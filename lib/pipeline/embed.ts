import { embedMany } from "ai";
import { EMBEDDING_MODEL, estimateCostUsd } from "@/lib/ai/models";
import { db, toVector } from "@/lib/db/client";
import { recordRun } from "@/lib/services/runs";

/** Embeddings d'une liste de textes, avec le coût de l'appel. */
export async function embedTexts(values: string[], model: string = EMBEDDING_MODEL.id) {
  const started = Date.now();
  const { embeddings, usage } = await embedMany({ model, values, maxParallelCalls: 2, maxRetries: 3 });
  const tokens = usage?.tokens ?? 0;
  return {
    embeddings,
    tokens,
    costUsd: estimateCostUsd(model, { inputTokens: tokens, outputTokens: 0 }) ?? 0,
    durationMs: Date.now() - started,
  };
}

/** Étape « embeddings » : le vecteur de chaque besoin extrait qui n'en a pas encore. On embarque le besoin, pas le texte brut. */
export async function embedPendingRequests(batchId: number | null): Promise<number> {
  const sql = db();
  const pending = await sql`
    select id, underlying_need from feature_requests where kind = 'feature' and embedding is null order by id`;
  if (pending.length === 0) return 0;

  const result = await embedTexts(pending.map((row) => row.underlying_need as string));
  await sql`
    update feature_requests as r set embedding = v.embedding::vector
    from unnest(${pending.map((row) => row.id)}::int[], ${result.embeddings.map((vector) => toVector(vector))}::text[]) as v(id, embedding)
    where r.id = v.id`;
  await recordRun({
    batchId,
    stage: "embed",
    subject: `${pending.length} besoins`,
    model: EMBEDDING_MODEL.id,
    inputTokens: result.tokens,
    outputTokens: 0,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    status: "ok",
  });
  return pending.length;
}
