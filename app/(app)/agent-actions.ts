"use server";

import { refresh } from "next/cache";
import { BacklogError } from "@/lib/services/backlog";
import { getImportReport, type ImportReport } from "@/lib/services/imports";
import { applyProposal, getProposalStatus, rejectProposal, type ProposalOutcome } from "@/lib/services/proposals";

/** Le compte rendu d'un import qui vient de finir, pour dire au PO où est allé le retour qu'il a ajouté. */
export async function importReportAction(batchId: number): Promise<ImportReport | null> {
  return getImportReport(batchId);
}

export type ProposalActionResult = ProposalOutcome | { error: string };

/** Le PO applique une proposition de l'agent : le backlog est reclassé et le journal garde « sur proposition de l'agent ». */
export async function applyProposalAction(id: number): Promise<ProposalActionResult> {
  try {
    const outcome = await applyProposal(id);
    refresh();
    return outcome;
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    console.error(error);
    return { error: "La proposition n'a pas pu être appliquée." };
  }
}

/** Où en est une proposition : une conversation rouverte sur une autre page montre si elle a déjà été tranchée. */
export async function proposalStatusAction(id: number): Promise<string | null> {
  return getProposalStatus(id);
}

export async function rejectProposalAction(id: number): Promise<ProposalActionResult> {
  try {
    return await rejectProposal(id);
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    console.error(error);
    return { error: "La proposition n'a pas pu être rejetée." };
  }
}
