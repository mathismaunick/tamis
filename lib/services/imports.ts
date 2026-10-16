import { db } from "@/lib/db/client";

/** Le rang de chaque besoin classé, à un instant donné : { "5": 1, "4": 2, … }. */
export async function rankSnapshot(): Promise<Record<string, number>> {
  const rows = await db()`select id, rank from themes where merged_into is null and rank is not null`;
  return Object.fromEntries(rows.map((row) => [String(row.id), row.rank as number]));
}

/** Photographie le classement au début ou à la fin d'un import. */
export async function saveRanks(batchId: number, moment: "before" | "after") {
  const ranks = JSON.stringify(await rankSnapshot());
  if (moment === "before") await db()`update import_batches set ranks_before = ${ranks}::jsonb where id = ${batchId}`;
  else await db()`update import_batches set ranks_after = ${ranks}::jsonb where id = ${batchId}`;
}

export type ImportNeed = {
  id: number;
  title: string;
  /** Demandes de l'import rattachées à ce besoin. */
  added: number;
  /** Clients qui n'avaient encore jamais exprimé ce besoin. */
  newClients: string[];
  reach: number;
  /** Le besoin est né de cet import. */
  created: boolean;
  rankBefore: number | null;
  rankAfter: number | null;
};

export type ImportReport = {
  batchId: number;
  filename: string;
  createdAt: string;
  status: string;
  feedback: number;
  duplicates: number;
  requests: number;
  bugs: number;
  seconds: number | null;
  costUsd: number;
  needs: ImportNeed[];
  /** Les petits besoins regroupés par la consolidation pendant cet import. */
  merged: Array<{ source: string; targetId: number; targetTitle: string }>;
  /** Les autres besoins dont le rang a changé, sans avoir reçu de demande. */
  moved: Array<{ id: number; title: string; from: number | null; to: number | null }>;
};

/**
 * Ce qu'un import a changé : les besoins qui ont reçu des demandes (et de quels nouveaux clients), ceux qui sont nés,
 * les regroupements, et les rangs avant et après. Calculé à partir de la base, sans modèle.
 */
export async function getImportReport(batchId?: number | null): Promise<ImportReport | null> {
  const sql = db();
  const [batch] = batchId
    ? await sql`
        select b.*, b.created_at::text as created_text, extract(epoch from (b.finished_at - b.created_at))::float as seconds,
               coalesce((select sum(cost_usd) from pipeline_runs r where r.import_batch_id = b.id), 0)::float as cost
        from import_batches b where b.id = ${batchId}`
    : await sql`
        select b.*, b.created_at::text as created_text, extract(epoch from (b.finished_at - b.created_at))::float as seconds,
               coalesce((select sum(cost_usd) from pipeline_runs r where r.import_batch_id = b.id), 0)::float as cost
        from import_batches b where b.status = 'done' order by b.id desc limit 1`;
  if (!batch) return null;
  const id = batch.id as number;

  const requests = await sql`
    select r.theme_id, r.kind, f.client_id, c.name as client
    from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
    where f.import_batch_id = ${id} and f.duplicate_of is null`;
  const features = requests.filter((row) => row.kind === "feature" && row.theme_id !== null);
  const themeIds = [...new Set(features.map((row) => row.theme_id as number))];

  const [themes, earlier, merges, allThemes] = await Promise.all([
    themeIds.length > 0 ? sql`select id, title, reach, rank from themes where id = any(${themeIds})` : Promise.resolve([]),
    themeIds.length > 0
      ? sql`
          select distinct r.theme_id, f.client_id
          from feature_requests r join feedback f on f.id = r.feedback_id
          where r.theme_id = any(${themeIds}) and r.kind = 'feature' and f.duplicate_of is null
            and f.import_batch_id is distinct from ${id}`
      : Promise.resolve([]),
    sql`
      select s.old_value, s.theme_id, t.title
      from score_changes s join themes t on t.id = s.theme_id
      where s.field = 'merge' and s.actor = 'pipeline'
        and s.created_at >= ${batch.created_at} and s.created_at <= coalesce(${batch.finished_at}, now())
      order by s.id`,
    sql`select id, title, rank from themes where merged_into is null`,
  ]);

  const before = (batch.ranks_before ?? {}) as Record<string, number>;
  const after = (batch.ranks_after ?? null) as Record<string, number> | null;
  const rankAfter = (themeId: number, current: number | null) => (after ? (after[String(themeId)] ?? null) : current);

  const needs: ImportNeed[] = themes
    .map((theme) => {
      const mine = features.filter((row) => row.theme_id === theme.id);
      const known = new Set(earlier.filter((row) => row.theme_id === theme.id).map((row) => row.client_id as number));
      const newClients = [...new Map(mine.filter((row) => !known.has(row.client_id)).map((row) => [row.client_id, row.client as string])).values()];
      return {
        id: theme.id as number,
        title: theme.title as string,
        added: mine.length,
        newClients,
        reach: theme.reach as number,
        created: known.size === 0,
        rankBefore: before[String(theme.id)] ?? null,
        rankAfter: rankAfter(theme.id, theme.rank),
      };
    })
    .sort((a, b) => (a.rankAfter ?? 99) - (b.rankAfter ?? 99));

  const touched = new Set(themeIds);
  const moved = allThemes
    .filter((theme) => !touched.has(theme.id))
    .map((theme) => ({ id: theme.id as number, title: theme.title as string, from: before[String(theme.id)] ?? null, to: rankAfter(theme.id, theme.rank) }))
    .filter((theme) => theme.from !== null && theme.from !== theme.to)
    .sort((a, b) => (a.to ?? 99) - (b.to ?? 99));

  return {
    batchId: id,
    filename: batch.filename,
    createdAt: batch.created_text,
    status: batch.status,
    feedback: batch.feedback_count,
    duplicates: batch.duplicate_count,
    requests: features.length,
    bugs: requests.filter((row) => row.kind === "bug").length,
    seconds: batch.seconds,
    costUsd: batch.cost,
    needs,
    merged: merges.map((row) => ({ source: String(row.old_value ?? "").replace(/^T\d+ · /, ""), targetId: row.theme_id, targetTitle: row.title })),
    moved,
  };
}
