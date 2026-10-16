import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { StepPage } from "@/components/step-page";
import { Skeleton, StatusPill } from "@/components/ui";
import { highlightSegments } from "@/lib/pipeline/grounding";
import { CHANNEL_LABELS, FEEDBACK_STATUS, KIND_LABELS, SEGMENT_LABELS, formatDate, formatEuros, frenchSpaces } from "@/lib/labels";
import { getFeedback } from "@/lib/services/feedback";

export const metadata = { title: "Retour client" };

export default function FeedbackPage({ params }: PageProps<"/feedback/[id]">) {
  return (
    <StepPage className="max-w-[880px]">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FeedbackContent params={params} />
      </Suspense>
    </StepPage>
  );
}

async function FeedbackContent({ params }: Pick<PageProps<"/feedback/[id]">, "params">) {
  const { id } = await params;
  const feedback = Number.isInteger(Number(id)) ? await getFeedback(Number(id)) : null;
  if (!feedback) notFound();

  const status = FEEDBACK_STATUS[feedback.status] ?? FEEDBACK_STATUS.new;
  const segments = highlightSegments(feedback.text, feedback.items.map((item) => item.quote));

  return (
    <article className="grid gap-6">
      <div>
        <Link href={`/inbox?vue=retours#F${feedback.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-encre-3 hover:text-encre">
          <Icon name="back" className="size-4" />
          Tous les retours
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.025em]">{feedback.client.name}</h1>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-encre-2">
          <span>
            {SEGMENT_LABELS[feedback.client.segment] ?? feedback.client.segment}, {formatEuros(feedback.client.mrr)} par mois
          </span>
          <span>
            {CHANNEL_LABELS[feedback.channel] ?? feedback.channel}, {formatDate(feedback.receivedAt)}
            {feedback.author ? `, ${feedback.author}` : ""}
          </span>
          <span className="text-encre-3">
            Retour F{feedback.id}
            {feedback.externalId ? `, réf. ${feedback.externalId}` : ""}
          </span>
          {feedback.status !== "processed" ? <StatusPill label={status.label} tone={status.tone} /> : null}
        </p>
      </div>

      <section className="rounded-xl border border-trait p-5 sm:p-6">
        <p className="text-base leading-relaxed whitespace-pre-line">
          {segments.map((segment, index) =>
            segment.quoteIndex === null ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <mark key={index} className="rounded-sm bg-accent-voile px-0.5 text-encre underline decoration-accent/40 underline-offset-4">
                {segment.text}
              </mark>
            ),
          )}
        </p>
        {feedback.duplicateOf ? (
          <p className="mt-4 text-sm text-encre-2">
            Doublon de{" "}
            <Link href={`/feedback/${feedback.duplicateOf}`} className="font-semibold underline">
              F{feedback.duplicateOf}
            </Link>{" "}
            : même client, même texte. Il n&apos;est compté qu&apos;une fois.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-base font-semibold">Ce que Tamis en a tiré</h2>
        {feedback.items.length === 0 ? (
          <p className="mt-2 text-encre-2">{feedback.status === "new" ? "Ce retour n'a pas encore été analysé." : "Aucune demande dans ce retour."}</p>
        ) : (
          <ul className="mt-2 divide-y divide-trait rounded-xl border border-trait">
            {feedback.items.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold">{KIND_LABELS[item.kind] ?? item.kind}</span>
                  {item.urgency === "churn_risk" ? <StatusPill label="Risque de départ" tone="alerte" /> : null}
                  {item.themeId ? (
                    <Link href={`/themes/${item.themeId}`} className="font-medium">
                      {item.themeTitle}
                    </Link>
                  ) : null}
                </p>
                <dl className="mt-2.5 grid gap-1.5 text-sm sm:grid-cols-[150px_1fr]">
                  {item.requestedSolution ? (
                    <>
                      <dt className="text-encre-3">Solution demandée</dt>
                      <dd>{frenchSpaces(item.requestedSolution)}</dd>
                    </>
                  ) : null}
                  <dt className="text-encre-3">Besoin</dt>
                  <dd>{frenchSpaces(item.underlyingNeed)}</dd>
                  <dt className="text-encre-3">Citation</dt>
                  <dd className="text-encre-2">{frenchSpaces(`« ${item.quote} »`)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
