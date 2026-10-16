import { callStructured, mapWithConcurrency } from "@/lib/ai/call";
import {
  CONFIRM_SYSTEM,
  PRESCORE_SYSTEM,
  SYNTHESIZE_SYSTEM,
  confirmPrompt,
  consolidatePrompt,
  prescorePrompt,
  synthesizePrompt,
} from "@/lib/ai/prompts";
import { confirmMatchSchema, consolidationSchema, prescoreSchema, synthesisSchema } from "@/lib/ai/schemas";
import { db } from "@/lib/db/client";
import { consensus, type ProposalSample } from "@/lib/scoring/consensus";
import { themeIndicators } from "@/lib/services/themes";
import { decideAssignment, DEFAULT_THRESHOLDS, planConsolidation, type Candidate, type ThemeGroup } from "./assign";

export type AssignStats = { assigned: number; direct: number; confirmed: number; created: number; touchedThemes: number[] };

/**
 * Étape « rattachement » : chaque demande sans thème, dans l'ordre d'arrivée, rejoint le thème le plus proche
 * ou en crée un. Séquentiel par construction : un thème créé devient candidat pour la demande suivante.
 */
export async function assignPendingRequests(batchId: number | null): Promise<AssignStats> {
  const sql = db();
  const pending = await sql`
    select r.id, r.underlying_need, r.quote, r.embedding::text as embedding
    from feature_requests r join feedback f on f.id = r.feedback_id
    where r.kind = 'feature' and r.theme_id is null and r.embedding is not null and f.duplicate_of is null
    order by f.received_at, r.id`;
  const stats: AssignStats = { assigned: 0, direct: 0, confirmed: 0, created: 0, touchedThemes: [] };
  const touched = new Set<number>();

  for (const request of pending) {
    const vector = request.embedding as string;
    const candidates = (
      await sql`
        select id, title, need_statement, 1 - (embedding <=> ${vector}::vector) as similarity
        from themes where merged_into is null and embedding is not null
        order by embedding <=> ${vector}::vector
        limit 3`
    ).map((row) => ({ themeId: row.id, similarity: Number(row.similarity), title: row.title, need: row.need_statement }) as Candidate);

    const decision = await decideAssignment(candidates, async (candidate) => {
      // Le modèle voit le thème à travers trois de ses demandes, pas seulement son titre.
      const members = await sql`
        select underlying_need from feature_requests where theme_id = ${candidate.themeId} order by id limit 3`;
      const result = await callStructured({
        task: "confirm",
        system: CONFIRM_SYSTEM,
        messages: [
          {
            role: "user",
            content: confirmPrompt(
              { need: request.underlying_need, quote: request.quote },
              { title: candidate.title, needs: members.map((member) => member.underlying_need as string) },
            ),
          },
        ],
        schema: confirmMatchSchema,
        effort: "low",
        trace: { batchId, stage: "assign", subject: `R${request.id} → T${candidate.themeId}` },
      });
      return result.output.same_need;
    }, DEFAULT_THRESHOLDS);

    let themeId: number;
    if (decision.kind === "attach") {
      themeId = decision.themeId;
      if (decision.method === "direct") stats.direct += 1;
      else stats.confirmed += 1;
    } else {
      // Le thème naît avec le besoin de sa première demande ; la synthèse lui donnera son titre.
      const [created] = await sql`
        insert into themes (title, need_statement, embedding)
        values (${request.underlying_need}, ${request.underlying_need}, ${vector}::vector)
        returning id`;
      themeId = created.id;
      stats.created += 1;
    }
    const assignment = {
      method: decision.kind === "attach" ? decision.method : "new",
      similarity: decision.similarity === null ? null : Math.round(decision.similarity * 1000) / 1000,
    };
    await sql`update feature_requests set theme_id = ${themeId}, assignment = ${JSON.stringify(assignment)}::jsonb where id = ${request.id}`;
    // Le vecteur du thème suit la moyenne de ses demandes, pour la demande suivante.
    await sql`
      update themes set embedding = (select avg(embedding) from feature_requests where theme_id = ${themeId} and embedding is not null)
      where id = ${themeId}`;
    touched.add(themeId);
    stats.assigned += 1;
  }
  stats.touchedThemes = [...touched];
  return stats;
}

export type ConsolidationStats = { merged: number; touchedThemes: number[] };

/** La question de la consolidation : quel thème voisin couvre déjà ce petit thème, s'il y en a un ? */
export async function chooseTheme(
  small: ThemeGroup,
  candidates: ThemeGroup[],
  options: { batchId?: number | null; model?: string; record?: boolean; onCost?: (costUsd: number) => void } = {},
): Promise<number | null> {
  const result = await callStructured({
    task: "confirm",
    system: CONFIRM_SYSTEM,
    messages: [
      {
        role: "user",
        content: consolidatePrompt(
          { needs: small.needs },
          candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, needs: candidate.needs.slice(0, 4) })),
        ),
      },
    ],
    schema: consolidationSchema,
    effort: "medium",
    trace: { batchId: options.batchId ?? null, stage: "assign", subject: `T${small.id} : consolidation` },
    model: options.model,
    record: options.record,
  });
  options.onCost?.(result.costUsd);
  const match = result.output.theme?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Un titre court pour le journal ; un thème né dans l'import porte encore le besoin de sa première demande. */
const shortTitle = (title: string) => {
  const capitalized = title.charAt(0).toUpperCase() + title.slice(1);
  return capitalized.length > 60 ? `${capitalized.slice(0, 59)}…` : capitalized;
};

/**
 * Étape « rattachement », seconde passe : la consolidation (voir `planConsolidation`). Seuls les petits thèmes touchés
 * par l'import sont examinés, et jamais un thème sur lequel le PO a déjà pris une décision. Chaque fusion est tracée
 * au journal, comme une fusion manuelle, et le PO peut la défaire en connaissance de cause.
 */
export async function consolidateThemes(touchedThemes: number[], batchId: number | null): Promise<ConsolidationStats> {
  const sql = db();
  const rows = await sql`
    select t.id, t.title, t.status, t.embedding::text as embedding,
           array_agg(r.underlying_need order by r.id) as needs,
           exists (select 1 from score_changes c where c.theme_id = t.id and c.actor = 'po') as decided
    from themes t join feature_requests r on r.theme_id = t.id and r.kind = 'feature'
    where t.merged_into is null and t.embedding is not null
    group by t.id`;
  const groups: ThemeGroup[] = rows.map((row) => ({ id: row.id, title: row.title, needs: row.needs, vector: JSON.parse(row.embedding) }));
  const sources = new Set(
    rows.filter((row) => touchedThemes.includes(row.id) && row.status === "new" && !row.decided).map((row) => row.id as number),
  );

  const plan = await planConsolidation(groups, (small, candidates) => chooseTheme(small, candidates, { batchId }), { sources });

  const titles = new Map(groups.map((group) => [group.id, group.title]));
  for (const { sourceId, targetId } of plan) {
    await sql.transaction([
      sql`update feature_requests
          set theme_id = ${targetId}, assignment = coalesce(assignment, '{}'::jsonb) || ${JSON.stringify({ consolidatedFrom: sourceId })}::jsonb
          where theme_id = ${sourceId}`,
      sql`update themes set merged_into = ${targetId} where merged_into = ${sourceId}`,
      sql`update themes set merged_into = ${targetId}, rank = null, updated_at = now() where id = ${sourceId}`,
      sql`insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
          values (${targetId}, 'merge', ${`T${sourceId} · ${shortTitle(titles.get(sourceId) ?? "")}`},
                  ${`T${targetId}`},
                  ${"Consolidation : même besoin de fond, confirmé par le modèle à la lecture de toutes les demandes"}, 'pipeline', 'pipeline')`,
    ]);
  }

  const merged = new Set(plan.map((merge) => merge.sourceId));
  const touched = new Set([...touchedThemes.filter((id) => !merged.has(id)), ...plan.map((merge) => merge.targetId)]);
  // Une cible peut avoir été absorbée à son tour : on ne garde que les thèmes encore actifs.
  for (const id of merged) touched.delete(id);
  return { merged: plan.length, touchedThemes: [...touched] };
}

/** Les références [F12] d'un texte. */
export function references(text: string): number[] {
  return [...text.matchAll(/\[F(\d+)\]/g)].map((match) => Number(match[1]));
}

/** Vérifie qu'une synthèse ne cite que des retours du thème, et que chaque phrase en cite au moins un. */
export function checkSynthesis(text: string, allowed: Set<number>): string[] {
  const problems: string[] = [];
  const unknown = references(text).filter((id) => !allowed.has(id));
  if (unknown.length > 0) problems.push(`références hors du thème : ${unknown.map((id) => `[F${id}]`).join(", ")}`);
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«])/u).filter((s) => s.trim().length > 0);
  const bare = sentences.filter((sentence) => references(sentence).length === 0);
  if (bare.length > 0) problems.push(`${bare.length} phrase(s) sans référence : « ${bare[0].slice(0, 80)} »`);
  return problems;
}

/** Les facettes ne gardent que des retours du thème, et seulement celles qui en ont au moins un. */
export function cleanFacets(facets: Array<{ label: string; feedback_ids: number[] }>, allowed: Set<number>) {
  return facets
    .map((facet) => ({ label: facet.label.trim(), feedbackIds: [...new Set(facet.feedback_ids.filter((id) => allowed.has(id)))] }))
    .filter((facet) => facet.label.length > 0 && facet.feedbackIds.length > 0)
    .slice(0, 4);
}

/** Étape « synthèse » : titre, besoin, facettes et synthèse citée de chaque thème touché par le lot. */
export async function synthesizeThemes(themeIds: number[], batchId: number | null) {
  const sql = db();
  await mapWithConcurrency(themeIds, 3, async (themeId) => {
    const requests = await sql`
      select r.feedback_id, r.underlying_need, r.requested_solution, r.quote, c.name as client, c.segment
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.theme_id = ${themeId} and r.kind = 'feature' and f.duplicate_of is null
      order by f.received_at, r.id`;
    if (requests.length === 0) return;
    const prompt = synthesizePrompt(
      requests.map((r) => ({ feedbackId: r.feedback_id, client: r.client, segment: r.segment, need: r.underlying_need, solution: r.requested_solution, quote: r.quote })),
    );
    const allowed = new Set(requests.map((r) => r.feedback_id as number));
    const call = (messages: Parameters<typeof callStructured>[0]["messages"]) =>
      callStructured({
        task: "synthesize",
        system: SYNTHESIZE_SYSTEM,
        messages,
        schema: synthesisSchema,
        effort: "low",
        trace: { batchId, stage: "synthesize", subject: `T${themeId}` },
      });

    let result = await call([{ role: "user", content: prompt }]);
    let problems = checkSynthesis(result.output.synthesis, allowed);
    if (problems.length > 0) {
      result = await call([
        { role: "user", content: prompt },
        { role: "assistant", content: JSON.stringify(result.output) },
        { role: "user", content: `Corrige la synthèse : ${problems.join(" ; ")}. Chaque phrase doit citer au moins un retour fourni, au format [F12].` },
      ]);
      problems = checkSynthesis(result.output.synthesis, allowed);
    }
    const synthesis = result.output;
    await sql`
      update themes set
        title = ${synthesis.title.trim()},
        need_statement = ${synthesis.need_statement.trim()},
        synthesis = ${synthesis.synthesis.trim()},
        signals = signals || ${JSON.stringify({
          alreadyExists: (synthesis.already_answered && synthesis.already_exists?.trim()) || null,
          facets: cleanFacets(synthesis.facets, allowed),
          synthesisIssues: problems,
        })}::jsonb,
        synthesized_at = now(),
        updated_at = now()
      where id = ${themeId}`;
  });
}

const FACTORS = ["impact", "confidence", "effort"] as const;

/** Nombre de propositions demandées au modèle pour chaque thème ; le code garde la médiane. */
export const PRESCORE_SAMPLES = 3;

/**
 * Étape « pré-scoring » : le modèle propose Impact, Confiance et Effort, chacun justifié, trois fois en parallèle ;
 * le code garde la médiane de chaque facteur. Un facteur déjà ajusté par le PO n'est jamais écrasé.
 * Le score et le rang sont ensuite calculés par le code.
 */
export async function prescoreThemes(themeIds: number[], batchId: number | null) {
  const sql = db();
  const references = await sql`select title, description, points from reference_stories order by points, id`;
  await mapWithConcurrency(themeIds, 3, async (themeId) => {
    const [theme] = await sql`
      select id, title, need_statement, synthesis, impact::float, confidence::float, effort, factor_sources, factor_justifications
      from themes where id = ${themeId}`;
    if (!theme) return;
    const indicators = await themeIndicators(themeId);
    const ask = () => callStructured({
      task: "prescore",
      system: PRESCORE_SYSTEM,
      messages: [
        {
          role: "user",
          content: prescorePrompt({
            title: theme.title,
            need: theme.need_statement,
            synthesis: theme.synthesis ?? "",
            indicators,
            references: references.map((r) => ({ title: r.title, description: r.description, points: r.points })),
          }),
        },
      ],
      schema: prescoreSchema,
      effort: "low",
      trace: { batchId, stage: "prescore", subject: `T${themeId}` },
    });
    const samples: ProposalSample[] = (await Promise.all(Array.from({ length: PRESCORE_SAMPLES }, ask))).map((result) => ({
      impact: { value: Number(result.output.impact), why: result.output.impact_justification },
      confidence: { value: Number(result.output.confidence), why: result.output.confidence_justification },
      effort: { value: Number(result.output.effort), why: result.output.effort_justification },
    }));
    const proposal = consensus(samples);
    const sources: Record<string, string> = { ...(theme.factor_sources as Record<string, string>), reach: "code" };
    const justifications: Record<string, string> = { ...(theme.factor_justifications as Record<string, string>) };
    const next: Record<string, number | null> = { impact: theme.impact, confidence: theme.confidence, effort: theme.effort };

    for (const factor of FACTORS) {
      if (sources[factor] === "po") continue; // le choix du PO prime
      const previous = next[factor];
      next[factor] = proposal[factor].value;
      sources[factor] = "model";
      justifications[factor] = proposal[factor].why.trim();
      if (previous !== null && previous !== proposal[factor].value) {
        await sql`
          insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
          values (${themeId}, ${factor}, ${String(previous)}, ${String(proposal[factor].value)},
                  ${"Nouveau pré-scoring après l'arrivée de retours"}, 'pipeline', 'pipeline')`;
      }
    }
    await sql`
      update themes set
        impact = ${next.impact}, confidence = ${next.confidence}, effort = ${next.effort},
        factor_sources = ${JSON.stringify(sources)}::jsonb,
        factor_justifications = ${JSON.stringify(justifications)}::jsonb,
        signals = signals || ${JSON.stringify({ agreement: Object.fromEntries(FACTORS.map((f) => [f, `${proposal[f].agreement}/${proposal[f].samples}`])) })}::jsonb,
        scored_at = now(), updated_at = now()
      where id = ${themeId}`;
  });
}

