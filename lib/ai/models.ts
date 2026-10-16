import type { LanguageModelUsage } from "ai";

/**
 * Un modèle par tâche, déclaré ici et nulle part ailleurs.
 *
 * Le choix est la qualité : des modèles de premier plan partout, Claude Opus 5.5 pour l'agent (la partie qui
 * raisonne en direct avec le PO) et Claude Sonnet 5.5 pour le reste. Le banc d'essai (docs/EVALS.md) mesure aussi des
 * modèles moins chers, qui atteindraient les cibles de certaines tâches : c'est l'option d'économie documentée. Chaque tâche se change par une variable
 * d'environnement, sans toucher au code. Les identifiants sont ceux du Vercel AI Gateway (« fournisseur/modèle »).
 */
export const TASK_MODELS = {
  /** Extraire les demandes d'un retour client (volume : un appel par retour). */
  extract: { env: "MODEL_EXTRACT", fallback: "anthropic/claude-sonnet-5.5" },
  /** Confirmer qu'une demande rejoint un thème existant, en zone grise de similarité. */
  confirm: { env: "MODEL_CONFIRM", fallback: "anthropic/claude-sonnet-5.5" },
  /** Rédiger la synthèse citée d'un thème. */
  synthesize: { env: "MODEL_SYNTHESIZE", fallback: "anthropic/claude-sonnet-5.5" },
  /** Proposer Impact, Confiance et Effort, avec leurs justifications. */
  prescore: { env: "MODEL_PRESCORE", fallback: "anthropic/claude-sonnet-5.5" },
  /** Dialoguer avec le PO : la boucle de l'agent et ses outils. */
  agent: { env: "MODEL_AGENT", fallback: "anthropic/claude-opus-5.5" },
  /** Rédiger une user story à partir des preuves d'un thème. */
  story: { env: "MODEL_STORY", fallback: "anthropic/claude-sonnet-5.5" },
  /** Noter les stories pendant les évals : une autre famille que le rédacteur, pour limiter la complaisance. */
  judge: { env: "MODEL_JUDGE", fallback: "openai/gpt-5" },
} as const;

export type ModelTask = keyof typeof TASK_MODELS;

export function modelFor(task: ModelTask): string {
  const { env, fallback } = TASK_MODELS[task];
  return process.env[env] || fallback;
}

/**
 * Le modèle d'embeddings fixe la dimension des vecteurs en base (db/migrations/0001_init.sql).
 * En changer impose une migration et un recalcul : un test de contrat compare les deux.
 */
export const EMBEDDING_MODEL = {
  id: process.env.MODEL_EMBED || "openai/text-embedding-3-small",
  dimensions: 1536,
} as const;

/** Profondeur de réflexion par tâche, transmise au fournisseur concerné (les autres l'ignorent). */
export function reasoning(level: "low" | "medium" | "high") {
  return {
    anthropic: { effort: level },
    openai: { reasoningEffort: level },
  };
}

/** Version des prompts, enregistrée avec chaque appel dans pipeline_runs. */
export const PROMPT_VERSIONS = {
  extract: "extract.v3",
  confirm: "confirm.v4",
  synthesize: "synthesize.v5",
  prescore: "prescore.v2",
  agent: "agent.v6",
  story: "story.v2",
  judge: "judge.v1",
} as const;

/**
 * Prix publics en dollars par million de tokens (entrée / sortie), relevés dans le catalogue
 * du Vercel AI Gateway le 14 octobre 2026. Ils servent à afficher le coût de chaque appel.
 */
export const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
  "anthropic/claude-sonnet-5.5": { input: 2, output: 10 },
  "anthropic/claude-opus-5.5": { input: 4, output: 20 },
  "openai/gpt-5": { input: 1.25, output: 10 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  "openai/gpt-5-nano": { input: 0.05, output: 0.4 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "openai/text-embedding-3-small": { input: 0.02, output: 0 },
  "mistral/mistral-embed": { input: 0.1, output: 0 },
};

/** Coût estimé d'un appel, à partir des tokens consommés. Null si le prix du modèle est inconnu. */
export function estimateCostUsd(
  model: string,
  usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens"> | undefined,
): number | null {
  const price = PRICES_PER_MILLION[model];
  if (!price || !usage) return null;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (input * price.input + output * price.output) / 1_000_000;
}
