import { db } from "@/lib/db/client";
import { listThemes } from "@/lib/services/backlog";
import { trendOf, trendSplit, type Trend } from "@/lib/trends";

export type HomeNeed = {
  id: number;
  title: string;
  clients: number;
  /** Le segment de chaque client qui l'exprime, du plus gros au plus petit : un point par client à l'écran. */
  segments: string[];
  messages: number;
  effort: number | null;
  moscow: string | null;
  rank: number | null;
  status: string;
  alreadyExists: boolean;
  trend: Trend;
};

const SEGMENT_ORDER = ["enterprise", "pro", "starter"];

export type HomeOverview = {
  feedback: number;
  duplicates: number;
  channels: number;
  clients: number;
  requests: number;
  bugs: number;
  /** Les besoins actifs, du plus demandé au moins demandé, avec leur tendance. */
  needs: HomeNeed[];
  moscow: Record<"must" | "should" | "could" | "wont", number>;
  /** Les besoins Must, et combien ont déjà une story. */
  must: { total: number; withStory: number; firstWithoutStory: { id: number; title: string } | null };
  /** La date à partir de laquelle une demande est « récente ». */
  trendSince: string | null;
};

/**
 * Ce que l'agent montre à l'arrivée : ce qu'il a fait des retours (combien, en combien de besoins, dont combien en
 * hausse), le classement en catégories MoSCoW, et les stories qui manquent. Tout est compté par le code.
 */
export async function homeOverview(): Promise<HomeOverview> {
  const sql = db();
  const [themes, [counts], dated, stories, clientSegments] = await Promise.all([
    listThemes(),
    sql`
      select (select count(*) from feedback)::int as feedback,
             (select count(*) from feedback where duplicate_of is not null)::int as duplicates,
             (select count(distinct channel) from feedback)::int as channels,
             (select count(distinct client_id) from feedback)::int as clients,
             (select count(*) from feature_requests r join feedback f on f.id = r.feedback_id
               where r.kind = 'feature' and f.duplicate_of is null)::int as requests,
             (select count(*) from feature_requests r join feedback f on f.id = r.feedback_id
               where r.kind = 'bug' and f.duplicate_of is null)::int as bugs`,
    sql`
      select distinct r.theme_id, f.id, f.received_at::text as date
      from feature_requests r join feedback f on f.id = r.feedback_id
      where r.kind = 'feature' and r.theme_id is not null and f.duplicate_of is null`,
    sql`select theme_id, count(*)::int as n from user_stories group by theme_id`,
    sql`
      select distinct r.theme_id, f.client_id, c.segment
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.kind = 'feature' and r.theme_id is not null and f.duplicate_of is null`,
  ]);
  const segmentsOf = (themeId: number) =>
    clientSegments
      .filter((row) => row.theme_id === themeId)
      .map((row) => row.segment as string)
      .sort((a, b) => SEGMENT_ORDER.indexOf(a) - SEGMENT_ORDER.indexOf(b));

  const split = trendSplit(dated.map((row) => row.date as string));
  const datesOf = (themeId: number) => dated.filter((row) => row.theme_id === themeId).map((row) => row.date as string);
  const withStory = new Set(stories.map((row) => row.theme_id as number));
  const ranked = themes.filter((theme) => theme.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const must = ranked.filter((theme) => theme.moscow === "must");
  const firstWithoutStory = must.find((theme) => !withStory.has(theme.id));

  return {
    feedback: counts.feedback,
    duplicates: counts.duplicates,
    channels: counts.channels,
    clients: counts.clients,
    requests: counts.requests,
    bugs: counts.bugs,
    needs: themes
      .map((theme) => ({
        id: theme.id,
        title: theme.title,
        clients: theme.reach,
        segments: segmentsOf(theme.id),
        messages: theme.messages,
        effort: theme.effort,
        moscow: theme.moscow,
        rank: theme.rank,
        status: theme.status,
        alreadyExists: Boolean(theme.alreadyExists),
        trend: trendOf(datesOf(theme.id), split),
      }))
      .sort((a, b) => b.clients - a.clients || (a.rank ?? 99) - (b.rank ?? 99)),
    moscow: {
      must: ranked.filter((theme) => theme.moscow === "must").length,
      should: ranked.filter((theme) => theme.moscow === "should").length,
      could: ranked.filter((theme) => theme.moscow === "could").length,
      wont: ranked.filter((theme) => theme.moscow === "wont").length,
    },
    must: {
      total: must.length,
      withStory: must.filter((theme) => withStory.has(theme.id)).length,
      firstWithoutStory: firstWithoutStory ? { id: firstWithoutStory.id, title: firstWithoutStory.title } : null,
    },
    trendSince: split,
  };
}
