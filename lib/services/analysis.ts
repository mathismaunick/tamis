import { callStructured } from "@/lib/ai/call";
import { CONFIRM_SYSTEM, confirmPrompt } from "@/lib/ai/prompts";
import { confirmMatchSchema } from "@/lib/ai/schemas";
import type { Channel, Segment } from "@/lib/csv/parse";
import { db, toVector } from "@/lib/db/client";
import { decideAssignment, DEFAULT_THRESHOLDS, type Candidate } from "@/lib/pipeline/assign";
import { embedTexts } from "@/lib/pipeline/embed";
import { extractFeedback } from "@/lib/pipeline/extract";
import { findOriginal } from "@/lib/services/feedback";
import { computeRice, rankThemes } from "@/lib/scoring/rice";

export type AnalysisInput = { text: string; client: string; channel: Channel; segment?: Segment | null };

export type AnalyzedItem = {
  kind: string;
  need: string;
  solution: string | null;
  quote: string;
  urgency: string | null;
  /** Le besoin du backlog que la demande rejoindrait, ou null si elle en créerait un nouveau. */
  match: {
    needId: number;
    title: string;
    rank: number | null;
    /** Le rang que le besoin aurait avec ce client de plus, à facteurs égaux (le pré-scoring peut ensuite les revoir). */
    rankAfter: number | null;
    reach: number;
    reachAfter: number;
    newClient: boolean;
    method: "direct" | "confirmed";
  } | null;
};

/** Le rang d'un besoin si son nombre de clients changeait, les autres facteurs et le reste du classement restant égaux. */
async function rankWithReach(themeId: number, reach: number): Promise<number | null> {
  const themes = await db()`select id, reach, impact::float, confidence::float, effort, status from themes where merged_into is null`;
  const ranks = rankThemes(
    themes.map((theme) => {
      const clients = theme.id === themeId ? reach : (theme.reach as number);
      return { id: theme.id, reach: clients, status: theme.status, score: computeRice({ reach: clients, impact: theme.impact, confidence: theme.confidence, effort: theme.effort }) };
    }),
  );
  return ranks.get(themeId) ?? null;
}

export type FeedbackAnalysis = {
  client: { name: string; known: boolean; segment: Segment | null; mrr: number | null };
  channel: Channel;
  text: string;
  date: string;
  items: AnalyzedItem[];
  /** Éléments écartés faute de citation retrouvée mot pour mot. */
  rejected: number;
  /** Le même retour, déjà reçu de ce client. */
  duplicateOf: number | null;
  costUsd: number;
};

/**
 * Analyse un retour collé par le PO, sans rien enregistrer : la même extraction et le même rattachement que le
 * traitement en masse (citations vérifiées, seuils, confirmation du modèle en zone grise), pour dire quel besoin la
 * demande rejoindrait. Le PO décide ensuite de l'ajouter : c'est alors l'import normal qui l'enregistre.
 */
export async function analyzeFeedback(input: AnalysisInput): Promise<FeedbackAnalysis> {
  const sql = db();
  const text = input.text.trim();
  const [client] = await sql`select id, name, segment, mrr::float as mrr from clients where lower(name) = lower(${input.client.trim()})`;
  const name = (client?.name as string | undefined) ?? input.client.trim();
  const segment = ((client?.segment as Segment | undefined) ?? input.segment ?? null) as Segment | null;
  const duplicateOf = await findOriginal((client?.id as number | undefined) ?? null, name, text);
  const date = new Date().toISOString().slice(0, 10);
  let costUsd = 0;

  const extraction = await extractFeedback(
    { id: 0, channel: input.channel, client: name, segment: segment ?? "inconnu", date, text },
    { trace: { stage: "analyze", subject: name } },
  );
  costUsd += extraction.costUsd;

  const features = extraction.items.filter((item) => item.kind === "feature");
  const vectors = features.length > 0 ? await embedTexts(features.map((item) => item.underlying_need)) : null;
  costUsd += vectors?.costUsd ?? 0;

  const items: AnalyzedItem[] = [];
  for (const item of extraction.items) {
    const base = { kind: item.kind, need: item.underlying_need, solution: item.requested_solution, quote: item.quote, urgency: item.urgency };
    const index = features.indexOf(item);
    if (index < 0 || !vectors) {
      items.push({ ...base, match: null });
      continue;
    }
    const vector = toVector(vectors.embeddings[index]);
    const rows = await sql`
      select id, title, need_statement, rank, reach, 1 - (embedding <=> ${vector}::vector) as similarity
      from themes where merged_into is null and embedding is not null
      order by embedding <=> ${vector}::vector
      limit 3`;
    const candidates: Candidate[] = rows.map((row) => ({ themeId: row.id, similarity: Number(row.similarity), title: row.title, need: row.need_statement }));
    const decision = await decideAssignment(
      candidates,
      async (candidate) => {
        const members = await sql`select underlying_need from feature_requests where theme_id = ${candidate.themeId} order by id limit 3`;
        const result = await callStructured({
          task: "confirm",
          system: CONFIRM_SYSTEM,
          messages: [
            {
              role: "user",
              content: confirmPrompt(
                { need: item.underlying_need, quote: item.quote },
                { title: candidate.title, needs: members.map((member) => member.underlying_need as string) },
              ),
            },
          ],
          schema: confirmMatchSchema,
          effort: "low",
          trace: { stage: "analyze", subject: `${name} → T${candidate.themeId}` },
        });
        costUsd += result.costUsd;
        return result.output.same_need;
      },
      DEFAULT_THRESHOLDS,
    );
    if (decision.kind === "create") {
      items.push({ ...base, match: null });
      continue;
    }
    const theme = rows.find((row) => row.id === decision.themeId)!;
    const [already] = client
      ? await sql`
          select 1 from feature_requests r join feedback f on f.id = r.feedback_id
          where r.theme_id = ${theme.id} and f.client_id = ${client.id} and f.duplicate_of is null limit 1`
      : [];
    const reachAfter = theme.reach + (already ? 0 : 1);
    items.push({
      ...base,
      match: {
        needId: theme.id,
        title: theme.title,
        rank: theme.rank,
        rankAfter: reachAfter === theme.reach ? theme.rank : await rankWithReach(theme.id, reachAfter),
        reach: theme.reach,
        reachAfter,
        newClient: !already,
        method: decision.method,
      },
    });
  }

  return {
    client: { name, known: Boolean(client), segment, mrr: (client?.mrr as number | null | undefined) ?? null },
    channel: input.channel,
    text,
    date,
    items,
    rejected: extraction.rejectedQuotes.length,
    duplicateOf,
    costUsd,
  };
}
