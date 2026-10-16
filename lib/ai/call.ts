import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import { estimateCostUsd, modelFor, PROMPT_VERSIONS, reasoning, type ModelTask } from "@/lib/ai/models";
import { recordRun } from "@/lib/services/runs";

export type CallTrace = { batchId?: number | null; stage: string; subject?: string };

export type StructuredResult<T> = {
  output: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

/**
 * Un appel à sortie structurée, validée par un schéma Zod, sur le modèle déclaré pour la tâche.
 * Chaque appel laisse une trace (modèle, version du prompt, tokens, coût, durée) dans pipeline_runs.
 */
export async function callStructured<S extends z.ZodType>(options: {
  task: ModelTask;
  system: string;
  messages: ModelMessage[];
  schema: S;
  effort?: "low" | "medium" | "high";
  trace: CallTrace;
  model?: string;
  record?: boolean;
}): Promise<StructuredResult<z.infer<S>>> {
  const model = options.model ?? modelFor(options.task);
  const started = Date.now();
  try {
    const result = await generateText({
      model,
      system: options.system,
      messages: options.messages,
      output: Output.object({ schema: options.schema }),
      providerOptions: reasoning(options.effort ?? "low"),
      maxRetries: 3,
    });
    const costUsd = estimateCostUsd(model, result.usage) ?? 0;
    const traced = {
      output: result.output as z.infer<S>,
      model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      costUsd,
      durationMs: Date.now() - started,
    };
    if (options.record !== false) {
      await recordRun({
        batchId: options.trace.batchId ?? null,
        stage: options.trace.stage,
        subject: options.trace.subject,
        model,
        promptVersion: PROMPT_VERSIONS[options.task],
        inputTokens: traced.inputTokens,
        outputTokens: traced.outputTokens,
        costUsd,
        durationMs: traced.durationMs,
        status: "ok",
      });
    }
    return traced;
  } catch (error) {
    if (options.record !== false) {
      await recordRun({
        batchId: options.trace.batchId ?? null,
        stage: options.trace.stage,
        subject: options.trace.subject,
        model,
        promptVersion: PROMPT_VERSIONS[options.task],
        durationMs: Date.now() - started,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
    }
    throw error;
  }
}

/** Exécute des tâches avec une concurrence bornée, pour rester sous les limites de débit des fournisseurs. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
