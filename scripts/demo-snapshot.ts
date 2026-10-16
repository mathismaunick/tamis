/**
 * Sauvegarde la base de démo et la restaure à l'identique, sans appeler les modèles : entre deux répétitions,
 * au lieu de `pnpm seed` (3 minutes, 1,10 $, et un regroupement qui change d'un seed à l'autre).
 * La base est partagée avec la démo en ligne : une restauration la change aussi.
 * Usage : pnpm demo:save            (écrit snapshots/demo.json ; n'écrase jamais un instantané existant)
 *         pnpm demo:save --force    (remplace l'instantané par l'état actuel de la base)
 *         pnpm demo:restore         (remet la base dans l'état de l'instantané)
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db/client";
import { formatDateTime, plural } from "../lib/labels";

/** Toutes les tables de Tamis, chacune après celles qu'elle référence : c'est l'ordre de rechargement. */
const TABLES = [
  "clients",
  "reference_stories",
  "import_batches",
  "feedback",
  "themes",
  "feature_requests",
  "score_changes",
  "user_stories",
  "agent_proposals",
  "pipeline_runs",
] as const;

type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

type Snapshot = {
  version: 1;
  savedAt: string;
  /** Les lignes de chaque table, telles que Postgres les écrit en JSON : un vecteur y est le texte « [0.1,…] ». */
  tables: Record<Table, Row[]>;
  /** Le prochain identifiant de chaque table : une séquence est souvent en avance sur le plus grand id. */
  nextIds: Record<Table, number>;
  /** L'empreinte de chaque table, pour vérifier la restauration avant de la valider. */
  fingerprints: Record<Table, string>;
};

const SNAPSHOT_PATH = "snapshots/demo.json";
const snapshotFile = path.join(process.cwd(), SNAPSHOT_PATH);

/** L'empreinte d'une table (alias t) : le md5 de ses lignes en JSON, dans l'ordre des id. */
const FINGERPRINT = "md5(coalesce(json_agg(t order by t.id)::text, ''))";

/** « 72 retours, 11 besoins, 0 story, 0 proposition en attente, 3 entrées au journal » */
function summary(snapshot: Snapshot): string {
  const { feedback, themes, user_stories, agent_proposals, score_changes } = snapshot.tables;
  return [
    plural(feedback.length, "retour"),
    plural(themes.filter((theme) => theme.merged_into === null).length, "besoin"),
    plural(user_stories.length, "story", "stories"),
    plural(agent_proposals.filter((proposal) => proposal.status === "pending").length, "proposition en attente", "propositions en attente"),
    plural(score_changes.length, "entrée au journal", "entrées au journal"),
  ].join(", ");
}

async function readSnapshot(): Promise<Snapshot> {
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8")) as Snapshot;
  // Les id et les empreintes entrent tels quels dans le SQL de la restauration : on les vérifie avant.
  const complete = TABLES.every(
    (table) =>
      Array.isArray(snapshot.tables?.[table]) &&
      Number.isInteger(snapshot.nextIds?.[table]) &&
      /^[0-9a-f]{32}$/.test(snapshot.fingerprints?.[table] ?? ""),
  );
  if (snapshot.version !== 1 || !complete) {
    throw new Error(`${SNAPSHOT_PATH} est incomplet ou d'un ancien format : refaites-le avec pnpm demo:save --force sur une base en état de démo.`);
  }
  return snapshot;
}

async function save(force: boolean) {
  if (existsSync(snapshotFile) && !force) {
    const existing = await readSnapshot();
    console.log(`Un instantané du ${formatDateTime(existing.savedAt)} existe déjà : ${summary(existing)}.`);
    console.log("Pour le remplacer par l'état actuel de la base : pnpm demo:save --force");
    process.exitCode = 1;
    return;
  }
  const sql = db();
  const unknown = await sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_migrations' and not (tablename::text = any(${[...TABLES]}::text[]))`;
  if (unknown.length > 0) {
    const names = unknown.map((row) => row.tablename).join(", ");
    throw new Error(`Tables absentes de l'instantané : ${names}. Ajoutez-les à TABLES, après celles qu'elles référencent.`);
  }
  const sequences = await sql`select t.name, pg_get_serial_sequence(t.name, 'id') as sequence from unnest(${[...TABLES]}::text[]) as t(name)`;
  const missing = sequences.filter((row) => row.sequence === null).map((row) => row.name);
  if (missing.length > 0) throw new Error(`Colonne id sans séquence : ${missing.join(", ")}.`);

  // Une seule transaction en lecture : toutes les tables au même instant, même si la démo en ligne écrit pendant ce temps.
  const results = await sql.transaction(
    [
      ...TABLES.map((table) => sql.query(`select coalesce(json_agg(t order by t.id), '[]'::json) as rows, ${FINGERPRINT} as fingerprint from ${table} t`)),
      // La séquence elle-même, pas pg_sequences : juste après une restauration, pg_sequences la montre vide.
      ...sequences.map((row) => sql.query(`select last_value, is_called from ${row.sequence}`)),
    ],
    { isolationLevel: "RepeatableRead", readOnly: true },
  );
  const contents = results.slice(0, TABLES.length).map(([row]) => row);
  const states = results.slice(TABLES.length).map(([row]) => row);

  const snapshot: Snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.map((table, index) => [table, contents[index].rows as Row[]])) as Snapshot["tables"],
    // Le pas des séquences d'identité est 1 ; is_called est faux tant que la valeur courante n'a pas été distribuée.
    nextIds: Object.fromEntries(
      sequences.map((row, index) => [row.name, Number(states[index].last_value) + (states[index].is_called ? 1 : 0)]),
    ) as Snapshot["nextIds"],
    fingerprints: Object.fromEntries(TABLES.map((table, index) => [table, contents[index].fingerprint as string])) as Snapshot["fingerprints"],
  };
  await mkdir(path.dirname(snapshotFile), { recursive: true });
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  console.log(`Instantané enregistré dans ${SNAPSHOT_PATH} : ${summary(snapshot)}.`);
}

async function restore() {
  if (!existsSync(snapshotFile)) {
    console.log("Aucun instantané : lancez d'abord pnpm demo:save, sur une base en état de démo.");
    process.exitCode = 1;
    return;
  }
  const snapshot = await readSnapshot();
  const sql = db();
  const started = Date.now();
  const checks = TABLES.map(
    (table) => `
      if (select ${FINGERPRINT} from ${table} t) <> '${snapshot.fingerprints[table]}' then
        raise exception 'La table ${table} restaurée diffère de l''instantané (le schéma a-t-il changé ?) : rien n''a été modifié.';
      end if;`,
  );
  // Tout dans une transaction, vérification comprise : si une étape échoue, la base reste telle qu'elle était.
  await sql.transaction([
    // Sans CASCADE : une table absente de TABLES qui référencerait celles-ci fait échouer la restauration,
    // au lieu d'être vidée sans être rechargée.
    sql.query(`truncate table ${TABLES.join(", ")}`),
    ...TABLES.map((table) =>
      sql.query(`insert into ${table} overriding system value select * from json_populate_recordset(null::${table}, $1::json)`, [
        JSON.stringify(snapshot.tables[table]),
      ]),
    ),
    ...TABLES.map((table) => sql.query(`alter table ${table} alter column id restart with ${snapshot.nextIds[table]}`)),
    sql.query(`do $$ begin ${checks.join("")} end $$`),
  ]);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`Base restaurée en ${seconds} s, identique à l'instantané du ${formatDateTime(snapshot.savedAt)} : ${summary(snapshot)}.`);
}

async function main() {
  const [mode, ...flags] = process.argv.slice(2);
  if (mode === "save") await save(flags.includes("--force"));
  else if (mode === "restore") await restore();
  else throw new Error("Usage : pnpm demo:save [--force] | pnpm demo:restore");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
