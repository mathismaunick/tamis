# Défis rencontrés et solutions

Le journal des difficultés réelles du développement, tenu au fil de l'eau. Chaque entrée dit ce qui s'est passé, ce qu'on a fait, et ce qu'on en retient.

## Fondations

### Les modèles Claude refusés sur l'offre gratuite du Gateway

- **Constat.** Le premier appel à Claude Haiku via le Vercel AI Gateway a été refusé : l'offre gratuite ne donne accès qu'à quelques modèles (GPT-5, Gemini 2.5 Flash, Mistral embed). Les embeddings `text-embedding-3-small` étaient refusés aussi.
- **Solution.** Un script de vérification (`pnpm check:ai`) appelle le modèle de chaque tâche et le modèle d'embeddings, et vérifie la dimension des vecteurs. Il a servi à constater le blocage, puis à confirmer que tout répond après l'ajout de crédits prépayés.
- **Ce qu'on en retient.** Vérifier l'accès à chaque modèle dès la première heure, avant d'écrire du code qui en dépend.

### Vitest 5 incompatible avec Node 20.18

- **Constat.** Vitest 5 s'appuie sur Vite 8 et Rolldown, dont le module natif exige Node 20.19 ou plus. Sur le poste de développement (Node 20.18), les tests ne démarraient pas.
- **Solution.** Vitest 3.2 avec Vite 6, versions épinglées : même API pour nos tests, compatible avec Node 20.18. Pour la même raison, l'application utilise l'AI SDK 6 (le 7 exige Node 22).
- **Ce qu'on en retient.** Épingler les versions exactes, et lire les exigences de moteur avant de monter de version.

## Traitement en masse

### Un regroupement trop strict : 26 thèmes au lieu de 9

- **Constat.** Au premier essai, chaque thème était pur, mais les vraies tendances étaient coupées en morceaux : « Dépendances » en trois, « Notifications » en quatre. Le petit modèle chargé de confirmer en zone grise répondait non trop souvent. Il voyait un seul besoin du thème, et sa consigne disait que « deux besoins voisins restent séparés ».
- **Solution.** Mesurer d'abord : sur le jeu annoté, la similarité médiane entre deux besoins de la même tendance est de 0,55 ; entre tendances différentes, elle dépasse rarement 0,58. Les seuils (0,70 et 0,40) viennent de là. Puis reformuler la question comme un PO la poserait (« rangerais-tu cette demande dans ce thème du backlog ? »), avec des exemples de variantes et trois demandes du thème sous les yeux. Résultat : 12 thèmes purs, dont les 9 tendances plantées.
- **Ce qu'on en retient.** La qualité d'un regroupement se règle autant par la question posée au modèle que par les seuils. Et il faut une vérité terrain pour savoir dans quel sens corriger.

### Deux thèmes « Suivi du temps passé » au seed final

- **Constat.** Avec les modèles définitifs, le seed a produit 14 thèmes au lieu d'une dizaine, dont deux portant le même titre. Le rattachement au fil de l'eau dépend de l'ordre d'arrivée : le tout premier retour (« un chemin critique ») avait fondé son propre thème, et les demandes de dépendances arrivées ensuite ne l'ont pas rejoint, parce que le modèle ne voyait de ce thème qu'un seul besoin. Les évals mesuraient ce défaut (des thèmes en trop, corrigeables par la fusion manuelle), mais il sautait aux yeux sur le backlog.
- **Solution.** Une passe de consolidation en fin d'import : chaque petit thème touché par l'import (trois demandes au plus) est présenté au modèle avec toutes ses demandes et ses six voisins les plus proches, et le modèle désigne celui qui relève du même epic, ou aucun. Un thème sur lequel le PO a décidé n'est jamais absorbé ; chaque fusion est inscrite au journal. La première version comparait chaque petit thème à ses deux voisins seulement, un par un : elle ne fusionnait presque rien. Le vrai doublon de « Suivi du temps passé » n'arrivait qu'en troisième position par similarité, et le modèle jugeait « chemin critique » et « dépendances » comme deux besoins distincts. D'où les six voisins montrés ensemble, et un critère explicite, partagé avec la confirmation en zone grise : « une même évolution du produit, un même epic, répondrait-elle aux deux ? ». L'éval E3 mesure les thèmes en trop avant et après la consolidation.
- **Ce qu'on en retient.** Un algorithme au fil de l'eau décide avec le contexte du moment ; une seconde passe, avec tout le contexte, rattrape ses premières décisions. La similarité entre thèmes départage mal : on s'en sert pour présélectionner, et le modèle choisit. Et un défaut mesuré mais toléré finit par se voir : mieux vaut le corriger que l'expliquer.

### La frontière entre un bug et une demande

- **Constat.** Le modèle classait en bug « le rôle lecteur donne accès à tout l'espace », qui décrit une limite du produit, pas un dysfonctionnement ; et en risque de départ un client qui promettait au contraire de monter en gamme.
- **Solution.** Préciser la définition dans le prompt et dans la description des champs du schéma : un dysfonctionnement est un bug, même formulé comme un souhait ; une limite de ce qu'Orbit propose est une demande ; une promesse d'achat n'est pas un risque de départ.
- **Ce qu'on en retient.** Les descriptions des champs d'un schéma font partie du prompt : c'est là que se règlent les cas limites.

## Scoring

### Deux pré-scorings, deux classements

- **Constat.** Les modèles récents ne permettent plus de régler la température. Deux exécutions du pré-scoring sur les mêmes thèmes donnaient des Impacts différents, et le classement changeait.
- **Solution.** Une grille d'Impact concrète dans le prompt (« 2, fort : supprime un contournement coûteux et régulier »), puis trois propositions en parallèle pour chaque thème : le code garde la médiane de chaque facteur et affiche l'accord (« 2 propositions sur 3 »). La latence ne change pas ; le coût de cette étape triple, soit quelques centimes par import. L'éval E5 compare la stabilité avec une et trois propositions.
- **Ce qu'on en retient.** Sans température, la stabilité se conçoit (catégories discrètes, résultats persistés, consensus) et se mesure.

## Interface

### Une interface refaite cinq fois, jusqu'à l'écran réel du PO

- **Constat.** La première interface était un tableau plat ; la deuxième, des groupes MoSCoW et des cartes sur fond gris ; la troisième, un tableau de bord en tuiles colorées, avec l'agent dans un tiroir. Les deux premières manquaient de hiérarchie, la troisième avait l'air d'un gabarit générique, et aucune ne montrait un agent. La quatrième faisait de l'agent l'accueil : validée en maquette, elle a échoué sur un portable. Les maquettes étaient dessinées en 1 440 × 1 000 ; sur un écran utile de 1 366 × 635, le champ de l'agent tombait sous le bas de la page (« le chatbot n'apparaît pas »), et la page des besoins ne tenait pas. Une variante avec le backlog en barres et l'agent à droite a ensuite été jugée trop chargée : six informations par ligne, cinq chiffres en tête, aucune gradation.
- **Solution.** Repartir de l'énoncé et de l'écran réel. La navigation est faite des trois étapes de l'énoncé (analyser, prioriser, rédiger) ; chaque écran pose une question, montre un visuel et mène à l'étape suivante, le détail à un clic ; l'agent est un panneau fixe à droite de chaque écran, son champ toujours visible. Chaque écran est conçu et vérifié à 1 366 × 640, avec les vraies données, par capture automatique. Des mots plutôt que des chiffres (« impact moyen », « ce cycle ») ; une gradation par la taille (ce qui se fait ce cycle est grand, ce qui attend rapetisse).
- **Ce qu'on en retient.** Une interface se juge d'abord à ce qu'elle doit prouver (ici, qu'il y a un agent au service du métier du PO), puis sur l'écran de celui qui s'en sert, pas sur celui du designer. Ensuite : un écran, une question ; nommer ce qui ne va pas ; faire valider une maquette à la bonne taille avec les vraies données ; donner aux couleurs un sens.

### La démo jouée pour de vrai, la veille

- **Constat.** Tests unitaires et évals au vert, la démo jouée de bout en bout dans un navigateur (scénario de [DEMO.md](DEMO.md), version de production) a pourtant trouvé deux défauts. L'email collé dans l'agent, puis reçu en entier dans le CSV, était compté deux fois : l'empreinte ne reconnaissait que le même texte, pas un extrait. Et une fois une conversation commencée, le point à trancher de l'étape 2 disparaissait du panneau de l'agent, avec la question qui ouvre l'acte suivant.
- **Solution.** Un doublon est aussi un message contenu dans un autre du même client, d'au moins 60 caractères, au formatage près : vérifié sur tout le jeu de données, la règle ne trouve que les deux vraies paires. Le point à trancher reste affiché au-dessus du champ de l'agent tant que sa question n'a pas été posée.
- **Ce qu'on en retient.** Les tests vérifient les pièces ; seul le scénario joué en entier vérifie leur assemblage. Il se rejoue désormais sans coût de remise à zéro (`pnpm demo:restore`).

### Next.js 16 et le rendu partiel

- **Constat.** Avec les Cache Components, une lecture de la base ou de l'adresse en dehors d'une frontière `Suspense` bloque le rendu statique : le build échouait sur la navigation, qui lit l'adresse courante pour marquer le lien actif.
- **Solution.** Chaque lecture de données est dans un composant enveloppé de `Suspense`, avec un squelette ou une version sans état actif. La page s'affiche aussitôt et les données arrivent en flux.
- **Ce qu'on en retient.** Lire la documentation embarquée de la version installée plutôt que coder de mémoire : les conventions de Next.js changent d'une version majeure à l'autre.
