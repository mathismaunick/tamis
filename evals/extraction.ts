/**
 * E1 (extraction), E2 (ancrage des citations) et la partie extraction de E6 (injection), pour un modèle donné.
 * Les retours viennent des CSV de démo, sans passer par la base : l'éval ne modifie rien.
 */
import { readFileSync } from "node:fs";
import { parseFeedbackCsv } from "../lib/csv/parse";
import { extractFeedback } from "../lib/pipeline/extract";
import { ANNOTATIONS, mapLimit } from "./lib";

export type ExtractionResult = {
  model: string;
  feedbacks: number;
  recall: number;
  precision: number;
  typeAccuracy: number;
  zeroDemandKept: number;
  zeroDemandTotal: number;
  retryRate: number;
  rejectedQuotes: number;
  injectionNeutralized: boolean;
  churnDetected: number;
  churnTotal: number;
  costUsd: number;
  meanLatencyMs: number;
  failures: string[];
  errors: number;
  /** Les demandes de fonctionnalité extraites, dans l'ordre d'arrivée : l'entrée de l'éval de regroupement. */
  requests: Array<{ key: string; feedbackId: number; externalId: string; batch: "seed" | "new_batch"; date: string; need: string; quote: string }>;
};

export function loadFeedback() {
  const seed = parseFeedbackCsv(readFileSync("data/seed/feedback.csv", "utf8")).rows;
  const batch = parseFeedbackCsv(readFileSync("data/seed/new_batch.csv", "utf8")).rows;
  return [...seed, ...batch]
    .map((row, index) => ({ ...row, id: index + 1 }))
    .filter((row) => !(ANNOTATIONS[row.external_id!]?.traps ?? []).includes("doublon"));
}

export async function evalExtraction(model: string): Promise<ExtractionResult> {
  const feedback = loadFeedback();
  let expectedFeatures = 0;
  let extractedFeatures = 0;
  let matchedFeatures = 0;
  let expectedItems = 0;
  let matchedKinds = 0;
  let zeroDemandKept = 0;
  let zeroDemandTotal = 0;
  let retried = 0;
  let rejectedQuotes = 0;
  let costUsd = 0;
  let latency = 0;
  let injectionNeutralized = true;
  let churnDetected = 0;
  let churnTotal = 0;
  let errors = 0;
  const failures: string[] = [];
  const requests: ExtractionResult["requests"] = [];

  await mapLimit(feedback, 6, async (row) => {
    const annotation = ANNOTATIONS[row.external_id!];
    const started = Date.now();
    try {
      const outcome = await extractFeedback(
        { id: row.id, channel: row.channel, client: row.client_name, segment: row.client_segment ?? "pro", date: row.received_at, text: row.text },
        { trace: { stage: "eval-extract" }, model, record: false },
      );
      latency += Date.now() - started;
      costUsd += outcome.costUsd;
      if (outcome.retried) retried += 1;
      outcome.items
        .filter((item) => item.kind === "feature")
        .forEach((item, index) =>
          requests.push({
            key: `${row.external_id}#${index}`,
            feedbackId: row.id,
            externalId: row.external_id!,
            batch: annotation.batch,
            date: row.received_at,
            need: item.underlying_need,
            quote: item.quote,
          }),
        );
      rejectedQuotes += outcome.rejectedQuotes.length;

      const expected = annotation.expected;
      const expF = expected.filter((item) => item.kind === "feature").length;
      const gotF = outcome.items.filter((item) => item.kind === "feature").length;
      expectedFeatures += expF;
      extractedFeatures += gotF;
      matchedFeatures += Math.min(expF, gotF);
      if (expF === 0) {
        zeroDemandTotal += 1;
        if (gotF === 0) zeroDemandKept += 1;
      }
      const kinds = outcome.items.map((item) => item.kind as string);
      for (const item of expected) {
        expectedItems += 1;
        const index = kinds.indexOf(item.kind);
        if (index >= 0) {
          matchedKinds += 1;
          kinds.splice(index, 1);
        }
      }
      if (expF !== gotF || expected.some((item) => !outcome.items.some((got) => got.kind === item.kind))) {
        failures.push(`F${row.id} (${row.external_id}) attendu ${expected.map((e) => e.kind).join("+") || "rien"}, obtenu ${outcome.items.map((i) => i.kind).join("+") || "rien"}`);
      }
      if (annotation.traps.includes("injection") && outcome.items.some((item) => item.urgency === "high" || item.urgency === "churn_risk")) {
        injectionNeutralized = false;
      }
      if (annotation.traps.includes("churn")) {
        churnTotal += 1;
        if (outcome.items.some((item) => item.urgency === "churn_risk")) churnDetected += 1;
      }
    } catch (error) {
      errors += 1;
      failures.push(`F${row.id} erreur : ${error instanceof Error ? error.message.split("\n")[0].slice(0, 120) : error}`);
    }
  });

  return {
    model,
    feedbacks: feedback.length,
    recall: matchedFeatures / expectedFeatures,
    precision: extractedFeatures === 0 ? 0 : matchedFeatures / extractedFeatures,
    typeAccuracy: matchedKinds / expectedItems,
    zeroDemandKept,
    zeroDemandTotal,
    retryRate: retried / feedback.length,
    rejectedQuotes,
    injectionNeutralized,
    churnDetected,
    churnTotal,
    costUsd,
    meanLatencyMs: latency / Math.max(1, feedback.length - errors),
    failures,
    errors,
    requests: requests.sort((a, b) => (a.batch === b.batch ? 0 : a.batch === "seed" ? -1 : 1) || a.date.localeCompare(b.date) || a.feedbackId - b.feedbackId),
  };
}
