import Link from "next/link";
import { Help } from "@/components/help";
import { MoscowTag, StatusPill, cx } from "@/components/ui";
import { laneLayout } from "@/lib/cycles";
import { THEME_STATUS, frenchSpaces, impactWord, plural } from "@/lib/labels";
import { CYCLE_CAPACITY } from "@/lib/scoring/rice";
import { doubtfulFactor, type ThemeRow } from "@/lib/services/backlog";

/** Les quatre catégories MoSCoW, dites comme un PO les dit en réunion : ce cycle, ensuite, plus tard, pas maintenant. */
const LANES = [
  { key: "must", word: "Ce cycle", label: "Must", text: "text-[14px]", points: true },
  { key: "should", word: "Ensuite", label: "Should", text: "text-[13px]", points: true },
  { key: "could", word: "Plus tard", label: "Could", text: "text-[12px]", points: false },
  { key: "wont", word: "Pas maintenant", label: "Won't", text: "text-[12px]", points: false },
] as const;

type Lane = (typeof LANES)[number];

/**
 * La couleur de chaque catégorie et l'encre du texte posé dessus : blanc sur l'indigo, encre ailleurs. Sur le bleu
 * et le vert, le blanc n'atteint que 2,97 et 2,74 de contraste, sous le minimum de 4,5 ; l'encre y fait 5,98 et 6,48.
 */
const LANE_COLOR: Record<string, string> = { must: "bg-must text-white", should: "bg-should text-encre", could: "bg-could text-encre", wont: "bg-wont text-encre" };
/** La hauteur de départ de chaque couloir : la gradation se voit, et un nom long agrandit son couloir au lieu d'être coupé. */
const LANE_HEIGHT: Record<string, string> = { must: "min-h-24", should: "min-h-[76px]", could: "min-h-[62px]", wont: "min-h-12" };
/** Sur un écran étroit, une ligne par besoin : la même gradation, en hauteur et en taille de texte. */
const ROW_HEIGHT: Record<string, string> = { must: "min-h-12", should: "min-h-11", could: "min-h-10", wont: "min-h-10" };

function ChurnDot({ theme }: { theme: ThemeRow }) {
  return theme.churnRisk ? <span role="img" aria-label="Risque de départ" className="mr-1.5 inline-block size-2 rounded-full bg-rouge align-middle" /> : null;
}

function pointsOf(theme: ThemeRow) {
  return `${theme.effort ?? "?"} pts${theme.moscowSource === "po" ? ", décidé par vous" : ""}`;
}

/**
 * Un couloir en blocs : chaque besoin aussi large que son effort, la place libre en pointillés. Un bloc ne descend
 * jamais sous 88 px ni sous le mot le plus long de son nom (`min-w-min`, car une largeur fixée l'emporterait sur la
 * largeur minimale automatique d'un élément flexible) : le nom tient en entier, sans couper un mot, et le couloir
 * grandit s'il lui faut une ligne de plus. Quand un bloc a besoin de cette place, ses voisins se resserrent un peu
 * plutôt que de faire défiler le couloir.
 */
function LaneBlocks({ lane, items }: { lane: Lane; items: ThemeRow[] }) {
  const layout = laneLayout(items.map((theme) => theme.effort ?? 1));
  const free = lane.key === "wont" ? 0 : layout.free;
  return (
    <div className={cx("hidden min-w-0 overflow-x-auto @min-[640px]:flex", lane.key === "wont" && "flex-wrap")}>
      {items.map((theme, index) => (
        <Link
          key={theme.id}
          href={`/themes/${theme.id}`}
          title={`${theme.rank}. ${theme.title} : ${plural(theme.reach, "client")}, ${theme.effort ?? "?"} points`}
          className="flex min-w-min shrink p-0.5"
          style={{ width: `max(88px, ${layout.widths[index]}%)` }}
        >
          <span
            className={cx(
              "flex w-full flex-col justify-between gap-1 rounded-[9px] py-2 transition-[filter] hover:brightness-110",
              lane.points ? "px-2.5" : "px-2",
              LANE_COLOR[lane.key],
              LANE_HEIGHT[lane.key],
            )}
          >
            <span className={cx("leading-tight font-semibold break-words", lane.text)}>
              <ChurnDot theme={theme} />
              {theme.title}
            </span>
            {lane.points ? (
              // Pas moins de 85 % : l'encre à 80 % tombe à 4,39 de contraste sur le bleu.
              <span className="text-xs opacity-85">{pointsOf(theme)}</span>
            ) : null}
          </span>
        </Link>
      ))}
      {free > 0 ? (
        <span aria-hidden className="flex min-w-0 shrink p-0.5" style={{ width: `${free}%` }}>
          <span className={cx("block w-full rounded-[9px] border-[1.5px] border-dashed border-trait-2", LANE_HEIGHT[lane.key])} />
        </span>
      ) : null}
    </div>
  );
}

/** Le même couloir sur un écran étroit : une liste, un besoin par ligne, son nom entier et son effort. */
function LaneList({ lane, items, free }: { lane: Lane; items: ThemeRow[]; free: number }) {
  return (
    <ul className="grid gap-1 @min-[640px]:hidden">
      {items.map((theme) => (
        <li key={theme.id}>
          <Link
            href={`/themes/${theme.id}`}
            className={cx(
              "flex items-center justify-between gap-3 rounded-[9px] px-3 py-2 transition-[filter] hover:brightness-110",
              LANE_COLOR[lane.key],
              ROW_HEIGHT[lane.key],
            )}
          >
            <span className={cx("leading-tight font-semibold", lane.text)}>
              <ChurnDot theme={theme} />
              {theme.title}
            </span>
            <span className="shrink-0 text-xs opacity-85">{pointsOf(theme)}</span>
          </Link>
        </li>
      ))}
      {free > 0 ? (
        <li aria-hidden className="flex min-h-9 items-center rounded-[9px] border-[1.5px] border-dashed border-trait-2 px-3 text-[12.5px] text-encre-3">
          {plural(free, "point libre", "points libres")}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * L'étape 2 en un visuel : les cycles de l'équipe, chacun de la largeur de sa capacité, remplis dans l'ordre du
 * classement RICE. Un besoin est un bloc aussi large que son effort : on voit d'un coup ce qui tient dans le cycle.
 * Les catégories rapetissent de « ce cycle » à « pas maintenant » : l'œil va d'abord à ce qui se fait. Sous 640 px
 * de large (un téléphone, ou un petit portable avec l'agent ouvert), chaque couloir devient une liste.
 */
export function CycleLanes({ themes }: { themes: ThemeRow[] }) {
  const ranked = themes.filter((theme) => theme.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const unranked = themes.length - ranked.length;
  const mustPoints = ranked.filter((theme) => theme.moscow === "must").reduce((sum, theme) => sum + (theme.effort ?? 0), 0);
  return (
    <div className="@container">
      <div className="grid gap-2.5">
        {LANES.map((lane) => {
          const items = ranked.filter((theme) => (theme.moscow ?? "wont") === lane.key);
          const points = items.reduce((sum, theme) => sum + (theme.effort ?? 0), 0);
          const free = lane.key === "wont" || items.length === 0 ? 0 : Math.max(0, CYCLE_CAPACITY - points);
          // Un besoin planifié par le PO reste dans « Ensuite » au moins : le couloir peut dépasser la capacité.
          const over = lane.key === "wont" ? 0 : Math.max(0, points - CYCLE_CAPACITY);
          return (
            <section
              key={lane.key}
              aria-label={`${lane.word} (${lane.label}) : ${plural(items.length, "besoin")}${over > 0 ? `, ${points} points pour ${CYCLE_CAPACITY}` : ""}`}
              className="grid grid-cols-1 items-center gap-1.5 @min-[640px]:grid-cols-[118px_minmax(0,1fr)] @min-[640px]:gap-3.5"
            >
              <div className="flex items-center gap-2 @min-[640px]:grid @min-[640px]:justify-items-start @min-[640px]:gap-1">
                <p className="text-[14.5px] leading-tight font-bold">{lane.word}</p>
                <span className="flex items-center">
                  <span className={cx("rounded-[5px] px-[7px] text-xs leading-[1.6] font-bold", LANE_COLOR[lane.key])}>{lane.label}</span>
                  {lane.key === "must" ? <Help term="moscow" /> : null}
                </span>
                {over > 0 ? (
                  <span title="Un besoin planifié par vous y est rangé, même au-delà de la capacité." className="text-xs font-semibold text-encre-2">
                    {points} pts pour {CYCLE_CAPACITY}
                  </span>
                ) : null}
              </div>
              {items.length === 0 ? (
                <span className={cx("flex w-full items-center rounded-[9px] border-[1.5px] border-dashed border-trait-2 px-3 text-[12.5px] text-encre-3", LANE_HEIGHT[lane.key])}>Aucun besoin</span>
              ) : (
                <>
                  <LaneBlocks lane={lane} items={items} />
                  <LaneList lane={lane} items={items} free={free} />
                </>
              )}
            </section>
          );
        })}
        <p className="text-[13px] text-encre-3 @min-[640px]:pl-[132px]">
          Ce cycle{" "}: <b className="text-accent">{plural(mustPoints, "point")} sur {CYCLE_CAPACITY}</b>. Cliquez sur un besoin pour voir pourquoi il est là.
          {unranked > 0 ? ` ${plural(unranked, "besoin parqué ou livré", "besoins parqués ou livrés")} : voir la liste complète.` : ""}
        </p>
      </div>
    </div>
  );
}

function Doubt() {
  return <span role="img" aria-label="L'IA hésite" className="ml-1.5 inline-block size-2 rounded-full bg-ambre align-middle" />;
}

/**
 * La liste complète : les besoins classés avec leurs facteurs RICE, leur catégorie et leur statut, comme dans
 * l'export. Les besoins parqués ou livrés suivent, avec la raison de la décision.
 */
export function BacklogTable({ themes }: { themes: ThemeRow[] }) {
  const rows = themes.filter((theme) => theme.rank !== null).sort((a, b) => a.rank! - b.rank!);
  return (
    <div className="grid gap-2">
      {rows.some((theme) => doubtfulFactor(theme)) ? (
        <p className="flex items-center gap-1.5 text-[12.5px] text-encre-3">
          <span aria-hidden className="size-2 rounded-full bg-ambre" />
          L&apos;IA hésite sur ce critère
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-trait">
        <table className="w-full text-[13.5px]">
          <thead className="bg-papier-2 text-left text-xs text-encre-3">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Rang</th>
              <th className="py-2.5 pr-3 font-semibold">Besoin</th>
              <th className="py-2.5 pr-3 font-semibold">Catégorie</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Clients</th>
              <th className="py-2.5 pr-3 font-semibold">Impact</th>
              <th className="py-2.5 pr-3 text-right font-semibold">Confiance</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Effort</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((theme) => {
              const doubt = doubtfulFactor(theme);
              const status = THEME_STATUS[theme.status];
              return (
                <tr key={theme.id} className="border-t border-trait">
                  <td className="px-3 py-2 text-encre-3 tabular-nums">{theme.rank ?? "–"}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/themes/${theme.id}`} className="font-semibold text-encre hover:text-accent">
                      {theme.title}
                    </Link>
                    {theme.status !== "new" && theme.status !== "triaged" && status ? <StatusPill label={status.label} tone={status.tone} className="ml-2" /> : null}
                    {theme.churnRisk ? <StatusPill label="Risque de départ" tone="alerte" className="ml-2" /> : null}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {theme.moscow ? <MoscowTag moscow={theme.moscow} /> : <span className="text-encre-3">–</span>}
                    {theme.moscowSource === "po" ? <span className="ml-1.5 text-xs text-encre-3">décidé</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{theme.reach}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {impactWord(theme.impact)}
                    {doubt === "impact" ? <Doubt /> : null}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                    {theme.confidence === null ? "–" : `${Math.round(theme.confidence * 100)} %`}
                    {doubt === "confidence" ? <Doubt /> : null}
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                    {theme.effort === null ? "–" : `${theme.effort} pts`}
                    {doubt === "effort" ? <Doubt /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Les besoins sortis du classement : parqués ou livrés, avec la raison de la décision. */
export function UnrankedList({ themes }: { themes: ThemeRow[] }) {
  const others = themes.filter((theme) => theme.rank === null);
  if (others.length === 0) return null;
  return (
    <section aria-labelledby="hors-classement">
      <h2 id="hors-classement" className="text-[15px] font-bold">
        Hors classement <span className="text-[13px] font-medium text-encre-3">{others.length}</span>
      </h2>
      <p className="text-[12.5px] text-encre-3">Parqués ou livrés, avec la raison de la décision</p>
      <ul className="mt-2.5 divide-y divide-trait rounded-xl border border-trait">
        {others.map((theme) => (
          <li key={theme.id}>
            <Link href={`/themes/${theme.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-encre hover:bg-papier-2">
              <span className="font-semibold">{theme.title}</span>
              <span className="text-[13px] text-encre-3">{theme.statusReason ?? (theme.status === "shipped" ? "Livré" : "Parqué")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const EFFORTS = [1, 2, 3, 5, 8, 13];
/** Le tracé fait 100 de large et garde le ratio 16/10 : les bulles se mesurent en pourcentage de la largeur. */
const PLOT_RATIO = 10 / 16;
/** La moitié de l'écart entre deux colonnes d'effort, en % de la largeur : la bande où une bulle peut s'écarter. */
const HALF_COLUMN = 84 / (EFFORTS.length - 1) / 2;
/** Le blanc entre deux bulles voisines, en % de la largeur : une dizaine de pixels sur un portable. */
const BUBBLE_GAP = 2.2;

const xOf = (effort: number) => 8 + (EFFORTS.indexOf(effort) / (EFFORTS.length - 1)) * 84;

type Bubble = { theme: ThemeRow; value: number; x: number; y: number; size: number };

/** Les places essayées pour une bulle, de la plus fidèle à la moins fidèle : d'abord sur le côté, puis en hauteur. */
function spotsFor(item: Bubble) {
  const half = HALF_COLUMN - item.size / 2 - 0.4;
  const spots: Array<{ x: number; y: number; cost: number }> = [];
  for (let row = 0; row <= 8; row++) {
    for (const up of row === 0 ? [0] : [1, -1]) {
      const dy = up * row * 0.12 * item.size;
      for (let step = 0; step * 0.5 <= half; step++) {
        for (const side of step === 0 ? [0] : [1, -1]) {
          const dx = side * step * 0.5;
          // Monter ou descendre change la valeur lue : quatre fois plus coûteux que s'écarter dans la colonne.
          spots.push({ x: item.x + dx, y: Math.min(96, Math.max(4, item.y + dy / PLOT_RATIO)), cost: Math.abs(dx) + 4 * Math.abs(dy) });
        }
      }
    }
  }
  return spots.sort((a, b) => a.cost - b.cost);
}

/**
 * Place les bulles sans qu'elles se touchent. L'effort est une échelle de colonnes : une bulle qui en gênerait une
 * autre s'écarte d'abord sur le côté, à la hauteur exacte de sa valeur, sans jamais sortir de sa colonne ; en dernier
 * recours, elle monte ou descend un peu. Les mieux classées sont placées d'abord et gardent leur position exacte.
 */
function placeBubbles(items: Bubble[]): Bubble[] {
  const placed: Bubble[] = [];
  for (const item of items) {
    const spots = spotsFor(item);
    const spot =
      spots.find(({ x, y }) => placed.every((other) => Math.hypot(x - other.x, (y - other.y) * PLOT_RATIO) >= (item.size + other.size) / 2 + BUBBLE_GAP)) ?? spots[0];
    placed.push({ ...item, x: spot.x, y: spot.y });
  }
  return placed;
}

/**
 * La matrice RICE : le score RICE dessiné. Chaque besoin est une bulle, d'autant plus grosse qu'il touche de clients, de la
 * couleur de sa catégorie. Valeur = clients × impact × confiance ; effort en points relatifs. En haut à gauche,
 * les gains rapides.
 */
export function PriorityMatrix({ themes }: { themes: ThemeRow[] }) {
  const ranked = themes.filter((t) => t.impact !== null && t.confidence !== null && t.effort !== null && t.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const values = ranked.map((t) => t.reach * t.impact! * t.confidence!);
  const maxValue = Math.max(1, ...values) * 1.15;
  const medianValue = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const yOf = (value: number) => 92 - (value / maxValue) * 84;
  // Les quadrants suivent les seuils : effort entre 3 et 5 points, valeur médiane des besoins.
  const xSplit = (xOf(3) + xOf(5)) / 2;
  const ySplit = yOf(medianValue);
  // Des bulles assez petites pour que les besoins d'un même effort tiennent côte à côte dans leur colonne.
  const bubbles = placeBubbles(ranked.map((theme, index) => ({ theme, value: values[index], x: xOf(theme.effort!), y: yOf(values[index]), size: 3.5 + Math.sqrt(theme.reach) * 0.9 })));
  const quickWins = ranked.filter((theme, index) => values[index] >= medianValue && theme.effort! <= 3);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
      <div className="rounded-xl border border-trait p-4 sm:p-5">
        <p className="text-base font-semibold">
          {quickWins.length > 0
            ? `Gains rapides : ${quickWins.map((theme) => theme.title).join(", ")}.`
            : "Aucun gain rapide : tous les besoins à forte valeur demandent 5 points d'effort ou plus."}
        </p>
        {/* La clé de lecture d'abord : elle reste visible sans défiler, au-dessus du tracé. */}
        <p className="mt-1 text-[13px] text-encre-3">
          {frenchSpaces("Le score RICE est la valeur divisée par l'effort : plus un besoin est haut et à gauche, plus il passe tôt. Taille : nombre de clients. Couleur : catégorie MoSCoW.")}
        </p>
        <p className="mt-3 mb-2 text-xs font-medium text-encre-3">↑ Valeur : clients × impact × confiance</p>
        <div className="@container relative aspect-[16/10] w-full">
          <div className="absolute inset-0 grid overflow-hidden rounded-lg text-xs font-semibold text-encre-3" style={{ gridTemplateColumns: `${xSplit}% 1fr`, gridTemplateRows: `${ySplit}% 1fr` }}>
            <div className="border-r border-b border-dashed border-trait-2 bg-papier-2 p-3 text-encre-2">Gains rapides</div>
            <div className="border-b border-dashed border-trait-2 p-3 text-right">Gros chantiers</div>
            {/* Les petits efforts à faible valeur tombent dans ce coin : sur un tracé étroit, son nom passe sur deux lignes. */}
            <div className="flex items-end border-r border-dashed border-trait-2 p-3">
              <span className="@max-[380px]:max-w-10">Petits plus</span>
            </div>
            <div className="flex items-end justify-end p-3">À éviter</div>
          </div>
          {bubbles.map(({ theme, value, x, y, size }) => (
            <Link
              key={theme.id}
              href={`/themes/${theme.id}`}
              aria-label={`Rang ${theme.rank} : ${theme.title}, valeur ${value.toLocaleString("fr-FR")}, effort ${theme.effort} points, ${plural(theme.reach, "client")}`}
              title={`${theme.rank}. ${theme.title} : ${plural(theme.reach, "client")}, effort ${theme.effort} pts`}
              className={cx(
                "absolute flex aspect-square min-w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold ring-2 ring-papier transition-transform hover:z-10 hover:scale-110",
                LANE_COLOR[theme.moscow ?? "wont"],
              )}
              style={{ left: `${x}%`, top: `${y}%`, width: `${size}%` }}
            >
              {theme.rank}
            </Link>
          ))}
        </div>
        <div className="relative mt-2 h-4 text-xs font-medium text-encre-3" aria-hidden>
          {EFFORTS.map((effort) => (
            <span key={effort} className="absolute -translate-x-1/2" style={{ left: `${xOf(effort)}%` }}>
              {effort}
            </span>
          ))}
        </div>
        <p className="mt-1 text-right text-xs font-medium text-encre-3">Effort, en points relatifs aux stories de référence →</p>
      </div>
      <ol className="grid content-start gap-0.5 text-sm">
        {ranked.map((theme) => (
          <li key={theme.id}>
            <Link href={`/themes/${theme.id}`} className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1 text-encre hover:bg-papier-2">
              <span aria-hidden className={cx("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", LANE_COLOR[theme.moscow ?? "wont"])}>
                {theme.rank}
              </span>
              <span className="font-medium">{theme.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
