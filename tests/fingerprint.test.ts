import { describe, expect, it } from "vitest";
import { contentHash, normalizeText, sameMessage } from "@/lib/feedback/fingerprint";

describe("empreinte d'un retour (doublons)", () => {
  it("ignore la casse, la ponctuation et les espaces", () => {
    expect(normalizeText("  Bonjour,\n\nUne VUE « rapport » !  ")).toBe("bonjour une vue rapport");
  });

  it("donne la même empreinte au même message reçu par deux canaux", () => {
    const email = "Bonjour,\n\nUne vue « rapport » serait idéale.\n\nMerci !";
    const ticket = "Bonjour, une vue \"rapport\" serait idéale. Merci !";
    expect(contentHash("Studio Cobalt", email)).toBe(contentHash("studio cobalt", ticket));
  });

  it("distingue deux clients qui écrivent le même texte", () => {
    expect(contentHash("Nexalis", "Slack svp")).not.toBe(contentHash("Pixel Rivage", "Slack svp"));
  });

  it("distingue deux textes différents du même client", () => {
    expect(contentHash("Nexalis", "Slack svp")).not.toBe(contentHash("Nexalis", "Teams svp"));
  });

  it("reconnaît un email collé sans sa formule de politesse, puis reçu en entier", () => {
    const colle = "Pour nos salons, il nous faudrait un diagramme de Gantt : visualiser l'enchaînement des tâches et voir tout de suite ce qui retarde le montage.";
    const recu = `Bonjour,\n\n${colle}\n\nMerci !\nMathilde`;
    expect(sameMessage(colle, recu)).toBe(true);
    expect(sameMessage(recu, colle)).toBe(true);
  });

  it("ne prend pas un message court contenu dans un autre pour un doublon", () => {
    expect(sameMessage("Merci !", "Bonjour, merci ! Les rapports ne s'exportent pas en PDF.")).toBe(false);
  });

  it("distingue deux messages longs différents", () => {
    const a = "Il faudrait pouvoir exporter le rapport d'avancement en PDF pour nos comités de pilotage mensuels.";
    const b = "Il faudrait pouvoir saisir le temps passé sur chaque tâche pour facturer nos clients au réel.";
    expect(sameMessage(a, b)).toBe(false);
  });
});
