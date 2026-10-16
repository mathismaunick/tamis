import { z } from "zod";

/*
 * Les contrats des sorties des modèles. Les descriptions des champs font partie du prompt : c'est là qu'on
 * explique au modèle ce qu'est un « besoin sous-jacent ». Pas de contraintes de longueur ici (tous les
 * fournisseurs ne les acceptent pas dans un schéma) : le code les vérifie après coup.
 */

export const KINDS = ["feature", "bug", "praise", "question", "other"] as const;

export const extractionSchema = z.object({
  items: z
    .array(
      z.object({
        kind: z
          .enum(KINDS)
          .describe(
            "feature : une capacité qu'Orbit n'offre pas ou que le client ne trouve pas, y compris quand il décrit une limite actuelle (« le rôle lecteur voit tout l'espace », « inutilisable sur téléphone »). bug : quelque chose qui existe mais fonctionne mal (lenteur, plantage, envoi en double), même formulé comme un souhait. praise : un remerciement. question : une question d'usage. other : tout le reste (facturation, plainte vague).",
          ),
        requested_solution: z
          .string()
          .nullable()
          .describe("Ce que le client dit vouloir, avec ses mots (un Gantt, une intégration Slack…). null s'il ne propose pas de solution."),
        underlying_need: z
          .string()
          .describe(
            "Le besoin derrière la demande : ce que l'utilisateur cherche à accomplir, sans nommer de solution ni d'outil, en une phrase courte en français. Exemple : « un diagramme de Gantt » et « des flèches entre les cartes » ont le même besoin, « voir quelles tâches en bloquent d'autres pour anticiper les retards ».",
          ),
        quote: z
          .string()
          .describe(
            "Le passage du retour qui justifie cet élément, recopié caractère pour caractère : un seul passage continu, sans reformulation, sans traduction et sans « … ».",
          ),
        sentiment: z.enum(["positive", "neutral", "negative"]),
        urgency: z
          .enum(["none", "low", "high", "churn_risk"])
          .describe(
            "churn_risk seulement si le client menace explicitement de partir ou de changer d'outil ; une promesse d'achat (passer à une offre supérieure) n'en est pas un. high si le client est bloqué maintenant ou cite une échéance proche. low pour un simple souhait. none sinon.",
          ),
      }),
    )
    .describe("De zéro à plusieurs éléments : un par besoin distinct. Ne rien inventer quand le retour n'exprime rien d'exploitable."),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedItem = Extraction["items"][number];

export const confirmMatchSchema = z.object({
  same_need: z.boolean().describe("true si la demande sert le même besoin de fond que le thème, même avec une autre solution, une variante ou d'autres mots."),
  reason: z.string().describe("Une phrase qui justifie la réponse."),
});

export const consolidationSchema = z.object({
  theme: z
    .string()
    .nullable()
    .describe("L'identifiant du thème du backlog qui couvre déjà ce besoin, par exemple « T6 » ; null si le petit thème est un besoin distinct."),
  reason: z.string().describe("Une phrase qui justifie la réponse."),
});

export const synthesisSchema = z.object({
  title: z.string().describe("Le nom du thème en 2 à 5 mots, formulé comme un besoin et non comme une solution. Exemple : « Dépendances entre tâches »."),
  need_statement: z
    .string()
    .describe(
      "Le besoin commun en une phrase courte, à l'infinitif, comme un PO l'écrit dans son backlog, sans « je » et sans nommer de solution. Exemple : « Savoir quelles tâches en bloquent d'autres, pour les traiter dans le bon ordre et anticiper les retards. »",
    ),
  synthesis: z
    .string()
    .describe(
      "Deux à quatre phrases pour un PO pressé : qui demande quoi, avec quelles nuances. Chaque phrase se termine par la référence d'au moins un retour cité, au format [F12] ou [F12][F31]. Aucune référence inventée.",
    ),
  facets: z
    .array(
      z.object({
        label: z
          .string()
          .describe("Ce que veulent ces clients, en 3 à 8 mots, à l'infinitif, sans « je ». Exemple : « Voir ce qui bloque, et dans quel ordre travailler »."),
        feedback_ids: z.array(z.number().int()).describe("Les numéros des retours qui l'expriment : [F12] donne 12."),
      }),
    )
    .describe("Deux à quatre facettes du besoin, de la plus partagée à la plus rare. Chaque retour du thème appartient à au moins une facette."),
  // La décision d'abord, en booléen : un modèle respecte mieux un vrai ou faux qu'une consigne de laisser un texte vide.
  already_answered: z
    .boolean()
    .describe(
      "true seulement si une fonctionnalité qu'Orbit propose déjà répond à ce que demandent certains clients, qui ne l'ont pas trouvée : un problème de découvrabilité, pas de développement. false si l'existant est insuffisant, différent ou absent.",
    ),
  already_exists: z
    .string()
    .nullable()
    .describe(
      "Si already_answered est vrai : une phrase qui cite la fonctionnalité existante et les retours concernés, au format [F12]. Sinon null : on n'explique pas pourquoi l'existant ne suffit pas.",
    ),
});

export const IMPACT_VALUES = [0.25, 0.5, 1, 2, 3] as const;
export const CONFIDENCE_VALUES = [0.5, 0.8, 1] as const;
export const EFFORT_VALUES = [1, 2, 3, 5, 8, 13] as const;

export const prescoreSchema = z.object({
  impact: z
    .enum(["0.25", "0.5", "1", "2", "3"])
    .describe("Effet pour chaque client concerné : 0.25 minimal, 0.5 faible, 1 moyen, 2 fort, 3 massif."),
  impact_justification: z.string().describe("Une ou deux phrases, fondées sur les retours cités et leurs segments."),
  confidence: z
    .enum(["0.5", "0.8", "1"])
    .describe("Certitude sur le Reach et l'Impact : 1 élevée, 0.8 moyenne, 0.5 faible."),
  confidence_justification: z
    .string()
    .describe("Une ou deux phrases, fondées sur les indicateurs fournis (clients, segments, canaux, concentration des messages)."),
  effort: z
    .enum(["1", "2", "3", "5", "8", "13"])
    .describe("Complexité en points relatifs, jamais en jours, par comparaison avec les stories de référence de l'équipe."),
  effort_justification: z
    .string()
    .describe("Une ou deux phrases qui nomment la ou les stories de référence les plus proches et leurs points."),
});

export type Prescore = z.infer<typeof prescoreSchema>;

export const storySchema = z.object({
  title: z.string().describe("Titre court de la story, orienté résultat pour l'utilisateur."),
  persona: z
    .string()
    .describe("Le persona précis, tiré des preuves (« conducteur de travaux d'une entreprise du BTP », « cheffe de projet en agence »), jamais « un utilisateur »."),
  want: z.string().describe("Ce que le persona veut pouvoir faire, sans détailler l'implémentation technique."),
  so_that: z.string().describe("Le bénéfice concret pour le persona, celui que les clients expriment."),
  acceptance_criteria: z
    .array(
      z.object({
        given: z.string().describe("Le contexte de départ."),
        when: z.string().describe("L'action de l'utilisateur."),
        then: z.string().describe("Le résultat observable, vérifiable par un test."),
      }),
    )
    .describe("Trois à cinq critères observables, au format Étant donné / Quand / Alors, qui couvrent les cas cités dans les preuves. Jamais « intuitif » ou « rapide » sans seuil."),
  complexity_points: z.enum(["1", "2", "3", "5", "8", "13"]).describe("Complexité en points relatifs, par comparaison avec les stories de référence."),
  reference_story_ids: z.array(z.number()).describe("Les identifiants des une ou deux stories de référence les plus proches."),
  complexity_rationale: z.string().describe("Pourquoi cette complexité : plus grosse que telle référence, plus petite que telle autre."),
  open_questions: z.array(z.string()).describe("Une à trois questions à trancher avec l'équipe ou les clients avant de développer."),
  evidence_feedback_ids: z.array(z.number()).describe("Les numéros des retours qui justifient la story, parmi ceux fournis (12 pour F12)."),
});
