import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

/** Le cadre d'une étape : les marges, et toute la hauteur de l'écran pour que l'étape suivante reste en bas. */
export function StepPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto flex min-h-full w-full max-w-[1000px] flex-col px-5 py-6 sm:px-9 sm:pt-6 sm:pb-5", className)}>{children}</div>;
}

/** L'en-tête d'une étape : une question en titre, une phrase qui dit ce qu'on voit, les actions à droite. */
export function StepHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[22rem] sm:max-w-[60ch]">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-balance">{title}</h1>
        {sub ? <p className="mt-1.5 text-[14.5px] leading-relaxed text-encre-3">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Les vues d'une étape : la vue simple d'abord, le détail à un clic. */
export function ViewSwitch({ views, current, label }: { views: Array<{ key: string; label: string; href: string }>; current: string; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex gap-0.5 rounded-[9px] bg-papier-3 p-[3px]">
      {views.map((view) => {
        const active = view.key === current;
        return (
          <Link
            key={view.key}
            href={view.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex min-h-8 items-center rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors",
              active ? "bg-papier font-semibold text-encre shadow-[0_1px_2px_rgba(21,22,43,0.1)]" : "font-medium text-encre-2 hover:text-encre",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Le bouton de l'étape suivante, en bas à droite : on sait toujours ce qui vient après. */
export function NextStep({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-auto flex justify-end pt-4">
      <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-fort hover:text-white">
        {label}
        <Icon name="arrow" className="size-4" />
      </Link>
    </div>
  );
}
