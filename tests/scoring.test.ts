import { describe, expect, it } from "vitest";
import { computeRice, formatScore, rankThemes, suggestMoscow, type MoscowInput } from "@/lib/scoring/rice";

describe("score RICE", () => {
  it("applique la formule Reach × Impact × Confiance ÷ Effort", () => {
    expect(computeRice({ reach: 6, impact: 2, confidence: 0.7, effort: 5 })).toBeCloseTo(1.68);
    expect(computeRice({ reach: 3, impact: 2, confidence: 0.8, effort: 2 })).toBeCloseTo(2.4);
  });

  it("borne la confiance entre 0 et 1 et l'effort à 1 au minimum", () => {
    expect(computeRice({ reach: 4, impact: 1, confidence: 1.5, effort: 0 })).toBe(4);
    expect(computeRice({ reach: 4, impact: 1, confidence: -1, effort: 2 })).toBe(0);
  });

  it("ne calcule rien tant qu'un facteur manque", () => {
    expect(computeRice({ reach: 4, impact: null, confidence: 0.8, effort: 3 })).toBeNull();
  });

  it("affiche deux décimales à la française, sans fausse précision", () => {
    expect(formatScore(1.6799)).toBe("1,68");
    expect(formatScore(null)).toBe("à scorer");
  });
});

describe("classement", () => {
  it("trie par score, puis par Reach, puis par ancienneté (tri stable)", () => {
    const ranks = rankThemes([
      { id: 1, score: 1.5, reach: 3, status: "new" },
      { id: 2, score: 2.4, reach: 3, status: "new" },
      { id: 3, score: 1.5, reach: 6, status: "triaged" },
      { id: 4, score: 1.5, reach: 6, status: "new" },
    ]);
    expect([...ranks.entries()]).toEqual([
      [1, 4],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  it("sort les thèmes parqués ou livrés et ceux sans score du classement", () => {
    const ranks = rankThemes([
      { id: 1, score: 3, reach: 5, status: "parked" },
      { id: 2, score: 1, reach: 2, status: "new" },
      { id: 3, score: 9, reach: 2, status: "shipped" },
      { id: 4, score: null, reach: 8, status: "new" },
    ]);
    expect(ranks.get(1)).toBeNull();
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(3)).toBeNull();
    expect(ranks.get(4)).toBeNull();
  });

  it("recalcule le rang de tous les thèmes quand un seul score change", () => {
    const before = rankThemes([
      { id: 1, score: 2.4, reach: 3, status: "new" },
      { id: 2, score: 1.68, reach: 6, status: "new" },
    ]);
    const after = rankThemes([
      { id: 1, score: 1.5, reach: 3, status: "new" },
      { id: 2, score: 1.68, reach: 6, status: "new" },
    ]);
    expect([before.get(1), before.get(2)]).toEqual([1, 2]);
    expect([after.get(1), after.get(2)]).toEqual([2, 1]);
  });
});

describe("MoSCoW suggéré", () => {
  const theme = (id: number, rank: number | null, effort: number | null, extra: Partial<MoscowInput> = {}): MoscowInput => ({
    id,
    rank,
    status: "new",
    moscow: null,
    moscowSource: "computed",
    effort,
    ...extra,
  });
  const ranked = (efforts: number[]) => efforts.map((effort, index) => theme(index + 1, index + 1, effort));

  it("remplit chaque catégorie jusqu'à la capacité d'un cycle, dans l'ordre du classement", () => {
    const result = suggestMoscow(ranked([8, 13, 8, 8, 8, 8, 13, 5, 5, 2, 8]), 30);
    expect([...result.values()]).toEqual(["must", "must", "must", "should", "should", "should", "could", "could", "could", "could", "wont"]);
  });

  it("ne laisse jamais un besoin moins bien classé passer devant", () => {
    // Le 3e tiendrait dans les Must (8 + 1 ≤ 10), mais le 2e a fermé la catégorie.
    const result = suggestMoscow(ranked([8, 5, 1]), 10);
    expect([...result.values()]).toEqual(["must", "should", "should"]);
  });

  it("donne un cycle entier à un besoin plus gros que la capacité", () => {
    const result = suggestMoscow(ranked([40, 5]), 30);
    expect([...result.values()]).toEqual(["must", "should"]);
  });

  it("compte les choix du PO dans la capacité de leur catégorie", () => {
    const result = suggestMoscow([theme(1, 1, 8), theme(2, 2, 13), theme(3, 11, 20, { moscow: "must", moscowSource: "po" })], 30);
    expect(result.get(3)).toBe("must");
    expect(result.get(1)).toBe("must");
    expect(result.get(2)).toBe("should");
  });

  it("met un besoin parqué en Won't et laisse sans catégorie un besoin non classé", () => {
    const result = suggestMoscow([theme(1, 1, 5), theme(2, null, 5, { status: "parked" }), theme(3, null, null)]);
    expect(result.get(2)).toBe("wont");
    expect(result.get(3)).toBeNull();
  });

  it("suggère au moins Should pour un besoin planifié", () => {
    const result = suggestMoscow([theme(1, 1, 30), theme(2, 2, 30), theme(3, 3, 30), theme(4, 4, 5, { status: "planned" })], 30);
    expect(result.get(4)).toBe("should");
  });
});
