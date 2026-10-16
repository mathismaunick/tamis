import { db } from "@/lib/db/client";
import { computeRice, rankThemes, suggestMoscow, type Moscow } from "@/lib/scoring/rice";

export type ThemeIndicators = {
  reach: number;
  messages: number;
  segments: string[];
  channels: number;
  topClientShare: number;
  churnRisk: boolean;
  mrr: number;
};

/**
 * Les indicateurs d'un thème, calculés par le code : clients distincts (le Reach), messages, segments,
 * canaux, concentration sur le client le plus actif, menace de départ, revenu mensuel concerné.
 * Les doublons n'ont pas de demande : ils ne comptent jamais.
 */
export async function themeIndicators(themeId: number): Promise<ThemeIndicators> {
  const rows = await db()`
    select c.id as client_id, c.segment, coalesce(c.mrr, 0)::float as mrr, f.channel, f.id as feedback_id, r.urgency
    from feature_requests r
    join feedback f on f.id = r.feedback_id
    join clients c on c.id = f.client_id
    where r.theme_id = ${themeId} and r.kind = 'feature' and f.duplicate_of is null`;
  const messagesByClient = new Map<number, Set<number>>();
  const mrrByClient = new Map<number, number>();
  for (const row of rows) {
    const set = messagesByClient.get(row.client_id) ?? new Set<number>();
    set.add(row.feedback_id);
    messagesByClient.set(row.client_id, set);
    mrrByClient.set(row.client_id, row.mrr);
  }
  const messages = new Set(rows.map((row) => row.feedback_id)).size;
  const top = Math.max(0, ...[...messagesByClient.values()].map((set) => set.size));
  return {
    reach: messagesByClient.size,
    messages,
    segments: [...new Set(rows.map((row) => row.segment as string))].sort(),
    channels: new Set(rows.map((row) => row.channel)).size,
    topClientShare: messages === 0 ? 0 : top / messages,
    churnRisk: rows.some((row) => row.urgency === "churn_risk"),
    mrr: [...mrrByClient.values()].reduce((sum, value) => sum + value, 0),
  };
}

/** Recalcule le Reach et le vecteur moyen des thèmes donnés. */
export async function refreshThemeStats(themeIds: number[]) {
  const sql = db();
  for (const themeId of themeIds) {
    const indicators = await themeIndicators(themeId);
    await sql`
      update themes set
        reach = ${indicators.reach},
        embedding = (select avg(embedding) from feature_requests where theme_id = ${themeId} and embedding is not null),
        signals = signals || ${JSON.stringify({ churnRisk: indicators.churnRisk })}::jsonb,
        updated_at = now()
      where id = ${themeId}`;
  }
}

/**
 * Recalcule le score, le rang et le MoSCoW suggéré de tout le backlog : c'est du code, déterministe,
 * relancé après chaque modification d'un facteur ou d'un statut.
 */
export async function rescoreAll() {
  const sql = db();
  const themes = await sql`
    select id, reach, impact::float, confidence::float, effort, status, moscow, moscow_source
    from themes where merged_into is null`;
  const scores = new Map(
    themes.map((theme) => [
      theme.id as number,
      computeRice({ reach: theme.reach, impact: theme.impact, confidence: theme.confidence, effort: theme.effort }),
    ]),
  );
  const ranks = rankThemes(themes.map((theme) => ({ id: theme.id, score: scores.get(theme.id) ?? null, reach: theme.reach, status: theme.status })));
  const moscow = suggestMoscow(
    themes.map((theme) => ({
      id: theme.id,
      rank: ranks.get(theme.id) ?? null,
      status: theme.status,
      moscow: theme.moscow as Moscow | null,
      moscowSource: theme.moscow_source,
      effort: theme.effort,
    })),
  );
  if (themes.length === 0) return;
  await sql`
    update themes as t set rice_score = v.score, rank = v.rank, moscow = v.moscow
    from unnest(
      ${themes.map((theme) => theme.id)}::int[],
      ${themes.map((theme) => scores.get(theme.id))}::numeric[],
      ${themes.map((theme) => ranks.get(theme.id))}::int[],
      ${themes.map((theme) => moscow.get(theme.id))}::text[]
    ) as v(id, score, rank, moscow)
    where t.id = v.id`;
}
