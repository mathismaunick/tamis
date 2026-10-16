/** Les libellés affichés au PO : un seul endroit pour la langue de l'interface. */

/** La PO de la démo : l'application n'a pas de comptes, le journal signe ses décisions. */
export const DEMO_PO = { name: "Camille", role: "Product Owner" };

/** Les couleurs des catégories MoSCoW, partout les mêmes : barres, colonnes, bulles ; `clair` pour le fond nuit. */
export const MOSCOW_COLORS: Record<string, { fill: string; clair: string }> = {
  must: { fill: "var(--must)", clair: "var(--must-clair)" },
  should: { fill: "var(--should)", clair: "var(--should-clair)" },
  could: { fill: "var(--could)", clair: "var(--could-clair)" },
  wont: { fill: "var(--wont)", clair: "rgba(255, 255, 255, 0.22)" },
};

/** Les segments de clients, du plus gros au plus petit : une gamme de nuit. */
export const SEGMENT_COLORS: Record<string, string> = {
  enterprise: "var(--enterprise)",
  pro: "var(--pro)",
  starter: "var(--starter)",
};

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  ticket: "Ticket",
  in_app: "In-app",
  sales_call: "Appel commercial",
};

export const SEGMENT_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

export const KIND_LABELS: Record<string, string> = {
  feature: "Demande",
  bug: "Bug",
  praise: "Remerciement",
  question: "Question",
  other: "Autre",
};

export const FEEDBACK_STATUS: Record<string, { label: string; tone: "neutre" | "accent" | "eteint" | "alerte" }> = {
  new: { label: "Non analysé", tone: "eteint" },
  processed: { label: "Analysé", tone: "neutre" },
  needs_review: { label: "À revoir", tone: "alerte" },
};

export const THEME_STATUS: Record<string, { label: string; tone: "neutre" | "accent" | "eteint" | "alerte" }> = {
  new: { label: "Nouveau", tone: "neutre" },
  triaged: { label: "Trié", tone: "neutre" },
  planned: { label: "Planifié", tone: "accent" },
  parked: { label: "Parqué", tone: "eteint" },
  shipped: { label: "Livré", tone: "eteint" },
};

export const MOSCOW_LABELS: Record<string, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
  wont: "Won't",
};

/** Les catégories MoSCoW dites comme un PO les dit en réunion, celles des couloirs de l'étape 2. */
export const MOSCOW_WORDS: Record<string, string> = {
  must: "Ce cycle",
  should: "Ensuite",
  could: "Plus tard",
  wont: "Pas maintenant",
};

/** Une catégorie en entier, le mot de l'équipe puis son nom MoSCoW : « Ce cycle (Must) ». La même partout. */
export function moscowName(moscow: string): string {
  return MOSCOW_WORDS[moscow] ? `${MOSCOW_WORDS[moscow]} (${MOSCOW_LABELS[moscow]})` : moscow;
}

export const IMPACT_LABELS: Record<string, string> = {
  "0.25": "Minimal",
  "0.5": "Faible",
  "1": "Moyen",
  "2": "Fort",
  "3": "Massif",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" });

/** Un moment comme le reste de Tamis l'écrit : « 14 oct., 16 h 31 », à l'heure de Paris. */
export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  const parts = timeFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${dayFormatter.format(date)}, ${part("hour")} h ${part("minute")}`;
}

export function formatEuros(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n.c.";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} €`;
}

export function formatUsd(value: number): string {
  const digits = value < 0.01 ? 4 : 2;
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Un rang en toutes lettres : 1ᵉʳ, 2ᵉ, 3ᵉ… */
export function ordinal(rank: number): string {
  return rank === 1 ? "1ᵉʳ" : `${rank}ᵉ`;
}

/** Les espaces insécables de la typographie française : jamais de « ? » ou de « » » seul en début de ligne. */
export function frenchSpaces(text: string): string {
  return text.replace(/ ([?!:;»%])/g, " $1").replace(/« /g, "« ");
}

/**
 * Un morceau de phrase écrit par le modèle, placé au milieu d'une phrase : sans majuscule initiale (« en tant que
 * chef de projet », « étant donné un projet »), sauf pour un sigle ou un nom propre en capitales.
 */
export function midSentence(text: string): string {
  const trimmed = text.trim();
  return /^[A-ZÀ-Ý]([a-zà-ÿ]|['’])/.test(trimmed) ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : trimmed;
}

/** Le mot qui dit l'impact : « fort » plutôt que 2. */
export function impactWord(value: number | null | undefined): string {
  if (value === null || value === undefined) return "à proposer";
  return (IMPACT_LABELS[String(value)] ?? String(value)).toLowerCase();
}

/** Le score RICE : clients × impact × confiance ÷ effort. Sert à dessiner les barres, jamais affiché seul. */
export function riceScore(need: { clients: number; impact: number | null; confidence: number | null; effort: number | null }): number {
  if (need.impact === null || need.confidence === null || need.effort === null) return 0;
  return (need.clients * need.impact * need.confidence) / Math.max(1, need.effort);
}
