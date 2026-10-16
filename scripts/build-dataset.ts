/**
 * Produit, à partir de data/dataset.ts, les fichiers d'import (data/seed/*.csv) et la vérité terrain
 * des évals (data/annotations/*.json). Affiche ensuite le volume de chaque tendance.
 * Usage : pnpm data:build
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  CLIENTS,
  EXPECTED_RANKING,
  NEW_BATCH,
  REFERENCE_STORIES,
  SEED_FEEDBACK,
  THEMES,
  type Feedback,
  type ThemeKey,
} from "../data/dataset";

const ROOT = process.cwd();
const PREFIX = { email: "ML", ticket: "ZD", in_app: "APP", sales_call: "CRM" } as const;
const START = { email: 100, ticket: 4800, in_app: 2200, sales_call: 880 } as const;

/** Un identifiant d'origine par retour, comme dans l'outil source (ZD-4801 pour un ticket, etc.). */
function withExternalIds(items: Feedback[], offset: Record<keyof typeof PREFIX, number>) {
  const counters = { ...offset };
  return items.map((item) => {
    counters[item.channel] += 1;
    return { ...item, externalId: `${PREFIX[item.channel]}-${counters[item.channel]}` };
  });
}

function toCsv(rows: Record<string, string | number>[]): string {
  return Papa.unparse(rows, { newline: "\n", quotes: (value) => typeof value === "string" }) + "\n";
}

async function write(relative: string, content: string) {
  const file = path.join(ROOT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  console.log(`écrit ${relative}`);
}

async function main() {
  const seed = withExternalIds(SEED_FEEDBACK, START);
  // Le lot du jour continue la numérotation du seed.
  const lastIds: Record<keyof typeof PREFIX, number> = { ...START };
  for (const item of SEED_FEEDBACK) lastIds[item.channel] += 1;
  const batch = withExternalIds(NEW_BATCH, lastIds);
  const clientByName = new Map(CLIENTS.map((client) => [client.name, client]));

  for (const item of [...seed, ...batch]) {
    if (!clientByName.has(item.client)) throw new Error(`Client inconnu : ${item.client}`);
  }

  await write("data/seed/clients.csv", toCsv(CLIENTS.map((c) => ({ name: c.name, segment: c.segment, seats: c.seats, mrr: c.mrr }))));

  const feedbackRow = (item: (typeof seed)[number]) => {
    const client = clientByName.get(item.client)!;
    return {
      external_id: item.externalId,
      channel: item.channel,
      client_name: item.client,
      client_segment: client.segment,
      client_seats: client.seats,
      client_mrr: client.mrr,
      author: item.author,
      received_at: item.date,
      text: item.text,
      language: item.language ?? "fr",
    };
  };
  await write("data/seed/feedback.csv", toCsv(seed.map(feedbackRow)));
  await write("data/seed/new_batch.csv", toCsv(batch.map(feedbackRow)));
  await write(
    "data/seed/reference_stories.csv",
    toCsv(REFERENCE_STORIES.map((s) => ({ title: s.title, description: s.description, points: s.points, tags: s.tags.join("|") }))),
  );

  const annotations = Object.fromEntries(
    [...seed.map((item) => ({ ...item, batch: "seed" })), ...batch.map((item) => ({ ...item, batch: "new_batch" }))].map((item) => [
      item.externalId,
      { batch: item.batch, client: item.client, expected: item.expected, traps: item.traps ?? [] },
    ]),
  );
  await write("public/exemples/nouveaux-retours.csv", toCsv(batch.map(feedbackRow)));
  await write("data/annotations/feedback.json", JSON.stringify(annotations, null, 2) + "\n");
  await write(
    "data/annotations/themes.json",
    JSON.stringify({ themes: THEMES, expectedRanking: EXPECTED_RANKING }, null, 2) + "\n",
  );

  // Contrôle : volume et clients distincts de chaque tendance, avant et après l'import du jour.
  const stats = (items: typeof seed) => {
    const result = new Map<ThemeKey, { messages: number; clients: Set<string> }>();
    for (const item of items) {
      for (const expected of item.expected) {
        if (!expected.theme) continue;
        const entry = result.get(expected.theme) ?? { messages: 0, clients: new Set<string>() };
        entry.messages += 1;
        entry.clients.add(item.client);
        result.set(expected.theme, entry);
      }
    }
    return result;
  };
  const before = stats(seed);
  const after = stats([...seed, ...batch]);
  console.log(`\n${seed.length} retours de départ, ${batch.length} à importer en direct, ${CLIENTS.length} clients.`);
  console.log("Tendance          messages  clients   après import");
  for (const key of Object.keys(THEMES) as ThemeKey[]) {
    const b = before.get(key);
    const a = after.get(key);
    console.log(
      `${key.padEnd(17)} ${String(b?.messages ?? 0).padStart(8)} ${String(b?.clients.size ?? 0).padStart(8)}   ${a?.messages ?? 0} / ${a?.clients.size ?? 0}`,
    );
  }
  const kinds = new Map<string, number>();
  for (const item of seed) for (const e of item.expected) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  console.log("Types attendus (seed) :", Object.fromEntries(kinds));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
