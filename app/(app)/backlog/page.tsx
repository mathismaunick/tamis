import Link from "next/link";
import { Suspense } from "react";
import { BacklogTable, CycleLanes, PriorityMatrix, UnrankedList } from "@/components/backlog";
import { Help } from "@/components/help";
import { Icon } from "@/components/icons";
import { NextStep, StepHeader, StepPage, ViewSwitch } from "@/components/step-page";
import { EmptyState, Skeleton, buttonClass } from "@/components/ui";
import { plural } from "@/lib/labels";
import { CYCLE_CAPACITY } from "@/lib/scoring/rice";
import { listBugs, listThemes } from "@/lib/services/backlog";

export const metadata = { title: "Prioriser le backlog" };

/**
 * Étape 2, prioriser : ce qu'on fait ce cycle. Les cycles d'abord (MoSCoW rempli selon la capacité de l'équipe), la
 * liste complète avec les facteurs RICE et la matrice RICE à un clic.
 */
export default function BacklogPage({ searchParams }: PageProps<"/backlog">) {
  return (
    <StepPage>
      <Suspense
        fallback={
          <>
            <StepHeader title="Ce qu'on fait ce cycle" />
            <Skeleton className="mt-6 h-80 w-full" />
          </>
        }
      >
        <Prioritize searchParams={searchParams} />
      </Suspense>
    </StepPage>
  );
}

async function Prioritize({ searchParams }: Pick<PageProps<"/backlog">, "searchParams">) {
  const params = await searchParams;
  const view = params.vue === "liste" ? "liste" : params.vue === "matrice" ? "matrice" : "cycles";
  const [themes, bugs] = await Promise.all([listThemes(), listBugs()]);

  if (themes.length === 0) {
    return (
      <>
        <StepHeader title="Ce qu'on fait ce cycle" sub="Les besoins de vos clients, classés et répartis dans la capacité de l'équipe." />
        <div className="mt-6">
          <EmptyState
            title="Aucun besoin pour l'instant"
            action={
              <Link href="/inbox" className={buttonClass("principal")}>
                Analyser des retours
              </Link>
            }
          >
            Les besoins apparaissent dès que des retours clients ont été importés et analysés.
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <StepHeader
        title="Ce qu'on fait ce cycle"
        sub={
          <>
            Les besoins sont classés par score RICE
            <Help term="rice" />, puis répartis en cycles de {CYCLE_CAPACITY} points d&apos;effort
            <Help term="cycle" />, la capacité de l&apos;équipe.
          </>
        }
        actions={
          <a href="/api/export/backlog" className={buttonClass("trait", "sm")}>
            <Icon name="download" className="size-4" />
            Exporter
          </a>
        }
      />
      <div className="mt-5 mb-4">
        <ViewSwitch
          label="Vue du backlog"
          current={view}
          views={[
            { key: "cycles", label: "Cycles", href: "/backlog" },
            { key: "liste", label: "Liste complète", href: "/backlog?vue=liste" },
            { key: "matrice", label: "Matrice RICE", href: "/backlog?vue=matrice" },
          ]}
        />
      </div>
      {view === "cycles" ? <CycleLanes themes={themes} /> : null}
      {view === "liste" ? (
        <div className="grid gap-5">
          <BacklogTable themes={themes} />
          <UnrankedList themes={themes} />
          {bugs.length > 0 ? (
            <p className="text-sm text-encre-2">
              {plural(bugs.length, "bug signalé", "bugs signalés")} dans les retours, hors besoins :{" "}
              <Link href="/inbox?vue=retours&type=bug" className="font-medium">
                les voir dans les retours
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}
      {view === "matrice" ? <PriorityMatrix themes={themes} /> : null}
      <NextStep href="/stories" label="Rédiger les stories du cycle" />
    </>
  );
}
