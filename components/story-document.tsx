import Link from "next/link";
import { CitedText } from "@/components/cited-text";
import { Help } from "@/components/help";
import { Icon } from "@/components/icons";
import { StatusPill, buttonClass } from "@/components/ui";
import { frenchSpaces, midSentence, plural } from "@/lib/labels";
import type { Story } from "@/lib/services/stories";

/** Un morceau de phrase sans majuscule ni ponctuation finale : les trois parties d'un critère forment une seule phrase. */
function part(text: string) {
  return frenchSpaces(midSentence(text).replace(/[.;:,]+$/, ""));
}

/**
 * Une story lue comme un document : la phrase « En tant que… », les critères d'acceptation, ce qui reste à trancher
 * avec l'équipe, puis la complexité comparée aux stories de référence et les retours dont elle est tirée.
 */
export function StoryDocument({ story }: { story: Story }) {
  return (
    <article className="rounded-xl border border-trait px-5 py-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
          <span className="text-[13px] font-semibold text-encre-3">{story.title}</span>
          {story.points ? <span className="rounded-md bg-must px-2 py-0.5 text-[13px] font-bold text-white">{plural(story.points, "point")}</span> : null}
          <StatusPill label={story.status === "reviewed" ? "Relue" : "Brouillon"} tone={story.status === "reviewed" ? "accent" : "neutre"} />
        </p>
        <span className="flex gap-2">
          <Link href={`/stories/${story.id}#modifier`} className={buttonClass("trait", "sm")}>
            <Icon name="pen" className="size-4" />
            Modifier
          </Link>
          <a href={`/api/stories/${story.id}/markdown`} className={buttonClass("trait", "sm")}>
            <Icon name="download" className="size-4" />
            Exporter
          </a>
        </span>
      </header>
      <p className="mt-3 text-[16.5px] leading-relaxed text-encre-2">
        En tant que <b className="font-semibold text-encre">{part(story.persona)}</b>, je veux <b className="font-semibold text-encre">{part(story.want)}</b>, afin de{" "}
        <b className="font-semibold text-encre">{part(story.soThat)}</b>.
      </p>
      <h2 className="mt-4 text-[12.5px] font-bold text-encre-3">
        Critères d&apos;acceptation
        <Help term="criteres" />
      </h2>
      <ul className="mt-1.5 grid gap-1.5">
        {story.criteria.map((criterion, index) => (
          <li key={index} className="flex gap-2.5 text-[13.5px] leading-relaxed">
            <Icon name="check" className="mt-[3px] size-4 shrink-0 text-could" />
            <span>
              <b className="font-semibold text-accent-fort">Étant donné</b> {part(criterion.given)}, <b className="font-semibold text-accent-fort">quand</b> {part(criterion.when)},{" "}
              <b className="font-semibold text-accent-fort">alors</b> {part(criterion.then)}.
            </span>
          </li>
        ))}
      </ul>
      {story.openQuestions.length > 0 ? (
        <>
          <h2 className="mt-4 text-[12.5px] font-bold text-encre-3">À trancher avec l&apos;équipe</h2>
          <ul className="mt-1.5 grid gap-1.5">
            {story.openQuestions.map((question, index) => (
              <li key={index} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                <Icon name="help" className="mt-[3px] size-4 shrink-0 text-ambre" />
                <span>
                  <CitedText text={question} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <footer className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-trait pt-3 text-[12.5px] text-encre-3">
        <span>
          Complexité relative
          {story.references.length > 0 ? ` : comme ${story.references.map((reference) => `« ${reference.title} » (${reference.points})`).join(", ")}` : ""}. Un point de départ pour le
          planning poker
          <Help term="poker" side="top" />.
        </span>
        <Link href={`/themes/${story.themeId}`} className="font-medium">
          Écrite à partir de {plural(story.evidence.length, "retour")}
        </Link>
      </footer>
    </article>
  );
}
