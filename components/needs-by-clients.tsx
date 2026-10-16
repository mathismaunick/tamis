import Link from "next/link";
import { Help } from "@/components/help";
import { Icon } from "@/components/icons";
import { SEGMENT_DOT, cx } from "@/components/ui";
import { SEGMENT_LABELS, plural } from "@/lib/labels";
import { PRODUCT } from "@/lib/product";
import type { HomeNeed } from "@/lib/services/home";

const MAX_DOTS = 10;

/**
 * Ce qu'il faut remarquer sur un besoin, en un mot : il monte, un client écrit beaucoup, ou il existe peut-être déjà.
 * « En hausse » est en indigo : l'ambre est réservé à ce qui attend une décision.
 */
function Remark({ need }: { need: HomeNeed }) {
  if (need.trend.rising) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-voile py-0.5 pr-2.5 pl-2 text-[12.5px] font-semibold text-accent-fort">
        <Icon name="up" className="size-3.5" />
        En hausse
      </span>
    );
  }
  if (need.messages >= 4 && need.messages >= 2 * need.clients) return <span className="text-[12.5px] text-encre-3">{plural(need.messages, "message")} pour {plural(need.clients, "client")}</span>;
  if (need.alreadyExists) {
    return (
      <span title={`${PRODUCT.name} sait peut-être déjà le faire : à vérifier avant de le construire.`} className="text-[12.5px] text-encre-3">
        Peut-être déjà dans {PRODUCT.name}
      </span>
    );
  }
  return null;
}

/**
 * L'étape 1 en un visuel : chaque besoin, et un point par client qui l'exprime, coloré par segment. Un client compte
 * une fois, même s'il écrit souvent : onze messages d'un même client restent un point.
 */
export function NeedsByClients({ needs }: { needs: HomeNeed[] }) {
  return (
    <section aria-label="Les besoins, du plus demandé au moins demandé" className="@container">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[12.5px] text-encre-3">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Formule{" "}:</span>
          {["enterprise", "pro", "starter"].map((segment) => (
            <span key={segment} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cx("size-2.5 rounded-full", SEGMENT_DOT[segment])} />
              {SEGMENT_LABELS[segment]}
            </span>
          ))}
          <Help term="formule" className="-ml-3" />
        </p>
        <p className="inline-flex items-center gap-1 sm:pr-1.5">
          <Icon name="up" className="size-3.5 text-accent-fort" />
          En hausse
          <Help term="hausse" align="end" />
        </p>
      </div>
      <ul>
        {needs.map((need) => (
          <li key={need.id} className="border-b border-papier-3">
            {/* Sur 600 px et plus, une ligne : le nom, les points, la remarque. En dessous (un téléphone, un petit portable
                avec l'agent ouvert), le nom tient sur deux lignes et les points passent dessous, avec la remarque. */}
            <Link
              href={`/themes/${need.id}`}
              className="grid min-h-[31px] grid-cols-1 items-center gap-x-4 gap-y-1 rounded-md px-1.5 py-1.5 text-encre transition-colors hover:bg-papier-2 hover:text-encre @min-[600px]:grid-cols-[minmax(0,1fr)_190px_170px] @min-[600px]:py-1"
            >
              <span className="line-clamp-2 text-[14.5px] font-medium">{need.title}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 @min-[600px]:contents">
                <span className="flex items-center gap-[5px]" aria-label={plural(need.clients, "client")}>
                  {need.segments.slice(0, MAX_DOTS).map((segment, index) => (
                    <span key={index} aria-hidden className={cx("size-[13px] shrink-0 rounded-full", SEGMENT_DOT[segment] ?? "bg-neutre")} />
                  ))}
                  {need.segments.length > MAX_DOTS ? <span className="text-xs text-encre-3">…</span> : null}
                  <b className="ml-1.5 text-[13px] font-semibold text-encre-2">{need.clients}</b>
                </span>
                <span>
                  <Remark need={need} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
