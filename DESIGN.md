# Système de design de Tamis

Tamis aide un Product Owner débordé par les retours clients. L'écran doit dire en cinq secondes par où commencer, ce que fait l'outil et où parler à l'agent ; puis montrer la preuve derrière chaque chiffre. Quatre interfaces ont précédé celle-ci : un tableau plat, des cartes sur fond gris, un tableau de bord en tuiles colorées, puis un accueil en conversation. Elles ont été jugées sans hiérarchie, « faites par l'IA », ou trop chargées ; la dernière cachait le champ de l'agent sous le bas d'un écran de portable. Celle-ci part des trois capacités de l'énoncé et de l'écran réel du PO.

## Les principes

1. **Trois étapes, celles de l'énoncé.** La barre de gauche est la navigation : 1 Analyser les retours clients, 2 Prioriser le backlog, 3 Rédiger les stories, puis le journal. On comprend l'outil en la lisant ; on sait toujours où on est et ce qui vient après.
2. **Un écran, une question.** Chaque étape a un titre qui est une question (« Ce que demandent vos clients », « Ce qu'on fait ce cycle », « Les stories du cycle »), un visuel, et un bouton vers l'étape suivante. Le détail est à un clic : les retours un par un, la liste complète avec les facteurs RICE, la matrice RICE.
3. **L'agent à côté de l'écran, pas à sa place.** Un panneau fixe à droite de chaque écran : il dit en une ou deux phrases ce qu'il y a à faire ici (« À faire ici »), sans répéter ce que l'écran montre déjà, propose deux questions, garde la conversation d'un écran à l'autre. Quand il montre une carte (un besoin, un classement, un retour analysé), il la commente en une seule phrase, sans redire ce qu'elle montre. Son champ reste toujours visible. Il a sa propre teinte et son avatar : il ne se fond pas dans la page.
4. **Tout tient dans un portable.** Chaque écran se conçoit et se vérifie à 1 366 × 640 : l'essentiel sans défiler, le détail en dessous.
5. **Des mots et des visuels plutôt que des chiffres.** Un point par client, des blocs aussi larges que leur effort, « impact moyen » plutôt que 1, un rang plutôt qu'un score. Un chiffre n'apparaît que s'il sert la décision.
6. **Une gradation visible.** Ce qui se fait ce cycle est grand et en indigo ; ensuite, plus tard, pas maintenant rapetissent et pâlissent. L'œil va d'abord à ce qui compte.
7. **Une couleur, un sens.** Froides pour les catégories, l'ambre pour ce qui attend une décision (l'IA hésite, une proposition attend un clic, une question reste ouverte), le rouge pour le risque de départ, la nuit pour la marque et l'agent. Jamais de couleur décorative, jamais une couleur pour deux sens.
8. **La preuve à un clic.** Chaque besoin, chaque citation, chaque retour cité par l'agent mène à sa source. Un identifiant interne (`T3`) n'est jamais montré seul.
9. **Le ton d'un outil.** Pas de capitales espacées, pas de chaînes séparées par des points médians ; des verbes sur les boutons ; les espaces insécables de la typographie française. Accessible : contraste AA, focus visible, des cibles de 24 px au moins, aucun texte sous 12 px, de 375 à 1 440 px de large sans défilement horizontal. Sur téléphone, chaque page garde 80 px libres en bas : le bouton « Demander à Tamis » ne cache rien.
10. **Un mot du métier s'explique.** Quelqu'un qui n'est pas PO doit pouvoir suivre : un « ? » à côté de chaque terme (score RICE, cycle et points, MoSCoW, story, critères d'acceptation, planning poker, formule du client) donne sa définition en une phrase, à sa première apparition sur l'écran. Les définitions sont au même endroit, dans [lib/glossary.ts](lib/glossary.ts).

## Les couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Nuit | `#1C1F5A` | Barre des étapes, avatar de l'agent, messages du PO |
| Indigo | `#3C47C8` | Action principale, liens, bordure du champ de l'agent, catégorie Must (ce cycle), « en hausse » (sur un voile indigo), toute sélection (un statut, une catégorie, la valeur d'un facteur). Le texte posé dessus est blanc |
| Bleu | `#3D9BE9` | Catégorie Should (ensuite). Le texte posé dessus est en encre |
| Vert d'eau | `#1FAF9A` | Catégorie Could (plus tard), critères d'acceptation cochés. Le texte posé dessus est en encre |
| Gris | `#B9BCCD` | Catégorie Won't (pas maintenant), et rien d'autre |
| Gris neutre | `#8A8DA6` | Un état sans enjeu, en point : une story en brouillon, le traitement automatique au journal, « peut-être déjà dans Orbit », un client bruyant, une proposition rejetée |
| Rouge | `#E5484D` | Risque de départ, en point de 8 px suivi d'un mot |
| Ambre | `#C97C0B` | Ce qui attend une décision : le facteur sur lequel l'IA hésite, une proposition de l'agent, une question à trancher avec l'équipe, un email analysé pas encore ajouté. Le grain du logo garde l'ambre clair, `#F2A33A` |
| Segments | `#1C1F5A` / `#6870DA` / `#B5BAF0` | Enterprise, Pro, Starter (la formule du client) : une gamme de nuit, du plus gros au plus petit client. Le Starter porte un contour Pro de 1,5 px |
| Agent | `#F4F5FC`, filet `#DFE2F4` | Le fond du panneau de l'agent |
| Encre | `#15162B` / `#4A4D6A` / `#6B6E8C` / `#8A8DA6` | Texte : titres, courant, légendes et signes du calcul (× ÷ =), rangs |
| Fond | `#FFFFFF`, filets `#E6E7EE` | Une surface blanche, découpée par des filets |

Le texte posé sur une couleur de catégorie (blocs des cycles, puce de catégorie, rang du calcul, bulles de la matrice) est blanc sur l'indigo (contraste 7,17) et en encre sur le bleu, le vert et le gris (5,98, 6,48 et 9,43). Le blanc n'atteint que 2,97 sur le bleu et 2,74 sur le vert, sous le minimum de 4,5.

Un point, un contour ou un signe qui porte un sens fait au moins 3 de contraste avec le blanc : l'ambre des points est foncé (3,30, contre 2,08 pour l'ambre clair), le point d'un client Starter a son contour (4,27, contre 1,87 sans), le gris neutre fait 3,26. Les signes du calcul et les numéros des critères sont en encre-3 (4,96) : l'encre-4 est réservée aux rangs.

Les jetons sont dans [app/globals.css](app/globals.css).

## La typographie

- **Schibsted Grotesk** partout, de 400 à 800.
- Les titres d'étape en 28 px ; le texte de l'agent en 14 px ; les titres des besoins en 13 à 14,5 px ; les légendes en 12 à 12,5 px. Rien sous 12 px, pas même le « ? » ni l'étiquette d'une catégorie.

## Les composants

| Composant | Rôle |
|---|---|
| Barre des étapes | Marque, produit suivi (Orbit), les trois étapes numérotées (l'étape ouverte en blanc, chacune expliquée en mots simples au survol), le journal, le PO |
| En-tête d'étape | La question en titre, une phrase qui dit ce qu'on voit, les actions à droite |
| Bascule de vue | La vue simple d'abord, le détail à un clic (« Par besoin » / « Tous les retours », « Cycles » / « Liste complète » / « Matrice RICE ») |
| Points par client | Étape 1 : chaque besoin, un point par client coloré par sa formule, « en hausse » en indigo ; la légende explique la formule et la hausse. Sous 600 px de large, le nom tient sur deux lignes et ses points passent dessous |
| Filtres des retours | « Tous les retours » : la recherche et trois listes (canal, formule, client) sur une ligne, appliquées dès qu'on change une valeur, sans bouton « Filtrer » |
| Cycles | Étape 2 : un couloir par catégorie MoSCoW, de la largeur d'un cycle ; chaque besoin est un bloc aussi large que son effort, jamais moins large que 88 px ni que le mot le plus long de son nom : le nom tient en entier, sans césure, et le couloir grandit s'il lui faut une ligne de plus ; la place libre en pointillés. Un couloir au-delà de la capacité (un besoin planifié par le PO y est toujours rangé) partage sa largeur au lieu de déborder, et l'indique (« 32 pts pour 30 »). Sous 640 px de large, chaque couloir devient une liste, un besoin par ligne avec son effort |
| Liste complète | Étape 2 : le rang, la catégorie (décidée ou suggérée, dite comme dans les cycles : « Ce cycle (Must) », « Ensuite (Should) »…), les clients et les facteurs RICE de chaque besoin ; au-dessus, la légende du point ambre (« L'IA hésite sur ce critère ») |
| Matrice RICE | Étape 2 : la valeur (clients × impact × confiance) en hauteur, l'effort en largeur, une bulle par besoin ; la clé de lecture sous le titre. Les bulles d'un même effort s'écartent côte à côte dans leur colonne, à la hauteur de leur valeur, avec un blanc d'une dizaine de pixels |
| Story | Étape 3 : la phrase « En tant que… », les critères Étant donné / Quand / Alors, les points à trancher avec l'équipe, la complexité comparée aux stories de référence. « Modifier » mène droit au formulaire, en bas de la page de la story |
| Page d'un besoin | Le pourquoi en un seul endroit : la phrase calculée, le doute de l'IA à trancher s'il y en a un, puis le calcul replié (« Voir le calcul » : clients × impact × confiance ÷ effort = rang, chaque facteur ajustable d'un clic) ; une citation par facette ; puis qui le demande, par formule, l'évolution, le journal |
| Décider | Sur la page d'un besoin : le statut, la catégorie et le regroupement. Le même geste pour le statut et la catégorie : choisir parmi des boutons, la sélection en indigo, puis donner sa raison, qui part au journal. Une phrase dit ce que change chaque statut, au survol ou au clavier |
| Panneau de l'agent | En-tête, « À faire ici » et deux questions propres à l'écran (la page d'un retour comprise), la conversation, le champ (une question, un retour collé, un CSV joint). Pendant une conversation, le point à trancher de l'écran reste affiché au-dessus du champ, avec sa question |
| Aide « ? » | La définition d'un mot du métier, en une phrase, au survol, au toucher ou au clavier ; jamais dans un lien. Un rond de 16 px dans une cible de 24 px |
| Journal | Chaque décision : ce qui a changé, la raison, qui et quand (« Par Camille, sur proposition de l'agent, 14 oct., 16 h 31 ») ; en bas, le dernier import, sa durée et le coût des modèles. La page d'un retour dit « Retour F8, réf. ML-104 », jamais un identifiant seul |
| Visuels de l'agent | Classement, tendances, besoin, comparaison, retours, compte rendu d'import, proposition, story, retour analysé |
| Étape suivante | Un bouton indigo en bas à droite de chaque étape |

## La marque

Le logo est un tamis vu de dessus : un cadre, sa grille, et un grain retenu au centre, en ambre, l'essentiel gardé parmi des dizaines de retours. Le nom s'écrit « Tamis », en Schibsted Grotesk gras.
