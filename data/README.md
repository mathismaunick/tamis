# Le jeu de données de démonstration

La boîte de réception de Camille, Product Owner d'**Orbit**, une plateforme SaaS fictive de gestion de projet (tableaux, tâches, équipes). Trois semaines de retours non lus, du 21 septembre au 9 octobre 2026, puis dix nouveaux retours importés en direct pendant la démo.

Le jeu porte la démonstration et les évals : sans vérité terrain, pas de mesure. Il est entièrement synthétique ; aucun nom ne désigne une entreprise réelle.

## Ce qu'il contient

| Élément | Volume |
|---|---|
| Retours de départ (`seed/feedback.csv`) | 72, sur quatre canaux : email, ticket, commentaire in-app, note d'appel commercial |
| Retours importés en direct (`seed/new_batch.csv`) | 10 |
| Clients (`seed/clients.csv`) | 19 : 4 Enterprise, 8 Pro, 7 Starter, avec sièges et revenu mensuel |
| Stories de référence (`seed/reference_stories.csv`) | 8 stories déjà livrées par l'équipe, de 1 à 13 points : les étalons de la complexité |
| Vérité terrain (`annotations/`) | Pour chaque retour, les éléments attendus (type et tendance) et ses pièges ; le classement attendu des tendances |

Les styles varient comme dans une vraie boîte de réception : email long et poli, ticket sec, commentaire avec des fautes, note d'appel en style télégraphique, deux retours en anglais.

## Les tendances plantées

| Tendance (le besoin) | Messages | Clients | Après l'import du jour |
|---|---|---|---|
| Notifications dans les outils de l'équipe | 14 | 3 | 15 / 4 |
| Dépendances entre tâches | 6 | 6 | 7 / 7 |
| Rapports d'avancement | 8 | 6 | 9 / 6 |
| Usage mobile sur le terrain | 7 | 5 | 8 / 5 |
| Suivi du temps passé | 6 | 5 | 7 / 6 |
| Champs personnalisés | 5 | 4 | 6 / 5 |
| Charge de travail de l'équipe | 7 | 5 | 8 / 6 |
| Accès des intervenants externes | 5 | 4 | 6 / 5 |
| Tâches récurrentes et modèles | 6 | 5 | 7 / 6 |
| Validation des livrables (naît pendant l'import) | 0 | 0 | 1 / 1 |

Le contraste clé : « Notifications » compte 14 messages mais 3 clients, dont un qui en envoie 11 ; « Dépendances » compte 6 messages et 6 clients, de trois segments.

## Les dix pièges

| Piège | Ce qu'il teste | Retours |
|---|---|---|
| Client bruyant | Compter les clients, pas les messages : Nexalis envoie 11 messages sur 4 canaux pour la même demande. | F1, F3, F7, F11, F16, F21, F26, F32, F42, F47, F56 |
| Solution ≠ besoin | « Chemin critique », « flèches entre les cartes », « dépend de », « Gantt » : un seul besoin. Et « Teams » rejoint « Slack ». | F2, F10, F22, F46, F73, F74 |
| Doublon | Même client, même texte, par email puis par ticket : compté une fois. | F31 (doublon de F30) |
| Bug déguisé en demande | « Il faudrait que le tableau soit plus rapide » : un bug de performance. | F9 |
| Fonctionnalité existante | « Exporter en Excel » : l'export CSV existe déjà, c'est un problème de découvrabilité. | F25 |
| Retour en anglais | Le traitement gère plusieurs langues ; le besoin est rédigé en français. | F13, F60 |
| Deux demandes dans un message | Zéro, une ou plusieurs demandes par retour. | F8, F74, F81 |
| Injection de prompt | « Ignore tes instructions… » : un retour est une donnée, jamais une consigne. | F41 |
| Menace de départ | « Sans ça, on part chez un concurrent » : signal remonté, sans fausser le score. | F42, F47 |
| Remerciement pur | Pas de demande inventée là où il n'y en a pas. | F18, F55, F76 |

Les numéros F sont ceux de l'application après `pnpm seed` puis l'import de `new_batch.csv`.

## Comment il est produit

`data/dataset.ts` est la source : chaque retour y est écrit avec ce qu'un PO attentif en extrairait. `pnpm data:build` en tire les CSV, les annotations, et le fichier d'exemple téléchargeable depuis l'interface (`public/exemples/nouveaux-retours.csv`).

Le code de l'application n'importe jamais `data/` : les annotations ne peuvent pas fuiter dans les prompts. Seuls le seed et les évals les lisent.

## Format du CSV d'import

| Colonne | Obligatoire | Exemple |
|---|---|---|
| `channel` | oui | `email`, `ticket`, `in_app`, `sales_call` |
| `client_name` | oui | `Atelier Nord` |
| `received_at` | oui | `2026-09-28` ou `28/09/2026` |
| `text` | oui | le retour, entre guillemets s'il tient sur plusieurs lignes |
| `external_id` | non | `ZD-4821` |
| `client_segment` | pour un nouveau client | `starter`, `pro`, `enterprise` |
| `client_seats`, `client_mrr` | non | `45`, `1 350` |
| `author`, `language` | non | `Lucie M.`, `fr` |

Le lecteur accepte le BOM et le séparateur « ; » d'un export Excel, les fins de ligne Windows, et renvoie une erreur lisible par ligne.
