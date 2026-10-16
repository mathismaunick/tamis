import { PRODUCT } from "@/lib/product";
import { CYCLE_CAPACITY } from "@/lib/scoring/rice";

/**
 * Les mots du métier, expliqués en une phrase pour quelqu'un qui découvre Tamis : ce qu'affiche le « ? » placé à côté
 * de chaque terme. Un seul endroit, pour que la même définition se lise partout.
 */
export const GLOSSARY = {
  formule: {
    label: "La formule",
    text: `l'abonnement du client à ${PRODUCT.name}. Enterprise : les grands comptes ; Pro : les équipes ; Starter : les petites structures. Plus le point est foncé, plus le client pèse.`,
  },
  hausse: {
    label: "En hausse",
    text: "le besoin revient plus souvent ces derniers temps : au moins trois demandes sur la seconde moitié de la période, deux fois plus que sur la première.",
  },
  rice: {
    label: "Le score RICE",
    text: "Reach × Impact × Confidence ÷ Effort. Le nombre de clients, multiplié par l'impact pour chacun et par la confiance dans ces estimations, divisé par l'effort : plus il est haut, plus le besoin passe tôt.",
  },
  cycle: {
    label: "Un cycle",
    text: `une période de travail de l'équipe, comme un sprint. Elle se remplit en points d'effort, une estimation relative du travail de 1 (petit) à 13 (gros chantier) : l'équipe en fait ${CYCLE_CAPACITY} par cycle.`,
  },
  moscow: {
    label: "MoSCoW",
    text: `quatre catégories pour décider : Must (ce cycle), Should (ensuite), Could (plus tard), Won't (pas maintenant). Tamis remplit chaque cycle dans l'ordre du classement, jusqu'à ${CYCLE_CAPACITY} points.`,
  },
  calcul: {
    label: "Le calcul",
    text: "clients × impact × confiance ÷ effort. Le code compte les clients ; l'IA propose l'impact (ce que ça change pour chacun), la confiance (la solidité des preuves) et l'effort (en points). Vous pouvez ajuster chacun, avec votre raison.",
  },
  story: {
    label: "Une user story",
    text: "un besoin écrit du point de vue de l'utilisateur : qui il est, ce qu'il veut, et pourquoi. C'est ce que l'équipe va développer.",
  },
  criteres: {
    label: "Les critères d'acceptation",
    text: "les conditions vérifiables qui disent quand la story est finie : étant donné une situation, quand l'utilisateur agit, alors il obtient tel résultat.",
  },
  poker: {
    label: "Le planning poker",
    text: "l'atelier où l'équipe estime ensemble l'effort d'une story, en points. Tamis lui donne un point de départ, en la comparant aux stories de référence de l'équipe.",
  },
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
