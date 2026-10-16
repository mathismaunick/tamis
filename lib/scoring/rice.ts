/**
 * Le moteur de scoring : du code pur, sans base ni modèle, testé. Le modèle propose des facteurs,
 * le code calcule le score, le rang et la catégorie MoSCoW suggérée.
 */

export type RiceFactors = {
  /** Clients distincts ayant exprimé le besoin (calculé par le code). */
  reach: number;
  /** 0.25 minimal, 0.5 faible, 1 moyen, 2 fort, 3 massif. */
  impact: number | null;
  /** Entre 0 et 1. */
  confidence: number | null;
  /** Points relatifs, au moins 1. */
  effort: number | null;
};

/** Score RICE = Reach × Impact × Confiance ÷ Effort. Null tant qu'un facteur manque. */
export function computeRice(factors: RiceFactors): number | null {
  const { reach, impact, confidence, effort } = factors;
  if (impact === null || confidence === null || effort === null) return null;
  const boundedConfidence = Math.min(1, Math.max(0, confidence));
  const boundedEffort = Math.max(1, effort);
  return (Math.max(0, reach) * impact * boundedConfidence) / boundedEffort;
}

/** Deux décimales : le rang compte plus que la valeur, on n'affiche pas de fausse précision. */
export function formatScore(score: number | null): string {
  if (score === null) return "à scorer";
  return score.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type RankInput = { id: number; score: number | null; reach: number; status: string };

/** Les thèmes parqués ou livrés sortent du classement. */
export function isRanked(status: string): boolean {
  return status !== "parked" && status !== "shipped";
}

/**
 * Classement stable : score décroissant, puis Reach décroissant, puis ancienneté.
 * Un thème sans score n'est pas classé.
 */
export function rankThemes(themes: RankInput[]): Map<number, number | null> {
  const ranked = themes
    .filter((theme) => isRanked(theme.status) && theme.score !== null)
    .sort((a, b) => b.score! - a.score! || b.reach - a.reach || a.id - b.id);
  const ranks = new Map<number, number | null>(themes.map((theme) => [theme.id, null]));
  ranked.forEach((theme, index) => ranks.set(theme.id, index + 1));
  return ranks;
}

export type Moscow = "must" | "should" | "could" | "wont";

/** Ce que l'équipe livre en un cycle, en points d'effort : la mesure qui remplit chaque catégorie MoSCoW. */
export const CYCLE_CAPACITY = 30;

export type MoscowInput = {
  id: number;
  rank: number | null;
  status: string;
  moscow: Moscow | null;
  moscowSource: "computed" | "po";
  effort: number | null;
};

const CYCLES: Moscow[] = ["must", "should", "could"];

/**
 * MoSCoW suggéré selon la capacité de l'équipe : dans l'ordre du classement, les Must remplissent un cycle, les
 * Should le suivant, les Could le troisième ; le reste est Won't. Un besoin qui ne tient plus dans le cycle le
 * ferme : un besoin moins bien classé ne passe jamais devant lui. Un besoin plus gros qu'un cycle en occupe un seul.
 * Les choix du PO sont conservés et comptent dans la capacité de leur catégorie. Un besoin parqué passe en Won't ;
 * un besoin planifié est au moins en Should.
 */
export function suggestMoscow(themes: MoscowInput[], capacity = CYCLE_CAPACITY): Map<number, Moscow | null> {
  const result = new Map<number, Moscow | null>();
  const used: Record<Moscow, number> = { must: 0, should: 0, could: 0, wont: 0 };
  for (const theme of themes) {
    if (theme.moscowSource !== "po") continue;
    result.set(theme.id, theme.moscow);
    if (theme.moscow) used[theme.moscow] += Math.max(1, theme.effort ?? 1);
  }
  const ranked = themes
    .filter((theme) => theme.moscowSource !== "po" && theme.status !== "parked" && theme.rank !== null)
    .sort((a, b) => a.rank! - b.rank!);
  let cycle = 0;
  for (const theme of ranked) {
    const effort = Math.max(1, theme.effort ?? 1);
    while (cycle < CYCLES.length && used[CYCLES[cycle]] > 0 && used[CYCLES[cycle]] + effort > capacity) cycle += 1;
    const suggested = cycle < CYCLES.length ? CYCLES[cycle] : "wont";
    used[suggested] += effort;
    result.set(theme.id, theme.status === "planned" && (suggested === "could" || suggested === "wont") ? "should" : suggested);
  }
  for (const theme of themes) {
    if (result.has(theme.id)) continue;
    result.set(theme.id, theme.status === "parked" ? "wont" : null);
  }
  return result;
}
