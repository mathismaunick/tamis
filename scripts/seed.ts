/**
 * Remet la démo dans son état de départ : la base est vidée, puis les clients, les stories de référence
 * et les 72 retours sont importés et traités par le même chemin que l'import en direct.
 * Usage : pnpm seed                  (tout le traitement)
 *         pnpm seed --until=embed    (s'arrête après une étape)
 *         pnpm seed --import-only    (sans appeler les modèles)
 */
import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import { parseFeedbackCsv } from "../lib/csv/parse";
import { db } from "../lib/db/client";
import type { StepKey } from "../lib/pipeline/events";
import { processPending } from "../lib/pipeline/run";
import { finishBatch, importFeedback } from "../lib/services/feedback";
import { batchCost } from "../lib/services/runs";
import { logEvent } from "./log";

async function readCsv(file: string) {
  return Papa.parse<Record<string, string>>(await readFile(file, "utf8"), { header: true, skipEmptyLines: "greedy" }).data;
}

async function main() {
  const args = process.argv.slice(2);
  const until = args.find((arg) => arg.startsWith("--until="))?.split("=")[1] as StepKey | undefined;
  const sql = db();
  await sql`
    truncate table pipeline_runs, agent_proposals, user_stories, score_changes, feature_requests, themes,
                   feedback, import_batches, clients, reference_stories
    restart identity cascade`;
  console.log("Base vidée.");

  for (const story of await readCsv("data/seed/reference_stories.csv")) {
    await sql`
      insert into reference_stories (title, description, points, tags)
      values (${story.title}, ${story.description}, ${Number(story.points)}, ${story.tags.split("|")})`;
  }
  for (const client of await readCsv("data/seed/clients.csv")) {
    await sql`
      insert into clients (name, segment, seats, mrr)
      values (${client.name}, ${client.segment}, ${Number(client.seats)}, ${Number(client.mrr)})`;
  }
  console.log("Clients et stories de référence chargés.");

  const { rows, errors } = parseFeedbackCsv(await readFile("data/seed/feedback.csv", "utf8"));
  if (errors.length > 0) throw new Error(`CSV de démo invalide : ${JSON.stringify(errors)}`);
  const summary = await importFeedback(rows, "feedback.csv");
  console.log(`${summary.imported} retours importés, dont ${summary.duplicates} doublon(s).`);

  if (!args.includes("--import-only")) {
    const started = Date.now();
    await processPending(summary.batchId, logEvent, { feedbackIds: summary.feedbackIds, until });
    console.log(`Traitement terminé en ${Math.round((Date.now() - started) / 1000)} s, coût ${(await batchCost(summary.batchId)).toFixed(4)} $.`);
  }
  await finishBatch(summary.batchId, "done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
