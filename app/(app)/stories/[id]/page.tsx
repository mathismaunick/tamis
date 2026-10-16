import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CitedText } from "@/components/cited-text";
import { StoryEditor } from "@/components/story-forms";
import { Icon } from "@/components/icons";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { StepPage } from "@/components/step-page";
import { Chip, Skeleton, StatusPill, buttonClass } from "@/components/ui";
import { frenchSpaces, midSentence } from "@/lib/labels";
import { getStory } from "@/lib/services/stories";

export const metadata = { title: "User story" };

export default function StoryPage({ params }: PageProps<"/stories/[id]">) {
  return (
    <StepPage className="max-w-[960px]">
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <StoryContent params={params} />
      </Suspense>
    </StepPage>
  );
}

async function StoryContent({ params }: Pick<PageProps<"/stories/[id]">, "params">) {
  const { id } = await params;
  const story = Number.isInteger(Number(id)) ? await getStory(Number(id)) : null;
  if (!story) notFound();

  return (
    <article className="grid gap-7">
      <div>
        <Link href={`/stories?besoin=${story.themeId}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-encre-3 hover:text-encre">
          <Icon name="back" className="size-4" />
          Les stories du cycle
        </Link>
        <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-encre-2">
          <StatusPill label={story.status === "reviewed" ? "Relue" : "Brouillon"} tone={story.status === "reviewed" ? "accent" : "neutre"} />
          <span>Version {story.version}</span>
          {story.createdVia === "agent" ? <Chip>Rédigée par l&apos;agent</Chip> : null}
        </p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold tracking-[-0.025em]">{story.title}</h1>
        <p className="mt-4 max-w-3xl border-l-4 border-accent pl-4 text-lg leading-relaxed">
          <b className="font-semibold text-accent-fort">En tant que</b> {midSentence(story.persona)}, <b className="font-semibold text-accent-fort">je veux</b> {midSentence(story.want)},{" "}
          <b className="font-semibold text-accent-fort">afin de</b> {frenchSpaces(midSentence(story.soThat))}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Le formulaire est en bas de la page : le bouton y mène directement. */}
          <a href="#modifier" className={buttonClass("trait", "sm")}>
            <Icon name="pen" className="size-4" />
            Modifier
          </a>
          <a href={`/api/stories/${story.id}/markdown`} className={buttonClass("trait", "sm")}>
            Exporter en Markdown
          </a>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="criteres">
          <h2 id="criteres" className="text-base font-semibold">
            Critères d&apos;acceptation
          </h2>
          <ol className="mt-2 divide-y divide-trait rounded-xl border border-trait">
            {story.criteria.map((criterion, index) => (
              <li key={index} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm">
                <span aria-hidden className="text-[13px] font-bold text-encre-3">
                  {index + 1}
                </span>
                <span className="grid gap-0.5">
                  <span>
                    <b className="font-semibold text-accent-fort">Étant donné</b> {frenchSpaces(midSentence(criterion.given))}
                  </span>
                  <span>
                    <b className="font-semibold text-accent-fort">quand</b> {frenchSpaces(midSentence(criterion.when))}
                  </span>
                  <span>
                    <b className="font-semibold text-accent-fort">alors</b> {frenchSpaces(midSentence(criterion.then))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid content-start gap-5">
          <section aria-labelledby="complexite" className="rounded-xl border border-trait p-5">
            <h2 id="complexite" className="text-sm font-semibold text-encre-2">
              Complexité relative
            </h2>
            <p className="mt-2 text-[36px] leading-none font-extrabold tracking-[-0.03em]">
              {story.points ?? "?"} <span className="text-base font-semibold text-encre-2">points</span>
            </p>
            {story.rationale ? <p className="mt-2 text-sm text-encre-2">{frenchSpaces(story.rationale)}</p> : null}
            {story.references.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {story.references.map((reference) => (
                  <li key={reference.id}>
                    Référence : {reference.title} <span className="text-encre-3">({reference.points} pts)</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-encre-3">Un point de départ pour le planning poker : l&apos;équipe a le dernier mot.</p>
          </section>
          <section aria-labelledby="questions" className="rounded-xl border border-trait p-5">
            <h2 id="questions" className="text-sm font-semibold text-encre-2">
              Questions ouvertes
            </h2>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
              {story.openQuestions.map((question, index) => (
                <li key={index}>
                  <CitedText text={question} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-encre-2">
              Preuves :{" "}
              {story.evidence.map((feedbackId) => (
                <Link key={feedbackId} href={`/feedback/${feedbackId}`} className="mr-1.5 inline-block rounded bg-papier-3 px-1.5 text-xs font-medium text-encre-2 hover:bg-trait-2">
                  F{feedbackId}
                </Link>
              ))}
            </p>
          </section>
        </div>
      </div>

      <section aria-labelledby="modifier">
        <h2 id="modifier" className="scroll-mt-28 text-base font-semibold lg:scroll-mt-6">
          Modifier la story
        </h2>
        <div className="mt-2 rounded-xl border border-trait p-5">
          <StoryEditor story={story} />
        </div>
      </section>
      <ScrollToHash />
    </article>
  );
}
