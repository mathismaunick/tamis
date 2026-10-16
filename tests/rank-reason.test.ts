import { describe, expect, it } from "vitest";
import { rankReason, type ReasonNeed } from "@/lib/rank-reason";

// Le backlog de la démo : clients, impact, confiance, effort de chaque besoin.
const backlog: ReasonNeed[] = [
  { reach: 5, impact: 2, confidence: 1, effort: 8 },
  { reach: 5, impact: 3, confidence: 1, effort: 13 },
  { reach: 5, impact: 2, confidence: 0.8, effort: 8 },
  { reach: 4, impact: 2, confidence: 1, effort: 8 },
  { reach: 6, impact: 1, confidence: 1, effort: 8 },
  { reach: 5, impact: 1, confidence: 1, effort: 8 },
  { reach: 4, impact: 2, confidence: 1, effort: 13 },
  { reach: 3, impact: 1, confidence: 0.8, effort: 5 },
  { reach: 3, impact: 1, confidence: 0.5, effort: 5 },
  { reach: 1, impact: 1, confidence: 0.5, effort: 2 },
  { reach: 3, impact: 1, confidence: 0.5, effort: 8 },
];

describe("pourquoi un besoin est à sa place", () => {
  it("dit d'abord ce qui le pousse, puis ce qui le retient", () => {
    expect(rankReason(backlog[4], backlog)).toBe("Le plus demandé (6 clients), mais un impact jugé moyen.");
    expect(rankReason(backlog[1], backlog)).toBe("Demandé par 5 clients, avec un impact massif, mais un effort important (13 points).");
  });

  it("s'arrête à ce qui le pousse quand rien ne le retient", () => {
    expect(rankReason(backlog[0], backlog)).toBe("Demandé par 5 clients, avec un impact fort.");
  });

  it("commence par un autre atout quand il est peu demandé", () => {
    // La médiane du backlog est de 4 clients : 3 clients, c'est « seulement ».
    expect(rankReason({ reach: 3, impact: 2, confidence: 1, effort: 13 }, backlog)).toBe("Un impact fort, mais demandé par 3 clients seulement et un effort important (13 points).");
    expect(rankReason(backlog[9], backlog)).toBe("Un effort faible (2 points), mais demandé par 1 client seulement, un impact jugé moyen et une confiance de 50 %.");
  });

  it("dit ce qui le retient quand il n'a pas d'atout", () => {
    expect(rankReason(backlog[10], backlog)).toBe("Demandé par 3 clients seulement, un impact jugé moyen et une confiance de 50 %.");
  });
});
