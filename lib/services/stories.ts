import { z } from "zod";
import { callStructured } from "@/lib/ai/call";
import { STORY_SYSTEM, storyPrompt } from "@/lib/ai/prompts";
import { storySchema } from "@/lib/ai/schemas";
import { db } from "@/lib/db/client";
import { BacklogError } from "@/lib/services/backlog";
import { midSentence } from "@/lib/labels";

export type Criterion = { given: string; when: string; then: string };

export type Story = {
  id: number;
  themeId: number;
  themeTitle: string;
  title: string;
  persona: string;
  want: string;
  soThat: string;
  criteria: Criterion[];
  points: number | null;
  rationale: string | null;
  references: Array<{ id: number; title: string; points: number }>;
  openQuestions: string[];
  evidence: number[];
  status: "draft" | "reviewed";
  version: number;
  createdVia: "ui" | "agent";
  updatedAt: string;
};

function mapStory(row: Record<string, unknown>, references: Map<number, { title: string; points: number }>): Story {
  const referenceIds = (row.reference_story_ids as number[]) ?? [];
  return {
    id: row.id as number,
    themeId: row.theme_id as number,
    themeTitle: row.theme_title as string,
    title: row.title as string,
    persona: row.persona as string,
    want: row.want as string,
    soThat: row.so_that as string,
    criteria: row.acceptance_criteria as Criterion[],
    points: row.complexity_points as number | null,
    rationale: row.complexity_rationale as string | null,
    references: referenceIds.filter((id) => references.has(id)).map((id) => ({ id, ...references.get(id)! })),
    openQuestions: row.open_questions as string[],
    evidence: (row.evidence_feedback_ids as number[]) ?? [],
    status: row.status as "draft" | "reviewed",
    version: row.version as number,
    createdVia: row.created_via as "ui" | "agent",
    updatedAt: row.updated_at as string,
  };
}

async function referenceMap() {
  const rows = await db()`select id, title, points from reference_stories`;
  return new Map(rows.map((row) => [row.id as number, { title: row.title as string, points: row.points as number }]));
}

export async function listStories(themeId?: number): Promise<Story[]> {
  const [rows, references] = await Promise.all([
    db()`
      select s.*, s.updated_at::text as updated_at, t.title as theme_title
      from user_stories s join themes t on t.id = s.theme_id
      where (${themeId ?? null}::int is null or s.theme_id = ${themeId ?? null})
      order by s.updated_at desc`,
    referenceMap(),
  ]);
  return rows.map((row) => mapStory(row, references));
}

export async function getStory(id: number): Promise<Story | null> {
  const [rows, references] = await Promise.all([
    db()`
      select s.*, s.updated_at::text as updated_at, t.title as theme_title
      from user_stories s join themes t on t.id = s.theme_id where s.id = ${id}`,
    referenceMap(),
  ]);
  return rows[0] ? mapStory(rows[0], references) : null;
}

/**
 * Rédige une user story à partir des preuves du thème : persona précis, bénéfice, critères Given / When / Then,
 * complexité relative aux stories de référence de l'équipe, questions ouvertes. Enregistrée en brouillon.
 */
export async function draftStory(themeId: number, via: "ui" | "agent"): Promise<Story> {
  const sql = db();
  const [theme] = await sql`select id, title, need_statement, synthesis, merged_into from themes where id = ${themeId}`;
  if (!theme || theme.merged_into) throw new BacklogError(`Le thème T${themeId} n'existe pas.`);
  const [evidence, references] = await Promise.all([
    sql`
      select f.id as feedback_id, c.name as client, c.segment, r.quote, r.underlying_need, r.requested_solution
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.theme_id = ${themeId} and r.kind = 'feature' and f.duplicate_of is null
      order by f.received_at, r.id`,
    sql`select id, title, description, points from reference_stories order by points, id`,
  ]);
  const result = await callStructured({
    task: "story",
    system: STORY_SYSTEM,
    messages: [
      {
        role: "user",
        content: storyPrompt({
          title: theme.title,
          need: theme.need_statement,
          synthesis: theme.synthesis ?? "",
          evidence: evidence.map((e) => ({ feedbackId: e.feedback_id, client: e.client, segment: e.segment, quote: e.quote, solution: e.requested_solution })),
          references: references.map((r) => ({ id: r.id, title: r.title, description: r.description, points: r.points })),
        }),
      },
    ],
    schema: storySchema,
    effort: "low",
    trace: { stage: "story", subject: `T${themeId}` },
  });
  const story = result.output;
  const allowedFeedback = new Set(evidence.map((e) => e.feedback_id as number));
  const allowedReferences = new Set(references.map((r) => r.id as number));
  const evidenceIds = story.evidence_feedback_ids.filter((id) => allowedFeedback.has(id));
  const referenceIds = story.reference_story_ids.filter((id) => allowedReferences.has(id));
  const [row] = await sql`
    insert into user_stories (theme_id, title, persona, want, so_that, acceptance_criteria, complexity_points, complexity_rationale,
                              reference_story_ids, open_questions, evidence_feedback_ids, created_via)
    values (${themeId}, ${story.title.trim()}, ${story.persona.trim()}, ${story.want.trim()}, ${story.so_that.trim()},
            ${JSON.stringify(story.acceptance_criteria)}::jsonb, ${Number(story.complexity_points)}, ${story.complexity_rationale.trim()},
            ${referenceIds}, ${JSON.stringify(story.open_questions)}::jsonb, ${evidenceIds.length > 0 ? evidenceIds : [...allowedFeedback].slice(0, 6)}, ${via})
    returning id`;
  return (await getStory(row.id))!;
}

export const storyEditSchema = z.object({
  title: z.string().trim().min(3),
  persona: z.string().trim().min(2),
  want: z.string().trim().min(3),
  soThat: z.string().trim().min(3),
  criteria: z.array(z.object({ given: z.string().trim().min(1), when: z.string().trim().min(1), then: z.string().trim().min(1) })).min(1),
  openQuestions: z.array(z.string().trim().min(1)),
  status: z.enum(["draft", "reviewed"]),
});

/** Le PO réécrit sa story : chaque enregistrement crée une nouvelle version, ses modifications ne sont jamais écrasées. */
export async function updateStory(id: number, input: z.infer<typeof storyEditSchema>) {
  const data = storyEditSchema.parse(input);
  const [row] = await db()`
    update user_stories set title = ${data.title}, persona = ${data.persona}, want = ${data.want}, so_that = ${data.soThat},
      acceptance_criteria = ${JSON.stringify(data.criteria)}::jsonb, open_questions = ${JSON.stringify(data.openQuestions)}::jsonb,
      status = ${data.status}, version = version + 1, updated_at = now()
    where id = ${id} returning id`;
  if (!row) throw new BacklogError(`La story S${id} n'existe pas.`);
}

/** Export Markdown d'une story, prêt à coller dans un outil de ticketing. */
export function storyToMarkdown(story: Story): string {
  const lines = [
    `# ${story.title}`,
    "",
    `**En tant que** ${midSentence(story.persona)}, **je veux** ${midSentence(story.want)}, **afin de** ${midSentence(story.soThat)}.`,
    "",
    "## Critères d'acceptation",
    "",
    ...story.criteria.flatMap((criterion, index) => [
      `${index + 1}. **Étant donné** ${midSentence(criterion.given)}`,
      `   **quand** ${midSentence(criterion.when)}`,
      `   **alors** ${midSentence(criterion.then)}`,
    ]),
    "",
    "## Complexité",
    "",
    `${story.points ?? "?"} points, par comparaison avec : ${story.references.map((ref) => `${ref.title} (${ref.points})`).join(", ") || "aucune référence"}.`,
    story.rationale ? `${story.rationale}` : "",
    "",
    "## Questions ouvertes",
    "",
    ...story.openQuestions.map((question) => `- ${question}`),
    "",
    `## Preuves`,
    "",
    `Thème T${story.themeId} (${story.themeTitle}), retours ${story.evidence.map((id) => `F${id}`).join(", ")}.`,
    "",
  ];
  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
}
