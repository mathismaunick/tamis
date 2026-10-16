/**
 * Outils communs des évals : vérité terrain, métriques, rapport. Les évals mesurent ce qui est probabiliste
 * (le modèle juge) sur le jeu annoté ; les tests unitaires couvrent ce qui est déterministe (le code calcule).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type ExpectedItem = { kind: string; theme?: string };
export type Annotation = { batch: "seed" | "new_batch"; client: string; expected: ExpectedItem[]; traps: string[] };

export const ANNOTATIONS: Record<string, Annotation> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data", "annotations", "feedback.json"), "utf8"),
);

export const THEME_FILE: {
  themes: Record<string, { title: string; need: string }>;
  expectedRanking: Array<{ theme: string; impact: number }>;
} = JSON.parse(readFileSync(path.join(process.cwd(), "data", "annotations", "themes.json"), "utf8"));

/** Les tendances attendues d'un retour (une par demande de fonctionnalité). */
export function expectedThemes(externalId: string): string[] {
  return (ANNOTATIONS[externalId]?.expected ?? []).filter((item) => item.kind === "feature" && item.theme).map((item) => item.theme!);
}

/** Corrélation de rang de Spearman entre deux classements de mêmes éléments. */
export function spearman(a: string[], b: string[]): number {
  const common = a.filter((item) => b.includes(item));
  const n = common.length;
  if (n < 2) return Number.NaN;
  const rankA = new Map(common.map((item, index) => [item, index]));
  const orderB = b.filter((item) => common.includes(item));
  const rankB = new Map(orderB.map((item, index) => [item, index]));
  const d2 = common.reduce((sum, item) => sum + (rankA.get(item)! - rankB.get(item)!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** Indice de Jaccard sur les paires d'éléments regroupés ensemble par deux regroupements. */
export function pairJaccard(a: Map<number, number>, b: Map<number, number>): number {
  const ids = [...a.keys()].filter((id) => b.has(id));
  let both = 0;
  let either = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const inA = a.get(ids[i]) === a.get(ids[j]);
      const inB = b.get(ids[i]) === b.get(ids[j]);
      if (inA && inB) both += 1;
      if (inA || inB) either += 1;
    }
  }
  return either === 0 ? 1 : both / either;
}

/** Aire sous la courbe ROC : probabilité qu'une paire « même besoin » soit plus similaire qu'une paire « besoins différents ». */
export function auc(positives: number[], negatives: number[]): number {
  let wins = 0;
  for (const p of positives) for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}

/** Étiquette majoritaire d'un groupe de demandes annotées. */
export function majorityLabel(labels: string[][]): string | null {
  const counts = new Map<string, number>();
  for (const itemLabels of labels) for (const label of itemLabels) counts.set(label, (counts.get(label) ?? 0) + 1 / itemLabels.length);
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

export type Metric = { id: string; name: string; value: number | string; target: string; pass: boolean | null; note?: string };

export function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "n/d";
}

export function pct(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)} %` : "n/d";
}

export function usd(value: number): string {
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(3)} $`.replace(".", ",");
}

export function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)).then(() => results);
}
