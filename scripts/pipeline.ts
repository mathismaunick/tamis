/**
 * Reprend le traitement là où il s'est arrêté : extraction des retours non analysés, puis embeddings,
 * rattachement, synthèse et pré-scoring de ce qui manque. Rien n'est refait deux fois.
 * Usage : pnpm pipeline [--until=assign]
 */
import { db } from "../lib/db/client";
import type { StepKey } from "../lib/pipeline/events";
import { processPending } from "../lib/pipeline/run";
import { logEvent } from "./log";

async function main() {
  const until = process.argv.slice(2).find((arg) => arg.startsWith("--until="))?.split("=")[1] as StepKey | undefined;
  const pending = await db()`select id from feedback where status = 'new' order by id`;
  console.log(`${pending.length} retour(s) à analyser.`);
  await processPending(null, logEvent, { feedbackIds: pending.map((row) => row.id), until });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
