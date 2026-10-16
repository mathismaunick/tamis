/**
 * Vérifie que chaque modèle déclaré dans lib/ai/models.ts répond via le Vercel AI Gateway,
 * et que le modèle d'embeddings renvoie la dimension attendue par la base.
 * Usage : pnpm check:ai
 */
import { embedMany, generateText } from "ai";
import { EMBEDDING_MODEL, TASK_MODELS, estimateCostUsd, modelFor, type ModelTask } from "../lib/ai/models";

async function checkTask(task: ModelTask) {
  const model = modelFor(task);
  const started = Date.now();
  try {
    const result = await generateText({ model, prompt: "Réponds seulement : ok" });
    const cost = estimateCostUsd(model, result.usage);
    return `OK    ${task.padEnd(11)} ${model.padEnd(32)} ${Date.now() - started} ms, ${cost?.toFixed(6) ?? "?"} $`;
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return `ÉCHEC ${task.padEnd(11)} ${model.padEnd(32)} ${message.slice(0, 120)}`;
  }
}

async function main() {
  const tasks = Object.keys(TASK_MODELS) as ModelTask[];
  for (const line of await Promise.all(tasks.map(checkTask))) console.log(line);

  try {
    const { embeddings } = await embedMany({ model: EMBEDDING_MODEL.id, values: ["voir les dépendances entre tâches"] });
    const dims = embeddings[0]?.length;
    const ok = dims === EMBEDDING_MODEL.dimensions;
    console.log(`${ok ? "OK   " : "ÉCHEC"} embeddings  ${EMBEDDING_MODEL.id.padEnd(32)} ${dims} dimensions (attendu ${EMBEDDING_MODEL.dimensions})`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`ÉCHEC embeddings  ${EMBEDDING_MODEL.id.padEnd(32)} ${message.slice(0, 120)}`);
  }
}

main();
