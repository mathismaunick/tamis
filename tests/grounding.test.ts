import { describe, expect, it } from "vitest";
import { highlightSegments, isGrounded, locateQuote } from "@/lib/pipeline/grounding";

const SOURCE =
  "Bonjour,\n\nSur nos chantiers, beaucoup de tâches ne peuvent commencer qu'une fois une autre terminée.\nPouvoir lier deux tâches avec un « dépend de » nous éviterait des oublis.";

describe("ancrage des citations", () => {
  it("accepte une sous-chaîne exacte du retour", () => {
    expect(isGrounded(SOURCE, "Pouvoir lier deux tâches")).toBe(true);
  });

  it("tolère les sauts de ligne et les guillemets typographiques", () => {
    expect(isGrounded(SOURCE, "commencer qu'une fois une autre terminée. Pouvoir lier")).toBe(true);
    expect(isGrounded(SOURCE, 'avec un "dépend de" nous')).toBe(true);
  });

  it("rejette une citation reformulée, inventée ou tronquée", () => {
    expect(isGrounded(SOURCE, "Pouvoir relier deux tâches")).toBe(false);
    expect(isGrounded(SOURCE, "un diagramme de Gantt")).toBe(false);
    expect(isGrounded(SOURCE, "Pouvoir lier deux tâches […] des oublis")).toBe(false);
    expect(isGrounded(SOURCE, "ok")).toBe(false);
  });

  it("donne la position exacte dans le texte d'origine", () => {
    const position = locateQuote(SOURCE, "Pouvoir lier deux tâches")!;
    expect(SOURCE.slice(position.start, position.end)).toBe("Pouvoir lier deux tâches");
  });

  it("découpe le texte pour surligner les passages cités", () => {
    const segments = highlightSegments("Un timer sur les cartes stp", ["timer sur les cartes"]);
    expect(segments).toEqual([
      { text: "Un ", quoteIndex: null },
      { text: "timer sur les cartes", quoteIndex: 0 },
      { text: " stp", quoteIndex: null },
    ]);
  });
});
