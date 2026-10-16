/**
 * Sans réglage de température, deux appels au même modèle peuvent proposer des facteurs différents.
 * Le modèle propose donc plusieurs fois, et le code garde, pour chaque facteur, la médiane des propositions,
 * avec la justification d'une proposition qui l'a donnée. L'accord (2 sur 3, 3 sur 3) est conservé et affiché.
 */

export type FactorName = "impact" | "confidence" | "effort";
export type FactorSample = { value: number; why: string };
export type ProposalSample = Record<FactorName, FactorSample>;
export type ConsensusFactor = FactorSample & { agreement: number; samples: number };

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("Aucune valeur");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function consensus(samples: ProposalSample[]): Record<FactorName, ConsensusFactor> {
  const result = {} as Record<FactorName, ConsensusFactor>;
  for (const factor of ["impact", "confidence", "effort"] as const) {
    const values = samples.map((sample) => sample[factor].value);
    const chosen = median(values);
    const witness = samples.find((sample) => sample[factor].value === chosen)!;
    result[factor] = {
      value: chosen,
      why: witness[factor].why,
      agreement: values.filter((value) => value === chosen).length,
      samples: samples.length,
    };
  }
  return result;
}
