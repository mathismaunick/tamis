import Link from "next/link";
import { Suspense } from "react";
import { FeedbackFilters } from "@/components/feedback-filters";
import { ImportPanel } from "@/components/import-panel";
import { NeedsByClients } from "@/components/needs-by-clients";
import { NextStep, StepHeader, StepPage, ViewSwitch } from "@/components/step-page";
import { Chip, EmptyState, Skeleton, StatusPill, cx } from "@/components/ui";
import { CHANNEL_LABELS, FEEDBACK_STATUS, KIND_LABELS, SEGMENT_LABELS, formatDate, frenchSpaces, plural } from "@/lib/labels";
import { inboxStats, listClients, listInbox, type InboxFilters, type InboxItem } from "@/lib/services/feedback";
import { homeOverview } from "@/lib/services/home";
import { PRODUCT } from "@/lib/product";

export const metadata = { title: "Analyser les retours" };

/**
 * Étape 1, analyser : ce que demandent les clients, besoin par besoin, un point par client. Les retours un par un,
 * avec leurs filtres, sont à un clic : rien n'est perdu, mais on commence par la synthèse.
 */
export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <StepPage>
      <Suspense
        fallback={
          <>
            <StepHeader title="Ce que demandent vos clients" />
            <Skeleton className="mt-6 h-96 w-full" />
          </>
        }
      >
        <Analyse searchParams={searchParams} />
      </Suspense>
    </StepPage>
  );
}

async function Analyse({ searchParams }: Pick<PageProps<"/inbox">, "searchParams">) {
  const params = await searchParams;
  const all = params.vue === "retours";
  const [stats, home] = await Promise.all([inboxStats(), homeOverview()]);
  const sub =
    stats.total === 0
      ? "Aucun retour pour l'instant. Importez un fichier CSV, ou collez un email client dans le champ de l'agent, à droite."
      : `Les ${plural(stats.total, "retour")} des clients d'${PRODUCT.name}, votre produit, regroupés en ${plural(home.needs.length, "besoin")}. Chaque point est un client : il compte une fois, même s'il écrit souvent.`;

  return (
    <>
      <StepHeader title="Ce que demandent vos clients" sub={sub} actions={<ImportPanel autoOpen={params.importer === "1"} label="Ajouter des retours" />} />
      {stats.total > 0 ? (
        <>
          <div className="mt-4 mb-2.5">
            <ViewSwitch
              label="Vue des retours"
              current={all ? "retours" : "besoins"}
              views={[
                { key: "besoins", label: "Par besoin", href: "/inbox" },
                { key: "retours", label: `Tous les retours (${stats.total})`, href: "/inbox?vue=retours" },
              ]}
            />
          </div>
          {all ? <AllFeedback params={params} /> : <NeedsByClients needs={home.needs} />}
          <NextStep href="/backlog" label="Prioriser le backlog" />
        </>
      ) : null}
    </>
  );
}

function pick(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

const KINDS: Array<{ value?: string; label: string }> = [
  { label: "Tout" },
  { value: "feature", label: "Demandes" },
  { value: "bug", label: "Bugs" },
  { value: "praise", label: "Remerciements" },
  { value: "question", label: "Questions" },
];

async function AllFeedback({ params }: { params: Awaited<PageProps<"/inbox">["searchParams"]> }) {
  const filters: InboxFilters = {
    channel: pick(params.canal),
    segment: pick(params.segment),
    client: pick(params.client),
    kind: pick(params.type),
    q: pick(params.q),
  };
  const [items, clients] = await Promise.all([listInbox(filters), listClients()]);
  const filtered = Object.values(filters).some(Boolean);
  const hrefFor = (kind?: string) => {
    const query = new URLSearchParams({ vue: "retours" });
    for (const [key, value] of Object.entries({ canal: filters.channel, segment: filters.segment, client: filters.client, q: filters.q, type: kind })) {
      if (value) query.set(key, value);
    }
    return `/inbox?${query.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <nav aria-label="Type de contenu" className="flex flex-wrap gap-1 border-b border-trait">
        {KINDS.map((kind) => {
          const active = (filters.kind ?? undefined) === kind.value;
          return (
            <Link
              key={kind.label}
              href={hrefFor(kind.value)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                active ? "border-accent text-encre" : "border-transparent text-encre-3 hover:text-encre",
              )}
            >
              {kind.label}
            </Link>
          );
        })}
      </nav>

      <FeedbackFilters
        values={{ q: filters.q ?? "", canal: filters.channel ?? "", segment: filters.segment ?? "", client: filters.client ?? "" }}
        kind={filters.kind}
        channels={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))}
        segments={Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label }))}
        clients={clients.map((client) => ({ value: String(client.id), label: client.name }))}
      />

      {items.length === 0 ? (
        <EmptyState title="Aucun retour ne correspond à ces filtres">Élargissez la recherche ou effacez les filtres.</EmptyState>
      ) : (
        <section aria-label="Retours">
          <p className="mb-2 text-sm text-encre-2">
            <b className="text-encre">{plural(items.length, "retour")}</b>
            {filtered ? " pour ces filtres" : ", du plus récent au plus ancien"}
          </p>
          <ul className="divide-y divide-trait rounded-xl border border-trait">
            {items.map((item) => (
              <FeedbackRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FeedbackRow({ item }: { item: InboxItem }) {
  const status = FEEDBACK_STATUS[item.status] ?? FEEDBACK_STATUS.new;
  const long = item.text.length > 220 || item.text.includes("\n\n");
  return (
    <li id={`F${item.id}`} className="grid scroll-mt-20 gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <Link href={`/feedback/${item.id}`} className="text-[15px] font-semibold text-encre hover:text-accent">
            {item.client.name}
          </Link>
          <span className="text-encre-2">{SEGMENT_LABELS[item.client.segment] ?? item.client.segment}</span>
          <span className="text-encre-3">{[item.author, CHANNEL_LABELS[item.channel] ?? item.channel, formatDate(item.receivedAt)].filter(Boolean).join(", ")}</span>
          {item.language === "en" ? <Chip>Anglais</Chip> : null}
        </p>
        {long ? (
          <details className="group mt-1.5">
            <summary className="cursor-pointer list-none text-encre-2">
              <span className="line-clamp-2 group-open:hidden">{frenchSpaces(item.text.replace(/\s+/g, " "))}</span>
              <span className="mt-1 inline-block text-xs font-medium text-accent group-open:hidden">Lire tout</span>
            </summary>
            <p className="whitespace-pre-line text-encre-2">{frenchSpaces(item.text)}</p>
          </details>
        ) : (
          <p className="mt-1.5 whitespace-pre-line text-encre-2">{frenchSpaces(item.text)}</p>
        )}
        {item.items.length > 0 ? (
          <ul className="mt-2.5 grid gap-1.5">
            {item.items.map((request) => (
              <li key={request.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-semibold text-encre-3">{KIND_LABELS[request.kind] ?? request.kind}</span>
                <span className="text-encre-2">{frenchSpaces(request.underlyingNeed)}</span>
                {request.themeId ? (
                  <Link href={`/themes/${request.themeId}`} className="font-medium">
                    {request.themeTitle}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {item.reviewReason ? <p className="mt-2 text-sm font-medium text-rouge-encre">{item.reviewReason}</p> : null}
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:flex-col sm:items-end">
        {item.status !== "processed" ? <StatusPill label={status.label} tone={status.tone} /> : null}
        {item.duplicateOf ? (
          <Link href={`/feedback/${item.duplicateOf}`} className="text-xs font-medium text-encre-3 hover:text-encre">
            Doublon d&apos;un retour
          </Link>
        ) : null}
      </div>
    </li>
  );
}
