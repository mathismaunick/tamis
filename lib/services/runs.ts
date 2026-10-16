import { db } from "@/lib/db/client";

export type RunRecord = {
  batchId: number | null;
  stage: string;
  subject?: string;
  model?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
  status: "ok" | "retried" | "failed";
  error?: string;
};

/** Une ligne par appel à un modèle : de quoi afficher le coût et la durée de chaque import. */
export async function recordRun(run: RunRecord) {
  await db()`
    insert into pipeline_runs (import_batch_id, stage, subject, model, prompt_version, input_tokens, output_tokens, cost_usd, duration_ms, status, error)
    values (${run.batchId}, ${run.stage}, ${run.subject ?? null}, ${run.model ?? null}, ${run.promptVersion ?? null},
            ${run.inputTokens ?? null}, ${run.outputTokens ?? null}, ${run.costUsd ?? null}, ${run.durationMs ?? null},
            ${run.status}, ${run.error ?? null})`;
}

export async function batchCost(batchId: number): Promise<number> {
  const [row] = await db()`select coalesce(sum(cost_usd), 0)::float as cost from pipeline_runs where import_batch_id = ${batchId}`;
  return row.cost as number;
}
