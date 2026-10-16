import type { FeedbackRow } from "@/lib/csv/parse";
import { db } from "@/lib/db/client";
import { contentHash, sameMessage } from "@/lib/feedback/fingerprint";

export type ImportSummary = {
  batchId: number;
  imported: number;
  duplicates: number;
  createdClients: string[];
  rejected: Array<{ line: number; message: string }>;
  feedbackIds: number[];
};

/**
 * L'original d'un retour déjà reçu : la même empreinte, ou le même message sous une autre forme chez le même client
 * (un email collé dans l'agent, puis reçu en entier dans un CSV). Un doublon est enregistré, mais compté une fois.
 */
export async function findOriginal(clientId: number | null, clientName: string, text: string): Promise<number | null> {
  const sql = db();
  const [same] = await sql`
    select id from feedback where content_hash = ${contentHash(clientName, text)} and duplicate_of is null order by id limit 1`;
  if (same) return same.id as number;
  if (clientId === null) return null;
  const messages = await sql`select id, text from feedback where client_id = ${clientId} and duplicate_of is null order by id`;
  const match = messages.find((message) => sameMessage(message.text as string, text));
  return match ? (match.id as number) : null;
}

/**
 * Importe des retours : rattachement au client (créé s'il est nouveau et que son segment est connu),
 * empreinte du contenu, et lien vers l'original pour un doublon. Le seed passe par ce même chemin.
 */
export async function importFeedback(rows: FeedbackRow[], filename: string): Promise<ImportSummary> {
  const sql = db();
  const [batch] = await sql`insert into import_batches (filename, status) values (${filename}, 'running') returning id`;
  const batchId = batch.id as number;

  const clientIds = new Map<string, number>();
  const createdClients: string[] = [];
  const rejected: ImportSummary["rejected"] = [];
  const feedbackIds: number[] = [];
  let duplicates = 0;

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const clientKey = row.client_name.toLowerCase();
    let clientId = clientIds.get(clientKey);
    if (clientId === undefined) {
      const [existing] = await sql`select id from clients where lower(name) = ${clientKey}`;
      if (existing) {
        clientId = existing.id as number;
      } else if (row.client_segment) {
        const [created] = await sql`
          insert into clients (name, segment, seats, mrr)
          values (${row.client_name}, ${row.client_segment}, ${row.client_seats ?? null}, ${row.client_mrr ?? null})
          returning id`;
        clientId = created.id as number;
        createdClients.push(row.client_name);
      } else {
        rejected.push({ line, message: `client inconnu « ${row.client_name} » : précisez son segment (client_segment)` });
        continue;
      }
      clientIds.set(clientKey, clientId);
    }

    const hash = contentHash(row.client_name, row.text);
    const originalId = await findOriginal(clientId, row.client_name, row.text);
    if (originalId !== null) duplicates += 1;
    const [inserted] = await sql`
      insert into feedback (external_id, client_id, import_batch_id, channel, author, received_at, text, language, content_hash, duplicate_of)
      values (${row.external_id ?? null}, ${clientId}, ${batchId}, ${row.channel}, ${row.author ?? null}, ${row.received_at},
              ${row.text}, ${row.language ?? null}, ${hash}, ${originalId})
      returning id`;
    feedbackIds.push(inserted.id as number);
  }

  await sql`
    update import_batches
    set feedback_count = ${feedbackIds.length}, duplicate_count = ${duplicates}
    where id = ${batchId}`;
  return { batchId, imported: feedbackIds.length, duplicates, createdClients, rejected, feedbackIds };
}

export async function finishBatch(batchId: number, status: "done" | "failed", error?: string) {
  await db()`
    update import_batches set status = ${status}, error = ${error ?? null}, finished_at = now() where id = ${batchId}`;
}

export type InboxFilters = { channel?: string; segment?: string; client?: string; q?: string; kind?: string };

export type InboxItem = {
  id: number;
  externalId: string | null;
  channel: string;
  author: string | null;
  receivedAt: string;
  text: string;
  language: string | null;
  status: string;
  reviewReason: string | null;
  duplicateOf: number | null;
  client: { id: number; name: string; segment: string; mrr: number | null };
  items: Array<{ id: number; kind: string; quote: string; underlyingNeed: string; themeId: number | null; themeTitle: string | null }>;
};

/** Les retours de la boîte de réception, du plus récent au plus ancien, avec ce que le traitement en a tiré. */
export async function listInbox(filters: InboxFilters): Promise<InboxItem[]> {
  const sql = db();
  const q = filters.q?.trim() ? `%${filters.q.trim()}%` : null;
  const rows = await sql`
    select f.id, f.external_id, f.channel, f.author, f.received_at::text as received_at, f.text, f.language, f.status,
           f.review_reason, f.duplicate_of, c.id as client_id, c.name as client_name, c.segment, c.mrr,
           coalesce(
             (select json_agg(json_build_object(
                'id', r.id, 'kind', r.kind, 'quote', r.quote, 'underlyingNeed', r.underlying_need,
                'themeId', r.theme_id, 'themeTitle', t.title) order by r.id)
              from feature_requests r left join themes t on t.id = r.theme_id
              where r.feedback_id = f.id),
             '[]'::json) as items
    from feedback f
    join clients c on c.id = f.client_id
    where (${filters.channel ?? null}::text is null or f.channel = ${filters.channel ?? null})
      and (${filters.segment ?? null}::text is null or c.segment = ${filters.segment ?? null})
      and (${filters.client ?? null}::text is null or c.id::text = ${filters.client ?? null})
      and (${q}::text is null or f.text ilike ${q} or c.name ilike ${q})
      and (${filters.kind ?? null}::text is null or exists (
        select 1 from feature_requests r where r.feedback_id = f.id and r.kind = ${filters.kind ?? null}))
    order by f.received_at desc, f.id desc`;
  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    channel: row.channel,
    author: row.author,
    receivedAt: row.received_at,
    text: row.text,
    language: row.language,
    status: row.status,
    reviewReason: row.review_reason,
    duplicateOf: row.duplicate_of,
    client: { id: row.client_id, name: row.client_name, segment: row.segment, mrr: row.mrr === null ? null : Number(row.mrr) },
    items: row.items,
  }));
}

export async function inboxStats() {
  const [row] = await db()`
    select count(*)::int as total,
           count(*) filter (where duplicate_of is not null)::int as duplicates,
           count(*) filter (where status = 'processed')::int as processed,
           count(*) filter (where status = 'needs_review')::int as needs_review,
           count(distinct client_id)::int as clients
    from feedback`;
  return row as { total: number; duplicates: number; processed: number; needs_review: number; clients: number };
}

export async function listClients() {
  return (await db()`select id, name, segment from clients order by name`) as Array<{ id: number; name: string; segment: string }>;
}

export type FeedbackDetail = Omit<InboxItem, "items"> & {
  items: Array<InboxItem["items"][number] & { requestedSolution: string | null; urgency: string | null; sentiment: string | null }>;
  duplicates: number[];
};

/** Un retour complet, avec ce qui en a été extrait et ses éventuels doublons. */
export async function getFeedback(id: number): Promise<FeedbackDetail | null> {
  const sql = db();
  const [row] = await sql`
    select f.id, f.external_id, f.channel, f.author, f.received_at::text as received_at, f.text, f.language, f.status,
           f.review_reason, f.duplicate_of, c.id as client_id, c.name as client_name, c.segment, c.mrr,
           coalesce(
             (select json_agg(json_build_object(
                'id', r.id, 'kind', r.kind, 'quote', r.quote, 'underlyingNeed', r.underlying_need,
                'requestedSolution', r.requested_solution, 'urgency', r.urgency, 'sentiment', r.sentiment,
                'themeId', r.theme_id, 'themeTitle', t.title) order by r.id)
              from feature_requests r left join themes t on t.id = r.theme_id
              where r.feedback_id = f.id),
             '[]'::json) as items,
           coalesce((select array_agg(d.id order by d.id) from feedback d where d.duplicate_of = f.id), '{}') as duplicates
    from feedback f join clients c on c.id = f.client_id
    where f.id = ${id}`;
  if (!row) return null;
  return {
    id: row.id,
    externalId: row.external_id,
    channel: row.channel,
    author: row.author,
    receivedAt: row.received_at,
    text: row.text,
    language: row.language,
    status: row.status,
    reviewReason: row.review_reason,
    duplicateOf: row.duplicate_of,
    client: { id: row.client_id, name: row.client_name, segment: row.segment, mrr: row.mrr === null ? null : Number(row.mrr) },
    items: row.items,
    duplicates: row.duplicates,
  };
}

/** Le dernier import : combien de retours, ce qu'il a coûté en appels aux modèles, et combien de temps il a pris. */
export async function lastImport() {
  const [row] = await db()`
    select b.id, b.filename, b.feedback_count, b.created_at::text as created_at,
           extract(epoch from (b.finished_at - b.created_at))::float as seconds,
           coalesce((select sum(cost_usd) from pipeline_runs r where r.import_batch_id = b.id), 0)::float as cost
    from import_batches b where b.status = 'done'
    order by b.id desc limit 1`;
  return row as { id: number; filename: string; feedback_count: number; created_at: string; seconds: number | null; cost: number } | undefined;
}
