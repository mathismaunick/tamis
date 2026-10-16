import type { FeedbackRow } from "@/lib/csv/parse";
import { plural } from "@/lib/labels";
import { finishBatch, importFeedback } from "@/lib/services/feedback";
import { saveRanks } from "@/lib/services/imports";
import { batchCost } from "@/lib/services/runs";
import { refreshThemeStats, rescoreAll } from "@/lib/services/themes";
import { embedPendingRequests } from "./embed";
import type { EmitEvent, StepKey } from "./events";
import { extractBatch } from "./extract";
import { assignPendingRequests, consolidateThemes, prescoreThemes, synthesizeThemes } from "./themes";

/**
 * Le traitement d'un import : un workflow à étapes fixes, écrit en code. Il appelle les modèles à des
 * endroits précis, ne décide jamais de son déroulé, et chaque étape est visible du PO.
 * Le seed et l'import en direct passent par ces mêmes fonctions.
 */
export async function runImport(rows: FeedbackRow[], filename: string, emit: EmitEvent) {
  const started = Date.now();
  emit({ type: "step", step: "import", status: "running" });
  const summary = await importFeedback(rows, filename);
  const parts = [plural(summary.imported, "retour importé", "retours importés")];
  if (summary.duplicates > 0) parts.push(plural(summary.duplicates, "doublon détecté", "doublons détectés"));
  if (summary.createdClients.length > 0) parts.push(plural(summary.createdClients.length, "nouveau client", "nouveaux clients"));
  if (summary.rejected.length > 0) parts.push(plural(summary.rejected.length, "ligne rejetée", "lignes rejetées"));
  emit({ type: "step", step: "import", status: "done", detail: parts.join(", ") });
  for (const rejected of summary.rejected.slice(0, 5)) {
    emit({ type: "error", message: `Ligne ${rejected.line} : ${rejected.message}` });
  }
  // Le classement avant le traitement : le compte rendu dira ce qui a bougé.
  await saveRanks(summary.batchId, "before");

  try {
    const result = await processPending(summary.batchId, emit, { feedbackIds: summary.feedbackIds });
    await finishBatch(summary.batchId, "done");
    await saveRanks(summary.batchId, "after");
    emit({
      type: "done",
      batchId: summary.batchId,
      summary: [parts[0], ...result].join(", "),
      costUsd: await batchCost(summary.batchId),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishBatch(summary.batchId, "failed", message);
    throw error;
  }
  return summary;
}

async function step<T>(emit: EmitEvent, key: StepKey, work: () => Promise<T>, describe: (result: T) => string): Promise<T> {
  emit({ type: "step", step: key, status: "running" });
  try {
    const result = await work();
    emit({ type: "step", step: key, status: "done", detail: describe(result) });
    return result;
  } catch (error) {
    emit({ type: "step", step: key, status: "failed", detail: error instanceof Error ? error.message.slice(0, 200) : undefined });
    throw error;
  }
}

/**
 * Traite tout ce qui ne l'a pas encore été : relancer ne refait jamais le travail déjà fait (idempotence).
 * `until` arrête le traitement après une étape, pour régler les seuils avant de créer les besoins.
 */
export async function processPending(
  batchId: number | null,
  emit: EmitEvent,
  options: { feedbackIds?: number[]; until?: StepKey } = {},
): Promise<string[]> {
  const summary: string[] = [];
  const stop = (key: StepKey) => options.until === key;

  const extraction = await step(
    emit,
    "extract",
    () => extractBatch(options.feedbackIds ?? [], batchId),
    (s) => {
      const parts = [plural(s.requests, "demande extraite", "demandes extraites")];
      if (s.bugs > 0) parts.push(plural(s.bugs, "bug"));
      if (s.others > 0) parts.push(plural(s.others, "autre élément", "autres éléments"));
      return parts.join(", ");
    },
  );
  summary.push(plural(extraction.requests, "demande extraite", "demandes extraites"));
  if (extraction.bugs > 0) summary.push(plural(extraction.bugs, "bug"));
  emit({
    type: "step",
    step: "ground",
    status: "done",
    detail:
      extraction.needsReview > 0
        ? `${plural(extraction.needsReview, "retour", "retours")} à revoir, ${plural(extraction.retried, "relance", "relances")}`
        : `toutes les citations retrouvées mot pour mot${extraction.retried > 0 ? `, après ${plural(extraction.retried, "relance", "relances")}` : ""}`,
  });
  if (stop("extract") || stop("ground")) return summary;

  await step(emit, "embed", () => embedPendingRequests(batchId), (count) => plural(count, "besoin vectorisé", "besoins vectorisés"));
  if (stop("embed")) return summary;

  // Rattachement au fil de l'eau, puis consolidation des petits besoins que l'ordre d'arrivée a pu laisser à part.
  const assignment = await step(
    emit,
    "assign",
    async () => {
      const stats = await assignPendingRequests(batchId);
      const consolidation = await consolidateThemes(stats.touchedThemes, batchId);
      return { ...stats, merged: consolidation.merged, touchedThemes: consolidation.touchedThemes };
    },
    (s) =>
      [
        plural(s.direct + s.confirmed, "demande rattachée à un besoin existant", "demandes rattachées à des besoins existants"),
        s.confirmed > 0 ? `dont ${s.confirmed} confirmée${s.confirmed > 1 ? "s" : ""} par le modèle` : null,
        plural(s.created, "nouveau besoin", "nouveaux besoins"),
        s.merged > 0 ? `${plural(s.merged, "petit besoin regroupé", "petits besoins regroupés")} à la consolidation` : null,
      ]
        .filter(Boolean)
        .join(", "),
  );
  summary.push(plural(Math.max(0, assignment.created - assignment.merged), "nouveau besoin", "nouveaux besoins"));
  if (stop("assign")) return summary;

  await refreshThemeStats(assignment.touchedThemes);
  await step(emit, "synthesize", () => synthesizeThemes(assignment.touchedThemes, batchId), () =>
    plural(assignment.touchedThemes.length, "besoin mis à jour", "besoins mis à jour"),
  );
  if (stop("synthesize")) return summary;

  await step(
    emit,
    "prescore",
    async () => {
      await prescoreThemes(assignment.touchedThemes, batchId);
      await rescoreAll();
    },
    () => "facteurs proposés, score et rang recalculés",
  );
  return summary;
}
