# Règles audio

Synthèse des règles métier, établie le 2026-10-30. Chaque règle cite sa source dans docs/ref. Une règle sans source porte la mention **À VÉRIFIER** : elle ne doit pas être présentée comme réglementaire.

Les choix marqués **Décision** ont été validés le 2026-10-30 (ADR-009) et sont codés dans `packages/domain/src/audio-rules`. Une décision sur une règle À VÉRIFIER reste à confirmer sur le texte.

Statuts : **Confirmé** (le texte dit exactement cela), **Confirmé avec écart** (le texte nuance ou complète), **À VÉRIFIER** (absent de docs/ref, ou textes contradictoires).

## Sources

| Fichier                            | Contenu                                                      | Version                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convention-audioprothesistes.pdf` | Convention nationale, version consolidée                     | Convention du 23/03/2022 (JORF 02/07/2022) et avenant n° 1 du 04/11/2024 (JO 04/12/2024), en vigueur le 01/01/2025. Seuls ces deux textes sont opposables, pas la version consolidée (p. 1) |
| `ameli-100-sante-audio.pdf`        | Page amelipro « Aide auditive dans le cadre du 100 % Santé » | Datée du 04/10/2023                                                                                                                                                                         |
| `fr201-codes-prestation.pdf`       | Fiche d'évolution réglementaire FR 201v2 et cas de tests     | Application 01/01/2021, CDC 1.40                                                                                                                                                            |
| `modele-devis-audio.pdf`           | Annexe I, devis normalisé                                    | Fichier de 2019 ; encore rédigé avec « CMU-c » et « Dès 2020 »                                                                                                                              |
| `lpp/908/`                         | Base LPP                                                     | Version 908, actualisée au 16/10/2026                                                                                                                                                       |

Les pages citées sont celles du PDF (identiques à la numérotation imprimée pour la convention).

**Absents de docs/ref**, ce qui explique presque tous les À VÉRIFIER : le texte de la nomenclature LPP (conditions générales du titre II chapitre 3), le code de la sécurité sociale (dont l'art. R.165-24, seulement cité) et tout texte sur les contrats responsables.

## Bilan de la vérification

| Point de départ                            | Verdict             | Écart                                                                                                      |
| ------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| PLV classe I : 950 € / 1 400 €             | Confirmé avec écart | Montants exacts. La borne des 20 ans est contradictoire (R1). « TTC » n'est écrit dans aucun texte (R3)    |
| Base 400 € / 1 400 €                       | Confirmé avec écart | Montants exacts, même borne contradictoire                                                                 |
| AMO à 60 %                                 | Confirmé avec écart | Pas universel : 85 % CRPCEN, SNCF hors table sans valeur, 100 % AME (R5)                                   |
| C2S : plafond 800 € par oreille            | Confirmé avec écart | Incomplet : 1 400 € avant 20 ans ou personne sourde et aveugle. Le patient peut refuser et payer plus (R6) |
| C2S : toujours P2G/P2D                     | Confirmé            | Convention et ameli concordent (R7)                                                                        |
| Codes P1G/P1D, P2G/P2D, PIL, APA           | Confirmé avec écart | Existe aussi `SUI` pour le suivi. Les codes génériques portent `RJT` dans la LPP (R7)                      |
| Renouvellement 4 ans, même oreille         | Confirmé avec écart | Le texte part de la **délivrance**, pas de la facturation. Renouvellement anticipé possible (R8)           |
| Essai 30 à 45 jours, 2 RDV, non facturable | Confirmé avec écart | Prolongation seulement sur demande écrite du prescripteur. Embouts sur mesure facturables (R9)             |
| Prescription selon âge et médecin          | **À VÉRIFIER**      | Aucun document ne parle d'ORL, de généraliste, d'otologie ni du seuil de 6 ans (R10)                       |
| Contrat responsable : 1 700 €              | **À VÉRIFIER**      | Montant absent de tous les documents (R14)                                                                 |
| Date de référence de l'âge                 | **À VÉRIFIER**      | Non tranchée (R2)                                                                                          |
| Durée de validité de l'ordonnance          | **À VÉRIFIER**      | Non tranchée (R11)                                                                                         |
| Quotas annuels de piles                    | **À VÉRIFIER**      | Non tranchés (R15)                                                                                         |

## R1 – Tranche d'âge (`trancheAge`)

**Statut : À VÉRIFIER** (borne contradictoire entre les textes).

**Règle** : deux tranches, à 20 ans. Les textes ne s'accordent pas sur l'année des 20 ans :

| Source                                                    | Tranche basse      | Tranche haute                                |
| --------------------------------------------------------- | ------------------ | -------------------------------------------- |
| ameli p. 1                                                | Moins de 20 ans    | 20 ans et plus                               |
| LPP 908, libellés des aides auditives (2351057, 2325120…) | `<= A 20 ANS`      | `> 20 ANS`                                   |
| LPP 908, embouts (2357338, 2312927)                       | `< 20 ANS`         | `> OU = 20 ANS`                              |
| FR 201v2, tests n° 6, 7 et 9                              | « jusqu'à 20 ans » | « plus de 20 ans », « 20 ans ou plus » (APA) |

Le champ `AGE_MAX` ne tranche pas : il vaut 0 sur les aides auditives.

**Enjeu** : 1 000 € de base et 450 € de prix limite par oreille, pour un patient de 20 ans.

**Paramètres** : seuil 20 ans ; tranches `MOINS_DE_20` et `VINGT_ET_PLUS`.

**Décision** : suivre ameli (âge révolu ≥ 20 ans = `VINGT_ET_PLUS`), seule source rédigée en clair et cohérente avec les embouts. La nomenclature LPP doit confirmer.

**Cas limites** : veille des 20 ans ; jour des 20 ans ; 20 ans et 11 mois ; né un 29 février (anniversaire au 1er mars, déjà À VÉRIFIER dans `ageAt`).

## R2 – Date de référence de l'âge

**Statut : À VÉRIFIER** (aucun texte ne la fixe).

**Indices** : le tarif et les codes se lisent à la date de délivrance (ameli p. 2) ; les droits s'apprécient à la date de délivrance, définie comme la remise de l'aide auditive en situation de la facturer, à l'issue de l'essai (convention art. 27, p. 26). Les cas FR 201 ne discriminent pas : prescription, soins et facture ont la même date.

**Décision** : date de délivrance, pour toutes les règles liées à l'âge, y compris la qualité du prescripteur (R10). Au stade du devis, on utilise la date prévue et on avertit si la tranche change avant la délivrance possible (20 ans atteints pendant l'essai ou la validité du devis).

## R3 – Prix limite de vente (`plafondPrixVente`)

**Statut : Confirmé avec écart.**

**Règle** : classe I, prix inférieur ou égal au prix limite, par oreille ; tout dépassement est illégal. Classe II : prix libre.

**Source** : convention art. 25, p. 24 ; ameli p. 1 (tableau, 1er janvier 2021) ; LPP 908 `PUREGLEMEN` (950,00 sur 2351057 et 2365119, 1 400,00 sur 2325120 et 2337749, 0 en classe II).

**Paramètres** : lus dans le référentiel LPP, pas en constante. 95 000 et 140 000 centimes ; `null` en classe II.

**Écarts** :

- « TTC » n'apparaît dans aucun texte. Le devis présente HT et TTC (p. 1). Lecture retenue : le prix limite s'applique au prix TTC payé par le patient. À VÉRIFIER.
- La LPP 908 n'a de lignes pour ces codes que depuis le 07/07/2023 (arrêté du 03/07/2023), contre 2021 chez ameli. Mêmes montants, mais aucun tarif LPP n'existe avant cette date.

**Cas limites** : prix égal au plafond (accepté) ; un centime au-dessus (refusé) ; C2S (voir R6). Les accessoires et consommables sont une ligne distincte du devis (p. 1), hors comparaison.

## R4 – Base de remboursement (`baseRemboursement`)

**Statut : Confirmé avec écart** (borne de R1).

**Règle** : 400 € à partir de 20 ans, 1 400 € avant, identique en classes I et II.

**Source** : ameli p. 1 ; LPP 908 `TARIF` ; FR 201v2, tests n° 6 et 7.

**Paramètres** : lus dans le référentiel LPP, à la date de délivrance (`tarifEnVigueur`).

**Cas limite** : personne sourde et aveugle ou cécité de 20 ans et plus. Le plafond C2S passe à 1 400 € (R6) et des libellés LPP actifs d'embouts portent « < 20 ANS OU CECITE », mais aucun code d'aide auditive actif ne mentionne la cécité. Base applicable : À VÉRIFIER.

## R5 – Part AMO (`partAMO`)

**Statut : Confirmé avec écart.**

**Règle** : part AMO = base × taux, arrondie au centime.

**Source** : FR 201v2, table 4 p. 4 (60 % ; 85 % CRPCEN ; date d'effet 01/01/2021) ; tests n° 6 à 10.

**Paramètres** : taux 60 et 85 (constantes). Arrondi : 4,91 € × 60 % = 2,946 € donne 2,95 € (test n° 9), soit au centime le plus proche, ligne par ligne.

**Écarts** :

- 60 % ne vaut pas pour tous : la table exclut SNCF et CRPCEN, et ne donne pas le taux SNCF.
- AME : 100 % du tarif de responsabilité (convention art. 30, p. 28).
- ALD, maternité, accident du travail, Alsace-Moselle : aucun taux dans docs/ref. À VÉRIFIER. Le taux reste donc un paramètre fourni par l'appelant.

**Cas limites** : base impaire ; exactement ,5 centime (aucun cas dans les textes, arrondi au supérieur retenu, À VÉRIFIER).

## R6 – Bénéficiaire C2S (`plafondPrixVente`)

**Statut : Confirmé avec écart.**

**Règle** : prix maximal spécifique, quelle que soit la classe, pris en charge à 100 %.

| Situation                                      | Plafond |
| ---------------------------------------------- | ------- |
| 20 ans et plus                                 | 800 €   |
| Moins de 20 ans, ou personne sourde et aveugle | 1 400 € |

**Source** : ameli p. 2 (tableau « depuis 2021 ») ; convention art. 29 § 1 et 2, p. 27.

**Paramètres** : 80 000 et 140 000 centimes, en constantes, car la LPP n'a aucune ligne C2S.

**Écarts** :

- Le plafond n'est pas absolu : le bénéficiaire peut refuser l'offre et choisir un appareil plus cher. Il reste remboursé au prix maximal C2S et paie la différence (art. 29 § 2, ameli p. 2). Le devis doit faire apparaître ce dépassement.
- Les tests FR 201 n° 5 et 10 illustrent ce cas : 1 500 € facturés, AMO 840 €, AMC 560 €, reste 100 €.

**Décision** : option explicite `refusOffreC2S`. Sans elle, le plafond C2S s'applique. Avec elle, on revient au plafond général (950 € en classe I, art. 25 ; libre en classe II).

**Cas limites** : classe I à 20 ans et plus, plafond C2S 800 € inférieur au PLV 950 € ; AMC à 20 ans et plus (800 − 240 = 560 €), déduit, aucun cas de test ne le montre. À VÉRIFIER.

## R7 – Codes prestation (`codePrestation`)

**Statut : Confirmé avec écart.**

| Équipement          | Gauche | Droite |
| ------------------- | ------ | ------ |
| Classe I            | P1G    | P1D    |
| Classe II           | P2G    | P2D    |
| C2S, classe I ou II | P2G    | P2D    |

Piles : `PIL`. Accessoires : `APA`.

**Source** : ameli p. 2 ; FR 201v2 p. 1 ; convention art. 29 § 2, p. 27 ; LPP 908 `NAT_PREST` des codes 7xxxxxx.

**Écarts** :

- L'art. 29 vise la délivrance à un prix inférieur ou égal au maximum. Ameli écrit « quelle que soit la classe » sans condition. Lecture retenue : P2 aussi en cas de refus de l'offre (R6).
- `SUI` existe aussi : suivi, code LPP 2305927, 0,01 € (ameli p. 3 ; convention art. 20, p. 21). Hors `codePrestation`.
- Depuis le 07/07/2023, les codes génériques ont la nature `RJT`, et seuls les codes 7xxxxxx portent P1D, P1G, etc. Les tests FR 201 de 2021 facturaient encore les génériques. Le code LPP à facturer reste à confirmer (étape 11, ADR-008).

**Autre point** : une prescription est requise pour les six codes, piles et accessoires compris (FR 201v2, table 4 p. 4).

## R8 – Renouvellement (`eligibiliteRenouvellement`)

**Statut : Confirmé avec écart.**

**Règle** : prise en charge subordonnée à l'écoulement de 4 ans à compter de la précédente délivrance, pour une même oreille.

**Source** : convention art. 22 § 1, p. 22.

**Paramètres** : 4 ans ; oreille ; date de la dernière délivrance sur cette oreille.

**Écarts** :

- Le texte dit « délivrance », pas « facturation ». Les deux coïncident : « La date de facturation marque la délivrance » (devis p. 2 § 5) et art. 27, p. 26. On stocke et compare une date de délivrance.
- Renouvellement anticipé (art. 22 § 2, p. 22, renvoyant à R.165-24) : aide hors d'usage et irréparable, ne répondant plus au besoin, garantie impossible à mettre en œuvre ; prescription justifiant le besoin ; demande à la caisse ; facturation après accord, le silence de deux mois valant acceptation. Le caractère cumulatif des trois conditions est À VÉRIFIER.
- Le délai concerne la prise en charge, pas la vente.
- Notre historique ne voit que nos délivrances. Le téléservice de l'Assurance Maladie fait foi (art. 22 § 1) : un résultat « éligible » reste indicatif.

**Cas limites** : jour anniversaire (éligible le jour même, retenu, À VÉRIFIER) ; oreilles à des dates différentes ; premier appareillage (éligible) ; plusieurs délivrances (la plus récente) ; 29 février.

## R9 – Essai (`etatEssai`)

**Statut : Confirmé avec écart.**

**Règle** : durée minimale de 30 jours, deux rendez-vous au moins, aucune facturation de l'appareillage avant la fin de l'essai.

**Source** : convention art. 18 3°, p. 20 ; devis p. 2 § 3.

**Paramètres** : 30 jours ; prolongation de 15 jours au plus (45 au total) ; 2 rendez-vous.

**Écarts** :

- Prolongation sur demande écrite du prescripteur, si l'aide contribue à un ensemble de solutions thérapeutiques. Elle n'est pas à la main de l'audioprothésiste.
- « Non facturable » : le patient qui n'achète pas peut quand même se voir facturer les embouts ou coques sur mesure (devis p. 2 § 3).
- Un dépôt de garantie est possible (devis p. 2 § 3).
- En cas d'échec, nouvelle période possible avec une autre aide (devis p. 2 § 3).

**Cas limites** : le texte fixe un minimum, pas de maximum sans prolongation (essai de 38 jours sans demande écrite ?) ; décompte du jour de début (retenu : début + 30 jours, À VÉRIFIER) ; prolongation de plus de 15 jours ou sans demande écrite ; rendez-vous le jour même du début. Une alerte se déclenche 7 jours avant l'échéance : choix applicatif, pas une règle. Une prolongation sans demande écrite n'est pas retenue ; au-delà de 15 jours, elle est ramenée à 15 ; les deux cas lèvent une alerte.

## R10 – Qualité du prescripteur (`prescriptionValide`)

**Statut : À VÉRIFIER en totalité.** Aucun document ne mentionne l'ORL, le généraliste, l'otologie ni le seuil de 6 ans.

**Règle fournie, non sourcée** :

| Type               | Après 6 ans                          | À 6 ans ou moins |
| ------------------ | ------------------------------------ | ---------------- |
| Primo-appareillage | ORL ou généraliste formé en otologie | ORL              |
| Renouvellement     | Tout médecin                         | ORL              |

**Décision** : table codée, marquée `// À VÉRIFIER`, en **avertissement** et non en erreur bloquante tant que le texte n'est pas déposé. Âge en années révolues : « 6 ans ou moins » va jusqu'à la veille des 7 ans.

**Cas limites** : 6e anniversaire et 6 ans révolus (même ambiguïté qu'en R1) ; généraliste dont la formation est inconnue ; spécialité `AUTRE` de la fiche prescripteur, qui ne garantit pas un médecin (avertissement dédié en renouvellement).

## R11 – Antériorité et validité de la prescription (`prescriptionValide`)

**Statut : Confirmé pour l'antériorité. À VÉRIFIER pour la durée.**

**Règle** : prescription médicale préalable obligatoire (devis p. 1), donc antérieure ou égale au devis. Elle accompagne la facturation (art. 28, p. 26) et se conserve (art. 21, p. 21).

**Durée de validité** : aucun texte. Non contrôlée, aucune valeur inventée.

**Cas limites** : prescription datée du jour du devis (acceptée) ; datée du lendemain (refusée).

## R12 – Devis (`controleDevis`)

**Statut : Confirmé.**

**Bloquants** (règle sourcée) :

| Contrôle                                       | Source                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| Offre classe I pour chaque oreille appareillée | Convention art. 18 3°, p. 19 ; ameli p. 1 ; devis § 1.1 |
| Prix classe I ≤ prix limite                    | Convention art. 25, p. 24                               |
| Prix ≤ plafond C2S, sauf refus de l'offre      | Convention art. 29, p. 27 ; ameli p. 2                  |
| Prescription présente, antérieure au devis     | Devis p. 1                                              |
| Validité du devis d'au moins 2 mois            | Devis p. 1                                              |
| Présentation de la bobine T                    | Convention art. 18 3°, p. 19 ; devis p. 2 § 2           |
| Fiche technique jointe                         | Convention art. 18 3°, p. 20 ; devis p. 1               |
| Au moins une oreille à appareiller             | Contrôle de cohérence, pas une règle                    |

**Avertissements** :

- renouvellement avant 4 ans (la vente reste possible, sans prise en charge) ;
- tranche d'âge changeant avant la délivrance (R2) ;
- prescripteur non conforme (R10) ;
- dépassement du plafond de contrat responsable (R14) ;
- dépassement C2S à faire figurer au devis (art. 29 § 2).

**Écarts** : le devis ajoute des exigences absentes de la liste initiale : validité de 2 mois, bobine T, fiche technique, au moins 3 options parmi 8 pour l'offre 100 % santé (p. 1). Ce dernier point relève du catalogue, non modélisé.

## R13 – Ventilation (`ventilation`)

**Statut : Confirmé avec écart.**

**Règle** : `amo` selon R5 ; `amc` limitée à ce qui reste ; `resteACharge` = prix − amo − amc, jamais négatif.

**Source** : FR 201v2, tests ci-dessous.

| Test            | Prix     | Base     | Taux | AMC fournie | AMO    | AMC    | Reste  |
| --------------- | -------- | -------- | ---- | ----------- | ------ | ------ | ------ |
| n° 6, classe I  | 950,00   | 400,00   | 60   | 0           | 240,00 | 0      | 710,00 |
| n° 7, classe II | 1 500,00 | 1 400,00 | 60   | 0           | 840,00 | 0      | 660,00 |
| n° 8, piles     | 1,50     | 1,50     | 60   | 0           | 0,90   | 0      | 0,60   |
| n° 9, embout    | 4,91     | 4,91     | 60   | 0           | 2,95   | 0      | 1,96   |
| n° 10, C2S      | 1 500,00 | 1 400,00 | 60   | 560,00      | 840,00 | 560,00 | 100,00 |

Le reste n'est pas dans les tests : il est calculé. Dans ces cas de tiers payant AMO, il couvre aussi une éventuelle part complémentaire.

**Cas limites** : prix inférieur à la base (ex. classe II à 1 000 € avant 20 ans). Aucun texte. Décision : base retenue = min(prix, base), soit AMO 600 €. À VÉRIFIER. Une AMC supérieure au restant est écrêtée.

## R14 – Contrat responsable

**Statut : À VÉRIFIER.** Le montant de 1 700 € n'apparaît dans aucun document.

**Ce que les textes disent** : classe I intégralement prise en charge avec un contrat responsable (ameli p. 1 ; devis note 2 p. 1).

**Décision** : constante marquée `// À VÉRIFIER`, utilisée seulement en avertissement dans `controleDevis`.

**Cas limites** : dépend de la classe, de l'âge et de la nature du contrat : à relire sur le texte.

## R15 – Piles et quantités

**Statut : À VÉRIFIER.**

**Constat** : piles à 1,50 € la boîte de 6 (LPP 908 ; FR 201v2, test n° 8). `QTE_MAX` vaut 0 sur tous les codes de piles actifs, sans dictionnaire pour dire si 0 signifie « illimité » ou « non renseigné ». Les forfaits annuels de la base visent les implants, hors champ.

**Autre constat** : `QTE_MAX` vaut 4 pour les embouts avant 2 ans (sauf 7353204, à 0) et 2 de 2 à 20 ans ou cécité, sans période indiquée.

**Décision** : aucun quota codé.

## R16 – Règles voisines, hors fonctions de cette étape

- **AME** : tarif de responsabilité à 100 %, devis et prix limites identiques (art. 30, p. 28).
- **Suivi** : bilans aux 3e, 6e et 12e mois (devis p. 2), deux consultations annuelles recommandées ensuite (art. 19, p. 20), télétransmission `SUI` (art. 20, p. 21).
- **Droits** : appréciés à la date de délivrance (art. 27, p. 26).

## Points À VÉRIFIER

| Point                                               | Règle | Document qui trancherait                      |
| --------------------------------------------------- | ----- | --------------------------------------------- |
| Borne de 20 ans                                     | R1    | Nomenclature LPP                              |
| Date de référence de l'âge                          | R2    | Nomenclature LPP                              |
| Prix limite TTC                                     | R3    | Nomenclature LPP                              |
| Base en cas de cécité                               | R4    | Nomenclature LPP                              |
| Taux ALD, AT, maternité, SNCF, Alsace-Moselle       | R5    | Cahier des charges SESAM-Vitale ou AreaFSE    |
| Arrondi à ,5 centime                                | R5    | Cahier des charges SESAM-Vitale               |
| AMC C2S à 20 ans et plus                            | R6    | Texte C2S                                     |
| Code LPP à facturer, sens de `RJT`                  | R7    | Dictionnaire LPP ou caisse                    |
| Jour anniversaire, conditions de R.165-24           | R8    | Nomenclature LPP, code de la sécurité sociale |
| Décompte des jours d'essai, durée sans prolongation | R9    | Nomenclature LPP                              |
| Qualité du prescripteur                             | R10   | Nomenclature LPP                              |
| Validité de l'ordonnance                            | R11   | Nomenclature LPP                              |
| Prix inférieur à la base                            | R13   | Nomenclature LPP ou cahier des charges        |
| 1 700 €                                             | R14   | Texte sur les contrats responsables           |
| Quotas de piles et d'embouts, sens de `QTE_MAX`     | R15   | Nomenclature LPP, dictionnaire LPP            |
