/** Les étapes du traitement d'un import, dans l'ordre où le PO les voit avancer. */
export const PIPELINE_STEPS = [
  { key: "import", label: "Lecture et dédoublonnage" },
  { key: "extract", label: "Extraction des demandes" },
  { key: "ground", label: "Vérification des citations" },
  { key: "embed", label: "Calcul des embeddings" },
  { key: "assign", label: "Rattachement aux besoins" },
  { key: "synthesize", label: "Synthèse des besoins" },
  { key: "prescore", label: "Pré-scoring et classement" },
] as const;

export type StepKey = (typeof PIPELINE_STEPS)[number]["key"];

export type ImportEvent =
  | { type: "step"; step: StepKey; status: "running" | "done" | "failed"; detail?: string }
  | { type: "error"; message: string }
  | { type: "done"; batchId: number; summary: string; costUsd: number; durationMs: number };

export type EmitEvent = (event: ImportEvent) => void;
