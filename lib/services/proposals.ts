import { db } from "@/lib/db/client";
import { THEME_STATUS } from "@/lib/labels";
import { BacklogError, FACTOR_OPTIONS, STATUSES, updateFactor, updateStatus, type ThemeStatus } from "@/lib/services/backlog";

/*
 * Les propositions de l'agent : la frontière entre « l'agent veut » et « le PO a fait ».
 * L'agent ne modifie jamais le backlog ; il crée une proposition en attente, que le PO applique ou rejette.
 * Appliquer passe par le même service que l'édition manuelle, avec « via agent » dans le journal.
 */

export type ProposalPayload =
  | { kind: "score_change"; factor: "impact" | "confidence" | "effort"; value: number; previous: number | null; reason: string }
  | { kind: "status_change"; status: ThemeStatus; previous: string; reason: string };

export type Proposal = {
  id: number;
  themeId: number;
  themeTitle: string;
  status: "pending" | "applied" | "rejected";
  payload: ProposalPayload;
};

/** Une proposition ne se résout qu'une fois : appliquer ou rejeter une proposition déjà traitée est refusé. */
export function assertPending(status: string, id: number) {
  if (status !== "pending") {
    throw new BacklogError(`La proposition P${id} a déjà été ${status === "applied" ? "appliquée" : "rejetée"}.`);
  }
}

export async function createScoreProposal(input: {
  conversationId: string;
  themeId: number;
  factor: "impact" | "confidence" | "effort";
  value: number;
  reason: string;
}): Promise<Proposal> {
  if (!FACTOR_OPTIONS[input.factor].includes(input.value)) {
    throw new BacklogError(`Valeur ${input.value} non autorisée pour ${input.factor}. Valeurs possibles : ${FACTOR_OPTIONS[input.factor].join(", ")}.`);
  }
  const sql = db();
  const [theme] = await sql`select id, title, impact::float, confidence::float, effort, merged_into from themes where id = ${input.themeId}`;
  if (!theme || theme.merged_into) throw new BacklogError(`Le thème T${input.themeId} n'existe pas. Utilise list_themes pour trouver le bon identifiant.`);
  const payload: ProposalPayload = {
    kind: "score_change",
    factor: input.factor,
    value: input.value,
    previous: theme[input.factor] as number | null,
    reason: input.reason.trim(),
  };
  const [row] = await sql`
    insert into agent_proposals (conversation_id, theme_id, kind, payload)
    values (${input.conversationId}, ${input.themeId}, 'score_change', ${JSON.stringify(payload)}::jsonb)
    returning id`;
  return { id: row.id, themeId: theme.id, themeTitle: theme.title, status: "pending", payload };
}

export async function createStatusProposal(input: {
  conversationId: string;
  themeId: number;
  status: ThemeStatus;
  reason: string;
}): Promise<Proposal> {
  if (!STATUSES.includes(input.status)) throw new BacklogError(`Statut inconnu : ${input.status}.`);
  if (input.reason.trim().length < 3) throw new BacklogError("Une proposition de statut doit donner sa raison.");
  const sql = db();
  const [theme] = await sql`select id, title, status, merged_into from themes where id = ${input.themeId}`;
  if (!theme || theme.merged_into) throw new BacklogError(`Le thème T${input.themeId} n'existe pas. Utilise list_themes pour trouver le bon identifiant.`);
  const payload: ProposalPayload = { kind: "status_change", status: input.status, previous: theme.status, reason: input.reason.trim() };
  const [row] = await sql`
    insert into agent_proposals (conversation_id, theme_id, kind, payload)
    values (${input.conversationId}, ${input.themeId}, 'status_change', ${JSON.stringify(payload)}::jsonb)
    returning id`;
  return { id: row.id, themeId: theme.id, themeTitle: theme.title, status: "pending", payload };
}

export type ProposalOutcome = { status: "applied" | "rejected"; before?: { score: number | null; rank: number | null }; after?: { score: number | null; rank: number | null } };

/** Le PO applique : même chemin que l'édition manuelle, tracé « sur proposition de l'agent ». */
export async function applyProposal(id: number): Promise<ProposalOutcome> {
  const sql = db();
  const [proposal] = await sql`select id, theme_id, status, payload from agent_proposals where id = ${id}`;
  if (!proposal) throw new BacklogError(`La proposition P${id} n'existe pas.`);
  assertPending(proposal.status, id);
  const [before] = await sql`select rice_score::float as score, rank from themes where id = ${proposal.theme_id}`;
  const payload = proposal.payload as ProposalPayload;
  if (payload.kind === "score_change") {
    await updateFactor(proposal.theme_id, payload.factor, payload.value, payload.reason, "agent");
  } else {
    await updateStatus(proposal.theme_id, payload.status, payload.reason, "agent");
  }
  await sql`update agent_proposals set status = 'applied', resolved_at = now() where id = ${id}`;
  const [after] = await sql`select rice_score::float as score, rank from themes where id = ${proposal.theme_id}`;
  return { status: "applied", before: { score: before.score, rank: before.rank }, after: { score: after.score, rank: after.rank } };
}

/** Le PO rejette : rien ne change sur le thème. */
export async function rejectProposal(id: number): Promise<ProposalOutcome> {
  const sql = db();
  const [proposal] = await sql`select id, status from agent_proposals where id = ${id}`;
  if (!proposal) throw new BacklogError(`La proposition P${id} n'existe pas.`);
  assertPending(proposal.status, id);
  await sql`update agent_proposals set status = 'rejected', resolved_at = now() where id = ${id}`;
  return { status: "rejected" };
}

export async function getProposalStatus(id: number): Promise<string | null> {
  const [row] = await db()`select status from agent_proposals where id = ${id}`;
  return row?.status ?? null;
}

const FACTOR_LABELS: Record<string, string> = { impact: "Impact", confidence: "Confiance", effort: "Effort" };

/** Une proposition en quelques mots : « statut Nouveau → Planifié », « Impact à 2 ». */
export function describeProposal(payload: Record<string, unknown>): string {
  if (payload.kind === "status_change") {
    const from = THEME_STATUS[String(payload.previous)]?.label ?? String(payload.previous);
    const to = THEME_STATUS[String(payload.status)]?.label ?? String(payload.status);
    return `statut ${from} → ${to}`;
  }
  const factor = String(payload.factor);
  const value = Number(payload.value);
  const shown = factor === "confidence" ? `${Math.round(value * 100)} %` : factor === "effort" ? `${value} points` : value.toLocaleString("fr-FR");
  return `${FACTOR_LABELS[factor] ?? factor} à ${shown}`;
}

/** Les propositions de l'agent encore en attente sur un besoin : elles se tranchent aussi depuis sa page. */
export async function listPendingProposals(themeId: number): Promise<Array<{ id: number; label: string; reason: string }>> {
  const rows = await db()`select id, payload from agent_proposals where theme_id = ${themeId} and status = 'pending' order by created_at`;
  return rows.map((row) => ({ id: row.id as number, label: describeProposal(row.payload as Record<string, unknown>), reason: String((row.payload as { reason?: string }).reason ?? "") }));
}
