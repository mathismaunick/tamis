# Décisions

Les choix qui structurent Tamis, avec leur contexte, les alternatives écartées et leurs conséquences.

## 1. Un workflow pour la masse, un agent pour le dialogue

- **Contexte.** Traiter des dizaines de retours suit toujours les mêmes étapes ; dialoguer avec le PO, non.
- **Décision.** Le traitement en masse est un workflow à étapes fixes, écrit en code. L'agent sert au dialogue : analyser un retour, expliquer le classement, contester, comparer, proposer, rédiger. Les deux appellent les mêmes services.
- **Écarté.** Tout confier à un agent (il redécouvrirait les étapes à chaque fois, différemment et plus cher) ; pas d'agent du tout (le brief demande un agent, et le dialogue apporte ce qu'une table n'apporte pas : raisonner à travers les besoins, répondre à un « et si »).
- **Conséquence.** Le traitement se teste étape par étape et se mesure ; l'agent n'a que dix outils, ce qui le rend fiable.

## 2. L'AI SDK de Vercel pour les modèles et l'agent

- **Contexte.** Il faut des sorties structurées validées, une boucle d'agent, des embeddings, un affichage en direct, et plusieurs fournisseurs pour choisir un modèle par tâche.
- **Décision.** L'AI SDK 6 (`ToolLoopAgent`, `Output.object`, `embedMany`, `useChat`), avec les modèles adressés par le Vercel AI Gateway (« fournisseur/modèle »). Version 6 plutôt que 7 : la 7 exige Node 22.
- **Écarté.** Le SDK d'un seul fournisseur (incompatible avec un modèle par tâche) ; LangChain ou LangGraph (des couches d'abstraction disproportionnées pour un agent à dix outils) ; une boucle écrite à la main (on réinvente ce que la bibliothèque fournit).
- **Conséquence.** Changer de modèle, c'est changer une chaîne de caractères ; le SDK est isolé dans `lib/ai` et `lib/agent`, la logique métier n'en dépend pas.

## 3. Un modèle par tâche, mesuré, la qualité d'abord

- **Contexte.** Le volume et l'enjeu diffèrent d'une tâche à l'autre : 2 000 extractions par mois ne demandent pas le même modèle que 450 conversations avec le PO.
- **Décision.** Chaque tâche (extraction, confirmation, synthèse, pré-scoring, agent, stories, juge) a son modèle, déclaré dans `lib/ai/models.ts` et modifiable par variable d'environnement. Le banc d'essai rejoue l'éval de chaque tâche sur plusieurs modèles et montre, pour chacune, le moins cher qui atteint la cible. La configuration retenue privilégie la marge de qualité : Claude Sonnet 5.5 pour le traitement et les stories, Claude Opus 5.5 pour l'agent, GPT-5 pour juger les stories. Elle atteint toutes les cibles pour environ 50 $ par mois à l'échelle d'une équipe, contre une dizaine avec la configuration la plus économe.
- **Écarté.** Un modèle codé en dur pour tout (impossible de mesurer ou de changer une tâche sans toucher les autres) ; le moins cher partout (il passe les cibles sur ce petit jeu, mais avec moins de marge, et une erreur de priorisation coûte plus cher que la différence) ; un choix par réputation (non démontré).
- **Conséquence.** Chaque choix est mesuré (voir [EVALS.md](EVALS.md)) ; passer à la configuration économe est un changement de variables d'environnement, validé par `pnpm eval` ; le juge des stories est d'une autre famille que le rédacteur.

## 4. Regrouper par le besoin, au fil de l'eau

- **Contexte.** Les clients décrivent des solutions (« un Gantt », « des flèches entre les cartes ») ; le PO raisonne en besoins (« voir ce qui bloque »). Et les décisions du PO sont attachées aux thèmes : un thème ne doit pas changer d'identité à chaque import.
- **Décision.** Le modèle extrait le besoin sous-jacent ; c'est lui qui est vectorisé. Chaque demande rejoint le thème le plus proche, avec confirmation par le modèle en zone grise, ou crée un thème.
- **Écarté.** Les embeddings du texte brut (regroupent par vocabulaire) ; un regroupement global à chaque import (meilleur optimum, mais identifiants instables et décisions du PO perdues) ; le regroupement par le modèle seul (non mesurable, ne passe pas à l'échelle).
- **Conséquence.** Le résultat dépend de l'ordre d'arrivée. Une passe de consolidation, en fin d'import, présente chaque petit thème touché au modèle, avec toutes ses demandes et ses voisins du backlog ; le modèle désigne celui qui relève du même epic, ou aucun. L'éval E3 mesure les thèmes en trop avant et après. Le PO peut aussi fusionner deux thèmes. Un regroupement global périodique, qui conserverait les identifiants, reste l'évolution naturelle.

## 5. Le modèle propose, le code calcule

- **Contexte.** Un modèle compte mal et ne donne pas deux fois la même réponse ; les modèles récents ne permettent plus de régler la température.
- **Décision.** Le Reach (clients distincts), le score RICE, le rang et le MoSCoW sont calculés par du code testé. Le modèle propose Impact, Confiance et Effort dans des catégories discrètes, avec une justification. Il propose trois fois, et le code garde la médiane de chaque facteur.
- **Écarté.** Laisser le modèle calculer le score (non reproductible, injustifiable) ; une seule proposition (deux exécutions donnaient des classements différents).
- **Conséquence.** La stabilité se mesure (E5) ; l'accord entre propositions (« 2 sur 3 ») est affiché à côté de chaque facteur.

## 6. Compter les clients, pas les messages

- **Contexte.** Un client qui écrit onze fois la même demande ne fait pas une tendance.
- **Décision.** Reach = nombre de clients distincts ; segment et revenu mensuel sont affichés à côté, hors formule. Le risque de départ est un signal remonté, pas un multiplicateur.
- **Écarté.** Compter les messages (le piège) ; pondérer par le revenu (favorise les gros comptes et masque un besoin large ; c'est une option possible du moteur, pas le défaut).
- **Conséquence.** Le thème porté par un client bruyant reste à sa place dans le classement ; la décision commerciale se trace par un statut, avec sa raison.

## 7. L'agent propose, le PO applique

- **Contexte.** Un agent qui modifie le backlog sans demander perd la confiance du PO.
- **Décision.** Les outils de lecture s'exécutent librement ; toute modification passe par une proposition en attente (`agent_proposals`), que le PO applique ou rejette d'un clic, depuis la conversation ou depuis la page du besoin. Appliquer passe par le même service que l'édition manuelle.
- **Écarté.** Un agent en lecture seule (passif) ; un agent autonome avec annulation (contraire au métier du PO).
- **Conséquence.** Chaque décision est tracée « sur proposition de l'agent » ; même un modèle trompé ne peut pas modifier le backlog.

## 8. Rien sans preuve

- **Contexte.** Un chiffre ou une citation inventés détruisent la confiance du PO et du jury.
- **Décision.** Chaque citation est une sous-chaîne exacte du retour, vérifiée par le code ; une citation introuvable entraîne une relance, puis l'élément est écarté. Chaque phrase de synthèse cite ses retours. L'agent ne donne aucun chiffre qu'un outil ne lui a pas fourni (vérifié par l'éval E8).
- **Conséquence.** Tout chiffre et toute phrase mènent en un clic à leurs sources.

## 9. Next.js, Neon et Vercel

- **Contexte.** Une démo en ligne, que le jury peut tester, avec des vecteurs et des jointures (retour → demande → thème → story).
- **Décision.** Next.js 16 (App Router, actions serveur, routes en direct) déployé sur Vercel à Francfort ; Postgres avec pgvector chez Neon, installé par la place de marché Vercel, dans la même région. Un code d'accès protège la démo.
- **Écarté.** SQLite (pas de persistance sur Vercel) ; une base vectorielle séparée (un second stockage pour quelques centaines de vecteurs, sans jointures).
- **Conséquence.** Un seul stockage, des migrations SQL versionnées ; un import de dix retours tient dans une requête.

## 10. Des évals maison, versionnées

- **Contexte.** Il faut mesurer des sorties probabilistes sur un jeu annoté sur mesure, avec des métriques qu'on sait expliquer.
- **Décision.** Un script (`pnpm eval`) avec huit évals et un rapport Markdown daté, versionné dans le dépôt. Les tests unitaires couvrent ce qui est déterministe.
- **Écarté.** Promptfoo, Braintrust ou Langfuse : utiles en production, disproportionnés ici.
- **Conséquence.** Chaque changement de prompt ou de modèle se valide par les chiffres ; les rapports montrent l'évolution.

## 11. Trois étapes, l'agent à côté de chaque écran

- **Contexte.** L'énoncé décrit trois capacités : analyser les retours, aider à prioriser, aider à rédiger. La première interface était un tableau de bord avec l'agent dans un tiroir : on voyait une application d'analyse, pas un agent. La suivante faisait de l'agent l'accueil : sur un écran de portable, son champ tombait sous le bas de la page, l'écran passait pour un chatbot, et le backlog n'était plus qu'une page parmi d'autres.
- **Décision.** La navigation est faite des trois étapes de l'énoncé, numérotées : analyser les retours clients, prioriser le backlog, rédiger les stories. Chaque étape est un écran qui pose une question (« Ce que demandent vos clients », « Ce qu'on fait ce cycle », « Les stories du cycle »), montre un visuel et propose l'étape suivante ; le détail est à un clic (les retours un par un, la liste complète avec les facteurs RICE, la matrice RICE). L'agent est un panneau fixe à droite de chaque écran : il dit ce qu'il y a à faire sur l'écran ouvert, sans répéter ce que l'écran montre, propose deux questions, garde la conversation d'un écran à l'autre ; son champ reste visible. Chaque écran tient dans un portable de 1 366 × 640.
- **Écarté.** L'agent dans un tiroir (il passe pour une option) ; l'agent comme accueil (un chatbot de plus, le backlog relégué) ; un tableau de bord qui montre tout d'un coup (trop de chiffres au même niveau) ; des onglets par objet sans ordre (on ne sait pas par où commencer).
- **Conséquence.** On comprend l'outil en lisant la barre de gauche, et le jury voit l'agent travailler à côté de l'écran qu'il commente. Ses réponses restent des visuels dessinés par le code avec les vraies données (classement, besoin rejoint, story) : un visuel ne peut pas inventer un chiffre. Le modèle sait quel écran le PO regarde.

## 12. Analyser un retour collé, sans l'enregistrer

- **Contexte.** Le cas le plus naturel pour un PO : un email arrive, il le colle et demande « qu'est-ce que tu en fais ? ». Mais un agent qui ajoute des retours à la base change le classement sans que le PO l'ait décidé.
- **Décision.** L'outil `analyze_feedback` fait l'extraction, l'ancrage des citations et le rattachement du traitement en masse, sans rien écrire : il dit quelle demande contient le retour, quel besoin elle rejoindrait et ce que ça changerait (« 6 → 7 clients »). Le bouton « Ajouter au backlog » envoie ensuite le retour à l'import normal, et le compte rendu de l'import dit où il est allé. L'agent doit recopier le texte du client mot pour mot : le code le vérifie contre le message du PO.
- **Écarté.** Laisser l'agent importer le retour (contraire à la décision 7) ; un formulaire d'ajout séparé (le PO quitterait l'agent).
- **Conséquence.** L'analyse se mesure sans effet de bord (l'éval E8 vérifie qu'aucun retour n'est créé) ; l'ajout passe par le même chemin qu'un CSV, testé et tracé.

## 13. RICE pour classer, MoSCoW pour décider, selon la capacité

- **Contexte.** L'énoncé cite « MoSCoW, RICE, etc. ». RICE donne un ordre ; MoSCoW dit ce qu'on s'engage à livrer. Découper MoSCoW par quart du classement est arbitraire : un Must n'a de sens que s'il tient dans ce que l'équipe livre.
- **Décision.** RICE classe les besoins (le code calcule ; le modèle propose impact, confiance et effort ; le PO corrige). MoSCoW est suggéré selon la capacité de l'équipe (`CYCLE_CAPACITY`, 30 points par cycle) : dans l'ordre du classement, les Must remplissent un cycle, les Should le suivant, les Could le troisième, le reste est Won't. Un besoin qui ne tient plus ferme la catégorie : un besoin moins bien classé ne passe jamais devant lui. Le PO peut fixer la catégorie d'un besoin ; son choix est conservé et compte dans la capacité. La matrice RICE dessine le même calcul : la valeur en hauteur, l'effort en largeur, le score est la pente.
- **Écarté.** ICE (impact, confiance, facilité) : RICE sans le Reach, qui est justement ce que les retours mesurent le mieux ; WSJF : il demande le coût du retard et la criticité dans le temps, que des retours clients ne donnent pas ; Kano : il demande une enquête auprès des clients, pas des retours spontanés. Le moteur (`lib/scoring`) est du code pur : un autre framework s'y ajoute en une fonction et ses tests.
- **Conséquence.** « Ce cycle » est un engagement réaliste, et la capacité se change en une ligne. Le PO garde le dernier mot sur chaque catégorie, et l'écran dit si une catégorie est suggérée ou décidée.

## 14. Le premier regard : un nouveau venu doit suivre

- **Contexte.** Relue avec les yeux de quelqu'un qui n'est pas PO, l'interface perdait son lecteur : le jargon jamais expliqué (backlog, RICE, MoSCoW, points, story, planning poker), des signaux sans légende (Enterprise, Pro, Starter ; « 2 propositions sur 3 »), l'ambre qui voulait dire à la fois « en hausse », « l'IA hésite » et « étape passée », un agent qui répétait les chiffres de la page, et le « pourquoi » d'un rang éclaté en quatre endroits.
- **Décision.** Un « ? » à côté de chaque terme du métier, à sa première apparition sur l'écran, donne sa définition en une phrase (`lib/glossary.ts`, `components/help.tsx`, sans JavaScript ; en bas de l'écran sur téléphone). Une couleur, un sens : l'ambre ne marque plus que ce qui attend une décision (le facteur où l'IA hésite, une proposition, une question ouverte) ; « en hausse » passe en indigo. L'agent dit « À faire ici » au lieu de répéter l'écran. La page d'un besoin donne son pourquoi au même endroit : la phrase, le doute de l'IA dit en clair (« elle a proposé « moyen » 2 fois sur 3 »), puis le calcul replié. Orbit est présenté (« Produit : Orbit », « votre produit »).
- **Écarté.** Un glossaire sur une page à part (personne ne va le lire au moment où il bute sur un mot) ; une visite guidée au premier lancement (elle se ferme sans être lue, et le jury ouvre l'application plusieurs fois) ; retirer le vocabulaire du métier (le jury le parle, et l'énoncé l'emploie).
- **Conséquence.** Le vocabulaire de l'énoncé reste à l'écran, et quelqu'un qui ne le connaît pas a la définition sous la main. Les trois étapes tiennent toujours sans défiler à 1 366 × 640.

## Évolutions envisagées

- Connecteurs entrants (support, ticketing) et sortants (Jira, Linear).
- Exécution durable du traitement pour les gros volumes, API par lots, index HNSW sur les vecteurs.
- Regroupement global périodique qui conserve les identifiants, pour corriger la dépendance à l'ordre.
- Pondération temporelle du Reach, alignement avec les objectifs du trimestre, suivi après livraison.
- Anonymisation des données personnelles avant l'envoi aux modèles.
