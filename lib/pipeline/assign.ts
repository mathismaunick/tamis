/**
 * Rattachement d'une demande à un thème, au fil de l'eau. La similarité porte sur le besoin normalisé,
 * pas sur le texte brut : « un Gantt » et « voir ce qui bloque » se retrouvent.
 * - au-dessus du seuil haut : rattachement direct ;
 * - en zone grise : le modèle confirme « même besoin ? » ;
 * - en dessous : un nouveau thème naît.
 * Les identifiants des thèmes restent stables d'un import à l'autre : les décisions du PO ne se perdent pas.
 */

export type Candidate = { themeId: number; similarity: number; title: string; need: string; needs?: string[] };

export type Thresholds = { high: number; low: number };

/**
 * Seuils réglés sur le jeu annoté, pour text-embedding-3-small : entre deux besoins du même thème, la similarité
 * médiane est de 0,55 ; entre thèmes différents, elle dépasse rarement 0,58. Au-dessus de 0,70, le rattachement
 * est sûr ; entre 0,40 et 0,70, le modèle confirme.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  high: Number(process.env.ASSIGN_HIGH ?? 0.7),
  low: Number(process.env.ASSIGN_LOW ?? 0.4),
};

export type AssignDecision =
  | { kind: "attach"; themeId: number; method: "direct" | "confirmed"; similarity: number }
  | { kind: "create"; similarity: number | null };

export async function decideAssignment(
  candidates: Candidate[],
  confirm: (candidate: Candidate) => Promise<boolean>,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Promise<AssignDecision> {
  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const best = sorted[0];
  if (!best) return { kind: "create", similarity: null };
  if (best.similarity >= thresholds.high) {
    return { kind: "attach", themeId: best.themeId, method: "direct", similarity: best.similarity };
  }
  // Les candidats de la zone grise sont soumis en parallèle ; le plus proche qui est confirmé l'emporte.
  const grey = sorted.filter((c) => c.similarity >= thresholds.low);
  const answers = await Promise.all(grey.map((candidate) => confirm(candidate)));
  const confirmed = grey.find((_, index) => answers[index]);
  if (confirmed) return { kind: "attach", themeId: confirmed.themeId, method: "confirmed", similarity: confirmed.similarity };
  return { kind: "create", similarity: best.similarity };
}

/** Similarité cosinus entre deux vecteurs. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** Le vecteur d'un thème est la moyenne des besoins qui lui sont rattachés. */
export function meanVector(vectors: readonly (readonly number[])[]): number[] {
  const mean = new Array<number>(vectors[0]?.length ?? 0).fill(0);
  for (const vector of vectors) for (let index = 0; index < vector.length; index++) mean[index] += vector[index] / vectors.length;
  return mean;
}

export type MemoryRequest = { id: number; need: string; quote: string; embedding: number[] };

/**
 * Le même algorithme, en mémoire : sert aux évals (réglage des seuils, comparaison des modèles d'embeddings)
 * sans toucher à la base. Renvoie le thème de chaque demande.
 */
export async function assignInMemory(
  requests: MemoryRequest[],
  confirm: (request: MemoryRequest, candidate: Candidate) => Promise<boolean>,
  thresholds: Thresholds,
): Promise<{ assignments: Map<number, number>; confirmations: number; themes: ThemeGroup[] }> {
  const themes: Array<{ id: number; title: string; need: string; members: number[][]; needs: string[]; vector: number[] }> = [];
  const assignments = new Map<number, number>();
  let confirmations = 0;
  for (const request of requests) {
    const candidates = themes
      .map((theme) => ({
        themeId: theme.id,
        similarity: cosine(request.embedding, theme.vector),
        title: theme.title,
        need: theme.need,
        needs: theme.needs.slice(0, 3),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
    const decision = await decideAssignment(
      candidates,
      async (candidate) => {
        confirmations += 1;
        return confirm(request, candidate);
      },
      thresholds,
    );
    if (decision.kind === "attach") {
      const theme = themes.find((t) => t.id === decision.themeId)!;
      theme.members.push(request.embedding);
      theme.needs.push(request.need);
      theme.vector = meanVector(theme.members);
      assignments.set(request.id, theme.id);
    } else {
      const id = themes.length + 1;
      themes.push({ id, title: request.need, need: request.need, members: [request.embedding], needs: [request.need], vector: request.embedding });
      assignments.set(request.id, id);
    }
  }
  return {
    assignments,
    confirmations,
    themes: themes.map((theme) => ({ id: theme.id, title: theme.title, needs: theme.needs, vector: theme.vector })),
  };
}

export type ThemeGroup = { id: number; title: string; needs: string[]; vector: number[] };

export type MergePlan = Array<{ sourceId: number; targetId: number; similarity: number }>;

/** Jusqu'à cette taille, un thème peut être un fragment ; au-delà, c'est une tendance établie : elle absorbe, elle n'est pas absorbée. */
export const SMALL_THEME_MAX = 3;

/** Voisins montrés au modèle pour un petit thème : la similarité entre thèmes départage mal, le modèle choisit. */
export const CONSOLIDATION_CANDIDATES = 6;

/**
 * Consolidation, en fin d'import. Le rattachement au fil de l'eau dépend de l'ordre d'arrivée : une première demande
 * isolée peut fonder un thème que ses voisines ne rejoignent pas, faute de contexte. Chaque petit thème est donc
 * présenté au modèle avec toutes ses demandes et ses voisins du backlog (les plus proches par similarité, assez
 * nombreux pour que le bon y figure) ; le modèle désigne celui qui relève du même epic, ou aucun. Les plus petits
 * passent d'abord ; un thème qui en absorbe un autre grandit pour la suite.
 * `sources` limite les thèmes examinés (ceux que l'import a touchés) ; tous les thèmes restent des cibles possibles.
 */
export async function planConsolidation(
  themes: ThemeGroup[],
  choose: (small: ThemeGroup, candidates: ThemeGroup[]) => Promise<number | null>,
  options: { sources?: Set<number>; maxSize?: number; low?: number; candidates?: number } = {},
): Promise<MergePlan> {
  const maxSize = options.maxSize ?? SMALL_THEME_MAX;
  // Pas de seuil par défaut : entre thèmes, la similarité départage mal, et le bon voisin peut être sous 0,40.
  const low = options.low ?? 0;
  const alive = new Map(themes.map((theme) => [theme.id, { ...theme, needs: [...theme.needs], vector: [...theme.vector] }]));
  const order = themes
    .filter((theme) => (options.sources ? options.sources.has(theme.id) : true) && theme.needs.length <= maxSize)
    .sort((a, b) => a.needs.length - b.needs.length || b.id - a.id);
  const plan: MergePlan = [];

  for (const { id } of order) {
    const source = alive.get(id);
    if (!source || source.needs.length > maxSize) continue;
    const candidates = [...alive.values()]
      .filter((other) => other.id !== source.id)
      .map((other) => ({ other, similarity: cosine(source.vector, other.vector) }))
      .filter((candidate) => candidate.similarity >= low)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.candidates ?? CONSOLIDATION_CANDIDATES);
    if (candidates.length === 0) continue;
    const targetId = await choose(
      source,
      candidates.map((candidate) => candidate.other),
    );
    // Le modèle ne peut désigner qu'un des voisins qu'on lui a montrés.
    const chosen = candidates.find((candidate) => candidate.other.id === targetId);
    if (!chosen) continue;
    const target = chosen.other;
    const total = target.needs.length + source.needs.length;
    target.vector = target.vector.map((value, index) => (value * target.needs.length + source.vector[index] * source.needs.length) / total);
    target.needs.push(...source.needs);
    alive.delete(source.id);
    plan.push({ sourceId: source.id, targetId: target.id, similarity: chosen.similarity });
  }
  return plan;
}

/** Applique un plan de fusion à des affectations : chaque demande suit son thème, y compris par fusions successives. */
export function applyMergePlan(assignments: Map<number, number>, plan: MergePlan): Map<number, number> {
  const into = new Map(plan.map((merge) => [merge.sourceId, merge.targetId]));
  const resolve = (themeId: number): number => (into.has(themeId) ? resolve(into.get(themeId)!) : themeId);
  return new Map([...assignments].map(([request, themeId]) => [request, resolve(themeId)]));
}
