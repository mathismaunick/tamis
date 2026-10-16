/**
 * E7 (qualité des user stories) : une story par thème de tête, notée par un juge d'une autre famille de modèles
 * sur une grille de six critères (0 à 2). Le juge est un instrument, pas une autorité : la relecture humaine reste.
 */
import { z } from "zod";
import { callStructured } from "../lib/ai/call";
import { STORY_SYSTEM, storyPrompt } from "../lib/ai/prompts";
import { storySchema } from "../lib/ai/schemas";
import { db } from "../lib/db/client";

const score = z.enum(["0", "1", "2"]);

export const RUBRIC = {
  persona: "Le persona est précis (un métier, un contexte), pas « un utilisateur ».",
  benefit: "Le bénéfice (« afin de ») est explicite et vient des clients.",
  observable: "Chaque critère est observable et testable, au format Étant donné / Quand / Alors.",
  coverage: "Les critères couvrent les cas cités dans les preuves.",
  complexity: "La complexité est justifiée par comparaison avec des stories de référence.",
  grounded: "Aucune fonctionnalité n'est inventée : tout vient des preuves.",
} as const;

const judgeSchema = z.object({
  persona: score,
  benefit: score,
  observable: score,
  coverage: score,
  complexity: score,
  grounded: score,
  comment: z.string().describe("Une ou deux phrases sur le point le plus faible."),
});

const JUDGE_SYSTEM = `Tu évalues une user story rédigée à partir de retours clients, avec une grille stricte. Pour chaque critère, note 2 (pleinement satisfait), 1 (partiellement) ou 0 (absent ou faux). Sois exigeant : un 2 se mérite.
${Object.entries(RUBRIC)
  .map(([key, text]) => `- ${key} : ${text}`)
  .join("\n")}`;

export type StoryCase = { themeId: number; title: string; scores: Record<keyof typeof RUBRIC, number>; mean: number; comment: string };

export async function evalStories(writerModel: string, judgeModel: string, themeCount = 3) {
  const sql = db();
  const themes = await sql`
    select id, title, need_statement, synthesis from themes
    where merged_into is null and rank is not null order by rank limit ${themeCount}`;
  const references = await sql`select id, title, description, points from reference_stories order by points, id`;
  let costUsd = 0;
  const cases: StoryCase[] = [];
  for (const theme of themes) {
    const evidence = await sql`
      select f.id as feedback_id, c.name as client, c.segment, r.quote, r.requested_solution
      from feature_requests r join feedback f on f.id = r.feedback_id join clients c on c.id = f.client_id
      where r.theme_id = ${theme.id} and r.kind = 'feature' and f.duplicate_of is null order by f.received_at`;
    const prompt = storyPrompt({
      title: theme.title,
      need: theme.need_statement,
      synthesis: theme.synthesis ?? "",
      evidence: evidence.map((e) => ({ feedbackId: e.feedback_id, client: e.client, segment: e.segment, quote: e.quote, solution: e.requested_solution })),
      references: references.map((r) => ({ id: r.id, title: r.title, description: r.description, points: r.points })),
    });
    const story = await callStructured({
      task: "story",
      system: STORY_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      schema: storySchema,
      effort: "low",
      trace: { stage: "eval-story" },
      model: writerModel,
      record: false,
    });
    const judged = await callStructured({
      task: "judge",
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: `${prompt}\n<story>\n${JSON.stringify(story.output, null, 2)}\n</story>` }],
      schema: judgeSchema,
      effort: "low",
      trace: { stage: "eval-judge" },
      model: judgeModel,
      record: false,
    });
    costUsd += story.costUsd + judged.costUsd;
    const scores = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, Number(judged.output[key as keyof typeof RUBRIC])])) as StoryCase["scores"];
    const values = Object.values(scores);
    cases.push({
      themeId: theme.id,
      title: story.output.title,
      scores,
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      comment: judged.output.comment,
    });
  }
  const mean = cases.reduce((sum, c) => sum + c.mean, 0) / Math.max(1, cases.length);
  const anyZero = cases.some((c) => Object.values(c.scores).some((value) => value === 0));
  return { writerModel, judgeModel, cases, mean, anyZero, costUsd };
}
