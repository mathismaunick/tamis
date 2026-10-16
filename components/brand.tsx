/**
 * Identité de Tamis : un tamis vu de dessus, son cadre, ses trous, et un grain retenu au centre, en ambre.
 * Le grain, c'est l'essentiel que le PO garde parmi des dizaines de retours.
 */
const HOLES = [7.5, 12, 16.5].flatMap((y) => [7.5, 12, 16.5].map((x) => [x, y] as const)).filter(([x, y]) => !(x === 12 && y === 12));

export function TamisSymbol({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {HOLES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" fill="currentColor" />
      ))}
      <circle cx="12" cy="12" r="2.6" style={{ fill: "var(--ambre-grain)" }} />
    </svg>
  );
}

/** Le logo complet : le symbole et le nom. `sombre` pour la barre latérale indigo nuit. */
export function TamisLogo({ className, sombre = false }: { className?: string; sombre?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <TamisSymbol size={26} className={sombre ? "text-white" : "text-encre"} />
      <span className={`text-[19px] font-bold tracking-[-0.02em] ${sombre ? "text-white" : "text-encre"}`}>Tamis</span>
    </span>
  );
}
