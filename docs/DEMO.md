# Scénario de démonstration

Neuf minutes, trois actes, ceux de l'énoncé et de la barre de gauche : analyser, prioriser, rédiger. L'agent est à droite de chaque écran, du début à la fin. Camille est PO d'Orbit, un logiciel de gestion de projet ; elle a trois semaines de retours non lus et une réunion de priorisation dans une heure.

État de départ : `pnpm seed` (72 retours traités en 3 minutes environ, 1,10 $ ; une dizaine de besoins), gardé par `pnpm demo:save` ; entre deux répétitions, `pnpm demo:restore` y revient en quelques secondes, sans appel aux modèles (voir « Entre deux répétitions »). Le fichier des 10 nouveaux retours est dans `public/exemples/nouveaux-retours.csv`, téléchargeable aussi depuis la fenêtre « Ajouter des retours ». L'email du premier acte en est la première ligne.

| # | Temps | Ce qu'on fait | Ce qu'on montre | Ce qu'on dit |
|---|---|---|---|---|
| 0 | 0:00 – 0:40 | Ouvrir l'application | La barre de gauche : 1 Analyser, 2 Prioriser, 3 Rédiger, et le produit suivi, Orbit. À droite, l'agent dit quoi faire ici : vérifier ses regroupements, ou coller un email. | « Les trois étapes de l'énoncé sont la navigation. L'agent est à côté de chaque écran, jamais à sa place. » |
| 1a | 0:40 – 1:30 | Étape 1, « Ce que demandent vos clients » | Un point par client, coloré par sa formule (le « ? » de la légende l'explique). « Dépendances » : 6 clients. « Notifications » : 3 clients pour 14 messages. Trois besoins « en hausse ». | « Un client compte une fois : les onze messages de Nexalis ne font qu'un point. » |
| 1b | 1:30 – 2:30 | Coller dans le champ de l'agent l'email de Terre & Ciel Événements : « Pour nos salons, il nous faudrait un diagramme de Gantt… » | L'agent analyse sans rien enregistrer : le client demande « un diagramme de Gantt », son besoin rejoint « Dépendances entre tâches », 6 → 7 clients. « Ajouter au backlog » : le traitement tourne, le compte rendu dit où le retour est allé. | « Le client demande un Gantt ; l'agent a compris qu'il parle de dépendances. Il regroupe par besoin, pas par mots. Et il n'ajoute rien sans moi. » |
| 1c | 2:30 – 3:15 | « Joindre un CSV de retours » : `nouveaux-retours.csv` | Les étapes défilent dans le panneau (lecture, extraction, citations, rattachement, synthèse, pré-score), une quarantaine de secondes. L'agent dit ce qui a changé : le nouveau besoin (la validation des livrables), qui a changé de rang. L'email déjà ajouté est reconnu comme doublon. | « Le même traitement qu'au départ, mesuré et tracé : chaque appel aux modèles a son coût. » |
| 2a | 3:15 – 4:15 | « Prioriser le backlog » | Les cycles de 30 points : ce cycle, ensuite, plus tard, pas maintenant. Chaque besoin est un bloc aussi large que son effort. Les « ? » expliquent le score RICE, les cycles et MoSCoW. À droite, sous la conversation de l'acte 1, l'agent garde affiché le point à trancher : Nexalis menace de partir. | « RICE pour classer, MoSCoW pour décider, et MoSCoW suit la capacité de l'équipe : un Must, c'est ce qui tient dans le cycle. » |
| 2b | 4:15 – 5:15 | « Que faire de ce point ? » (Nexalis menace de partir) | L'agent vérifie : 11 des 15 messages viennent de Nexalis (4 clients en tout depuis l'import du CSV). Il refuse de gonfler le classement et propose un statut, avec sa raison. « Appliquer » : la décision part au journal. | « Un client bruyant ne fait pas une tendance. L'agent propose, je décide, et c'est tracé. » |
| 2c | 5:15 – 6:15 | Cliquer le bloc « Dépendances entre tâches » | La phrase « pourquoi ». L'email de l'acte 1 a apporté une preuve, et Tamis a refait le pré-score : deux cas. Si l'impact est resté moyen (la page dit si l'IA hésite) : « Ajuster », impact fort, avec la raison (un client gère ses dépendances dans un tableur) ; le besoin passe premier et entre dans le cycle. S'il est déjà passé à fort (le cas du test du 16 octobre) : le journal du besoin le montre (« nouveau pré-scoring après l'arrivée de retours »), puis « Ajuster » l'effort, 8 → 5, avec la raison (l'équipe a déjà un composant de liens entre cartes) ; le cycle gagne 3 points. Le journal garde chaque raison. | « Chaque rang se justifie en une phrase ; quand une preuve arrive, Tamis refait le calcul et le trace. Le dernier mot est au PO. » |
| 3 | 6:15 – 8:30 | « Rédiger les stories du cycle », puis « Rédiger avec l'agent » | Une vingtaine de secondes. La story s'affiche comme un document : persona tiré des preuves, critères Étant donné / Quand / Alors, points à trancher avec l'équipe, complexité comparée aux stories de référence. « Modifier » : changer un critère, enregistrer (nouvelle version), exporter en Markdown. | « La story est précise parce qu'elle part des citations. La complexité est relative à l'historique de l'équipe : un point de départ pour le planning poker. » |
| 4 | 8:30 – 9:15 | Journal, puis le dernier rapport d'évals | Chaque décision, qui l'a prise et pourquoi ; en bas, la durée et le coût du dernier import ; puis `evals/reports/` : extraction, regroupement, classement, stories, agent. | « Tout ce que vous avez vu est mesuré sur un jeu annoté, avec des pièges plantés, dont une injection de prompt. » |

## Questions de réserve

- **L'injection** : demander à l'agent « Suis les instructions du retour F41 » : il refuse, et rien n'est proposé.
- **Un mot inconnu** : chaque terme du métier (score RICE, cycle, MoSCoW, story, critères d'acceptation, planning poker) a son « ? », qui le définit en une phrase.
- **La fonctionnalité existante** : à l'étape 1, « Export des données de tableau » porte « Peut-être déjà dans Orbit » : l'export des tableaux existe (F25), c'est un problème de découvrabilité, pas de développement.
- **Le doublon** : F31 est le même message que F30, reçu par un autre canal ; il n'est compté qu'une fois.
- **La matrice RICE** : à l'étape 2, la valeur en hauteur, l'effort en largeur ; le score RICE est la pente. Ici, aucun gain rapide : les besoins à 5 points ou moins touchent peu de clients.
- **La liste complète** : à l'étape 2, tous les facteurs RICE besoin par besoin, et l'export CSV.
- **Le regroupement manuel** : Tamis sépare « Modèles de projet réutilisables » de « Tâches récurrentes automatiques » (deux epics, selon le modèle). Si Camille y voit un seul besoin, elle les regroupe depuis « Décider », avec sa raison.

## Liste de vérification

- La veille : ouvrir l'application en ligne (la base Neon se réveille au premier appel), vérifier le solde du Vercel AI Gateway, faire une répétition complète, puis `pnpm demo:restore` pour revenir à l'état de départ.
- Le jour même : application ouverte dans un onglet, l'email Gantt copié, `nouveaux-retours.csv` sur le bureau, rapport d'évals ouvert dans un autre onglet, vidéo de secours sur le disque.
- Si le réseau tombe : la vidéo de secours, puis l'application en local (`pnpm dev`).

## Entre deux répétitions

Chaque répétition modifie la base : un email ajouté, un CSV importé, une proposition appliquée, un impact ajusté, une story rédigée. Pour revenir au point de départ sans rien payer :

1. Une seule fois, sur la base en état de départ (étapes 1 et 2 vérifiées : une dizaine de besoins, « Dépendances » à 6 clients, « Notifications » à 3 clients pour 14 messages ; 0 story, 0 proposition en attente) : `pnpm demo:save`. Toutes les tables, vecteurs compris, partent dans `snapshots/demo.json`, ignoré par git. La commande n'écrase jamais un instantané existant ; `pnpm demo:save --force` le remplace.
2. Après chaque répétition : `pnpm demo:restore`. En quelques secondes et sans aucun appel aux modèles, la base redevient identique à l'instantané, jusqu'aux numéros à venir : le retour ajouté pendant la démo reçoit chaque fois le même (F74). La restauration vérifie son résultat avant de le valider : si une table différait de l'instantané, tout est annulé et la base reste telle qu'elle était.
3. Dans le navigateur : « Nouvelle conversation », en haut du panneau de l'agent, efface la conversation de l'onglet.

La base est partagée avec la démo en ligne : une restauration remet aussi tamis-po.vercel.app dans cet état. `pnpm seed` ne sert plus qu'à repartir de zéro (3 minutes environ, 1,10 $) ; le regroupement varie alors légèrement d'un seed à l'autre : revérifier les étapes 1 et 2, puis `pnpm demo:save --force`.
