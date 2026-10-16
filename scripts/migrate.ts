/**
 * Applique les migrations SQL de db/migrations, dans l'ordre, une seule fois chacune.
 * Usage : pnpm db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db/client";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Découpe un fichier SQL en instructions : les commentaires sont retirés, une instruction finit par « ; » en fin de ligne. */
function splitStatements(source: string): string[] {
  const withoutComments = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function main() {
  const sql = db();
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from _migrations`).map((row) => row.name as string));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = splitStatements(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    // Une migration s'applique en entier ou pas du tout.
    await sql.transaction([
      ...statements.map((statement) => sql.query(statement)),
      sql`insert into _migrations (name) values (${file})`,
    ]);
    console.log(`Migration appliquée : ${file} (${statements.length} instructions)`);
  }
  console.log("Base à jour.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
