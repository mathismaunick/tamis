import { Fragment, type ReactNode } from "react";
import { CitedText } from "@/components/cited-text";

/** Le gras (**texte**) et les références [F12] d'une ligne. */
function inline(text: string, titles?: ReadonlyMap<number, string>): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-encre">
        <CitedText text={part.slice(2, -2)} titles={titles} />
      </strong>
    ) : (
      <CitedText key={index} text={part} titles={titles} />
    ),
  );
}

/**
 * Le texte de l'agent : paragraphes, listes à puces et gras, avec les références cliquables.
 * Un rendu volontairement minimal, sans bibliothèque Markdown : l'agent n'a pas besoin de plus.
 */
export function RichText({ text, titles }: { text: string; titles?: ReadonlyMap<number, string> }) {
  const blocks: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.kind === "ul") last.lines.push(bullet[1]);
      else blocks.push({ kind: "ul", lines: [bullet[1]] });
    } else if (line.trim() === "") {
      blocks.push({ kind: "p", lines: [] });
    } else {
      const last = blocks.at(-1);
      if (last?.kind === "p" && last.lines.length > 0) last.lines.push(line);
      else blocks.push({ kind: "p", lines: [line] });
    }
  }
  return (
    <div className="grid gap-2.5">
      {blocks
        .filter((block) => block.lines.length > 0)
        .map((block, index) =>
          block.kind === "ul" ? (
            <ul key={index} className="grid list-disc gap-1 pl-5">
              {block.lines.map((line, i) => (
                <li key={i}>{inline(line, titles)}</li>
              ))}
            </ul>
          ) : (
            <p key={index}>
              {block.lines.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 ? <br /> : null}
                  {inline(line, titles)}
                </Fragment>
              ))}
            </p>
          ),
        )}
    </div>
  );
}
