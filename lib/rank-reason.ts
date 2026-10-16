import { impactWord, plural } from "@/lib/labels";

export type ReasonNeed = { reach: number; impact: number | null; confidence: number | null; effort: number | null };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
}

function list(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function capital(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pourquoi un besoin est à sa place, en une phrase calculée par le code à partir de ses facteurs RICE, comparés au
 * reste du backlog : ce qui le pousse vers le haut, puis ce qui le retient. « Le plus demandé (6 clients), mais un
 * impact jugé moyen. » Rien n'est inventé : chaque mot vient d'un facteur affiché à côté.
 */
export function rankReason(need: ReasonNeed, all: ReasonNeed[]): string {
  const strengths: string[] = [];
  const limits: string[] = [];
  let reachStrength: string | null = null;

  const maxReach = Math.max(need.reach, ...all.map((other) => other.reach));
  if (need.reach === maxReach && need.reach > 1) reachStrength = `le plus demandé (${plural(need.reach, "client")})`;
  else if (need.reach >= median(all.map((other) => other.reach))) reachStrength = `demandé par ${plural(need.reach, "client")}`;
  else limits.push(`demandé par ${plural(need.reach, "client")} seulement`);

  if (need.impact !== null) {
    if (need.impact >= 2) strengths.push(`un impact ${impactWord(need.impact)}`);
    else limits.push(`un impact jugé ${impactWord(need.impact)}`);
  }
  if (need.confidence !== null && need.confidence < 0.8) limits.push(`une confiance de ${Math.round(need.confidence * 100)} %`);
  if (need.effort !== null) {
    if (need.effort <= 3) strengths.push(`un effort faible (${plural(need.effort, "point")})`);
    else if (need.effort >= 13) limits.push(`un effort important (${plural(need.effort, "point")})`);
  }

  const head = reachStrength ? `${capital(reachStrength)}${strengths.length > 0 ? `, avec ${list(strengths)}` : ""}` : strengths.length > 0 ? capital(list(strengths)) : "";
  if (!head) return `${capital(list(limits))}.`;
  return limits.length > 0 ? `${head}, mais ${list(limits)}.` : `${head}.`;
}
