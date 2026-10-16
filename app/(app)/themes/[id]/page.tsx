import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AskButton } from "@/components/agent/ask-button";
import { ChangeList } from "@/components/change-list";
import { CitedText } from "@/components/cited-text";
import { Icon } from "@/components/icons";
import { StepPage } from "@/components/step-page";
import { Help } from "@/components/help";
import { DecidePanel, FactorStrip, PendingProposal, type EquationFactor } from "@/components/theme-forms";
import { SEGMENT_DOT, Skeleton, StatusPill, buttonClass, cx } from "@/components/ui";
import { countFacetClients } from "@/lib/facets";
import { CHANNEL_LABELS, IMPACT_LABELS, MOSCOW_COLORS, SEGMENT_LABELS, THEME_STATUS, formatDate, formatEuros, frenchSpaces, impactWord, ordinal, plural } from "@/lib/labels";
import { rankReason } from "@/lib/rank-reason";
import { FACTOR_OPTIONS, getThemeDetail, listThemeOptions, listThemes, type ThemeDetail } from "@/lib/services/backlog";
import { listPendingProposals } from "@/lib/services/proposals";
import { listStories } from "@/lib/services/stories";
import { PRODUCT } from "@/lib/product";

export const metadata = { title: "Besoin" };

export default function ThemePage({ params }: PageProps<"/themes/[id]">) {
  return (
    <StepPage>
      <Suspense
        fallback={
          <div className="grid gap-5">
            <Skeleton className="h-28" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        }
      >
        <ThemeContent params={params} />
      </Suspense>
    </StepPage>
  );
}

/**
 * La catégorie MoSCoW dite comme en réunion, et la question à laquelle répond la page. Sa couleur porte la puce de
 * catégorie et le rang du calcul : texte blanc sur l'indigo, encre sur le bleu et le vert (contraste AA).
 */
const LANES: Record<string, { word: string; why: string; className: string }> = {
  must: { word: "Ce cycle", why: "Pourquoi il est dans ce cycle", className: "bg-must text-white" },
  should: { word: "Ensuite", why: "Pourquoi il attend le cycle suivant", className: "bg-should text-encre" },
  could: { word: "Plus tard", why: "Pourquoi il passe plus tard", className: "bg-could text-encre" },
  wont: { word: "Pas maintenant", why: "Pourquoi pas maintenant", className: "bg-wont text-encre" },
};

const IMPACT_HINTS: Record<number, string> = {
  0.25: "Minimal : cosmétique",
  0.5: "Faible : confort ponctuel",
  1: "Moyen : du temps gagné chaque semaine",
  2: "Fort : supprime un contournement coûteux",
  3: "Massif : rend possible un usage impossible",
};

const ORIGIN = (source: string | undefined): EquationFactor["origin"] => (source === "model" || source === "po" || source === "code" ? source : "none");

function number(value: number | null) {
  return value === null ? "–" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function factorsOf(theme: ThemeDetail): EquationFactor[] {
  const word = impactWord(theme.impact);
  return [
    {
      key: "impact",
      value: theme.impact === null ? "–" : word.charAt(0).toUpperCase() + word.slice(1),
      caption: "impact",
      name: "l'impact",
      keep: word,
      current: theme.impact,
      options: FACTOR_OPTIONS.impact.map((value) => ({ value, label: IMPACT_LABELS[String(value)] ?? number(value), hint: IMPACT_HINTS[value] })),
      origin: ORIGIN(theme.factorSources.impact),
      agreement: theme.agreement.impact,
      justification: theme.factorJustifications.impact,
    },
    {
      key: "confidence",
      value: theme.confidence === null ? "–" : `${Math.round(theme.confidence * 100)} %`,
      caption: "confiance",
      name: "la confiance",
      keep: theme.confidence === null ? "–" : `${Math.round(theme.confidence * 100)} %`,
      current: theme.confidence,
      options: FACTOR_OPTIONS.confidence.map((value) => ({ value, label: `${Math.round(value * 100)} %` })),
      origin: ORIGIN(theme.factorSources.confidence),
      agreement: theme.agreement.confidence,
      justification: theme.factorJustifications.confidence,
    },
    {
      key: "effort",
      value: theme.effort === null ? "–" : `${theme.effort} pts`,
      caption: "effort",
      name: "l'effort",
      keep: theme.effort === null ? "–" : `${theme.effort} points`,
      current: theme.effort,
      options: FACTOR_OPTIONS.effort.map((value) => ({ value, label: String(value) })),
      origin: ORIGIN(theme.factorSources.effort),
      agreement: theme.agreement.effort,
      justification: theme.factorJustifications.effort,
    },
  ];
}

/** Les demandes semaine par semaine, du lundi au dimanche, sur les six dernières semaines où le besoin a été exprimé. */
function weeklyCounts(dates: string[]) {
  const monday = (iso: string) => {
    const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  if (dates.length === 0) return [];
  const first = monday([...dates].sort()[0]);
  const last = monday([...dates].sort().at(-1)!);
  const weeks: Array<{ start: string; count: number }> = [];
  for (let cursor = first; cursor <= last; ) {
    weeks.push({ start: cursor, count: dates.filter((date) => monday(date) === cursor).length });
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    cursor = next.toISOString().slice(0, 10);
  }
  return weeks.slice(-6);
}

async function ThemeContent({ params }: Pick<PageProps<"/themes/[id]">, "params">) {
  const { id } = await params;
  const themeId = Number(id);
  const [theme, options, stories, proposals, themes] = await Promise.all([
    Number.isInteger(themeId) ? getThemeDetail(themeId) : null,
    listThemeOptions(),
    Number.isInteger(themeId) ? listStories(themeId) : [],
    Number.isInteger(themeId) ? listPendingProposals(themeId) : [],
    listThemes(),
  ]);
  if (!theme) notFound();
  const status = THEME_STATUS[theme.status] ?? THEME_STATUS.new;
  const ranked = themes.filter((other) => other.rank !== null);
  const lane = theme.rank ? LANES[theme.moscow ?? "wont"] : null;
  const reason = theme.rank ? rankReason(theme, ranked) : null;
  const segments = ["enterprise", "pro", "starter"]
    .map((segment) => ({ key: segment, label: SEGMENT_LABELS[segment], count: theme.clients.filter((client) => client.segment === segment).length }))
    .filter((segment) => segment.count > 0);
  const facets = countFacetClients(theme.facets, theme.evidence);
  const color = MOSCOW_COLORS[theme.moscow ?? "wont"].fill;
  const weeks = weeklyCounts([...new Map(theme.evidence.map((item) => [item.feedbackId, item.date])).values()]);
  const maxWeek = Math.max(1, ...weeks.map((week) => week.count));
  // Ce qu'ils disent : une citation par facette du besoin, la première qui la porte ; sans facettes, les trois premières.
  // Deux facettes peuvent s'appuyer sur le même retour : chacune prend la première citation pas encore montrée.
  const shown = new Set<number>();
  const quotes =
    facets.length > 0
      ? facets
          .flatMap((facet) => {
            const item = theme.evidence.find((evidence) => facet.feedbackIds.includes(evidence.feedbackId) && !shown.has(evidence.requestId));
            if (!item) return [];
            shown.add(item.requestId);
            return [{ label: facet.label, clients: facet.clients, item }];
          })
          .slice(0, 3)
      : theme.evidence.slice(0, 3).map((item) => ({ label: null, clients: 0, item }));

  return (
    <div className="grid gap-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/backlog" className="inline-flex items-center gap-1 text-[13px] font-medium text-encre-3 hover:text-encre">
            <Icon name="back" className="size-4" />
            Backlog
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <DecidePanel themeId={theme.id} status={theme.status} moscow={theme.moscow} moscowSource={theme.moscowSource} options={options} merged={theme.mergedThemes} />
            {stories.length > 0 ? (
              <Link href={`/stories/${stories[0].id}`} className={buttonClass("principal")}>
                <Icon name="book" className="size-4" />
                Voir la story
              </Link>
            ) : (
              <AskButton question={`Rédige la story de « ${theme.title} ».`} className={buttonClass("principal")}>
                <Icon name="pen" className="size-4" />
                Rédiger la story
              </AskButton>
            )}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-encre-2">
          {lane ? <span className={cx("rounded-md px-2 py-0.5 text-[12.5px] font-bold", lane.className)}>{lane.word}</span> : null}
          <span>{theme.rank ? `${ordinal(theme.rank)} sur ${ranked.length}` : "Hors classement"}</span>
          {theme.moscowSource === "po" ? <span className="text-encre-3">catégorie décidée par vous</span> : null}
          {theme.status !== "new" ? <StatusPill label={status.label} tone={status.tone} /> : null}
          {theme.churnRisk ? <StatusPill label="Risque de départ" tone="alerte" /> : null}
        </p>
        <h1 className="mt-1.5 text-[28px] leading-tight font-bold tracking-[-0.025em] text-balance">{theme.title}</h1>
        <p className="mt-1.5 max-w-[70ch] text-[14.5px] leading-relaxed text-encre-2">{frenchSpaces(theme.needStatement)}</p>
        {theme.statusReason ? (
          <p className="mt-2 text-sm text-encre-2">
            <b className="text-encre">Décision : </b>
            <CitedText text={theme.statusReason} />
          </p>
        ) : null}
      </header>

      {proposals.length > 0 || theme.alreadyExists ? (
        <div className="grid gap-3">
          {proposals.map((proposal) => (
            <PendingProposal key={proposal.id} id={proposal.id} label={proposal.label} reason={proposal.reason} />
          ))}
          {theme.alreadyExists ? (
            <p className="flex items-baseline gap-2.5 rounded-xl border border-trait px-4 py-3 text-sm text-encre-2">
              <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full bg-neutre" />
              <span>
                <b className="text-encre">Peut-être déjà dans {PRODUCT.name}. </b>
                <CitedText text={theme.alreadyExists} />
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="pourquoi">
        <h2 id="pourquoi" className="text-[13px] font-bold text-encre-3">
          {lane ? lane.why : "Hors classement"}
        </h2>
        {reason ? <p className="mt-1.5 max-w-[70ch] text-[16px] leading-relaxed text-encre">{reason}</p> : null}
        <div className="mt-1">
          <FactorStrip
            themeId={theme.id}
            reach={theme.reach}
            factors={factorsOf(theme)}
            rank={{ value: theme.rank ? ordinal(theme.rank) : "–", caption: theme.rank ? `sur ${ranked.length}` : "hors classement", className: lane?.className ?? "bg-wont text-encre" }}
          />
        </div>
      </section>

      <section aria-labelledby="disent">
        <h2 id="disent" className="text-[13px] font-bold text-encre-3">
          Ce qu&apos;ils disent
        </h2>
        <div className="mt-2.5 grid gap-5 sm:grid-cols-3">
          {quotes.map(({ label, clients, item }) => (
            <blockquote key={item.requestId} className="border-t-2 border-papier-3 pt-2.5">
              {label ? (
                <p className="mb-1.5 text-[12.5px] leading-snug font-bold text-accent">
                  {frenchSpaces(label)} <span className="font-medium whitespace-nowrap text-encre-3">{plural(clients, "client")}</span>
                </p>
              ) : null}
              <p className="text-[14px] leading-relaxed">{frenchSpaces(`« ${item.quote} »`)}</p>
              <cite className="mt-1 block text-[12px] text-encre-3 not-italic">
                {item.client},{" "}
                <Link href={`/feedback/${item.feedbackId}`} className="text-encre-3 hover:text-accent">
                  {(CHANNEL_LABELS[item.channel] ?? item.channel).toLowerCase()}, {formatDate(item.date)}
                </Link>
              </cite>
            </blockquote>
          ))}
        </div>
        <details className="group mt-4">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-accent hover:text-accent-fort">
            Voir les {plural(theme.evidence.length, "citation")} et la synthèse
          </summary>
          {theme.synthesis ? (
            <p className="mt-3 max-w-[75ch] text-sm leading-[1.7] text-encre-2">
              <CitedText text={theme.synthesis} />
            </p>
          ) : null}
          <ul className="mt-2">
            {theme.evidence.map((item) => (
              <Quote key={item.requestId} item={item} />
            ))}
          </ul>
        </details>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="qui" className="rounded-xl border border-trait p-5">
          <h2 id="qui" className="text-base font-semibold">
            Qui le demande <span className="text-sm font-normal text-encre-3">{formatEuros(theme.mrr)} de revenu mensuel</span>
          </h2>
          <span aria-hidden className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-[4px]">
            {segments.map((segment) => (
              <span key={segment.key} className={SEGMENT_DOT[segment.key]} style={{ flex: segment.count }} />
            ))}
          </span>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 text-[13px] text-encre-2">
            <span>Formule{" "}:</span>
            {segments.map((segment, index) => (
              <span key={segment.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cx("size-2.5 rounded-[3px]", SEGMENT_DOT[segment.key])} />
                {segment.label} {segment.count}
                {/* Le « ? » suit la dernière formule : il ne part jamais seul à la ligne. */}
                {index === segments.length - 1 ? <Help term="formule" className="ml-0" /> : null}
              </span>
            ))}
          </p>
          <ul className="mt-3 grid gap-1 text-[13px]">
            {theme.clients.map((client) => (
              <li key={client.id} className="flex justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  {client.churnRisk ? <span aria-label="Menace de partir" className="size-2 rounded-full bg-rouge" /> : null}
                  <b className="font-medium">{client.name}</b>
                  <span className="text-encre-3">{SEGMENT_LABELS[client.segment]}</span>
                </span>
                <span className="text-encre-3">{plural(client.messages, "message")}</span>
              </li>
            ))}
          </ul>
          {theme.topClientShare >= 0.5 && theme.messages >= 4 && theme.clients.length > 1 ? (
            <p className="mt-3 flex items-baseline gap-2 text-[13px] text-encre-2">
              <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full bg-neutre" />
              {Math.round(theme.topClientShare * 100)} % des messages viennent de {theme.clients[0].name} : un client bruyant ne fait pas une tendance.
            </p>
          ) : null}
        </section>

        {weeks.length > 1 ? (
          <section aria-labelledby="semaines" className="rounded-xl border border-trait p-5">
            <h2 id="semaines" className="text-base font-semibold">
              Dans le temps
            </h2>
            <div className="mt-3 flex h-20 items-end gap-2" aria-hidden>
              {weeks.map((week) => (
                <div key={week.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-semibold text-encre-2">{week.count || ""}</span>
                  <span className="w-full rounded-t-[3px]" style={{ height: `${week.count === 0 ? 2 : Math.round((week.count / maxWeek) * 52)}px`, background: week.count === 0 ? "var(--trait)" : color }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-2" aria-hidden>
              {weeks.map((week) => (
                <span key={week.start} className="flex-1 text-center text-xs text-encre-3">
                  {formatDate(week.start)}
                </span>
              ))}
            </div>
            <p className="sr-only">{weeks.map((week) => `Semaine du ${formatDate(week.start)} : ${plural(week.count, "demande")}`).join(". ")}</p>
          </section>
        ) : null}
      </div>

      <section aria-labelledby="journal-besoin" className="grid gap-2">
        <h2 id="journal-besoin" className="text-base font-semibold">
          Journal du besoin
        </h2>
        {theme.changes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-trait-2 px-4 py-3 text-sm text-encre-2">Aucune décision pour l&apos;instant. Chaque ajustement s&apos;inscrira ici, avec sa raison.</p>
        ) : (
          <ChangeList changes={theme.changes} />
        )}
      </section>
    </div>
  );
}

function Quote({ item }: { item: ThemeDetail["evidence"][number] }) {
  return (
    <li className="border-b border-trait py-3 last:border-b-0">
      <p className="text-[14.5px] leading-relaxed">{frenchSpaces(`« ${item.quote} »`)}</p>
      <p className="mt-1 text-[13px] text-encre-3">
        <b className="font-medium text-encre">{item.client}</b>, {SEGMENT_LABELS[item.segment] ?? item.segment},{" "}
        <Link href={`/feedback/${item.feedbackId}`} className="text-encre-3 hover:text-accent">
          {(CHANNEL_LABELS[item.channel] ?? item.channel).toLowerCase()}, {formatDate(item.date)}
        </Link>
      </p>
    </li>
  );
}
