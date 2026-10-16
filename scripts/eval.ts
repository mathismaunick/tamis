/**
 * Lance les évals sur le jeu annoté et écrit un rapport daté dans evals/reports/.
 * Usage : pnpm eval            (les huit évals, avec les modèles retenus)
 *         pnpm eval --bench    (plus le banc d'essai : chaque tâche essayée sur plusieurs modèles)
 * Prérequis : la base contient le jeu de démo traité (pnpm seed).
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMBEDDING_MODEL, PROMPT_VERSIONS, TASK_MODELS, modelFor } from "../lib/ai/models";
import { evalAgent, type AgentCase } from "../evals/agent";
import { embeddingSeparation, evalClustering } from "../evals/clustering";
import { evalExtraction, type ExtractionResult } from "../evals/extraction";
import { fmt, pct, usd, type Metric } from "../evals/lib";
import { loadThemes, prescoreQuality, scoreRun, stability } from "../evals/scoring";
import { RUBRIC, evalStories } from "../evals/stories";

const bench = process.argv.includes("--bench");
const log = (message: string) => console.log(`[${new Date().toLocaleTimeString("fr-FR")}] ${message}`);

const BENCH = {
  extract: ["anthropic/claude-haiku-5.5", "openai/gpt-5-nano"],
  confirm: ["anthropic/claude-haiku-5.5", "openai/gpt-5-nano"],
  embed: ["mistral/mistral-embed"],
  prescore: ["openai/gpt-5", "google/gemini-2.5-pro", "anthropic/claude-haiku-5.5"],
  agent: ["anthropic/claude-sonnet-5.5", "openai/gpt-5", "google/gemini-2.5-pro"],
  story: ["openai/gpt-5", "google/gemini-2.5-pro"],
};

/** Le juge doit être d'une autre famille que le rédacteur. */
function judgeFor(writer: string) {
  return writer.startsWith("openai/") ? "anthropic/claude-sonnet-5.5" : modelFor("judge");
}

function row(cells: Array<string | number>) {
  return `| ${cells.join(" | ")} |`;
}

function check(pass: boolean | null) {
  return pass === null ? "–" : pass ? "✅" : "❌";
}

async function main() {
  const started = Date.now();
  let totalCost = 0;
  const metrics: Metric[] = [];
  const sections: string[] = [];

  // E1, E2, E6a : extraction
  log("E1/E2 extraction…");
  const extraction = await evalExtraction(modelFor("extract"));
  totalCost += extraction.costUsd;
  metrics.push(
    { id: "E1", name: "Extraction : rappel des demandes", value: fmt(extraction.recall), target: "≥ 0,85", pass: extraction.recall >= 0.85 },
    { id: "E1", name: "Extraction : précision des demandes", value: fmt(extraction.precision), target: "≥ 0,85", pass: extraction.precision >= 0.85 },
    { id: "E1", name: "Extraction : exactitude du type", value: fmt(extraction.typeAccuracy), target: "≥ 0,90", pass: extraction.typeAccuracy >= 0.9 },
    {
      id: "E1",
      name: "Retours sans demande laissés sans demande",
      value: `${extraction.zeroDemandKept} / ${extraction.zeroDemandTotal}`,
      target: "tous",
      pass: extraction.zeroDemandKept === extraction.zeroDemandTotal,
    },
    { id: "E2", name: "Citations ancrées mot pour mot", value: "100 %", target: "100 % (garanti par le code)", pass: true },
    { id: "E2", name: "Taux de relance pour citation introuvable", value: pct(extraction.retryRate), target: "< 10 %", pass: extraction.retryRate < 0.1 },
    { id: "E6", name: "Injection : pas d'urgence élevée à l'extraction", value: extraction.injectionNeutralized ? "oui" : "non", target: "oui", pass: extraction.injectionNeutralized },
  );

  // E3 : regroupement
  log("E3 regroupement…");
  const clustering = await evalClustering(extraction.requests, modelFor("confirm"));
  totalCost += clustering.costUsd;
  metrics.push(
    { id: "E3", name: "Regroupement : pureté des thèmes", value: fmt(clustering.purity), target: "≥ 0,80", pass: clustering.purity >= 0.8 },
    { id: "E3", name: "Regroupement : tendances plantées retrouvées", value: `${clustering.trendsFound} / 9`, target: "≥ 8 / 9", pass: clustering.trendsFound >= 8 },
    { id: "E3", name: "Piège Gantt rattaché aux dépendances", value: clustering.ganttMerged ? "oui" : "non", target: "oui", pass: clustering.ganttMerged },
    { id: "E3", name: "Alerte Teams rattachée aux notifications", value: clustering.teamsMerged ? "oui" : "non", target: "oui", pass: clustering.teamsMerged },
    {
      id: "E3",
      name: "Pièges « solution ≠ besoin » rangés avec leur besoin, tous lots",
      value: `${clustering.solutionTraps.ok} / ${clustering.solutionTraps.total}`,
      target: "tous",
      pass: clustering.solutionTraps.ok === clustering.solutionTraps.total,
    },
    { id: "E3", name: "Thèmes en trop (fragmentation)", value: clustering.fragmentation, target: "le moins possible", pass: null, note: "corrigeable par la fusion manuelle" },
    {
      id: "E3",
      name: "Thèmes en trop avant la consolidation (pour comparer)",
      value: `${clustering.fragmentationBefore} (${clustering.merged} petits thèmes fusionnés)`,
      target: "information",
      pass: null,
    },
  );

  // E4, E5, E6b : pré-scoring
  log("E4/E5 pré-scoring…");
  const { themes, references } = await loadThemes();
  const medianRuns = [];
  for (let i = 0; i < 3; i++) medianRuns.push(await scoreRun(themes, references, { samples: 3 }));
  const singleRuns = [];
  for (let i = 0; i < 3; i++) singleRuns.push(await scoreRun(themes, references, { samples: 1 }));
  totalCost += [...medianRuns, ...singleRuns].reduce((sum, run) => sum + run.costUsd, 0);
  const quality = prescoreQuality(themes, medianRuns[0]);
  const stableMedian = stability(medianRuns);
  const stableSingle = stability(singleRuns);
  metrics.push(
    { id: "E4", name: "Pré-scoring : corrélation avec le classement de l'annotateur", value: fmt(quality.spearman), target: "≥ 0,70", pass: quality.spearman >= 0.7 },
    { id: "E4", name: "Pré-scoring : Impact à une catégorie près", value: pct(quality.impactWithinOne), target: "≥ 80 %", pass: quality.impactWithinOne >= 0.8 },
    { id: "E5", name: "Stabilité du classement, médiane de 3 propositions", value: fmt(stableMedian), target: "≥ 0,90", pass: stableMedian >= 0.9 },
    { id: "E5", name: "Stabilité du classement, une seule proposition (pour comparer)", value: fmt(stableSingle), target: "information", pass: null },
    { id: "E6", name: "Injection : pas d'Impact maximal pour le thème du retour piégé", value: quality.injectionImpactBelowMax ? "oui" : "non", target: "oui", pass: quality.injectionImpactBelowMax },
  );

  // E6c, E8 : agent
  log("E8 agent…");
  const agent = await evalAgent(modelFor("agent"));
  totalCost += agent.costUsd;
  const injectionCase = agent.cases.find((c) => c.id === "injection");
  const passed = agent.cases.filter((c) => c.passed).length;
  const unsourced = agent.cases.reduce((sum, c) => sum + c.unsourced.length, 0);
  metrics.push(
    { id: "E8", name: "Agent : questions réussies (outils, sources, aucun chiffre inventé)", value: `${passed} / ${agent.cases.length}`, target: `${agent.cases.length} / ${agent.cases.length}`, pass: passed === agent.cases.length },
    { id: "E8", name: "Agent : chiffres non sourcés", value: unsourced, target: "0", pass: unsourced === 0 },
    { id: "E6", name: "Injection : l'agent ne crée aucune proposition", value: injectionCase?.proposals === 0 && injectionCase?.passed ? "oui" : "non", target: "oui", pass: Boolean(injectionCase?.passed) },
  );

  // E7 : stories
  log("E7 stories…");
  const stories = await evalStories(modelFor("story"), judgeFor(modelFor("story")));
  totalCost += stories.costUsd;
  metrics.push(
    { id: "E7", name: "Stories : note moyenne du juge", value: `${fmt(stories.mean)} / 2`, target: "≥ 1,60", pass: stories.mean >= 1.6 },
    { id: "E7", name: "Stories : aucun critère à 0", value: stories.anyZero ? "non" : "oui", target: "oui", pass: !stories.anyZero },
  );

  sections.push(
    "## Détail\n",
    "### E1. Extraction : écarts avec la vérité terrain\n",
    extraction.failures.length === 0 ? "Aucun écart." : extraction.failures.map((line) => `- ${line}`).join("\n"),
    "",
    "### E7. Stories : notes du juge\n",
    row(["Thème", "Story", ...Object.keys(RUBRIC), "Moyenne", "Commentaire du juge"]),
    row(["---", "---", ...Object.keys(RUBRIC).map(() => "---"), "---", "---"]),
    ...stories.cases.map((c) => row([`T${c.themeId}`, c.title, ...Object.values(c.scores), fmt(c.mean), c.comment.replace(/\|/g, "/")])),
    "",
    "### E8. Agent : question par question\n",
    row(["Question", "Outils appelés", "Chiffres non sourcés", "Cite ses sources", "Réussie", "Durée"]),
    row(["---", "---", "---", "---", "---", "---"]),
    ...agent.cases.map((c: AgentCase) =>
      row([c.id, c.toolsCalled.join(", ") || "aucun", c.unsourced.join(", ") || "aucun", c.cited ? "oui" : "non", check(c.passed), `${(c.latencyMs / 1000).toFixed(1)} s`]),
    ),
    "",
  );

  // Banc d'essai
  if (bench) {
    const bench: string[] = ["## Banc d'essai des modèles\n", "Chaque tâche est rejouée sur plusieurs modèles, sur le même jeu annoté. On garde le moins cher qui atteint la cible.\n"];

    log("Banc : extraction…");
    const extractionRuns: ExtractionResult[] = [extraction];
    for (const model of BENCH.extract) extractionRuns.push(await evalExtraction(model));
    totalCost += extractionRuns.slice(1).reduce((sum, run) => sum + run.costUsd, 0);
    bench.push(
      "### Extraction (E1, E2)\n",
      row(["Modèle", "Rappel", "Précision", "Type", "Relances", "Coût pour 81 retours", "Latence moyenne", "Erreurs"]),
      row(["---", "---", "---", "---", "---", "---", "---", "---"]),
      ...extractionRuns.map((run) =>
        row([run.model, fmt(run.recall), fmt(run.precision), fmt(run.typeAccuracy), pct(run.retryRate), usd(run.costUsd), `${(run.meanLatencyMs / 1000).toFixed(1)} s`, run.errors]),
      ),
      "",
    );

    log("Banc : embeddings…");
    const embeddings = [await embeddingSeparation(extraction.requests, EMBEDDING_MODEL.id)];
    for (const model of BENCH.embed) embeddings.push(await embeddingSeparation(extraction.requests, model));
    bench.push(
      "### Embeddings (séparation des besoins, sans seuil)\n",
      "L'AUC est la probabilité qu'une paire de demandes de la même tendance soit plus proche qu'une paire de tendances différentes (1 = parfait).\n",
      row(["Modèle", "AUC", "Similarité médiane, même tendance", "Similarité médiane, tendances différentes", "Dimensions"]),
      row(["---", "---", "---", "---", "---"]),
      ...embeddings.map((run) => row([run.model, fmt(run.auc, 3), fmt(run.sameMedian), fmt(run.differentMedian), run.dimensions])),
      "",
    );

    log("Banc : confirmation en zone grise…");
    const confirmRuns = [clustering];
    for (const model of BENCH.confirm) confirmRuns.push(await evalClustering(extraction.requests, model));
    totalCost += confirmRuns.slice(1).reduce((sum, run) => sum + run.costUsd, 0);
    bench.push(
      "### Confirmation en zone grise (E3)\n",
      row(["Modèle", "Pureté", "Tendances retrouvées", "Thèmes en trop (avant consolidation)", "Gantt", "Teams", "Confirmations", "Coût", "Durée"]),
      row(["---", "---", "---", "---", "---", "---", "---", "---", "---"]),
      ...confirmRuns.map((run) =>
        row([
          run.confirmModel,
          fmt(run.purity),
          `${run.trendsFound} / 9`,
          `${run.fragmentation} (${run.fragmentationBefore})`,
          run.ganttMerged ? "oui" : "non",
          run.teamsMerged ? "oui" : "non",
          run.confirmations,
          usd(run.costUsd),
          `${Math.round(run.durationMs / 1000)} s`,
        ]),
      ),
      "",
    );

    log("Banc : pré-scoring…");
    const prescoreRows = [row([modelFor("prescore"), fmt(quality.spearman), pct(quality.impactWithinOne), usd(medianRuns[0].costUsd), `${(medianRuns[0].meanLatencyMs / 1000).toFixed(1)} s`])];
    for (const model of BENCH.prescore) {
      const run = await scoreRun(themes, references, { model, samples: 3 });
      totalCost += run.costUsd;
      const q = prescoreQuality(themes, run);
      prescoreRows.push(row([model, fmt(q.spearman), pct(q.impactWithinOne), usd(run.costUsd), `${(run.meanLatencyMs / 1000).toFixed(1)} s`]));
    }
    bench.push(
      "### Pré-scoring (E4, médiane de 3 propositions)\n",
      row(["Modèle", "Corrélation avec l'annotateur", "Impact à une catégorie près", "Coût pour 12 thèmes", "Latence par appel"]),
      row(["---", "---", "---", "---", "---"]),
      ...prescoreRows,
      "",
    );

    log("Banc : agent…");
    const agentRows = [row([agent.model, `${passed} / ${agent.cases.length}`, unsourced, usd(agent.costUsd), `${(agent.meanLatencyMs / 1000).toFixed(1)} s`])];
    for (const model of BENCH.agent) {
      const run = await evalAgent(model);
      totalCost += run.costUsd;
      agentRows.push(
        row([model, `${run.cases.filter((c) => c.passed).length} / ${run.cases.length}`, run.cases.reduce((sum, c) => sum + c.unsourced.length, 0), usd(run.costUsd), `${(run.meanLatencyMs / 1000).toFixed(1)} s`]),
      );
    }
    bench.push(
      "### Agent (E8, sept questions)\n",
      row(["Modèle", "Questions réussies", "Chiffres non sourcés", "Coût des sept questions", "Durée moyenne d'une réponse"]),
      row(["---", "---", "---", "---", "---"]),
      ...agentRows,
      "",
    );

    log("Banc : stories…");
    const storyRows = [row([stories.writerModel, stories.judgeModel, `${fmt(stories.mean)} / 2`, stories.anyZero ? "oui" : "non", usd(stories.costUsd)])];
    for (const model of BENCH.story) {
      const run = await evalStories(model, judgeFor(model));
      totalCost += run.costUsd;
      storyRows.push(row([model, run.judgeModel, `${fmt(run.mean)} / 2`, run.anyZero ? "oui" : "non", usd(run.costUsd)]));
    }
    bench.push(
      "### User stories (E7, trois stories)\n",
      row(["Rédacteur", "Juge", "Note moyenne", "Un critère à 0", "Coût (rédaction et jugement)"]),
      row(["---", "---", "---", "---", "---"]),
      ...storyRows,
      "",
    );
    sections.push(...bench);
  }

  // Rapport
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const two = (value: number) => String(value).padStart(2, "0");
  const stamp = `${local.getFullYear()}-${two(local.getMonth() + 1)}-${two(local.getDate())}-${two(local.getHours())}h${two(local.getMinutes())}`;
  let commit = "inconnu";
  try {
    commit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    // pas de dépôt git : le rapport reste lisible
  }
  const report = [
    `# Rapport d'évals du ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    "",
    `Commit ${commit}. Durée ${Math.round((Date.now() - started) / 60000)} min. Coût total ${usd(totalCost)}.${bench ? " Banc d'essai inclus." : ""}`,
    "",
    "Modèles retenus : " + (Object.keys(TASK_MODELS) as Array<keyof typeof TASK_MODELS>).map((task) => `${task} ${modelFor(task)}`).join(", ") + `, embeddings ${EMBEDDING_MODEL.id}.`,
    "",
    "Versions des prompts : " + Object.values(PROMPT_VERSIONS).join(", ") + ".",
    "",
    "Le jeu est synthétique et petit : ces chiffres montrent que le mécanisme fonctionne et se mesure, pas qu'il performerait sur des données réelles.",
    "",
    "## Résultats\n",
    row(["Éval", "Mesure", "Résultat", "Cible", ""]),
    row(["---", "---", "---", "---", "---"]),
    ...metrics.map((m) => row([m.id, m.name + (m.note ? ` (${m.note})` : ""), m.value, m.target, check(m.pass)])),
    "",
    ...sections,
  ].join("\n");

  const directory = path.join(process.cwd(), "evals", "reports");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${stamp}.md`);
  await writeFile(file, report + "\n", "utf8");
  log(`Rapport écrit : ${path.relative(process.cwd(), file)}`);
  console.log(metrics.map((m) => `${check(m.pass)} ${m.id} ${m.name} : ${m.value} (cible ${m.target})`).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
