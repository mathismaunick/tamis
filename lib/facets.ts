export type Facet = { label: string; feedbackIds: number[] };

/**
 * Combien de clients distincts portent chaque facette d'un thème : la barre se mesure en clients, jamais en
 * messages, comme le Reach. Les facettes sont rendues de la plus partagée à la plus rare.
 */
export function countFacetClients(facets: Facet[], evidence: Array<{ feedbackId: number; client: string }>) {
  const clientOf = new Map(evidence.map((item) => [item.feedbackId, item.client]));
  return facets
    .map((facet) => ({
      label: facet.label,
      feedbackIds: facet.feedbackIds,
      clients: new Set(facet.feedbackIds.map((id) => clientOf.get(id)).filter((client): client is string => client !== undefined)).size,
    }))
    .filter((facet) => facet.clients > 0)
    .sort((a, b) => b.clients - a.clients);
}
