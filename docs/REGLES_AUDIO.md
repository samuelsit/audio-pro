# Règles audio

Synthèse des règles métier, établie le 2026-10-30. Chaque règle cite sa source dans docs/ref. Une règle sans source porte la mention **À VÉRIFIER** : elle ne doit pas être présentée comme réglementaire.

Les choix marqués **Décision** ont été validés le 2026-10-30 (ADR-009) et sont codés dans `packages/domain/src/audio-rules`. Une décision sur une règle À VÉRIFIER reste à confirmer sur le texte.

Statuts : **Confirmé** (le texte dit exactement cela), **Confirmé avec écart** (le texte nuance ou complète), **À VÉRIFIER** (absent de docs/ref, ou textes contradictoires).

## Sources

| Fichier                            | Contenu                                                          | Version                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convention-audioprothesistes.pdf` | Convention nationale, version consolidée                         | Convention du 23/03/2022 (JORF 02/07/2022) et avenant n° 1 du 04/11/2024 (JO 04/12/2024), en vigueur le 01/01/2025. Seuls ces deux textes sont opposables, pas la version consolidée (p. 1) |
| `ameli-100-sante-audio.pdf`        | Page amelipro « Aide auditive dans le cadre du 100 % Santé »     | Datée du 04/10/2023                                                                                                                                                                         |
| `fr201-codes-prestation.pdf`       | Fiche d'évolution réglementaire FR 201v2 et cas de tests         | Application 01/01/2021, CDC 1.40                                                                                                                                                            |
| `modele-devis-audio.pdf`           | Annexe I, devis normalisé                                        | Fichier de 2019 ; encore rédigé avec « CMU-c » et « Dès 2020 »                                                                                                                              |
| `lpp/908/`                         | Base LPP                                                         | Version 908, actualisée au 16/10/2026                                                                                                                                                       |
| `fiscal/`                          | BOFiP : logiciels de caisse, modèle d'attestation, format du FEC | Pages enregistrées le 01/11/2026, versions du 25/03/2026 (caisse) et du 07/06/2017 (FEC). Art. 286 du CGI et A47 A-1 du LPF absents : Légifrance refuse le téléchargement                   |
| `biap-rec-02-2-en.pdf`             | BIAP, Recommandation 02/2, classification audiométrique          | Version anglaise, langue d'origine, publiée le 01/09/2026, acceptée en juillet 2026 ; retire la 02/1 bis (p. 6). Recommandation professionnelle, pas un texte opposable                     |

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
- Depuis le 07/07/2023, les codes génériques ont la nature `RJT`, et seuls les codes 7xxxxxx portent P1D, P1G, etc. Les tests FR 201 de 2021 facturaient encore les génériques. Le code LPP à facturer reste à confirmer (R21, ADR-008).

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

**Décision** (2026-10-31, ADR-011) : à l'enregistrement de la prescription, le délai s'apprécie à la première délivrance possible (jour + 30 jours d'essai, `controlePrescription`), sur chaque oreille du dossier et quel que soit son type déclaré. Un délai non écoulé est une erreur, qu'un ADMIN_CLIENT peut forcer avec un motif. La date de comparaison est À VÉRIFIER : aucun texte ne la fixe avant la délivrance réelle.

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

**Fin d'essai** (`blocagesSignature`, ADR-013) : la signature est refusée tant que l'échéance n'est pas atteinte à la date de signature et que 2 rendez-vous ne sont pas tenus, sans forçage (devis p. 2 § 3 et § 5 ; convention art. 18 3°, p. 20). Passé l'échéance, `ECHEANCE_DEPASSEE` alerte sans interdire, faute de maximum dans le texte. `RDV_INSUFFISANTS` ne se lève que 7 jours avant l'échéance : avant, un essai qui commence n'a rien d'anormal.

**Prolongation** : une seule par essai, de 1 à 15 jours, justificatif obligatoire, ce qui vaut demande écrite. N'avoir qu'une prolongation et accepter une demande après l'échéance sont des choix, À VÉRIFIER.

**Changement d'appareil** : l'essai continue et sa date de début ne bouge pas. Le devis ne prévoit une nouvelle période qu'« à l'issue » d'un échec (p. 2 § 3) ; pour un autre modèle en cours d'essai, le départ des 30 jours est À VÉRIFIER.

## R10 – Qualité du prescripteur (`prescriptionValide`)

**Statut : À VÉRIFIER en totalité.** Aucun document ne mentionne l'ORL, le généraliste, l'otologie ni le seuil de 6 ans.

**Règle fournie, non sourcée** :

| Type               | Après 6 ans                          | À 6 ans ou moins |
| ------------------ | ------------------------------------ | ---------------- |
| Primo-appareillage | ORL ou généraliste formé en otologie | ORL              |
| Renouvellement     | Tout médecin                         | ORL              |

**Décision** : table codée, marquée `// À VÉRIFIER`, en **avertissement** et non en erreur bloquante tant que le texte n'est pas déposé. Âge en années révolues : « 6 ans ou moins » va jusqu'à la veille des 7 ans. Le type s'applique oreille par oreille (ADR-011).

**RPPS** : un prescripteur sans RPPS lève l'avertissement `RPPS_PRESCRIPTEUR_MANQUANT`. Contrôle de cohérence, À VÉRIFIER : le « N° prescripteur » des cas FR 201 ressemble à un identifiant Assurance Maladie, pas à un RPPS. Le blocage éventuel se décidera à l'étape 11.

**Cas limites** : 6e anniversaire et 6 ans révolus (même ambiguïté qu'en R1) ; généraliste dont la formation est inconnue ; spécialité `AUTRE` de la fiche prescripteur, qui ne garantit pas un médecin (avertissement dédié en renouvellement).

## R11 – Antériorité et validité de la prescription (`prescriptionValide`)

**Statut : Confirmé pour l'antériorité. À VÉRIFIER pour la durée.**

**Règle** : prescription médicale préalable obligatoire (devis p. 1), donc antérieure ou égale au devis. Elle accompagne la facturation (art. 28, p. 26) et se conserve (art. 21, p. 21).

**Durée de validité** : aucun texte. Non contrôlée, aucune valeur inventée.

**À l'enregistrement** (ADR-011) : aucun devis n'existe encore. Une date future est refusée à la saisie, sans forçage possible, et la comparaison au devis reste faite à l'étape 9. Le scan est obligatoire (art. 21 et 28). La prescription doit couvrir chaque oreille du dossier : `OREILLE_NON_PRESCRITE` est un contrôle de cohérence, pas une règle. La mention de renouvellement est conservée sans effet : aucun texte ne lui en donne (À VÉRIFIER).

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

- renouvellement avant 4 ans (la vente reste possible, sans prise en charge ; le même cas est une erreur à l'enregistrement de la prescription, voir R8) ;
- tranche d'âge changeant avant la délivrance (R2) ;
- prescripteur non conforme (R10) ;
- dépassement du plafond de contrat responsable (R14) ;
- dépassement C2S à faire figurer au devis (art. 29 § 2).

**Écarts** : le devis ajoute des exigences absentes de la liste initiale : validité de 2 mois, bobine T, fiche technique, au moins 3 options parmi 8 pour l'offre 100 % santé (p. 1).

**Bloquants ajoutés à l'étape 9** (`controleDevis`, ADR-012) :

| Contrôle                                                                                    | Source                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Offre 1.1 de classe I pour chaque oreille (une classe I placée en 1.2 ne compte pas)        | Devis p. 1 § 1.1 ; convention art. 18 3°   |
| Au moins 3 options parmi 8 sur l'aide de l'offre 1.1                                        | Devis p. 1 § 1.1                           |
| Seuls des produits remboursables en 1.1 (code LPP requis)                                   | Devis p. 1, note 1                         |
| Mentions du catalogue complètes (adresse, marque, référence, canaux, connectivité, oui/non) | Devis p. 1, tableaux 1.1 et 1.2            |
| Date du précédent appareillage en renouvellement                                            | Devis p. 1, en-tête                        |
| Raison sociale et SIRET du centre (contrôle de cohérence, À VÉRIFIER)                       | Devis p. 2, identification de l'entreprise |

**Avertissement ajouté** : RCS, FINESS ou TVA intracommunautaire manquant. Une structure peut ne pas avoir de RCS : le caractère obligatoire de chaque identifiant est À VÉRIFIER.

**Signature** : à l'issue de l'essai, jamais avant (devis p. 1 et p. 2 § 5). Le devis signé est conservé (convention art. 21). Le dépassement C2S à faire figurer (art. 29 § 2) apparaît au reste à charge : le modèle n'a pas de rubrique dédiée.

**« Autre offre » facultative** : la convention dit « le cas échéant » (art. 18 3°). La rubrique 1.2 reste imprimée, vide.

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

## R17 – Traçabilité des aides auditives (`packages/domain/src/stock`)

**Statut : Confirmé avec écart.**

**Texte** : l'entreprise conserve, pendant la durée prévue par l'article L. 332-1 du Code de la sécurité sociale, notamment le bon de livraison « jusqu'à ce que la facturation soit reçue du fabricant », le numéro de série des aides délivrées et la facture du fabricant. Elle identifie rapidement les assurés détenteurs en cas de signalement de l'ANSM et assure le retour en cas de rappel de lot (art. 21, p. 21).

**Décision** : un appareil et ses mouvements ne se suppriment pas ; la référence de facture se saisit après la réception ; le mouvement garde le patient détenteur (ADR-010).

**Écart** : ce sont les références qui sont stockées, pas les pièces elles-mêmes. Aucun numéro de lot n'est stocké et aucun écran ne liste les détenteurs d'un modèle.

**Hors docs/ref** : la machine à états (ADR-010) est un choix d'organisation, pas une règle réglementaire. La consignation est un simple indicateur, aucun document n'en parle.

## R18 – TVA et prix HT (`prixHT`)

**Statut : À VÉRIFIER.** Aucun document de docs/ref ne donne de taux de TVA, alors que le devis impose les colonnes Prix HT et Prix TTC (p. 1).

**Décision** (2026-10-31, révisée le 2026-11-01, ADR-028) : les taux ne sont plus des constantes. Ils vivent dans la table globale datée `taux_tva`, par type de produit, gérée depuis la console éditeur ; un changement ajoute une ligne. La migration reprend 5,5 % pour les aides auditives et 20 % pour les piles et accessoires, valeurs choisies sans source, à faire valider par l'expert-comptable. **Aucun taux n'est posé pour l'entretien** : R18 n'en fixait pas, et une ligne d'entretien bloque la facture (`TAUX_TVA_ABSENT`) tant qu'il n'est pas saisi.

Le taux est copié sur chaque ligne de devis et de facture. La facture suit le taux en vigueur à sa date ; un écart avec le devis signé lève `TVA_DIFFERENTE_DEVIS`. Le fait générateur et la date de lecture du taux sont À VÉRIFIER.

**Règle de calcul** : le TTC est la référence, le HT s'en déduit au centime le plus proche. Seul le TTC peut atteindre exactement le prix limite.

## R19 – Garantie (`finGarantieMinimale`)

**Statut : Confirmé avec écart.**

**Règle** : garantie minimale de 4 ans assurée par le fabricant, pièces, main d'œuvre et transport.

**Source** : devis p. 2 § 4.

**Écart** : le modèle ne fixe pas le point de départ. La délivrance est retenue, À VÉRIFIER. La date de fin s'affiche à l'écran ; le PDF garde le texte officiel, sans rubrique ajoutée.

## R20 – Compte rendu au prescripteur (`rendreCompteRenduEssaiHtml`)

**Statut : Confirmé avec écart.**

**Règle** : l'entreprise remet au prescripteur un compte-rendu de la prestation délivrée.

**Source** : convention art. 18 6°, p. 20 ; devis p. 2 § 4 (« compte(s) rendu(s) de votre appareillage au médecin prescripteur et au médecin traitant »).

**Écarts** :

- Aucun texte ne fixe le contenu ni le délai du compte rendu. Le courrier reprend le déroulé de l'essai (appareils, rendez-vous, prolongation, issue) : modèle applicatif, À VÉRIFIER.
- Le devis cite aussi le médecin traitant, que le dossier ne connaît pas : seul le prescripteur est destinataire.
- Le courrier ne contient ni NIR ni montant. Il se télécharge, ou part au prescripteur par un lien sécurisé (ADR-026) ; l'envoi et les ouvertures sont tracés.

## R21 – Facture préparée (`preparerFacture`, `choisirCodeLpp`, `partAMCC2S`)

**Statut : Confirmé avec écart.**

**Règle** : une ligne par oreille, plus les piles et accessoires de l'offre retenue. Base, âge et code LPP se lisent à la date de délivrance, pas sur le devis. L'AMO reprend R5 et R13 ; le reste à charge est ce qui reste.

**Source** : convention art. 27, p. 26 (date de délivrance) ; art. 28, p. 26 (facturation, prescription jointe) ; devis p. 2 § 5 ; FR 201v2, tests n° 5 à 10.

**Code LPP** : le devis n'en porte pas pour les aides. On prend le code du modèle dont `NAT_PREST` est le code prestation et dont la base est celle de la tranche. Sinon, le code générique de la grille (8 codes), avec un avertissement : ces codes portent `RJT` (R7).

**C2S** : codes de la classe II quelle que soit la classe de l'aide (art. 29 § 2 ; test n° 5). AMC = min(prix, prix maximal C2S) − AMO, sans PEC. Piles et accessoires : pris en charge à 100 % (ameli p. 2), soit AMC = min(prix, tarif) − AMO, déduit, À VÉRIFIER.

**Écart** : les tests FR 201 de 2021 facturent les codes génériques, que la LPP 908 marque `RJT` depuis le 07/07/2023.

**Depuis l'étape 14** (ADR-028) : ces lignes se figent à la validation de la facture, datée du jour même (R27 à R29). L'encaissement arrive à l'étape 15.

## R22 – Contrôles avant facturation (`controlerFacture`, `couvertureAmoAJour`)

**Statut : Confirmé avec écart.** Une erreur bloque, un avertissement n'empêche rien. L'état se recalcule à chaque lecture.

| Erreur bloquante                                                             | Source                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Couverture AMO absente ou à confirmer                                        | Convention art. 27, p. 26 ; délai À VÉRIFIER |
| Droits non ouverts à la date de délivrance                                   | Convention art. 27, p. 26                    |
| Prescription absente, postérieure au devis, oreille non prescrite            | Devis p. 1 ; convention art. 28, p. 26       |
| Renouvellement avant 4 ans à la délivrance réelle, sauf forçage ADMIN_CLIENT | Convention art. 22 § 1, p. 22                |
| Devis non signé ou sans offre retenue                                        | Devis p. 2 § 5                               |
| Numéro de série manquant                                                     | Convention art. 21, p. 21                    |
| Ventilation incohérente                                                      | Contrôle de cohérence (R13)                  |
| Prix au-dessus du plafond à la délivrance                                    | Convention art. 25, p. 24 et art. 29, p. 27  |
| Tarif LPP indisponible à la date de délivrance                               | Contrôle de cohérence                        |
| PEC manquante ou en attente, si un tiers payant AMC est attendu              | Choix applicatif, voir R23                   |

**Avertissements** : fin de droits inconnue, prescripteur (R10), RPPS manquant, renouvellement forcé, code LPP générique, article sans tarif, AMO différente du devis signé, PEC refusée, sans justificatif ou supérieure au reste, reste à charge sur une classe I avec contrat responsable et PEC accordée (ameli p. 1).

**Couverture à jour** : `origine = VITALE` et lecture à 30 jours au plus de la délivrance, ou confirmation postérieure à la dernière modification. `origine = SAISIE` écarte une lecture : la fiche a été retouchée après la carte. Le délai de 30 jours et la confirmation manuelle ne sont dans aucun texte (choix du 2026-10-31, À VÉRIFIER).

**Écart** : la date de début des droits n'est pas stockée (ADR-007) : seule leur fin est contrôlée.

**Non contrôlé** : durée de validité de l'ordonnance (R11), contrôles comp/incomp de la LPP (aucun document ne les définit).

## R23 – Prise en charge complémentaire (`pecSaisieSchema`, `repartirAmc`)

**Statut : À VÉRIFIER.** Aucun document de docs/ref ne décrit une PEC.

**Règle retenue** : un tiers payant AMC est attendu, hors C2S, si le patient a une couverture complémentaire ou si le devis annonce une part AMC.

**Au devis** (`amcDepuisPec`, `montantPecApplicable`, ADR-025, ADR-030) : une PEC accordée, hors C2S, remplace la part AMC saisie sur un brouillon, répartie entre les postes de chaque offre au prorata du reste après AMO, plafonnée au reste. Un refus ou une expiration la remplacent par 0. Sans décision, la part estimée reste. Un devis émis reste figé ; une réponse arrivée après lui lève une alerte qui propose une nouvelle version.

| Statut               | Bloque | Part AMC                                      |
| -------------------- | ------ | --------------------------------------------- |
| Aucune PEC, attendue | Oui    | 0                                             |
| `A_DEMANDER`         | Oui    | 0                                             |
| `DEMANDEE`           | Oui    | 0                                             |
| `ACCORDEE`           | Non    | Montant accordé, réparti                      |
| `PARTIELLE`          | Non    | Montant accordé, réparti                      |
| `REFUSEE`            | Non    | 0, avertissement                              |
| `EXPIREE`            | Oui    | 0                                             |
| Accord dépassé       | Oui    | 0                                             |
| `SANS_TIERS_PAYANT`  | Non    | 0, le reste à charge couvre la part AMC (R13) |

**Demande** : montants par ligne, préremplis depuis une offre du devis (`lignesDemandeDepuisOffre`). Un accord partiel est inférieur à la demande, un accord total ne l'est pas.

**Validité** : un accord dont `validiteFin` précède la date de délivrance est expiré, par analogie avec les droits (art. 27). Aucune tâche planifiée : l'expiration se déduit à la lecture.

**Répartition** : au prorata du reste après AMO, arrondis cumulés, le dernier centime sur la dernière ligne. Un excédent n'est pas affecté et lève un avertissement. Choix applicatif, la saisie ne donnant qu'un montant par dossier.

**Justificatif** : facultatif, avertissement s'il manque sur un accord.

**Cas limite** : C2S gérée par un organisme complémentaire, aucun texte de docs/ref. Traitée comme la C2S gérée par la caisse, sans PEC.

## R24 – Perte moyenne et grade audiométrique (`perteMoyenneTonale`, `gradeAudiometrique`)

**Statut : Confirmé** pour les bornes, la formule et le grade global ; **À VÉRIFIER** pour les points listés ci-dessous. La source est une recommandation professionnelle, pas un texte opposable.

| Règle                                                                                                    | Source                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Perte moyenne : moyenne des seuils en conduction aérienne à 500, 1000, 2000, 4000 Hz, par oreille        | `biap-rec-02-2-en.pdf` p. 2, 4 |
| Pas de réponse mesurable : 120 dB HL                                                                     | `biap-rec-02-2-en.pdf` p. 2    |
| Grades : 0 < 20 ; 1 : 20–<35 ; 2 : 35–<50 ; 3 : 50–<65 ; 4 : 65–<80 ; 5 : 80–<95 ; 6 ≥ 95                | `biap-rec-02-2-en.pdf` p. 3-4  |
| Unilatérale : moyenne < 20 à la meilleure oreille, perte confirmée à l'autre                             | `biap-rec-02-2-en.pdf` p. 5    |
| Asymétrique : écart de plus de 15 dB en moyenne ou sur trois fréquences consécutives                     | `biap-rec-02-2-en.pdf` p. 5    |
| Grade global d'une perte asymétrique : (7 × meilleure oreille + 3 × moins bonne) / 10                    | `biap-rec-02-2-en.pdf` p. 5    |
| Sans appareil uniquement ; indicateur descriptif, sans effet sur l'éligibilité ou le choix d'un appareil | `biap-rec-02-2-en.pdf` p. 2-3  |

**Décisions** (2026-10-31, ADR-022) :

- Une fréquence manquante rend la moyenne non calculable : on n'estime jamais un seuil.
- Aucun arrondi avant le classement, le texte n'en prévoit pas. L'affichage est à une décimale.
- « Perte confirmée » de la définition d'une perte unilatérale : grade 1 ou plus à la moins bonne oreille.
- Hors asymétrie, la recommandation ne définit pas de grade global : seuls les grades par oreille s'affichent.
- Le grade n'alimente aucune règle de `audio-rules`.
- La 02/1 bis, retirée, n'est pas codée.

**À VÉRIFIER** :

- Intitulés français des grades : le texte lu est en anglais. Retenus : dans les limites de la normale, atteinte légère, modérée, modérée à sévère, sévère, sévère à profonde, profonde à totale.
- « Trois fréquences consécutives » : la grille n'est pas précisée. Retenu : fréquences mesurées aux deux oreilles, dans l'ordre de la grille de saisie.

## R25 – Saisies audiométriques (`audiogrammeSaisieSchema`)

**Statut : À VÉRIFIER.** Aucun document de docs/ref ne fixe ces contrôles : ils reprennent l'usage courant, comme les symboles de l'audiogramme.

Seuils entiers de −10 à 120 dB HL, par pas de 5 dB, sur la grille 125 à 8 000 Hz. Le seuil d'inconfort reste au-dessus du seuil en conduction aérienne de la même fréquence. Une conduction osseuse moins bonne que l'aérienne de plus de 10 dB avertit sans bloquer. Pourcentages d'intelligibilité de 0 à 100.

Symboles : O et X en conduction aérienne, triangle et carré si masquée, < et > en osseuse, [ et ] si masquée, flèche sans réponse, U pour l'inconfort ; droite en rouge, gauche en bleu.

## R26 – Formulaires cliniques (`MODELES_PAR_DEFAUT`, `calculerScores`)

**Statut : À VÉRIFIER.** Le modèle de devis mentionne l'analyse des antécédents, l'examen des conduits et la mesure de l'audition, de la tolérance aux sons forts et de la compréhension de la parole, sans en fixer le contenu (`modele-devis-audio.pdf` p. 2 § 4).

L'anamnèse, les questionnaires livrés et la synthèse en PDF sont des propositions, à relire par un audioprothésiste. Aucun questionnaire validé (COSI, APHAB, HHIE, IOI-HA) n'est livré : ni leur texte, ni leurs droits d'usage, ni leur cotation ne figurent dans docs/ref.

## R27 – Mentions de la facture (`controlerMentions`, `rendreFactureHtml`)

**Statut : À VÉRIFIER en grande partie.** Les mentions obligatoires d'une facture relèvent du code de commerce et du code général des impôts, absents de docs/ref.

| Mention                                                        | Source                                                                        | Effet                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| Garantie minimale de 4 ans, texte du modèle                    | `modele-devis-audio.pdf` p. 2 § 4                                             | Imprimée si la pièce a une aide |
| « La date de facturation marque la délivrance »                | Devis p. 2 § 5 ; convention art. 27, p. 26                                    | Imprimée si la pièce a une aide |
| SIRET, RCS, FINESS, TVA intracommunautaire                     | Devis p. 2, identification de l'entreprise                                    | Imprimés s'ils sont renseignés  |
| Raison sociale et SIRET                                        | Contrôle repris du devis, À VÉRIFIER                                          | Bloque                          |
| RCS, FINESS, TVA manquants ; adresse du patient manquante      | À VÉRIFIER                                                                    | Avertit                         |
| Numéro, date, vendeur, client, HT, TVA, TTC, détail des lignes | À VÉRIFIER                                                                    | Imprimés                        |
| Numéro de série                                                | Convention art. 21, p. 21 : traçabilité, pas mention de facture               | Imprimé                         |
| Code LPP, code prestation, base, parts AMO et AMC, reste       | FR 201v2, cas de tests (colonnes de la facturation) ; présentation À VÉRIFIER | Imprimés                        |

**Date** : la date de facture est le jour de la validation, non antidatable, et vaut date de délivrance (décision du 2026-11-01). Elle alimente `eligibiliteRenouvellement` (R8). Point de départ de la garantie : voir R19.

## R28 – Numérotation et chaînage (`formaterNumero`, `enchainer`, `verifierChaine`)

**Statut : Confirmé avec écart.** Le chaînage et l'absence de suppression sans trace : `fiscal/boi-tva-decla-30-10-30.html` § 130 et § 140, qui n'imposent pas de technique. La numérotation continue vient de `CLAUDE.md`.

**Règle** : numéro continu, sans trou, une série par centre, attribué à la validation, dans la transaction : un rollback le rend. Format `<PREFIXE>-000123`, sans remise à zéro annuelle. Factures et avoirs partagent la série. Une chaîne par centre lie validations, avoirs et sorties de documents (empreinte SHA-256 du maillon précédent) ; `evenement_caisse` sert aussi de journal des événements de caisse.

**À VÉRIFIER** : format, série commune aux factures et aux avoirs.

## R29 – Avoir (`calculerAvoir`)

**Statut : À VÉRIFIER.** Aucun texte de docs/ref ne traite de l'avoir. La règle « une facture validée ne se modifie pas : on émet un avoir » vient de `CLAUDE.md`.

**Règle** : un avoir, total ou partiel, reprend des lignes de sa facture sans dépasser ce qui reste à créditer. Il reçoit le numéro suivant de la série et se fige aussitôt.

**Décisions** :

- Avoir partiel : ventilation au prorata de ce qui reste sur la ligne, le reste à charge absorbant l'arrondi. Une reprise de tout le restant retombe exactement sur la facture.
- Avoir qui solde une facture de dossier = vente annulée (décision du 2026-11-01) : délivrance conservée mais annulée, hors du délai de 4 ans ; appareils `VENDU → RESERVE` ; dossier `FACTURE → A_FACTURER` ; nouveau brouillon. La confirmation de couverture est à refaire.
- Avoir partiel : purement financier.

**À arbitrer** : retour en stock des piles et accessoires (non automatique) ; abandon d'un dossier revenu en `A_FACTURER` ; retour physique d'un appareil.

## R30 – Vente directe (`controlerVenteDirecte`)

**Statut : Confirmé avec écart.**

**Règle** : une prescription est requise pour les codes PIL et APA (FR 201v2, table 4 p. 4, voir R7). La vente directe exige donc une fiche patient, et une prescription du patient ouvre le remboursement. Sans elle, tout est en reste à charge. L'entretien n'a ni code LPP ni code prestation et ne part jamais en FSE.

**À VÉRIFIER** : validité de la prescription pour cet usage (R11) ; taux AMO, repris du devis signé du dossier de la prescription, sinon taux général ; quotas de piles (R15) ; TVA de l'entretien (R18).

## R31 – Préparation de la FSE (`construireFseDraft`)

**Statut : À VÉRIFIER pour le format.** `docs/vendor/areafse` est vide : tout le contrat du port `BillingEngine` est provisoire, comme `VitaleReader`, et sera aligné à l'étape 26.

**Règle** : la FSE reprend la pièce figée, lignes codées et remboursables seulement.

**Source** : convention art. 28, p. 26 et art. 32 ; FR 201v2, tests n° 6 à 10 (prescripteur, date de prescription, code, montant, base, parts).

**Décisions** : préparation sur action explicite, après validation ; une FSE en cours ne repart pas, une FSE rejetée repart ; le contenu, qui porte le NIR, est chiffré. Sur un avoir, une FSE transmise ou acceptée lève une alerte seulement : sa correction arrive à l'étape 26. Le RPPS du prescripteur reste un avertissement (R10) ; le simulateur rejette une FSE sans RPPS pour montrer le parcours, ce n'est pas une règle.

## R32 – Chaînage de format 2 (`enchainer`)

**Statut : Confirmé avec écart.** `fiscal/boi-tva-decla-30-10-30.html` § 50 (date à la minute), § 100 et § 140 (chaînage, empreinte à clé privée). Le texte n'impose aucune technique.

**Règle** : le maillon hache aussi `horodatage`, `acteurId` et `centreId`. Les maillons de l'étape 14 restent en format 1. L'horodatage, pris sous le verrou, ne recule pas. Clôtures et archives sont signées en Ed25519, clé hors de la base.

## R33 – Corrections de caisse (`remboursementSaisieSchema`)

**Statut : Confirmé.** `fiscal/boi-tva-decla-30-10-30.html` § 90 : opérations de « plus » et de « moins ».

**Règle** : remboursement et annulation sont des lignes inverses, motif obligatoire. Une annulation reprend tout le reste, dans le mode d'origine ; un remboursement peut être partiel et dans un autre mode. Mêmes rôles qu'un avoir.

## R34 – Plafond d'encaissement (`calculerSolde`)

**Statut : À VÉRIFIER.** Choix applicatif, remplacé à l'étape 16 (voir R43).

**Règle** : on encaisse au plus ce que le patient doit (R43). Un patient qui avance la part de la caisse est une facture sans tiers payant AMO. Le solde se calcule, il n'est jamais stocké. Espèces : une session ouverte du jour est exigée, et `remis - rendu = montant`.

**À VÉRIFIER** : plafond légal des paiements en espèces, non codé.

## R35 – Acomptes (`acomptesADeduire`)

**Statut : À VÉRIFIER.** Choix applicatif.

**Règle** : un acompte se prend sur un devis `SIGNE`, au plus le TTC de l'offre retenue. À la validation, la facture du dossier reprend les acomptes nets, jamais plus que son reste à charge ; le montant est figé et imprimé. Le solde d'un dossier se lit au dossier : après un avoir total, acomptes et paiements suivent la facture suivante. Sur une vente directe, un avoir total laisse un trop-perçu à rembourser.

## R36 – TVA sur acomptes

**Statut : À VÉRIFIER.** Aucun texte de docs/ref. Exigibilité sur les acomptes et obligation d'une facture d'acompte à confirmer par l'expert-comptable.

**Règle en attendant** : les acomptes figurent à part dans les clôtures, hors des totaux par taux.

## R37 – Clôtures (`cloturerCentre`)

**Statut : Confirmé avec écart.** `fiscal/boi-tva-decla-30-10-30.html` § 170 : journalière, mensuelle et annuelle ou par exercice, cumulatives et impératives ; grand total et total perpétuel.

**Règle** : automatique chaque nuit, avec rattrapage, jamais sur la journée en cours. Une clôture couvre une plage de rangs. Le mois additionne ses jours, l'exercice ses mois. Le grand total repart à l'ouverture de l'exercice, le total perpétuel jamais.

**Écart** : le § 170 dispense les logiciels de facturation avec fonction de caisse ; la dispense n'est pas utilisée.

**À VÉRIFIER** : un jour sans opération ne produit pas de clôture.

## R38 – Archivage (`archiverCentre`)

**Statut : Confirmé avec écart.** `fiscal/boi-tva-decla-30-10-30.html` § 220 à § 250.

**Règle** : une archive par mois clôturé, JSON avec notice en français, empreinte du fichier en clair chaînée, signée. Aucune purge à cette étape.

**À VÉRIFIER** : art. 286 I 3° bis, version du 27/06/2026 : restitution « dans un format répondant aux normes établies par l'administration » ; aucune norme trouvée, texte absent de docs/ref. Transfert au CIBS, art. L. 216-48.

## R39 – Écritures comptables (`ecrituresDepuisMaillon`)

**Statut : À VÉRIFIER.** Aucun plan de comptes dans docs/ref. Valeurs par défaut à faire valider par l'expert-comptable.

**Règle** : les écritures se déduisent des maillons, donc de ce qui est chaîné. Facture : clients, AMO et AMC contre ventes et TVA ; un avoir la retourne. Encaissement : trésorerie contre clients, ou contre acomptes pour un devis. Comptes de tiers collectifs : aucune identité de patient.

## R40 – FEC (`formaterEcritures`, `descriptionFec`)

**Statut : À VÉRIFIER.** `fiscal/boi-cf-ior-60-40-20.html` donne les 18 champs (§ 80 à § 270), la première ligne (§ 10), la numérotation (§ 100), le nom par ses exemples (§ 370). Séparateur, codage, dates et virgule viennent de l'art. A47 A-1 du LPF, absent de docs/ref.

**Règle** : un fichier par SIREN et par exercice, centres de même SIREN regroupés. Il couvre les ventes et les encaissements, pas la comptabilité, ce que dit sa description.

## R41 – Journal des événements de caisse

**Statut : Confirmé avec écart.** `fiscal/boi-tva-decla-30-10-30.html` § 100 (suivi des modifications), § 240 (traçabilité de l'archivage).

**Règle** : `evenement_caisse` trace ouverture, comptage, encaissement, remboursement, annulation, duplicata, clôture, archivage, changement de paramètres avec l'avant et l'après (préfixe, comptes, identité de l'entreprise), et échec de vérification, une fois par rupture.

## R42 – Créances et échéances (`creancesDeFacture`, `echeanceAmo`, `echeanceAmc`)

**Statut : Confirmé avec écart** pour la part de la caisse, **À VÉRIFIER** pour le reste. `convention-audioprothesistes.pdf`, art. 27, p. 26 (subrogation) ; art. 35 § 3, p. 32 (« ordre de virement [...] dans un délai maximal de cinq jours ouvrés, à compter du jour de la réception de l'accusé de réception logique (ARL) positif », y compris la part AMC C2S en tiers payant intégral coordonné).

**Règle** : à la validation, une créance par part portée par un organisme, dans la même transaction. Part AMC C2S : payée par la caisse, au même délai. Part AMC hors C2S : l'organisme de la PEC.

**Échéance** : caisse, 5 jours ouvrés depuis la facture, recalculés à la FSE `ACCEPTEE`. Complémentaire, `delaiPaiementJours` du référentiel, 30 jours par défaut.

**Écarts** : l'ARL n'est pas connu avant l'étape 26, l'acceptation de la FSE en tient lieu. Le texte vise l'ordre de virement en mode sécurisé, pas la réception des fonds.

**À VÉRIFIER** : délai des complémentaires, aucun texte ; jours fériés non déduits, la convention ne définit pas « ouvré » ; échéance en B2D, papier et AME.

**Ancienneté** : comptée depuis la facture, en tranches 0-30, 31-60, 61-90 et plus de 90 jours. Choix applicatif.

## R43 – Tiers payant et solde du patient (`partPatientDeLaPiece`, `calculerSolde`)

**Statut : Confirmé avec écart.** `convention-audioprothesistes.pdf`, art. 1, p. 6 et art. 27, p. 26 (tiers payant obligatoire pour la C2S, l'AME, la maternité, l'ALD, les risques professionnels et la détention ; dispense d'avance ouverte aux autres assurés).

**Règle** : le tiers payant AMO se choisit sur le brouillon, coché par défaut, et se fige à la validation. Décoché, le patient règle la part AMO et aucune créance AMO ne naît. La part du patient vaut reste à charge net d'avoirs, plus la part AMO sans tiers payant, plus les créances passées à sa charge. On encaisse au plus ce qu'il doit ; le trop-perçu se mesure à sa part.

**Écart** : seule la C2S bloque (`TIERS_PAYANT_OBLIGATOIRE`). Les autres cas de l'art. 27 ne sont pas connus de façon fiable à la facturation : À VÉRIFIER.

## R44 – Lettrage, écarts et rejets (`verifierLettrage`, `imputerAvoir`)

**Statut : À VÉRIFIER.** Seule la définition du lettrage est dans docs/ref : `fiscal/boi-cf-ior-60-40-20.html` § 240 (« apparier deux écritures »). `convention-audioprothesistes.pdf`, art. 37, p. 33 : rapprochement des factures et des virements par référence, motifs de rejet par part.

**Lettrage** : manuel, sur une ou plusieurs créances d'un même centre, partiel ou complet. Au plus le solde de chaque créance et le reste du règlement, par part AMO et AMC. Sans effet comptable. Un délettrage est une ligne inverse.

**Écarts** : ce qu'un organisme a versé en moins passe en perte sur la créance ; ce qu'il a versé en plus reste à lettrer, ou se classe en produit sur le règlement. Motif obligatoire.

**Rejets** : la créance reste due. Trois suites : représentation (l'échéance repart), transfert au patient, abandon en perte.

**Avoir sur une créance** : dans l'ordre, solde ouvert, transfert au patient, perte, puis ce que l'organisme a déjà payé, qui devient un indu (solde négatif).

**À VÉRIFIER** : le transfert au patient laisse la facture figée, faut-il une pièce rectificative ?

## R45 – Écritures du tiers payant (`ecrituresDepuisMaillon`)

**Statut : À VÉRIFIER.** À faire valider par l'expert-comptable, comme R39.

**Règle** :

| Opération                 | Débit                   | Crédit           |
| ------------------------- | ----------------------- | ---------------- |
| Virement reçu             | 512000                  | 411100 et 411200 |
| Annulation du virement    | 411100 et 411200        | 512000           |
| Écart en perte            | 654000                  | 411100 ou 411200 |
| Écart en produit          | 411100 ou 411200        | 758000           |
| Transfert au patient      | 411000                  | 411100 ou 411200 |
| Facture sans tiers payant | 411000 pour la part AMO |                  |

Le lettrage n'écrit rien. Une contre-passation retourne l'écriture.

**À VÉRIFIER** : compte 654000, régularisation de la TVA sur une créance irrécouvrable.

## R46 – Virements d'organismes et clôtures

**Statut : À VÉRIFIER.** `fiscal/boi-tva-decla-30-10-30.html` § 40 ne range pas expressément le tiers payant.

**Règle** : règlements et régularisations sont chaînés et archivés, mais n'entrent pas dans les totaux de clôture. Le paiement reçu d'un organisme appartient-il au périmètre des « paiements reçus » ? Si oui, les clôtures devront les totaliser, ce qui serait une version majeure.

## R47 – Factures d'achat et caisse

**Statut : À VÉRIFIER.** `fiscal/boi-tva-decla-30-10-30.html` traite des opérations de caisse.

**Règle** : une facture fournisseur n'entre ni dans la chaîne ni dans le journal de caisse. Elle passe au journal d'audit et se fige à la validation. Choix fondé sur la nature de l'opération, un achat et non un paiement reçu : à confirmer par un conseil fiscal.

## R48 – Traçabilité des achats (`validerFactureFournisseur`)

**Source** : `convention-audioprothesistes.pdf` art. 21, p. 21 : le bon de livraison se conserve « jusqu'à ce que la facturation soit reçue du fabricant », et la facture du fabricant avec les autres pièces.

**Règle** : la réception garde la référence du bon de livraison, et le PDF de la facture reste au stockage chiffré. La validation écrit le numéro de facture sur les appareils rapprochés. La durée se lit à l'art. L. 332-1 CSS, À VÉRIFIER (R17).

## R49 – Facturation électronique (`PlateformeFactures`)

**Statut : À VÉRIFIER.** Aucun texte dans `docs/ref`.

**Règle** : le port recevra les factures de la plateforme agréée du client, sans adaptateur à cette étape. Si l'obligation de réception s'applique déjà à ces entreprises, les factures de fournisseurs français devraient arriver par la plateforme, et la boîte mail ne servirait plus que pour les autres. Calendrier, factures concernées et formats à cadrer avec l'expert-comptable.

## R50 – Bon de commande et données du patient (`BonCommandeVue`)

**Statut : À VÉRIFIER pour l'oreille.** Aucun texte dans `docs/ref`.

**Règle** : le bon ne porte ni identité ni donnée de santé, seulement un code interne aléatoire. L'oreille figure sur une ligne nominative, le sur-mesure ne se fabrique pas sans elle. Associée à un code, est-ce une donnée de santé ? Les précisions de fabrication (couleur, évent) restent hors du bon, faute de pouvoir exclure une donnée de santé d'un texte libre.

## R51 – Règles de gestion des achats (`deciderApprobation`, `statutSelonQuantites`, `rapprocher`, `relanceDue`, `quantiteAReapprovisionner`)

**Statut : choix de gestion**, sans texte de référence (ADR-031). Paramètres par client : `ParametresCommande`, `RegleCommande`, `SeuilStock`. Par défaut : relance à 3 jours, 2 relances, tolérance de prix nulle, approbation humaine.

## Points À VÉRIFIER

| Point                                                    | Règle | Document qui trancherait                      |
| -------------------------------------------------------- | ----- | --------------------------------------------- |
| Borne de 20 ans                                          | R1    | Nomenclature LPP                              |
| Date de référence de l'âge                               | R2    | Nomenclature LPP                              |
| Prix limite TTC                                          | R3    | Nomenclature LPP                              |
| Base en cas de cécité                                    | R4    | Nomenclature LPP                              |
| Taux ALD, AT, maternité, SNCF, Alsace-Moselle            | R5    | Cahier des charges SESAM-Vitale ou AreaFSE    |
| Arrondi à ,5 centime                                     | R5    | Cahier des charges SESAM-Vitale               |
| AMC C2S à 20 ans et plus                                 | R6    | Texte C2S                                     |
| Code LPP à facturer, sens de `RJT`                       | R7    | Dictionnaire LPP ou caisse                    |
| Jour anniversaire, conditions de R.165-24                | R8    | Nomenclature LPP, code de la sécurité sociale |
| Date de comparaison du délai avant la délivrance         | R8    | Nomenclature LPP                              |
| Décompte des jours d'essai, durée sans prolongation      | R9    | Nomenclature LPP                              |
| Plusieurs prolongations, demande après l'échéance        | R9    | Nomenclature LPP                              |
| Autre modèle en cours d'essai : les 30 jours repartent ? | R9    | Nomenclature LPP                              |
| Contenu et délai du compte rendu au prescripteur         | R20   | Nomenclature LPP                              |
| Qualité du prescripteur                                  | R10   | Nomenclature LPP                              |
| RPPS du prescripteur exigé, sens du « N° prescripteur »  | R10   | Cahier des charges SESAM-Vitale ou AreaFSE    |
| Validité de l'ordonnance                                 | R11   | Nomenclature LPP                              |
| Effet de la mention de renouvellement                    | R11   | Nomenclature LPP                              |
| Prix inférieur à la base                                 | R13   | Nomenclature LPP ou cahier des charges        |
| 1 700 €                                                  | R14   | Texte sur les contrats responsables           |
| Taux de TVA des aides, piles et accessoires              | R18   | Code général des impôts ou comptable          |
| Sens de « code de regroupement » (P1D… PIL, APA retenus) | R12   | Arrêté du devis normalisé                     |
| Identifiants d'entreprise obligatoires                   | R12   | Arrêté du devis normalisé                     |
| Point de départ de la garantie de 4 ans                  | R19   | Nomenclature LPP                              |
| Mentions « CMU-c », « Dès 2020 », « votre opticien »     | R12   | Version à jour du devis normalisé             |
| « Date de Naissance », cachée dans le modèle PDF         | R12   | Version à jour du devis normalisé             |
| Quotas de piles et d'embouts, sens de `QTE_MAX`          | R15   | Nomenclature LPP, dictionnaire LPP            |
| Part AMC C2S sur piles et accessoires                    | R21   | Texte C2S                                     |
| Délai de la lecture Vitale, confirmation manuelle        | R22   | Convention, cahier des charges SESAM-Vitale   |
| Procédure de PEC, répartition d'un montant global        | R23   | Conventions des complémentaires               |
| C2S gérée par un organisme complémentaire                | R23   | Texte C2S                                     |
| Mentions obligatoires de la facture                      | R27   | Code de commerce, CGI ou comptable            |
| TVA de l'entretien, fait générateur                      | R18   | Code général des impôts ou comptable          |
| Série commune aux factures et aux avoirs                 | R28   | Code général des impôts ou comptable          |
| Avoir partiel : ventilation, effet sur la part AMO       | R29   | Comptable, cahier des charges SESAM-Vitale    |
| Prescription et taux AMO d'une vente directe             | R30   | Nomenclature LPP, cahier des charges          |
| Contrat `BillingEngine`, champs de `FseDraft`            | R31   | Documentation AreaFSE                         |
| Correction d'une FSE après un avoir                      | R31   | Documentation AreaFSE                         |
| Plafond d'encaissement selon le tiers payant             | R34   | Comptable                                     |
| Délai de paiement des complémentaires                    | R42   | Conventions des complémentaires               |
| Jours fériés, échéance en B2D, papier et AME             | R42   | Convention, documentation AreaFSE             |
| Tiers payant obligatoire hors C2S, à la facturation      | R43   | Documentation AreaFSE                         |
| Pièce rectificative après un transfert au patient        | R44   | Code général des impôts ou comptable          |
| Limites du lettrage, ordre d'imputation d'un avoir       | R44   | Expert-comptable                              |
| Écritures du tiers payant, TVA irrécouvrable             | R45   | Expert-comptable                              |
| Virements d'organismes et paiements reçus                | R46   | Conseil fiscal                                |
| TVA sur acomptes, facture d'acompte                      | R36   | Code général des impôts ou comptable          |
| Plafond légal des espèces                                | R34   | Code monétaire et financier ou comptable      |
| Jour sans opération sans clôture                         | R37   | Conseil fiscal                                |
| Format de restitution des archives (art. 286 I 3° bis)   | R38   | Art. 286 du CGI, normes de l'administration   |
| Transfert au CIBS, référence de l'attestation            | R38   | Art. L. 216-48 du CIBS, ordonnance 2025-1247  |
| Plan de comptes et écritures d'écart                     | R39   | Expert-comptable                              |
| Format du FEC, description                               | R40   | Art. A47 A-1 du LPF, expert-comptable         |
| Durée de l'article L. 332-1 CSS                          | R17   | Code de la sécurité sociale                   |
| Factures d'achat hors chaîne de caisse                   | R47   | Conseil fiscal                                |
| Conservation des bons et factures d'achat                | R48   | Code de commerce, code de la sécurité sociale |
| Facturation électronique : calendrier, factures, formats | R49   | Expert-comptable, textes de la réforme        |
| Oreille sur le bon de commande                           | R50   | Délégué à la protection des données           |
| Format réel d'un relevé de centrale                      | R51   | Centrale d'achat                              |
| Numéro de lot à conserver                                | R17   | Vigilance ANSM                                |
| Format des numéros et codes lus à la douchette           | R17   | Étiquettes réelles des fabricants             |
| Consignation                                             | R17   | Contrats fabricants                           |
| Intitulés français des grades BIAP                       | R24   | Version française de la Rec 02/2              |
| Grille des trois fréquences consécutives                 | R24   | BIAP, commission TC 02                        |
| Pas de saisie et symboles de l'audiogramme               | R25   | Norme d'audiométrie, ISO 8253-1               |
| Contenu de l'anamnèse par défaut                         | R26   | Audioprothésiste référent                     |
| Questionnaires validés, droits d'usage et cotation       | R26   | Auteurs ou éditeurs de chaque questionnaire   |
