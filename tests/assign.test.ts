import { describe, expect, it, vi } from "vitest";
import {
  applyMergePlan,
  assignInMemory,
  cosine,
  decideAssignment,
  meanVector,
  planConsolidation,
  type Candidate,
  type ThemeGroup,
} from "@/lib/pipeline/assign";

const thresholds = { high: 0.85, low: 0.7 };
const candidate = (themeId: number, similarity: number): Candidate => ({ themeId, similarity, title: `T${themeId}`, need: "besoin" });

describe("rattachement d'une demande à un thème", () => {
  it("rattache directement au-dessus du seuil haut, sans appeler le modèle", async () => {
    const confirm = vi.fn();
    const decision = await decideAssignment([candidate(1, 0.6), candidate(2, 0.9)], confirm, thresholds);
    expect(decision).toEqual({ kind: "attach", themeId: 2, method: "direct", similarity: 0.9 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("en zone grise, suit la réponse du modèle et garde le candidat confirmé le plus proche", async () => {
    const confirm = vi.fn(async (c: Candidate) => c.themeId === 3);
    const decision = await decideAssignment([candidate(2, 0.8), candidate(3, 0.75), candidate(4, 0.4)], confirm, thresholds);
    expect(decision).toEqual({ kind: "attach", themeId: 3, method: "confirmed", similarity: 0.75 });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("crée un thème si le modèle refuse tous les candidats de la zone grise", async () => {
    const decision = await decideAssignment([candidate(2, 0.8)], async () => false, thresholds);
    expect(decision).toEqual({ kind: "create", similarity: 0.8 });
  });

  it("crée un thème sous le seuil bas, sans appeler le modèle", async () => {
    const confirm = vi.fn();
    expect(await decideAssignment([candidate(1, 0.5)], confirm, thresholds)).toEqual({ kind: "create", similarity: 0.5 });
    expect(await decideAssignment([], confirm, thresholds)).toEqual({ kind: "create", similarity: null });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("fait du thème créé un candidat pour la demande suivante", async () => {
    const requests = [
      { id: 1, need: "voir les dépendances", quote: "q", embedding: [1, 0, 0] },
      { id: 2, need: "voir ce qui bloque", quote: "q", embedding: [0.95, 0.05, 0] },
      { id: 3, need: "suivre le temps passé", quote: "q", embedding: [0, 0, 1] },
    ];
    const { assignments } = await assignInMemory(requests, async () => false, thresholds);
    expect(assignments.get(1)).toBe(assignments.get(2));
    expect(assignments.get(3)).not.toBe(assignments.get(1));
  });
});

const group = (id: number, size: number, vector: number[]): ThemeGroup => ({
  id,
  title: `T${id}`,
  needs: Array.from({ length: size }, (_, index) => `besoin ${id}.${index}`),
  vector,
});

describe("consolidation des petits thèmes", () => {
  it("montre au modèle les voisins d'un petit thème, du plus proche au plus lointain, et suit son choix", async () => {
    const themes = [group(1, 5, [1, 0, 0]), group(2, 4, [0.6, 0.8, 0]), group(3, 1, [0.9, 0.3, 0])];
    const choose = vi.fn(async (_small: ThemeGroup, candidates: ThemeGroup[]) => candidates[1].id);
    const plan = await planConsolidation(themes, choose, { low: 0.4 });
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose.mock.calls[0][1].map((candidate) => candidate.id)).toEqual([1, 2]);
    expect(plan).toEqual([{ sourceId: 3, targetId: 2, similarity: expect.closeTo(cosine([0.9, 0.3, 0], [0.6, 0.8, 0]), 5) }]);
  });

  it("ne fusionne rien quand le modèle ne désigne aucun voisin, ou un thème qu'on ne lui a pas montré", async () => {
    const themes = [group(1, 5, [1, 0, 0]), group(2, 1, [0, 1, 0]), group(3, 1, [0.9, 0.3, 0])];
    expect(await planConsolidation(themes, async () => null, { low: 0.4 })).toEqual([]);
    expect(await planConsolidation(themes, async () => 99, { low: 0.4 })).toEqual([]);
  });

  it("n'interroge pas le modèle pour un petit thème sans voisin au-dessus du seuil bas", async () => {
    const choose = vi.fn(async () => null);
    await planConsolidation([group(1, 5, [1, 0, 0]), group(2, 1, [0, 1, 0])], choose, { low: 0.4 });
    expect(choose).not.toHaveBeenCalled();
  });

  it("n'examine jamais une tendance établie, ni un thème hors des sources", async () => {
    const themes = [group(1, 5, [1, 0, 0]), group(2, 4, [0.99, 0.1, 0]), group(3, 1, [0.98, 0.2, 0])];
    const choose = vi.fn(async (_small: ThemeGroup, candidates: ThemeGroup[]) => candidates[0].id);
    expect(await planConsolidation(themes, choose, { low: 0.4, sources: new Set([1, 2]) })).toEqual([]);
    expect(choose).not.toHaveBeenCalled();
  });

  it("traite les plus petits d'abord, et une demande suit son thème de fusion en fusion", async () => {
    const themes = [group(1, 3, [1, 0, 0]), group(2, 1, [0.95, 0.05, 0]), group(3, 3, [0.9, 0.1, 0])];
    const plan = await planConsolidation(themes, async (_small, candidates) => candidates[0].id, { low: 0.4 });
    // T2 rejoint T1, le plus proche ; T3 rejoint ensuite T1, le seul restant ; T1, qui a grandi, n'est plus examiné.
    expect(plan.map((merge) => [merge.sourceId, merge.targetId])).toEqual([
      [2, 1],
      [3, 1],
    ]);
    const assignments = applyMergePlan(
      new Map([
        [10, 2],
        [11, 3],
        [12, 1],
      ]),
      [
        { sourceId: 2, targetId: 3, similarity: 0.9 },
        { sourceId: 3, targetId: 1, similarity: 0.9 },
      ],
    );
    expect([...assignments.values()]).toEqual([1, 1, 1]);
  });
});

describe("géométrie des vecteurs", () => {
  it("calcule la similarité cosinus", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it("fait du vecteur d'un thème la moyenne de ses demandes", () => {
    expect(meanVector([
      [1, 0],
      [0, 1],
    ])).toEqual([0.5, 0.5]);
  });
});
