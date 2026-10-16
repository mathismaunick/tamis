import { Suspense } from "react";
import { ChangeList } from "@/components/change-list";
import { StepPage } from "@/components/step-page";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { formatUsd, plural } from "@/lib/labels";
import { listChanges } from "@/lib/services/backlog";
import { lastImport } from "@/lib/services/feedback";

export const metadata = { title: "Journal" };

export default function ChangesPage() {
  return (
    <StepPage className="max-w-[880px]">
      <Suspense
        fallback={
          <>
            <PageHeader title="Journal" />
            <Skeleton className="h-64 w-full" />
          </>
        }
      >
        <Changes />
      </Suspense>
    </StepPage>
  );
}

/** Les décisions prises par le PO, dites à la deuxième personne comme dans le reste de Tamis. */
function byYou(count: number): string {
  if (count === 0) return "aucune prise par vous";
  return `${count} ${count > 1 ? "prises" : "prise"} par vous`;
}

async function Changes() {
  const [changes, last] = await Promise.all([listChanges(), lastImport()]);
  const byPo = changes.filter((change) => change.actor === "po").length;
  return (
    <>
      <PageHeader
        title="Journal"
        answer={
          changes.length === 0
            ? "Chaque décision sur les besoins apparaîtra ici : qui l'a prise, quand, et pourquoi."
            : `${plural(changes.length, "décision tracée", "décisions tracées")}, dont ${byYou(byPo)}. De quoi justifier chaque arbitrage plus tard.`
        }
      />
      {changes.length === 0 ? (
        <EmptyState title="Aucune décision pour l'instant">
          Ajustez un facteur, un statut ou une catégorie depuis la page d&apos;un besoin, ou appliquez une proposition de l&apos;agent : la décision et sa raison s&apos;inscrivent ici.
        </EmptyState>
      ) : (
        <ChangeList changes={changes} showTheme />
      )}
      {/* Le coût et la durée du traitement : utiles pour suivre l'outil, pas pour prioriser. Leur place est ici. */}
      {last ? (
        <p className="mt-4 text-[13px] text-encre-3">
          Dernier import : {last.filename}, {plural(last.feedback_count, "retour")}
          {last.seconds ? `, traité en ${Math.max(1, Math.round(last.seconds))} s` : ""}, coût des modèles {formatUsd(last.cost)}.
        </p>
      ) : null}
    </>
  );
}
