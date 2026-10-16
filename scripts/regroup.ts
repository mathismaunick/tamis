/**
 * Refait le regroupement en thèmes à partir des demandes déjà extraites (sans réappeler l'extraction) :
 * utile après un changement de seuils ou de prompt de confirmation. Efface les thèmes, le journal et les stories.
 * Usage : pnpm regroup
 */
import { db } from "../lib/db/client";
import { processPending } from "../lib/pipeline/run";
import { logEvent } from "./log";

async function main() {
  const sql = db();
  await sql`truncate table agent_proposals, user_stories, score_changes restart identity cascade`;
  await sql`update feature_requests set theme_id = null, assignment = null`;
  await sql`delete from pipeline_runs where stage in ('assign', 'synthesize', 'prescore')`;
  // Pas de TRUNCATE … CASCADE ici : il viderait aussi les demandes extraites, qui référencent les thèmes.
  await sql`delete from themes`;
  await sql`alter table themes alter column id restart with 1`;
  const started = Date.now();
  await processPending(null, logEvent, { feedbackIds: [] });
  console.log(`Regroupement terminé en ${Math.round((Date.now() - started) / 1000)} s.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
