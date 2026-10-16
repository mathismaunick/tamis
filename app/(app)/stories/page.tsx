import Link from "next/link";
import { Suspense } from "react";
import { AskButton } from "@/components/agent/ask-button";
import { Help } from "@/components/help";
import { Icon } from "@/components/icons";
import { StepHeader, StepPage } from "@/components/step-page";
import { StoryDocument } from "@/components/story-document";
import { EmptyState, Skeleton, StatusPill, buttonClass, cx } from "@/components/ui";
import { frenchSpaces, midSentence, plural } from "@/lib/labels";
import { listThemes } from "@/lib/services/backlog";
import { listStories, type Story } from "@/lib/services/stories";

export const metadata = { title: "Rédiger les stories" };

/**
 * Étape 3, rédiger : une story par besoin du cycle, lue comme un document. Un besoin sans story se rédige d'un clic,
 * par l'agent, à partir des citations des clients. Les stories des autres besoins sont en dessous.
 */
export default function StoriesPage({ searchParams }: PageProps<"/stories">) {
  return (
    <StepPage>
      <Suspense
        fallback={
          <>
            <StepHeader title="Les stories du cycle" />
            <Skeleton className="mt-6 h-80" />
          </>
        }
      >
        <Write searchParams={searchParams} />
      </Suspense>
    </StepPage>
  );
}

async function Write({ searchParams }: Pick<PageProps<"/stories">, "searchParams">) {
  const params = await searchParams;
  const [themes, stories] = await Promise.all([listThemes(), listStories()]);
  const cycle = themes.filter((theme) => theme.moscow === "must" && theme.rank !== null).sort((a, b) => a.rank! - b.rank!);
  // Les stories arrivent de la plus récente à la plus ancienne : la première d'un besoin est sa version courante.
  const latest = new Map<number, Story>();
  for (const story of stories) if (!latest.has(story.themeId)) latest.set(story.themeId, story);
  const selected = cycle.find((theme) => String(theme.id) === params.besoin) ?? cycle[0] ?? null;
  const story = selected ? latest.get(selected.id) : undefined;
  const others = stories.filter((item) => latest.get(item.themeId) === item && !cycle.some((theme) => theme.id === item.themeId));

  return (
    <>
      <StepHeader
        title="Les stories du cycle"
        sub={
          cycle.length > 0 ? (
            <>
              Une story
              <Help term="story" /> par besoin du cycle, écrite à partir des phrases des clients.
            </>
          ) : (
            "Aucun besoin n'est encore dans le cycle : la deuxième étape les y place."
          )
        }
      />
      {cycle.length > 0 ? (
        <nav aria-label="Les besoins du cycle" className="mt-5 mb-3 inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-[9px] bg-papier-3 p-[3px]">
          {cycle.map((theme) => {
            const active = theme.id === selected?.id;
            return (
              <Link
                key={theme.id}
                href={`/stories?besoin=${theme.id}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors",
                  active ? "bg-papier font-semibold text-encre shadow-[0_1px_2px_rgba(21,22,43,0.1)]" : "font-medium text-encre-2 hover:text-encre",
                )}
              >
                {latest.has(theme.id) ? <Icon name="check" className="size-4 text-could" /> : null}
                {theme.title}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {selected && story ? <StoryDocument story={story} /> : null}
      {selected && !story ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-trait-2 px-6 py-8">
          <p className="text-[17px] font-semibold">Pas encore de story pour « {selected.title} ».</p>
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-encre-2">
            L&apos;agent la rédige à partir des {plural(selected.reach, "client")} qui demandent ce besoin : le persona, les critères d&apos;acceptation, la complexité comparée aux stories de référence. Une
            vingtaine de secondes ; elle s&apos;affichera ici.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AskButton question={`Rédige la story de « ${selected.title} ».`} className={buttonClass("principal")}>
              <Icon name="pen" className="size-4" />
              Rédiger avec l&apos;agent
            </AskButton>
            <Link href={`/themes/${selected.id}`} className={buttonClass("trait")}>
              Voir les preuves
            </Link>
          </div>
        </div>
      ) : null}
      {!selected && stories.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Aucune story pour l'instant"
            action={
              <Link href="/backlog" className={buttonClass("principal")}>
                Prioriser le backlog
              </Link>
            }
          >
            Les stories se rédigent pour les besoins du cycle, à partir des citations des clients.
          </EmptyState>
        </div>
      ) : null}

      {others.length > 0 ? (
        <section aria-labelledby="autres" className="mt-8">
          <h2 id="autres" className="text-[15px] font-bold">
            Les autres stories <span className="text-[13px] font-medium text-encre-3">{others.length}</span>
          </h2>
          <ul className="mt-2 divide-y divide-trait rounded-xl border border-trait">
            {others.map((item) => (
              <li key={item.id}>
                <Link href={`/stories/${item.id}`} className="grid gap-1 px-4 py-3 text-encre transition-colors hover:bg-papier-2 hover:text-encre sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-encre-3">{item.themeTitle}</span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="line-clamp-1 block text-[13px] text-encre-2">{frenchSpaces(`En tant que ${midSentence(item.persona)}, je veux ${midSentence(item.want)}.`)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold">{item.points ? plural(item.points, "point") : "?"}</span>
                    <StatusPill label={item.status === "reviewed" ? "Relue" : "Brouillon"} tone={item.status === "reviewed" ? "accent" : "neutre"} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
