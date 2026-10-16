/**
 * E3 (regroupement) : les demandes extraites sont regroupées en mémoire par le même algorithme que la base
 * (seuils, zone grise confirmée par un modèle, consolidation des petits thèmes), puis comparées aux tendances annotées.
 * Sert aussi au banc d'essai des embeddings (séparation des besoins, sans seuil) et du modèle de confirmation.
 */
import { callStructured } from "../lib/ai/call";
import { EMBEDDING_MODEL } from "../lib/ai/models";
import { CONFIRM_SYSTEM, confirmPrompt } from "../lib/ai/prompts";
import { confirmMatchSchema } from "../lib/ai/schemas";
import { applyMergePlan, assignInMemory, cosine, DEFAULT_THRESHOLDS, planConsolidation, type Thresholds } from "../lib/pipeline/assign";
import { embedTexts } from "../lib/pipeline/embed";
import { chooseTheme } from "../lib/pipeline/themes";
import type { ExtractionResult } from "./extraction";
import { ANNOTATIONS, auc, expectedThemes, majorityLabel } from "./lib";

type Request = ExtractionResult["requests"][number];

const PLANTED = ["notifications", "dependances", "reporting", "mobile", "temps", "champs", "charge", "invites", "recurrence"];

/** Étiquettes attendues d'une demande extraite : les tendances annotées de son retour. */
function labelsOf(request: Request): string[] {
  return expectedThemes(request.externalId);
}

export async function embeddingSeparation(requests: Request[], model: string) {
  const labeled = requests.filter((request) => labelsOf(request).length === 1);
  const result = await embedTexts(
    labeled.map((request) => request.need),
    model,
  );
  const positives: number[] = [];
  const negatives: number[] = [];
  for (let i = 0; i < labeled.length; i++) {
    for (let j = i + 1; j < labeled.length; j++) {
      const similarity = cosine(result.embeddings[i], result.embeddings[j]);
      (labelsOf(labeled[i])[0] === labelsOf(labeled[j])[0] ? positives : negatives).push(similarity);
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return {
    model,
    auc: auc(positives, negatives),
    sameMedian: median(positives),
    differentMedian: median(negatives),
    dimensions: result.embeddings[0]?.length ?? 0,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  };
}

type GroupingScore = {
  themes: number;
  purity: number;
  trendsFound: number;
  fragmentation: number;
  ganttMerged: boolean;
  teamsMerged: boolean;
  /** Demandes du piège « solution ≠ besoin » (Gantt, chemin critique, flèches, Teams) rangées avec leur besoin, tous lots confondus. */
  solutionTraps: { ok: number; total: number };
};

export type ClusteringResult = GroupingScore & {
  confirmModel: string;
  /** Thèmes en trop à la sortie du rattachement au fil de l'eau, avant la consolidation. */
  fragmentationBefore: number;
  merged: number;
  confirmations: number;
  costUsd: number;
  durationMs: number;
  assignments: Map<number, number>;
};

export async function evalClustering(requests: Request[], confirmModel: string, thresholds: Thresholds = DEFAULT_THRESHOLDS): Promise<ClusteringResult> {
  const started = Date.now();
  const embedded = await embedTexts(
    requests.map((request) => request.need),
    EMBEDDING_MODEL.id,
  );
  let costUsd = embedded.costUsd;
  const memory = requests.map((request, index) => ({ id: index, need: request.need, quote: request.quote, embedding: embedded.embeddings[index] }));
  const { assignments: online, confirmations, themes } = await assignInMemory(
    memory,
    async (request, candidate) => {
      const result = await callStructured({
        task: "confirm",
        system: CONFIRM_SYSTEM,
        messages: [{ role: "user", content: confirmPrompt({ need: request.need, quote: request.quote }, { title: candidate.title, needs: candidate.needs ?? [candidate.need] }) }],
        schema: confirmMatchSchema,
        effort: "low",
        trace: { stage: "eval-confirm" },
        model: confirmModel,
        record: false,
      });
      costUsd += result.costUsd;
      return result.output.same_need;
    },
    thresholds,
  );
  let mergeChecks = 0;
  const plan = await planConsolidation(themes, (small, candidates) => {
    mergeChecks += 1;
    return chooseTheme(small, candidates, { model: confirmModel, record: false, onCost: (cost) => (costUsd += cost) });
  });
  const assignments = applyMergePlan(online, plan);
  const final = scoreGrouping(requests, assignments);

  return {
    confirmModel,
    ...final,
    fragmentationBefore: scoreGrouping(requests, online).fragmentation,
    merged: plan.length,
    confirmations: confirmations + mergeChecks,
    costUsd,
    durationMs: Date.now() - started,
    assignments,
  };
}

/** Pureté, tendances retrouvées, fragmentation et pièges, pour une affectation des demandes aux thèmes. */
function scoreGrouping(requests: Request[], assignments: Map<number, number>): GroupingScore {
  // Pureté : part des demandes dont la tendance attendue est l'étiquette majoritaire de leur groupe.
  const groups = new Map<number, number[]>();
  for (const [index, group] of assignments) groups.set(group, [...(groups.get(group) ?? []), index]);
  let pure = 0;
  let counted = 0;
  const groupLabel = new Map<number, string | null>();
  for (const [group, members] of groups) {
    const labels = members.map((index) => labelsOf(requests[index])).filter((labels) => labels.length > 0);
    const label = majorityLabel(labels);
    groupLabel.set(group, label);
    for (const labelsOfMember of labels) {
      counted += 1;
      if (label && labelsOfMember.includes(label)) pure += 1;
    }
  }
  const groupsPerTrend = new Map<string, number>();
  for (const [group, members] of groups) {
    const label = groupLabel.get(group);
    if (label && members.length >= 2) groupsPerTrend.set(label, (groupsPerTrend.get(label) ?? 0) + 1);
  }
  const trendsFound = PLANTED.filter((trend) => (groupsPerTrend.get(trend) ?? 0) >= 1).length;
  const fragmentation = PLANTED.reduce((sum, trend) => {
    const total = [...groups.entries()].filter(([group]) => groupLabel.get(group) === trend).length;
    return sum + Math.max(0, total - 1);
  }, 0);

  // Une demande du lot du jour, portant ce piège et attendue dans ce thème, a-t-elle rejoint le bon groupe ?
  const groupOfTrap = (trap: string, theme: string) =>
    requests.some(
      (request, index) =>
        ANNOTATIONS[request.externalId].batch === "new_batch" &&
        ANNOTATIONS[request.externalId].traps.includes(trap) &&
        labelsOf(request).includes(theme) &&
        groupLabel.get(assignments.get(index)!) === theme,
    );

  const traps = requests
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => ANNOTATIONS[request.externalId].traps.includes("solution_vs_besoin") && labelsOf(request).length > 0);
  const trapsOk = traps.filter(({ request, index }) => labelsOf(request).includes(groupLabel.get(assignments.get(index)!) ?? "")).length;

  return {
    themes: groups.size,
    purity: pure / Math.max(1, counted),
    trendsFound,
    fragmentation,
    ganttMerged: groupOfTrap("solution_vs_besoin", "dependances"),
    teamsMerged: groupOfTrap("deux_demandes", "notifications"),
    solutionTraps: { ok: trapsOk, total: traps.length },
  };
}
