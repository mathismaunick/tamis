/**
 * Relance la synthèse de tous les thèmes (titre, besoin, facettes, synthèse citée, fonctionnalité existante),
 * sans toucher au regroupement ni aux facteurs : utile après un changement du prompt de synthèse.
 * Usage : pnpm resynthesize
 */
import { db } from "../lib/db/client";
import { synthesizeThemes } from "../lib/pipeline/themes";

async function main() {
  const themes = await db()`select id from themes where merged_into is null order by id`;
  await synthesizeThemes(
    themes.map((theme) => theme.id as number),
    null,
  );
  const rows = await db()`select id, title, jsonb_array_length(coalesce(signals->'facets', '[]'::jsonb)) as facets from themes where merged_into is null order by rank nulls last`;
  for (const row of rows) console.log(`T${row.id} ${row.title} : ${row.facets} facettes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
