import type { ModelMessage } from "ai";
import { callStructured, mapWithConcurrency, type CallTrace } from "@/lib/ai/call";
import { EXTRACT_SYSTEM, extractPrompt, groundingRetryPrompt } from "@/lib/ai/prompts";
import { extractionSchema, type ExtractedItem } from "@/lib/ai/schemas";
import { db } from "@/lib/db/client";
import { isGrounded } from "./grounding";

export type FeedbackInput = { id: number; channel: string; client: string; segment: string; date: string; text: string };

export type ExtractOutcome = {
  items: ExtractedItem[];
  /** Citations introuvables dans le retour, même après une relance : les éléments correspondants sont écartés. */
  rejectedQuotes: string[];
  retried: boolean;
  costUsd: number;
  model: string;
};

/** Nettoie la sortie du modèle : textes rognés, éléments vides écartés. */
function clean(items: ExtractedItem[]): ExtractedItem[] {
  return items
    .map((item) => ({
      ...item,
      requested_solution: item.requested_solution?.trim() || null,
      underlying_need: item.underlying_need.trim(),
      quote: item.quote.trim(),
    }))
    .filter((item) => item.underlying_need.length > 0 && item.quote.length > 0);
}

/**
 * Extrait les éléments d'un retour. Chaque citation doit figurer mot pour mot dans le retour : sinon le modèle
 * est relancé une fois avec la liste des citations introuvables, puis les éléments encore non ancrés sont écartés.
 */
export async function extractFeedback(
  input: FeedbackInput,
  options: { trace: CallTrace; model?: string; record?: boolean },
): Promise<ExtractOutcome> {
  const messages: ModelMessage[] = [{ role: "user", content: extractPrompt(input) }];
  const call = (history: ModelMessage[]) =>
    callStructured({
      task: "extract",
      system: EXTRACT_SYSTEM,
      messages: history,
      schema: extractionSchema,
      effort: "low",
      trace: options.trace,
      model: options.model,
      record: options.record,
    });

  const first = await call(messages);
  let items = clean(first.output.items);
  let costUsd = first.costUsd;
  let failed = items.filter((item) => !isGrounded(input.text, item.quote));
  let retried = false;

  if (failed.length > 0) {
    retried = true;
    const second = await call([
      ...messages,
      { role: "assistant", content: JSON.stringify(first.output) },
      { role: "user", content: groundingRetryPrompt(failed.map((item) => item.quote)) },
    ]);
    costUsd += second.costUsd;
    items = clean(second.output.items);
    failed = items.filter((item) => !isGrounded(input.text, item.quote));
  }

  return {
    items: items.filter((item) => isGrounded(input.text, item.quote)),
    rejectedQuotes: failed.map((item) => item.quote),
    retried,
    costUsd,
    model: first.model,
  };
}

export type ExtractionStats = {
  processed: number;
  duplicates: number;
  requests: number;
  bugs: number;
  others: number;
  retried: number;
  needsReview: number;
};

/** Étape « extraction » du traitement : analyse des retours d'un lot et enregistrement des éléments ancrés. */
export async function extractBatch(feedbackIds: number[], batchId: number | null): Promise<ExtractionStats> {
  const sql = db();
  const rows = await sql`
    select f.id, f.channel, f.received_at::text as date, f.text, f.duplicate_of, c.name as client, c.segment
    from feedback f join clients c on c.id = f.client_id
    where f.id = any(${feedbackIds}) and f.status = 'new'
    order by f.id`;

  const stats: ExtractionStats = { processed: 0, duplicates: 0, requests: 0, bugs: 0, others: 0, retried: 0, needsReview: 0 };

  // Un doublon n'est pas réanalysé : il renvoie à son original et n'est compté qu'une fois.
  for (const row of rows.filter((r) => r.duplicate_of !== null)) {
    await sql`update feedback set status = 'processed', processed_at = now() where id = ${row.id}`;
    stats.duplicates += 1;
  }

  await mapWithConcurrency(
    rows.filter((r) => r.duplicate_of === null),
    5,
    async (row) => {
      const input: FeedbackInput = { id: row.id, channel: row.channel, client: row.client, segment: row.segment, date: row.date, text: row.text };
      try {
        const outcome = await extractFeedback(input, { trace: { batchId, stage: "extract", subject: `F${row.id}` } });
        for (const item of outcome.items) {
          await sql`
            insert into feature_requests (feedback_id, kind, requested_solution, underlying_need, quote, sentiment, urgency)
            values (${row.id}, ${item.kind}, ${item.requested_solution}, ${item.underlying_need}, ${item.quote}, ${item.sentiment}, ${item.urgency})`;
          if (item.kind === "feature") stats.requests += 1;
          else if (item.kind === "bug") stats.bugs += 1;
          else stats.others += 1;
        }
        const reason =
          outcome.rejectedQuotes.length > 0
            ? `${outcome.rejectedQuotes.length} élément(s) écarté(s) : citation introuvable dans le retour, même après relance.`
            : null;
        await sql`
          update feedback set status = ${reason ? "needs_review" : "processed"}, review_reason = ${reason}, processed_at = now()
          where id = ${row.id}`;
        if (outcome.retried) stats.retried += 1;
        if (reason) stats.needsReview += 1;
        stats.processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : "erreur inconnue";
        await sql`
          update feedback set status = 'needs_review', review_reason = ${`L'analyse a échoué : ${message}`}, processed_at = now()
          where id = ${row.id}`;
        stats.needsReview += 1;
      }
    },
  );
  return stats;
}
