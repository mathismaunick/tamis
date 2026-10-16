/**
 * Les tendances des besoins : les demandes de la seconde moitié de la période comparées à celles de la première.
 * Du code pur, testé : la même règle sert à l'accueil, à la page Besoins et à l'agent.
 */

export type Trend = { recent: number; older: number; rising: boolean; falling: boolean };

/** Ajoute des jours à une date ISO (AAAA-MM-JJ), sans fuseau horaire. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Le milieu de la période observée : les retours reçus à partir de cette date sont « récents ». */
export function trendSplit(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = dates.map((date) => date.slice(0, 10)).sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
  return addDays(first, Math.ceil(span / 2));
}

/**
 * La tendance d'un besoin. En hausse : au moins trois demandes récentes, deux fois plus qu'avant. En baisse :
 * l'inverse. Les seuils évitent de crier à la tendance pour une ou deux demandes.
 */
export function trendOf(dates: string[], split: string | null): Trend {
  if (!split) return { recent: 0, older: 0, rising: false, falling: false };
  const recent = dates.filter((date) => date.slice(0, 10) >= split).length;
  const older = dates.length - recent;
  return { recent, older, rising: recent >= 3 && recent >= 2 * older, falling: older >= 3 && older >= 2 * recent };
}
