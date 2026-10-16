/**
 * Relance le pré-scoring de tous les thèmes (facteurs proposés par le modèle), sans toucher aux facteurs
 * ajustés par le PO, puis recalcule score, rang et MoSCoW. Usage : pnpm rescore
 */
import { db } from "../lib/db/client";
import { prescoreThemes } from "../lib/pipeline/themes";
import { rescoreAll } from "../lib/services/themes";

async function main() {
  const themes = await db()`select id from themes where merged_into is null order by id`;
  await prescoreThemes(themes.map((theme) => theme.id as number), null);
  await rescoreAll();
  const rows = await db()`select id, title, reach, impact::float as i, confidence::float as c, effort as e, rice_score::float as s, rank from themes where merged_into is null order by rank nulls last`;
  for (const r of rows) console.log(`rang ${String(r.rank).padStart(2)}  T${r.id} ${r.title} : ${r.reach} × ${r.i} × ${r.c} ÷ ${r.e} = ${r.s?.toFixed(2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
