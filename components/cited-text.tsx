import Link from "next/link";
import { Fragment } from "react";
import { frenchSpaces } from "@/lib/labels";

/** Le titre est-il déjà écrit juste avant la référence ? Sinon, la référence le remplace. */
function namedBefore(before: string, title: string): boolean {
  const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return normalize(before.slice(-title.length - 40)).includes(normalize(title).slice(0, 24));
}

/**
 * Un texte dont les références deviennent des liens vers leur source : la preuve à un clic. Un retour [F12] garde son
 * numéro, comme un ticket ; un besoin [T3] devient une petite flèche quand son titre est déjà dans la phrase, et son
 * titre sinon : un identifiant interne n'est jamais montré seul. Une story [S2] devient le mot « story ».
 */
export function CitedText({ text, titles }: { text: string; titles?: ReadonlyMap<number, string> }) {
  const parts = text.split(/(\[[FTS]\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[([FTS])(\d+)\]$/);
        if (!match) return <Fragment key={index}>{frenchSpaces(part)}</Fragment>;
        const [, kind, id] = match;
        if (kind === "T") {
          const title = titles?.get(Number(id));
          if (title && !namedBefore(parts.slice(0, index).join(""), title)) {
            return (
              <Link key={index} href={`/themes/${id}`} className="font-semibold text-encre underline decoration-trait-3 underline-offset-2 hover:text-accent">
                {title}
              </Link>
            );
          }
          return (
            <Link
              key={index}
              href={`/themes/${id}`}
              aria-label={title ? `Ouvrir le besoin « ${title} »` : "Ouvrir le besoin"}
              title={title}
              className="mx-0.5 inline-grid size-[18px] place-items-center rounded bg-papier-3 align-[-3px] text-encre-2 no-underline hover:bg-trait-2 hover:text-encre"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7" />
                <path d="M8 7h9v9" />
              </svg>
            </Link>
          );
        }
        return (
          <Link
            key={index}
            href={kind === "F" ? `/feedback/${id}` : `/stories/${id}`}
            className="mx-0.5 inline-block rounded bg-papier-3 px-1.5 align-[1px] text-xs leading-[18px] font-medium text-encre-2 no-underline hover:bg-trait-2 hover:text-encre"
          >
            {kind === "F" ? `F${id}` : "story"}
          </Link>
        );
      })}
    </>
  );
}
