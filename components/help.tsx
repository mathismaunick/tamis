import { cx } from "@/components/ui";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";
import { frenchSpaces } from "@/lib/labels";

/**
 * Le « ? » à côté d'un mot du métier : sa définition en une phrase, au survol, au toucher ou au clavier. Sans
 * JavaScript, la bulle s'affiche tant que le bouton est survolé ou a le focus. Un terme n'a qu'un « ? » par écran,
 * à sa première apparition ; jamais dans un lien, qui ne peut pas contenir de bouton.
 */
export function Help({ term, align = "start", side = "bottom", className }: { term: GlossaryTerm; align?: "start" | "end"; side?: "top" | "bottom"; className?: string }) {
  const entry = GLOSSARY[term];
  const id = `aide-${term}`;
  return (
    <span className={cx("group/aide relative ml-1 inline-flex align-[-2px]", className)}>
      {/* Le rond fait 16 px ; le bouton qui l'entoure en fait 24, la taille minimale d'une cible tactile, sans
          prendre plus de place dans la ligne. */}
      <button
        type="button"
        aria-label={`Définition : ${entry.label.toLowerCase()}`}
        aria-describedby={id}
        className="group/rond -m-1 grid size-6 place-items-center rounded-full"
      >
        <span
          aria-hidden
          className="grid size-4 place-items-center rounded-full text-xs leading-none font-bold text-encre-3 ring-1 ring-trait-3 ring-inset transition-colors group-hover/rond:bg-encre-2 group-hover/rond:text-white group-hover/rond:ring-encre-2 group-focus-visible/rond:bg-encre-2 group-focus-visible/rond:text-white"
        >
          ?
        </span>
      </button>
      {/* Fermée, la bulle sort de la mise en page (rien ne déborde) ; sur téléphone, elle s'ouvre en bas de l'écran. */}
      <span
        role="tooltip"
        id={id}
        className={cx(
          "pointer-events-none fixed inset-x-4 bottom-4 z-40 hidden rounded-lg bg-nuit px-3 py-2.5 text-left text-[13px] leading-relaxed font-normal tracking-normal whitespace-normal text-white shadow-menu",
          "group-hover/aide:block group-focus-within/aide:block sm:absolute sm:w-[290px]",
          side === "top" ? "sm:top-auto sm:bottom-full sm:mb-2" : "sm:top-full sm:bottom-auto sm:mt-2",
          align === "end" ? "sm:right-[-8px] sm:left-auto" : "sm:right-auto sm:left-[-8px]",
        )}
      >
        <b className="font-semibold">{entry.label}</b>
        {frenchSpaces(` : ${entry.text}`)}
      </span>
    </span>
  );
}
