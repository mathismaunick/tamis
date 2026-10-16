# Tests et évals

## Le principe

- **On teste ce qui est déterministe** (le code calcule) : tests unitaires, binaires, gratuits, à chaque modification.
- **On mesure ce qui est probabiliste** (le modèle juge) : évals sur le jeu annoté, avec une métrique et une cible, lancées quand un prompt ou un modèle change.
- **On ne teste pas ce qui ne prouverait rien** : l'interface au pixel près, la base elle-même, la présence d'une phrase dans un prompt.

## Les tests unitaires (`pnpm test`)

| Fichier | Ce qu'il garantit |
|---|---|
| `tests/csv.test.ts` | Lecture tolérante : BOM, « ; », fins de ligne Windows, dates et montants à la française, erreur lisible par ligne ; les fichiers de démo se lisent sans erreur. |
| `tests/fingerprint.test.ts` | Un même message reçu par deux canaux a la même empreinte ; deux clients ou deux textes différents, non. Un email collé sans sa formule de politesse, puis reçu en entier, est reconnu ; un message court contenu dans un autre ne l'est pas. |
| `tests/grounding.test.ts` | Une citation n'est acceptée que mot pour mot (aux espaces et guillemets typographiques près) ; reformulée, inventée ou tronquée, elle est rejetée. |
| `tests/assign.test.ts` | Rattachement : seuil haut sans modèle, zone grise suivie de la réponse du modèle, nouveau thème sous le seuil bas, un thème créé devient candidat. Consolidation : seuls les petits thèmes touchés sont examinés, le modèle ne peut désigner qu'un voisin montré, les plus petits passent d'abord, une demande suit son thème de fusion en fusion. |
| `tests/scoring.test.ts` | Formule RICE et bornes, classement stable, thèmes parqués hors classement, MoSCoW rempli selon la capacité d'un cycle sans qu'un besoin moins bien classé passe devant, choix du PO conservé et compté dans la capacité. |
| `tests/decisions.test.ts` | La file « À décider » : le risque de départ en tête, une décision prise disparaît, deux facteurs à confirmer au plus, fusions et stories regroupées. |
| `tests/facets.test.ts` | Les facettes d'un thème comptent des clients distincts, pas des messages ; un retour hors du thème est écarté. |
| `tests/consensus.test.ts` | Médiane de plusieurs propositions, justification associée, accord compté, avis isolé sans effet. |
| `tests/access.test.ts` | Code d'accès : cookie valide accepté, cookie absent ou faux refusé, aucune redirection vers une autre origine. |
| `tests/rank-reason.test.ts` | La phrase « pourquoi il est à sa place » : ce qui pousse un besoin, puis ce qui le retient, calculé à partir de ses facteurs. |
| `tests/trends.test.ts` | Les tendances : la période coupée en son milieu, un besoin en hausse ou en baisse repéré, pas de tendance pour deux demandes. |
| `tests/cycles.test.ts` | Les couloirs des cycles : chaque besoin aussi large que son effort ; un couloir au-delà de la capacité (un besoin planifié par le PO) se partage la largeur sans déborder. |
| `tests/labels.test.ts` | Les dates du journal à l'heure de Paris, telles que Postgres les rend. |

## Les huit évals (`pnpm eval`)

| Éval | Question | Mesure | Cible |
|---|---|---|---|
| E1. Extraction | Les demandes attendues sont-elles trouvées, sans inventer ? | Rappel, précision, exactitude du type ; retours sans demande laissés sans demande | ≥ 0,85 ; ≥ 0,85 ; ≥ 0,90 ; tous |
| E2. Ancrage | Les citations sont-elles réelles ? | Citations ancrées ; taux de relance | 100 % (garanti par le code) ; < 10 % |
| E3. Regroupement | Les demandes vont-elles dans le bon thème ? | Pureté, tendances retrouvées, Gantt et Teams bien rattachés, pièges « solution ≠ besoin » ; thèmes en trop avant et après la consolidation | ≥ 0,80 ; ≥ 8 sur 9 ; oui ; tous |
| E4. Pré-scoring | Les propositions sont-elles plausibles ? | Corrélation de rang avec l'annotateur ; Impact à une catégorie près | ≥ 0,70 ; ≥ 80 % |
| E5. Stabilité | Deux exécutions donnent-elles le même classement ? | Corrélation moyenne entre trois exécutions, avec une et avec trois propositions | ≥ 0,90 avec la médiane |
| E6. Injection | Un retour piégé influence-t-il le système ? | Pas d'urgence élevée, pas d'Impact maximal, aucune proposition de l'agent | aucune déviation |
| E7. Stories | Les stories sont-elles bonnes ? | Grille de six critères notés de 0 à 2 par un juge d'une autre famille de modèles | moyenne ≥ 1,6 ; aucun 0 |
| E8. Agent | L'agent utilise-t-il ses outils au lieu d'inventer ? | Sept questions, dont un email collé : outils attendus, aucun chiffre absent des résultats d'outils, au moins une source citée ; pour l'email, le besoin trouvé nommé et rien d'enregistré ; pour la menace de départ, une proposition de statut créée | 7 sur 7 ; 0 chiffre non sourcé |

Les cibles sont des ambitions raisonnables sur un jeu synthétique : le rapport affiche les valeurs réelles, réussies ou non.

## Les résultats

Configuration retenue : Claude Sonnet 5.5 pour tout le traitement et les stories, Claude Opus 5.5 pour l'agent, GPT-5 pour juger les stories, `text-embedding-3-small` pour les vecteurs. Rapport : [evals/reports/2026-10-14-22h41.md](../evals/reports/2026-10-14-22h41.md) (5 minutes, 2,29 $). Toutes les cibles sont atteintes.

| Éval | Mesure | Résultat | Cible |
|---|---|---|---|
| E1 | Rappel, précision, exactitude du type | 1,00 · 1,00 · 0,99 | ≥ 0,85 · ≥ 0,85 · ≥ 0,90 |
| E1 | Retours sans demande laissés sans demande | 11 sur 11 | tous |
| E2 | Citations ancrées ; relances | 100 % ; 0 % | 100 % ; < 10 % |
| E3 | Pureté ; tendances retrouvées ; Gantt et Teams | 1,00 ; 9 sur 9 ; oui et oui | ≥ 0,80 ; ≥ 8 ; oui |
| E3 | Pièges « solution ≠ besoin » rangés avec leur besoin, tous lots | 7 sur 7 | tous |
| E3 | Thèmes en trop, avant et après la consolidation | 4 et 2 | le moins possible |
| E4 | Corrélation avec l'annotateur ; Impact à une catégorie près | 0,75 ; 100 % | ≥ 0,70 ; ≥ 80 % |
| E5 | Stabilité avec la médiane de 3 propositions ; avec une seule | 0,92 ; 0,95 | ≥ 0,90 |
| E6 | Retour piégé : urgence, Impact, propositions de l'agent | aucune déviation | aucune déviation |
| E7 | Note du juge ; critère à 0 | 1,72 sur 2 ; aucun | ≥ 1,6 ; aucun |
| E8 | Questions réussies ; chiffres non sourcés | 7 sur 7 ; 0 | 7 sur 7 ; 0 |

Ce qu'il faut lire derrière ces chiffres :

- **Extraction.** Un seul écart : une plainte vague (« plus lourd qu'avant », F68) classée bug au lieu d'« autre ».
- **Regroupement.** Les thèmes en trop restants sont des arbitrages de maille que le modèle tranche autrement que l'annotation, de façon constante et argumentée : « modèles de projet » à part des « tâches récurrentes », par exemple, parce qu'il y faudrait deux epics. Le regroupement manuel tranche en un clic. Sur cette exécution, la consolidation a ramené les thèmes en trop de 4 à 2 ; sur le seed de démonstration, elle a fusionné trois petits thèmes (14 ramenés à 11).
- **Pré-scoring.** La corrélation avec l'annotateur varie d'une passe à l'autre (0,97 à 16 h 39, 0,75 à 22 h 41) : sur une dizaine de thèmes, un ou deux échanges de rang suffisent à la faire bouger, et l'Impact reste à une catégorie près dans tous les cas. Sur un regroupement fragmenté, elle était tombée à 0,58 (rapport de 16 h 18) : chaque fragment d'une tendance est classé loin d'elle. La qualité du regroupement conditionne celle du classement.
- **Stabilité.** Sur cette exécution, une proposition unique est aussi stable que la médiane de trois : sur une dizaine de thèmes, l'écart n'est pas significatif. La médiane reste utile pour l'accord affiché à côté de chaque facteur (« 2 sur 3 »).
- **Stories.** À 22 h 33, une story a reçu 0 sur le fondement : ses critères ajoutaient des comportements que les clients ne demandaient pas (droits d'accès, seuil de 14 jours), tirés des fonctionnalités existantes. story.v2 envoie ces cas en questions ouvertes : 1,72 sans aucun 0. Le juge relève encore une couverture parfois partielle : c'est le point à relire avant de partager une story.
- **Agent.** La septième question colle un email (« un diagramme de Gantt ») : l'agent appelle `analyze_feedback`, nomme le besoin trouvé (les dépendances) et l'éval vérifie qu'aucun retour n'a été créé. Depuis agent.v5, la question sur Nexalis exige aussi une proposition de statut, réellement créée : lors de l'audit UX du 15 octobre, l'agent avait montré la fiche du besoin sans rien proposer, et l'ancienne éval ne le voyait pas. L'éval supprime à la fin les stories et propositions qu'elle a fait créer.

Dix passes ont mené à cette configuration :

1. [15 h 09](../evals/reports/2026-10-14-15h09.md), banc d'essai inclus (23 minutes, 3,16 $) : 21 cibles sur 22. La seule manquée était E8 : sur la question de comparaison (« entre la charge de l'équipe et le suivi du temps, lequel passe en premier ? »), l'agent répondait à partir du seul rang, sans lire les facteurs des deux thèmes. Correctif : la description de l'outil de comparaison dit désormais qu'un arbitrage s'appuie sur les facteurs (agent.v2). Rejouée, l'éval de l'agent passe à 6 sur 6.
2. [15 h 16](../evals/reports/2026-10-14-15h16.md), avec la configuration la plus économe du banc (4 minutes, 1,27 $) : extraction par Gemini 2.5 Flash-Lite à 0,99 · 0,99 · 0,98, mais 6 thèmes en trop avec Flash-Lite en zone grise, d'où le retour à Haiku pour la confirmation.
3. [15 h 33](../evals/reports/2026-10-14-15h33.md), avec Sonnet et Opus : toutes les cibles atteintes, 3 thèmes en trop.
4. [16 h 18](../evals/reports/2026-10-14-16h18.md), première version de la consolidation : elle ne fusionnait qu'un petit thème sur six (voir [DEFIS.md](DEFIS.md)), et E4 tombait à 0,58 sur un seed fragmenté.
5. [16 h 39](../evals/reports/2026-10-14-16h39.md), consolidation par choix parmi six voisins et critère de l'epic : toutes les cibles atteintes.
6. [22 h 33](../evals/reports/2026-10-14-22h33.md), l'agent au centre (agent.v3, dix outils, sept questions dont l'email collé) : 7 sur 7 pour l'agent, une story notée 0 sur le fondement.
7. [22 h 41](../evals/reports/2026-10-14-22h41.md), story.v2 : toutes les cibles atteintes.
8. 15 octobre, 0 h 10, l'agent dans un panneau à côté de chaque écran (agent.v4 : il sait quel écran le PO regarde). L'éval de l'agent, rejouée seule : 7 sur 7, aucun chiffre non sourcé, 0,40 $. Les autres prompts n'ont pas changé.
9. 15 octobre, midi, la menace de départ (agent.v5) : face à un client qui menace de partir, quand les preuves ne changent aucun facteur, l'agent appelle `propose_status` dans la même réponse (planifié ou parqué, avec sa raison), et l'éval l'exige. Rejouée avec la passe 10 (voir ci-dessous) : le cas de la contestation appelle `propose_status` et crée sa proposition.
10. 15 octobre, après-midi, une seule phrase quand une carte s'affiche (agent.v6) : après un email collé, l'agent écrivait six lignes qui redisaient la carte affichée juste dessous (6 → 7 clients, rien d'enregistré) et la poussaient hors de l'écran. La consigne demande désormais une seule phrase dès qu'un outil affiche sa carte (la recommandation, avec le titre du besoin et son identifiant), trois phrases au plus sinon. L'éval de l'agent, rejouée seule après la recharge des crédits, couvre les passes 9 et 10 : 7 sur 7, aucun chiffre non sourcé, 0,41 $. La question exacte de l'acte 2b de la démo (« Nexalis menace de partir sans « Notifications dans la messagerie d'équipe ». Je remonte ce besoin ? »), posée trois fois depuis l'étape 2 : trois propositions « planifié », chacune avec sa raison et sans toucher aux facteurs, 0,35 $. Tout ce qui a été créé a été supprimé.

## Le banc d'essai : un modèle par tâche

Chaque tâche passe son éval sur plusieurs modèles, au coût du catalogue du Vercel AI Gateway, mesuré sur le jeu annoté (rapport de 15 h 09).

| Tâche | Candidats (résultat) | Le plus économe qui atteint la cible |
|---|---|---|
| Extraire les demandes | Claude Haiku 5.5 (0,96 · 0,97 · 0,95, 0,022 $) ; Gemini 2.5 Flash-Lite (0,97 · 1,00 · 0,96, 0,010 $) ; GPT-5 nano (0,95 · 0,97 · 0,89, 4,5 s par retour) | Gemini 2.5 Flash-Lite. GPT-5 nano manque la cible du type et est trois fois plus lent. |
| Confirmer en zone grise | Haiku (pureté 0,99, 4 thèmes en trop, 0,021 $) ; GPT-5 nano (0,97, 3 en trop, 210 s) ; Flash-Lite (0,96, 5 à 6 en trop, 0,009 $) | Claude Haiku 5.5. Tous atteignent la cible de pureté, mais chaque thème en trop est une fusion manuelle pour le PO ; GPT-5 nano est trop lent pour un import en direct. |
| Vectoriser les besoins | text-embedding-3-small (AUC 0,866) ; Mistral embed (AUC 0,841) | text-embedding-3-small : sépare mieux les besoins et coûte cinq fois moins cher. |
| Proposer Impact, Confiance, Effort | Sonnet 5.5 (ρ 0,73, 0,29 $) ; GPT-5 (ρ 0,77, 0,36 $) ; Gemini 2.5 Pro (ρ 0,52) ; Haiku (ρ 0,35) | Claude Sonnet 5.5. Haiku coûte vingt fois moins mais classe mal : sur une tâche de jugement, payer plus cher se justifie. |
| Dialoguer avec le PO (agent) | Haiku (6 sur 6, 0,009 $, 6,9 s) ; Gemini 2.5 Pro (6 sur 6, 0,089 $, 19 s) ; Sonnet (5 sur 6, puis 6 sur 6 après le correctif, 0,16 $) ; GPT-5 (3 sur 6) | Claude Haiku 5.5 |
| Rédiger les user stories | Sonnet (1,72 sur 2, 0,092 $) ; Gemini 2.5 Pro (1,72, 0,134 $) ; GPT-5 (1,06, un critère à 0) | Claude Sonnet 5.5 : à qualité égale avec Gemini 2.5 Pro, le moins cher. |
| Juger les stories | une autre famille que le rédacteur | GPT-5, pour limiter la complaisance d'un modèle envers ses propres textes. |

### La configuration retenue : la qualité d'abord

Le banc montre qu'une configuration économe atteint déjà les cibles. La configuration retenue privilégie la marge de qualité sur chaque tâche :

| Tâche | Le plus économe | Retenu | Mesure du retenu |
|---|---|---|---|
| Extraction | Gemini 2.5 Flash-Lite | Claude Sonnet 5.5 | 1,00 · 1,00 · 0,99 |
| Confirmation en zone grise et consolidation | Claude Haiku 5.5 | Claude Sonnet 5.5 | pureté 1,00 ; 2 thèmes en trop après la consolidation, 4 avant (4 avec Haiku, 5 à 6 avec Flash-Lite, sans consolidation) |
| Synthèse | non départagé | Claude Sonnet 5.5 | références vérifiées par le code |
| Pré-scoring | Claude Sonnet 5.5 | Claude Sonnet 5.5 | ρ 0,75 à 0,97 selon la passe ; stabilité 0,92 |
| Agent | Claude Haiku 5.5 | Claude Opus 5.5 | 7 sur 7, 10 s par réponse en moyenne |
| Stories | Claude Sonnet 5.5 | Claude Sonnet 5.5 | 1,72 sur 2 (story.v2) |

Ce choix n'est pas démontré par ces évals : sur un jeu de cette taille, les modèles économes passent aussi, et les écarts de quelques centièmes ne sont pas significatifs. Il est assumé : pour un PO, une mauvaise priorisation coûte plus cher que quelques dizaines de dollars par mois, et l'agent travaille sur les conversations libres (arbitrages, contestations) que sept questions ne couvrent pas.

Le coût : 2,28 $ pour un passage complet des évals ; pour une vraie équipe (2 000 retours, 150 mises à jour de thèmes, 450 conversations et 100 stories par mois), de l'ordre de 50 $ par mois, contre une dizaine avec la configuration économe. Revenir à celle-ci ne demande que de changer les variables d'environnement (voir `.env.example`), puis de relancer `pnpm eval`.

## Ce que ces chiffres ne disent pas

Le jeu est synthétique et petit (82 retours), et chaque éval n'a tourné qu'une fois par modèle : les écarts de quelques centièmes ne sont pas significatifs. Les évals prouvent que le mécanisme fonctionne et se mesure ; le premier chantier en production serait un jeu annoté réel de quelques centaines de retours. Le juge des stories est un instrument, pas une autorité : les stories restent relues par le PO.
