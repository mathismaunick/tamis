/**
 * Ce que le PO sait du produit : ce qu'Orbit fait déjà. Le traitement s'en sert pour repérer une demande
 * déjà satisfaite (un problème de découvrabilité, pas de développement).
 */
export const PRODUCT = {
  name: "Orbit",
  description: "une plateforme SaaS de gestion de projet (tableaux, tâches, équipes) pour des PME et des grands comptes",
  existingFeatures: [
    "tableaux kanban avec cartes et colonnes",
    "sous-tâches dans une carte",
    "étiquettes de couleur et filtre par étiquette",
    "mentions @ dans les commentaires",
    "vue calendrier des échéances",
    "récapitulatif quotidien par email",
    "synchronisation avec Google Agenda",
    "export CSV d'un tableau, depuis le menu du tableau (s'ouvre dans Excel)",
    "rôles par projet : administrateur, membre, lecteur",
  ],
};
