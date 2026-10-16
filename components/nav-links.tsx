"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

/**
 * Les trois étapes de l'énoncé, dans l'ordre du travail d'un PO : chacune est un onglet de Tamis. `hint` dit l'étape
 * en mots simples, au survol, pour qui ne connaît pas « backlog » ni « story ».
 */
const STEPS = [
  {
    href: "/inbox",
    verb: "Analyser",
    object: "les retours clients",
    hint: "Lire ce que disent les clients et le regrouper en besoins",
    active: (p: string) => p === "/" || p.startsWith("/inbox") || p.startsWith("/feedback"),
  },
  {
    href: "/backlog",
    verb: "Prioriser",
    object: "le backlog",
    hint: "Classer les besoins (le backlog) et choisir ce que l'équipe fait ce cycle",
    active: (p: string) => p.startsWith("/backlog") || p.startsWith("/themes"),
  },
  {
    href: "/stories",
    verb: "Rédiger",
    object: "les stories",
    hint: "Écrire les user stories : ce que l'équipe va développer, besoin par besoin",
    active: (p: string) => p.startsWith("/stories"),
  },
];

type Layout = "colonne" | "ligne";

/** La navigation, sur le fond indigo nuit : les trois étapes, puis le journal. En colonne à gauche, en ligne sur mobile. */
export function NavLinks({ layout = "colonne" }: { layout?: Layout }) {
  return <Links pathname={usePathname()} layout={layout} />;
}

/** Les mêmes liens, sans le lien actif : affichés le temps que l'adresse soit connue. */
export function NavLinksFallback({ layout = "colonne" }: { layout?: Layout }) {
  return <Links pathname={null} layout={layout} />;
}

function Links({ pathname, layout }: { pathname: string | null; layout: Layout }) {
  const current = pathname === null ? -1 : STEPS.findIndex((step) => step.active(pathname));
  const journal = pathname !== null && pathname.startsWith("/changes");

  if (layout === "ligne") {
    return (
      <nav aria-label="Les trois étapes" className="flex items-center gap-1 whitespace-nowrap">
        {STEPS.map((step, index) => (
          <Link
            key={step.href}
            href={step.href}
            title={step.hint}
            aria-current={index === current ? "page" : undefined}
            className={cx("flex min-h-10 items-center gap-2 rounded-md px-3 text-[13px] font-medium", index === current ? "bg-white/10 text-white" : "text-nuit-texte hover:text-white")}
          >
            <span className={cx("grid size-5 place-items-center rounded-full text-xs font-bold", index === current ? "bg-white text-nuit" : "ring-1 ring-white/40")}>{index + 1}</span>
            {step.verb}
          </Link>
        ))}
        <Link href="/changes" aria-current={journal ? "page" : undefined} className={cx("flex min-h-10 items-center rounded-md px-3 text-[13px] font-medium", journal ? "bg-white/10 text-white" : "text-nuit-texte hover:text-white")}>
          Journal
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Les trois étapes" className="flex flex-1 flex-col">
      <ol className="relative grid gap-1.5 before:absolute before:top-7 before:bottom-7 before:left-[23px] before:w-0.5 before:bg-white/15">
        {STEPS.map((step, index) => {
          const active = index === current;
          const passed = current > index;
          return (
            <li key={step.href}>
              <Link
                href={step.href}
                title={step.hint}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors", active ? "bg-white/10" : "hover:bg-white/[.06]")}
              >
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold",
                    // L'ambre est réservé à ce qui attend une décision : une étape passée reste en blanc.
                    active ? "border-white bg-white text-nuit" : passed ? "border-white/70 bg-nuit text-white" : "border-white/35 bg-nuit text-white",
                  )}
                >
                  {index + 1}
                </span>
                <span className="leading-tight">
                  <span className="block text-[15px] font-semibold text-white">{step.verb}</span>
                  <span className="block text-[12.5px] text-nuit-doux">{step.object}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="min-h-6 flex-1" />
      <Link
        href="/changes"
        aria-current={journal ? "page" : undefined}
        className={cx("flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors", journal ? "bg-white/10 text-white" : "text-nuit-texte hover:bg-white/[.06] hover:text-white")}
      >
        <Icon name="history" className="size-[18px]" />
        Journal
      </Link>
    </nav>
  );
}
