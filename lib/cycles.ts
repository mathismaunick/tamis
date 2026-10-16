import { CYCLE_CAPACITY } from "@/lib/scoring/rice";

export type LaneLayout = {
  /** La largeur de chaque bloc, en pourcentage du couloir, dans l'ordre des efforts reçus. */
  widths: number[];
  /** La place libre, en pourcentage du couloir. */
  free: number;
  /** Les points au-delà de la capacité : un statut décidé par le PO peut charger un couloir plus que le cycle. */
  over: number;
};

/**
 * La disposition d'un couloir de cycle : chaque besoin aussi large que son effort, sur la capacité de l'équipe. Quand
 * un couloir dépasse la capacité (un besoin planifié par le PO y est toujours rangé), les blocs se partagent toute la
 * largeur au lieu de déborder, et le dépassement est rendu à part pour être affiché.
 */
export function laneLayout(efforts: number[], capacity = CYCLE_CAPACITY): LaneLayout {
  const points = efforts.map((effort) => Math.max(1, effort));
  const total = points.reduce((sum, effort) => sum + effort, 0);
  const scale = Math.max(capacity, total);
  return {
    widths: points.map((effort) => (effort / scale) * 100),
    free: ((scale - total) / scale) * 100,
    over: Math.max(0, total - capacity),
  };
}
