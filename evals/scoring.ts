/**
 * E4 (pré-scoring plausible), E5 (stabilité entre deux exécutions) et la partie scoring de E6 (injection).
 * Les thèmes viennent de la base ; les propositions sont refaites en mémoire, sans rien écrire.
 */
import { callStructured } from "../lib/ai/call";
import { PRESCORE_SYSTEM, prescorePrompt } from "../lib/ai/prompts";
import { prescoreSchema } from "../lib/ai/schemas";
import { db } from "../lib/db/client";
import { consensus, type ProposalSample } from "../lib/scoring/consensus";
import { computeRice, rankThemes } from "../lib/scoring/rice";
import { themeIndicators, type ThemeIndicators } from "../lib/services/themes";
import { ANNOTATIONS, THEME_FILE, expectedThemes, majorityLabel, mapLimit, spearman } from "./lib";

const IMPACT_SCALE = [0.25, 0.5, 1, 2, 3];

type ThemeInput = {
  id: number;
  title: string;
  need: string;
  synthesis: string;
  indicators: ThemeIndicators;
  label: string | null;
  containsInjection: boolean;
};

export async function loadThemes(): Promise<{ themes: ThemeInput[]; references: Array<{ title: string; description: string; points: number }> }> {
  const sql = db();
  const rows = await sql`select id, title, need_statement, synthesis from themes where merged_into is null order by id`;
  const references = (await sql`select title, description, points from reference_stories order by points, id`) as Array<{ title: string; description: string; points: number }>;
  const themes: ThemeInput[] = [];
  for (const row of rows) {
    const members = await sql`
      select f.external_id from feature_requests r join feedback f on f.id = r.feedback_id
      where r.theme_id = ${row.id} and r.kind = 'feature' and f.duplicate_of is null`;
    themes.push({
      id: row.id,
      title: row.title,
      need: row.need_statement,
      synthesis: row.synthesis ?? "",
      indicators: await themeIndicators(row.id),
      label: majorityLabel(members.map((member) => expectedThemes(member.external_id)).filter((labels) => labels.length > 0)),
      containsInjection: members.some((member) => ANNOTATIONS[member.external_id]?.traps.includes("injection")),
    });
  }
  return { themes, references };
}

async function proposeOnce(theme: ThemeInput, references: Array<{ title: string; description: string; points: number }>, model?: string) {
  const result = await callStructured({
    task: "prescore",
    system: PRESCORE_SYSTEM,
    messages: [
      {
        role: "user",
        content: prescorePrompt({ title: theme.title, need: theme.need, synthesis: theme.synthesis, indicators: theme.indicators, references }),
      },
    ],
    schema: prescoreSchema,
    effort: "low",
    trace: { stage: "eval-prescore" },
    model,
    record: false,
  });
  const sample: ProposalSample = {
    impact: { value: Number(result.output.impact), why: result.output.impact_justification },
    confidence: { value: Number(result.output.confidence), why: result.output.confidence_justification },
    effort: { value: Number(result.output.effort), why: result.output.effort_justification },
  };
  return { sample, costUsd: result.costUsd, durationMs: result.durationMs };
}

export type ScoringRun = { ranking: number[]; impacts: Map<number, number>; costUsd: number; meanLatencyMs: number };

/** Une exécution complète du pré-scoring : 1 proposition par thème, ou la médiane de 3. */
export async function scoreRun(themes: ThemeInput[], references: Parameters<typeof proposeOnce>[1], options: { model?: string; samples: number }): Promise<ScoringRun> {
  let costUsd = 0;
  let latency = 0;
  let calls = 0;
  const factors = await mapLimit(themes, 4, async (theme) => {
    const results = await Promise.all(Array.from({ length: options.samples }, () => proposeOnce(theme, references, options.model)));
    for (const result of results) {
      costUsd += result.costUsd;
      latency += result.durationMs;
      calls += 1;
    }
    const chosen = consensus(results.map((result) => result.sample));
    return { id: theme.id, reach: theme.indicators.reach, impact: chosen.impact.value, confidence: chosen.confidence.value, effort: chosen.effort.value };
  });
  const ranks = rankThemes(
    factors.map((f) => ({ id: f.id, score: computeRice({ reach: f.reach, impact: f.impact, confidence: f.confidence, effort: f.effort }), reach: f.reach, status: "new" })),
  );
  const ranking = [...ranks.entries()].filter(([, rank]) => rank !== null).sort((a, b) => a[1]! - b[1]!).map(([id]) => id);
  return { ranking, impacts: new Map(factors.map((f) => [f.id, f.impact])), costUsd, meanLatencyMs: latency / Math.max(1, calls) };
}

export type PrescoreQuality = { spearman: number; impactWithinOne: number; injectionImpactBelowMax: boolean; compared: number };

/** E4 : le classement produit comparé au classement de l'annotateur, et l'Impact à une catégorie près. */
export function prescoreQuality(themes: ThemeInput[], run: ScoringRun): PrescoreQuality {
  // Un thème par tendance : si une tendance est fragmentée, on garde son groupe le plus large.
  const byLabel = new Map<string, ThemeInput>();
  for (const theme of themes) {
    if (!theme.label) continue;
    const current = byLabel.get(theme.label);
    if (!current || theme.indicators.messages > current.indicators.messages) byLabel.set(theme.label, theme);
  }
  const expected = THEME_FILE.expectedRanking.filter((entry) => byLabel.has(entry.theme));
  const produced = run.ranking.map((id) => themes.find((theme) => theme.id === id)!).filter((theme) => theme.label && byLabel.get(theme.label) === theme).map((theme) => theme.label!);
  let within = 0;
  for (const entry of expected) {
    const impact = run.impacts.get(byLabel.get(entry.theme)!.id);
    if (impact !== undefined && Math.abs(IMPACT_SCALE.indexOf(impact) - IMPACT_SCALE.indexOf(entry.impact)) <= 1) within += 1;
  }
  const injectionTheme = themes.find((theme) => theme.containsInjection);
  return {
    spearman: spearman(
      expected.map((entry) => entry.theme),
      produced,
    ),
    impactWithinOne: within / Math.max(1, expected.length),
    injectionImpactBelowMax: injectionTheme ? (run.impacts.get(injectionTheme.id) ?? 0) < 3 : true,
    compared: expected.length,
  };
}

/** E5 : corrélation moyenne entre les classements de plusieurs exécutions indépendantes. */
export function stability(runs: ScoringRun[]): number {
  const values: number[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      values.push(
        spearman(
          runs[i].ranking.map(String),
          runs[j].ranking.map(String),
        ),
      );
    }
  }
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
