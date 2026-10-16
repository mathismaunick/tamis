import type { ImportEvent } from "../lib/pipeline/events";

/** Affiche la progression du traitement dans le terminal. */
export function logEvent(event: ImportEvent) {
  if (event.type === "step" && event.status !== "running") console.log(`  ${event.step.padEnd(10)} ${event.status} ${event.detail ?? ""}`);
  if (event.type === "error") console.log(`  erreur : ${event.message}`);
}
