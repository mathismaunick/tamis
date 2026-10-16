import type { ComponentProps, ReactNode } from "react";
import { MOSCOW_LABELS, MOSCOW_WORDS } from "@/lib/labels";

/** Assemble des classes en ignorant les valeurs vides. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "principal" | "trait" | "discret" | "clair";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Le bouton principal porte l'indigo : un seul par écran, sur l'action qui fait avancer.
  principal: "bg-accent text-white hover:bg-accent-fort",
  trait: "bg-papier text-encre ring-[1.5px] ring-inset ring-trait-2 hover:bg-papier-2",
  discret: "text-encre-2 hover:bg-papier-2 hover:text-encre",
  // Sur le fond nuit de l'agent.
  clair: "bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/15",
};

export function buttonClass(variant: ButtonVariant = "trait", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "min-h-8 px-3 text-[13px]" : "min-h-10 px-4 text-sm",
    BUTTON_VARIANTS[variant],
  );
}

export function Button({
  variant = "trait",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export type Tone = "neutre" | "accent" | "eteint" | "alerte" | "attention";

const DOT: Record<Tone, string> = {
  neutre: "bg-neutre",
  accent: "bg-accent",
  eteint: "bg-trait-2",
  alerte: "bg-rouge",
  attention: "bg-ambre",
};

/** Un état se dit par un point de couleur et un mot, jamais par un fond teinté. */
export function StatusPill({ label, tone = "neutre", wrap = false, className }: { label: string; tone?: Tone; wrap?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline gap-1.5 text-[13px] text-encre-2", wrap ? "whitespace-normal" : "whitespace-nowrap", className)}>
      <span aria-hidden className={cx("size-2 shrink-0 translate-y-[-1px] self-center rounded-full", DOT[tone])} />
      {label}
    </span>
  );
}

/**
 * La marque d'un client, colorée par sa formule : une gamme de nuit, du plus gros au plus petit. Le Starter, trop pâle
 * sur le blanc (contraste 1,87), porte un contour de la couleur Pro (4,27).
 */
export const SEGMENT_DOT: Record<string, string> = {
  enterprise: "bg-enterprise",
  pro: "bg-pro",
  starter: "bg-starter ring-[1.5px] ring-pro ring-inset",
};

/** Une étiquette neutre : un mot, encadré d'un filet. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap text-encre-2 ring-1 ring-trait ring-inset", className)}>{children}</span>;
}

const MOSCOW_SWATCH: Record<string, string> = { must: "bg-must", should: "bg-should", could: "bg-could", wont: "bg-wont" };

/**
 * La catégorie MoSCoW : un carré de sa couleur, le mot des couloirs de l'étape 2 puis son nom, « Ce cycle (Must) »,
 * partout les mêmes : le lien entre les cycles et la liste ne se perd pas.
 */
export function MoscowTag({ moscow, className }: { moscow: string | null; className?: string }) {
  const key = moscow && MOSCOW_SWATCH[moscow] ? moscow : "wont";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-semibold", className)}>
      <span aria-hidden className={cx("size-2.5 shrink-0 rounded-[3px]", MOSCOW_SWATCH[key])} />
      {MOSCOW_WORDS[key]}
      <span className="font-normal text-encre-3">({MOSCOW_LABELS[key]})</span>
    </span>
  );
}

/** Un bloc : un filet et des coins arrondis, sans ombre. */
export function Block({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cx("rounded-xl border border-trait bg-papier", className)}>{children}</Tag>;
}

/** Le conteneur d'une page : la largeur de lecture et les marges, de 375 à 1 440 px. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}

/** En-tête de page : le titre, la réponse en une phrase, puis les actions. */
export function PageHeader({ title, eyebrow, answer, actions }: { title: string; eyebrow?: ReactNode; answer?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="mb-2 text-[13px] text-encre-3">{eyebrow}</div> : null}
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-balance">{title}</h1>
        {answer ? <div className="mt-1.5 text-[15px] leading-relaxed text-encre-2">{answer}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Une section : un titre court, une phrase qui dit à quoi elle sert, puis le contenu. */
export function Section({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("grid gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-encre-3">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Un état vide dit ce qui apparaîtra ici et comment commencer. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-trait-2 px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-encre-2">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Message d'erreur : ce qui s'est passé, et quoi faire. */
export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-trait px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-rouge-encre">
        <span aria-hidden className="size-2 rounded-full bg-rouge" />
        {title}
      </p>
      {children ? <div className="mt-1 text-encre-2">{children}</div> : null}
    </div>
  );
}

/** Bloc de chargement neutre, de la taille du contenu attendu. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-papier-3", className)} />;
}
