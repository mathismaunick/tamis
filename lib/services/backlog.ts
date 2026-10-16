import { db } from "@/lib/db/client";
import type { Facet } from "@/lib/facets";
import { EFFORT_VALUES, IMPACT_VALUES } from "@/lib/ai/schemas";
import { refreshThemeStats, rescoreAll, themeIndicators } from "@/lib/services/themes";

export type ThemeRow = {
  id: number;
  title: string;
  needStatement: string;
  status: string;
  statusReason: string | null;
  reach: number;
  messages: number;
  segments: string[];
  mrr: number;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  score: number | null;
  rank: number | null;
  moscow: string | null;
  moscowSource: string;
  churnRisk: boolean;
  alreadyExists: string | null;
  /** Le client qui a écrit le plus sur ce thème : pour repérer un client bruyant d'un coup d'œil. */
  topClient: { name: string; messages: number } | null;
  /** Accord des propositions du modèle pour chaque facteur (« 2/3 »), et l'origine de chaque facteur. */
  agreement: Record<string, string>;
  factorSources: Record<string, string>;
};

/** Le premier facteur proposé par l'IA sur lequel ses propositions ne sont pas unanimes, s'il y en a un. */
export function doubtfulFactor(theme: Pick<ThemeRow, "agreement" | "factorSources">): "impact" | "confidence" | "effort" | null {
  for (const factor of ["impact", "confidence", "effort"] as const) {
    if (theme.factorSources[factor] !== "model") continue;
    const [agree, total] = (theme.agreement[factor] ?? "").split("/").map(Number);
    if (Number.isFinite(agree) && Number.isFinite(total) && agree < total) return factor;
  }
  return null;
}

/** Le backlog : tous les thèmes actifs, classés, avec ce qu'il faut pour décider d'un coup d'œil. */
export async function listThemes(): Promise<ThemeRow[]> {
  const rows = await db()`
    select t.id, t.title, t.need_statement, t.status, t.status_reason, t.reach, t.impact::float, t.confidence::float, t.effort,
           t.rice_score::float as score, t.rank, t.moscow, t.moscow_source, t.signals, t.factor_sources,
           count(distinct f.id)::int as messages,
           coalesce(array_agg(distinct c.segment) filter (where c.segment is not null), '{}') as segments,
           coalesce((select sum(c2.mrr) from clients c2 where c2.id in (
             select f2.client_id from feature_requests r2 join feedback f2 on f2.id = r2.feedback_id
             where r2.theme_id = t.id and f2.duplicate_of is null)), 0)::float as mrr,
           (select json_build_object('name', c3.name, 'messages', count(distinct f3.id))
              from feature_requests r3 join feedback f3 on f3.id = r3.feedback_id join clients c3 on c3.id = f3.client_id
              where r3.theme_id = t.id and r3.kind = 'feature' and f3.duplicate_of is null
              group by c3.name order by count(distinct f3.id) desc, c3.name limit 1) as top_client
    from themes t
    left join feature_requests r on r.theme_id = t.id and r.kind = 'feature'
    left join feedback f on f.id = r.feedback_id and f.duplicate_of is null
    left join clients c on c.id = f.client_id
    where t.merged_into is null
    group by t.id
    order by t.rank nulls last, t.rice_score desc nulls last, t.id`;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    needStatement: row.need_statement,
    status: row.status,
    statusReason: row.status_reason,
    reach: row.reach,
    messages: row.messages,
    segments: (row.segments as string[]).sort((a, b) => ["enterprise", "pro", "starter"].indexOf(a) - ["enterprise", "pro", "starter"].indexOf(b)),
    mrr: row.mrr,
    impact: row.impact,
    confidence: row.confidence,
    effort: row.effort,
    score: row.score,
    rank: row.rank,
    moscow: row.moscow,
    moscowSource: row.moscow_source,
    churnRisk: Boolean(row.signals?.churnRisk),
    alreadyExists: row.signals?.alreadyExists ?? null,
    topClient: row.top_client ? { name: row.top_client.name, messages: Number(row.top_client.messages) } : null,
    agreement: row.signals?.agreement ?? {},
    factorSources: row.factor_sources ?? {},
  }));
}

export type ThemeDetail = ThemeRow & {
  synthesis: string | null;
  /** Les facettes du besoin, chacune avec les retours qui la portent. */
  facets: Facet[];
  factorJustifications: Record<string, string>;
  channels: number;
  topClientShare: number;
  clients: Array<{ id: number; name: string; segment: string; mrr: number | null; messages: number; churnRisk: boolean }>;
  evidence: Array<{ requestId: number; feedbackId: number; client: string; segment: string; channel: string; date: string; quote: string; need: string; solution: string | null; urgency: string | null }>;
  changes: ChangeRow[];
  mergedThemes: Array<{ id: number; title: string }>;
};

export async function getThemeDetail(id: number): Promise<ThemeDetail | null> {
  const sql = db();
  const [theme] = await sql`
    select id, title, need_statement, synthesis, status, status_reason, reach, impact::float, confidence::float, effort,
           rice_score::float as score, rank, moscow, moscow_source, signals, factor_sources, factor_justifications, merged_into
    from themes where id = ${id}`;
  if (!theme) return null;
  const [evidence, indicators, changes, merged] = await Promise.all([
    sql`
      select r.id as request_id, f.id as feedback_id, c.id as client_id, c.name as client, c.segment, c.mrr::float as mrr,
             f.channel, f.received_at::text as date, r.quote, r.underlying_need, r.requested_solution, r.urgency
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.theme_id = ${id} and r.kind = 'feature' and f.duplicate_of is null
      order by f.received_at, r.id`,
    themeIndicators(id),
    listChanges({ themeId: id }),
    sql`select id, title from themes where merged_into = ${id} order by id`,
  ]);
  const clients = new Map<number, ThemeDetail["clients"][number]>();
  for (const row of evidence) {
    const client = clients.get(row.client_id) ?? { id: row.client_id, name: row.client, segment: row.segment, mrr: row.mrr, messages: 0, churnRisk: false };
    client.messages += 1;
    if (row.urgency === "churn_risk") client.churnRisk = true;
    clients.set(row.client_id, client);
  }
  return {
    id: theme.id,
    title: theme.title,
    needStatement: theme.need_statement,
    synthesis: theme.synthesis,
    status: theme.status,
    statusReason: theme.status_reason,
    reach: theme.reach,
    messages: indicators.messages,
    segments: indicators.segments,
    mrr: indicators.mrr,
    impact: theme.impact,
    confidence: theme.confidence,
    effort: theme.effort,
    score: theme.score,
    rank: theme.rank,
    moscow: theme.moscow,
    moscowSource: theme.moscow_source,
    churnRisk: Boolean(theme.signals?.churnRisk),
    alreadyExists: theme.signals?.alreadyExists ?? null,
    topClient: null,
    facets: (theme.signals?.facets ?? []) as Facet[],
    agreement: theme.signals?.agreement ?? {},
    factorSources: theme.factor_sources ?? {},
    factorJustifications: theme.factor_justifications ?? {},
    channels: indicators.channels,
    topClientShare: indicators.topClientShare,
    clients: [...clients.values()].sort((a, b) => b.messages - a.messages || (b.mrr ?? 0) - (a.mrr ?? 0)),
    evidence: evidence.map((row) => ({
      requestId: row.request_id,
      feedbackId: row.feedback_id,
      client: row.client,
      segment: row.segment,
      channel: row.channel,
      date: row.date,
      quote: row.quote,
      need: row.underlying_need,
      solution: row.requested_solution,
      urgency: row.urgency,
    })),
    changes,
    mergedThemes: merged.map((row) => ({ id: row.id, title: row.title })),
  };
}

export type ChangeRow = {
  id: number;
  themeId: number;
  themeTitle: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  actor: string;
  via: string;
  createdAt: string;
};

export async function listChanges(filter: { themeId?: number; limit?: number } = {}): Promise<ChangeRow[]> {
  const rows = await db()`
    select s.id, s.theme_id, t.title, s.field, s.old_value, s.new_value, s.reason, s.actor, s.via, s.created_at::text as created_at
    from score_changes s join themes t on t.id = s.theme_id
    where (${filter.themeId ?? null}::int is null or s.theme_id = ${filter.themeId ?? null})
    order by s.created_at desc, s.id desc
    limit ${filter.limit ?? 200}`;
  return rows.map((row) => ({
    id: row.id,
    themeId: row.theme_id,
    themeTitle: row.title,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: row.reason,
    actor: row.actor,
    via: row.via,
    createdAt: row.created_at,
  }));
}

export type Via = "ui" | "agent";

export class BacklogError extends Error {}

/** Valeurs que le PO peut choisir. La confiance proposée par le modèle est 0,5, 0,8 ou 1 ; le PO, lui, peut nuancer. */
export const FACTOR_OPTIONS = {
  impact: IMPACT_VALUES as readonly number[],
  confidence: [0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as readonly number[],
  effort: EFFORT_VALUES as readonly number[],
};

/**
 * Le PO ajuste un facteur : la valeur est validée, l'origine devient « PO », la raison est obligatoire,
 * la modification entre au journal, et tout le backlog est reclassé par le code.
 */
export async function updateFactor(themeId: number, factor: "impact" | "confidence" | "effort", value: number, reason: string, via: Via) {
  if (!FACTOR_OPTIONS[factor].includes(value)) throw new BacklogError(`Valeur non autorisée pour ${factor} : ${value}`);
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new BacklogError("Indiquez la raison de ce changement : elle sera dans le journal.");
  const sql = db();
  const [theme] = await sql`select impact::float, confidence::float, effort, factor_sources, merged_into from themes where id = ${themeId}`;
  if (!theme || theme.merged_into) throw new BacklogError(`Le thème T${themeId} n'existe pas ou a été fusionné.`);
  const previous = theme[factor] as number | null;
  const sources = { ...(theme.factor_sources as Record<string, string>), [factor]: "po" };
  await sql.transaction([
    sql`update themes set ${sql.unsafe(factor)} = ${value}, factor_sources = ${JSON.stringify(sources)}::jsonb, updated_at = now() where id = ${themeId}`,
    sql`insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
        values (${themeId}, ${factor}, ${previous === null ? null : String(previous)}, ${String(value)}, ${trimmed}, 'po', ${via})`,
  ]);
  await rescoreAll();
}

export const STATUSES = ["new", "triaged", "planned", "parked", "shipped"] as const;
export type ThemeStatus = (typeof STATUSES)[number];

/** Changer le statut d'un thème. Parquer exige une raison : un PO passe son temps à dire non, et ce non se trace. */
export async function updateStatus(themeId: number, status: ThemeStatus, reason: string, via: Via) {
  if (!STATUSES.includes(status)) throw new BacklogError(`Statut inconnu : ${status}`);
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new BacklogError("Indiquez la raison de ce changement de statut : elle sera dans le journal.");
  const sql = db();
  const [theme] = await sql`select status, merged_into from themes where id = ${themeId}`;
  if (!theme || theme.merged_into) throw new BacklogError(`Le thème T${themeId} n'existe pas ou a été fusionné.`);
  await sql.transaction([
    sql`update themes set status = ${status}, status_reason = ${trimmed}, updated_at = now() where id = ${themeId}`,
    sql`insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
        values (${themeId}, 'status', ${theme.status}, ${status}, ${trimmed}, 'po', ${via})`,
  ]);
  await rescoreAll();
}

/** Le PO choisit la catégorie MoSCoW : son choix n'est plus recalculé. « Auto » rend la main au calcul. */
export async function updateMoscow(themeId: number, moscow: "must" | "should" | "could" | "wont" | "auto", reason: string) {
  const sql = db();
  const [theme] = await sql`select moscow from themes where id = ${themeId}`;
  if (!theme) throw new BacklogError(`Le thème T${themeId} n'existe pas.`);
  if (moscow === "auto") {
    await sql`update themes set moscow_source = 'computed', updated_at = now() where id = ${themeId}`;
  } else {
    await sql`update themes set moscow = ${moscow}, moscow_source = 'po', updated_at = now() where id = ${themeId}`;
  }
  await sql`
    insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
    values (${themeId}, 'moscow', ${theme.moscow}, ${moscow === "auto" ? "calcul automatique" : moscow}, ${reason.trim() || null}, 'po', 'ui')`;
  await rescoreAll();
}

/**
 * Fusionner deux thèmes que le regroupement a séparés : les demandes rejoignent le thème cible, le thème source
 * est conservé (marqué fusionné) pour la traçabilité, et la cible est recalculée.
 */
export async function mergeThemes(sourceId: number, targetId: number, reason: string) {
  if (sourceId === targetId) throw new BacklogError("Choisissez un autre thème que celui-ci.");
  const sql = db();
  const themes = await sql`select id, title, merged_into from themes where id in (${sourceId}, ${targetId})`;
  if (themes.length !== 2 || themes.some((theme) => theme.merged_into)) throw new BacklogError("Un des deux thèmes n'existe pas ou a déjà été fusionné.");
  const source = themes.find((theme) => theme.id === sourceId)!;
  const target = themes.find((theme) => theme.id === targetId)!;
  await sql.transaction([
    sql`update feature_requests set theme_id = ${targetId} where theme_id = ${sourceId}`,
    sql`update themes set merged_into = ${targetId}, rank = null, updated_at = now() where id = ${sourceId}`,
    sql`insert into score_changes (theme_id, field, old_value, new_value, reason, actor, via)
        values (${targetId}, 'merge', ${`T${sourceId} · ${source.title}`}, ${`T${targetId} · ${target.title}`}, ${reason.trim() || null}, 'po', 'ui')`,
  ]);
  await refreshThemeStats([targetId]);
  await rescoreAll();
}

export async function listThemeOptions(): Promise<Array<{ id: number; title: string }>> {
  return (await db()`select id, title from themes where merged_into is null order by title`) as Array<{ id: number; title: string }>;
}

export async function listBugs() {
  return (await db()`
    select r.id, r.underlying_need, r.quote, f.id as feedback_id, c.name as client
    from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
    where r.kind = 'bug' and f.duplicate_of is null
    order by f.received_at desc`) as Array<{ id: number; underlying_need: string; quote: string; feedback_id: number; client: string }>;
}
