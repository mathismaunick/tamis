import { db } from "@/lib/db/client";
import { plural } from "@/lib/labels";
import { PRODUCT } from "@/lib/product";
import { listThemes, type ThemeRow } from "@/lib/services/backlog";
import { describeProposal } from "@/lib/services/proposals";

export type DecisionKind = "churn" | "proposal" | "confirm" | "exists" | "merge" | "story";

/** Une décision qui attend le PO : ce qu'il doit trancher, en une question, et où le faire. */
export type Decision = {
  kind: DecisionKind;
  /** La décision, formulée comme une question. */
  title: string;
  detail: string;
  href: string;
  action: string;
  /** La question à poser à l'agent : un clic la lui envoie. Sans question, la ligne mène à `href`. */
  question?: string;
  /** Le point de couleur : rouge pour un risque de départ, ambre pour ce que l'IA n'a pas su trancher. */
  signal: "rouge" | "ambre" | null;
};

type Factor = "impact" | "confidence" | "effort";

export type DecisionTheme = Pick<ThemeRow, "id" | "title" | "status" | "rank" | "moscow" | "reach" | "messages" | "churnRisk" | "alreadyExists"> & {
  /** Accord des propositions du modèle par facteur (« 2/3 »). */
  agreement: Record<string, string>;
  /** Origine de chaque facteur : code, model ou po. */
  sources: Record<string, string>;
  stories: number;
  /** Les clients qui menacent de partir, du plus bavard au moins bavard. */
  churnClients: string[];
};

export type DecisionInput = {
  themes: DecisionTheme[];
  /** Fusions faites par la consolidation au dernier import : le thème qui a absorbé un petit thème. */
  merges: Array<{ targetId: number; targetTitle: string }>;
  proposals: Array<{ themeId: number; themeTitle: string; label: string }>;
};

/** « de l'impact », « de la confiance » : le facteur dans une phrase, et le pronom qui le reprend. */
const FACTOR_OF: Record<Factor, string> = { impact: "de l'impact", confidence: "de la confiance", effort: "de l'effort" };
const FACTOR_PRONOUN: Record<Factor, string> = { impact: "le", confidence: "la", effort: "le" };
const FACTORS: Factor[] = ["impact", "confidence", "effort"];

/** Un thème est encore à décider tant que le PO ne l'a ni planifié, ni parqué, ni livré. */
const undecided = (theme: DecisionTheme) => theme.status === "new" || theme.status === "triaged";

/** « 2/3 » : les propositions du modèle ne sont pas unanimes. */
export function isDisputed(agreement: string | undefined): boolean {
  if (!agreement) return false;
  const [agree, total] = agreement.split("/").map(Number);
  return Number.isFinite(agree) && Number.isFinite(total) && agree < total;
}

/** Deux titres, ou deux et « 1 autre » : de quoi reconnaître les besoins sans les énumérer. */
function shortList(titles: string[]): string {
  return titles.length > 2 ? `${titles.slice(0, 2).join(", ")} et ${plural(titles.length - 2, "autre")}` : titles.join(", ");
}

/**
 * La file « À décider », de la plus urgente à la plus simple, chaque décision formulée comme une question que l'on
 * envoie à l'agent d'un clic. Une décision disparaît quand le PO l'a prise : un statut posé, un facteur confirmé,
 * une story rédigée, une proposition traitée. Du code pur, testé.
 */
export function buildDecisions({ themes, merges, proposals }: DecisionInput): Decision[] {
  const decisions: Decision[] = [];

  for (const theme of themes.filter((t) => undecided(t) && t.churnRisk)) {
    const who = theme.churnClients[0] ?? "Un client";
    decisions.push({
      kind: "churn",
      title: `${who} menace de partir : faut-il remonter son besoin ?`,
      detail: `${theme.title} · ${plural(theme.reach, "client")}, ${plural(theme.messages, "message")}`,
      href: `/themes/${theme.id}`,
      action: "Demander",
      question: `${who} menace de partir sans « ${theme.title} ». Je remonte ce besoin ?`,
      signal: "rouge",
    });
  }

  for (const proposal of proposals) {
    decisions.push({
      kind: "proposal",
      title: "Une proposition de l'agent attend votre décision",
      detail: `${proposal.themeTitle} · ${proposal.label}`,
      href: `/themes/${proposal.themeId}`,
      action: "Examiner",
      signal: null,
    });
  }

  const disputed = themes
    .filter((t) => undecided(t) && t.rank !== null)
    .map((theme) => ({ theme, factor: FACTORS.find((f) => theme.sources[f] === "model" && isDisputed(theme.agreement[f])) }))
    .filter((entry): entry is { theme: DecisionTheme; factor: Factor } => entry.factor !== undefined)
    .sort((a, b) => a.theme.rank! - b.theme.rank!)
    .slice(0, 2);
  for (const { theme, factor } of disputed) {
    decisions.push({
      kind: "confirm",
      title: `L'IA n'est pas sûre ${FACTOR_OF[factor]} : ${FACTOR_PRONOUN[factor]} garder ?`,
      detail: theme.title,
      href: `/themes/${theme.id}`,
      action: "Demander",
      question: `L'IA n'est pas sûre ${FACTOR_OF[factor]} de « ${theme.title} ». Qu'en pensez-vous ?`,
      signal: "ambre",
    });
  }

  for (const theme of themes.filter((t) => undecided(t) && t.alreadyExists)) {
    decisions.push({
      kind: "exists",
      title: `Existe peut-être déjà : que répondre ${theme.reach > 1 ? "aux clients" : "au client"} ?`,
      detail: `${theme.title} · ${plural(theme.reach, "client")}`,
      href: `/themes/${theme.id}`,
      action: "Demander",
      question: `« ${theme.title} » existe peut-être déjà dans ${PRODUCT.name}. Que répondre au client, et faut-il garder ce besoin ?`,
      signal: null,
    });
  }

  if (merges.length > 0) {
    decisions.push({
      kind: "merge",
      title:
        merges.length === 1
          ? "Un petit besoin regroupé par Tamis : ce regroupement tient-il ?"
          : `${merges.length} petits besoins regroupés par Tamis : ces regroupements tiennent-ils ?`,
      detail: shortList([...new Set(merges.map((merge) => merge.targetTitle))]),
      href: "/changes",
      action: "Demander",
      question: `Au dernier import, Tamis a regroupé ${plural(merges.length, "petit besoin", "petits besoins")} avec d'autres. Ces regroupements tiennent-ils ?`,
      signal: null,
    });
  }

  const withoutStory = themes
    .filter((t) => t.moscow === "must" && t.rank !== null && t.stories === 0 && t.status !== "parked" && t.status !== "shipped")
    .sort((a, b) => a.rank! - b.rank!);
  if (withoutStory.length > 0) {
    const [first] = withoutStory;
    decisions.push({
      kind: "story",
      title: withoutStory.length === 1 ? "Un besoin Must sans story : la rédiger ?" : `${withoutStory.length} besoins Must sans story : laquelle rédiger d'abord ?`,
      detail: shortList(withoutStory.map((theme) => theme.title)),
      href: `/themes/${first.id}`,
      action: "Demander",
      question:
        withoutStory.length === 1
          ? `Rédige la story de « ${first.title} ».`
          : "Quels besoins Must n'ont pas encore de story, et laquelle rédiger d'abord ?",
      signal: null,
    });
  }

  return decisions;
}

/** Les décisions en attente, lues dans la base. */
export async function listDecisions(): Promise<Decision[]> {
  const sql = db();
  const [themes, extra, churn, merges, stories, proposals] = await Promise.all([
    listThemes(),
    sql`select id, coalesce(signals->'agreement', '{}'::jsonb) as agreement, coalesce(factor_sources, '{}'::jsonb) as sources
        from themes where merged_into is null`,
    sql`
      select r.theme_id, c.name, count(distinct f.id)::int as messages
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.urgency = 'churn_risk' and r.kind = 'feature' and f.duplicate_of is null
      group by r.theme_id, c.name
      order by messages desc, c.name`,
    sql`
      select s.theme_id as target_id, t.title as target_title
      from score_changes s join themes t on t.id = s.theme_id
      where s.field = 'merge' and s.actor = 'pipeline'
        and s.created_at >= coalesce((select max(created_at) from import_batches where status = 'done'), now() - interval '7 days')`,
    sql`select theme_id, count(*)::int as n from user_stories group by theme_id`,
    sql`
      select p.theme_id, t.title, p.payload
      from agent_proposals p join themes t on t.id = p.theme_id
      where p.status = 'pending'
      order by p.created_at`,
  ]);
  const extraById = new Map(extra.map((row) => [row.id as number, row]));
  const storiesById = new Map(stories.map((row) => [row.theme_id as number, row.n as number]));
  return buildDecisions({
    themes: themes.map((theme) => ({
      ...theme,
      agreement: (extraById.get(theme.id)?.agreement ?? {}) as Record<string, string>,
      sources: (extraById.get(theme.id)?.sources ?? {}) as Record<string, string>,
      stories: storiesById.get(theme.id) ?? 0,
      churnClients: churn.filter((row) => row.theme_id === theme.id).map((row) => row.name as string),
    })),
    merges: merges.map((row) => ({ targetId: row.target_id as number, targetTitle: row.target_title as string })),
    proposals: proposals.map((row) => ({
      themeId: row.theme_id as number,
      themeTitle: row.title as string,
      label: describeProposal(row.payload as Record<string, unknown>),
    })),
  });
}
