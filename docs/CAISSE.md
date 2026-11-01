# Caisse : conformité aux conditions d'inaltérabilité, de sécurisation, de conservation et d'archivage

Ce document décrit comment AudioGest remplit chaque condition, avec le mécanisme, le code et le test qui le prouvent. Il sert de base à l'attestation individuelle de l'éditeur. **Il n'est pas une attestation** : voir « Avant la première attestation ».

État au 2026-11-01, version de la fonction de caisse `1.0` (`VERSION_CAISSE`, [cloture.ts](../packages/domain/src/caisse/cloture.ts)).

## Sources

| Document                                                                                                              | Version    | Dans le dépôt                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| BOI-TVA-DECLA-30-10-30                                                                                                | 25/03/2026 | `docs/ref/fiscal/boi-tva-decla-30-10-30.html`                                               |
| BOI-LETTRE-000242, modèle d'attestation                                                                               | 25/03/2026 | `docs/ref/fiscal/boi-lettre-000242.html`                                                    |
| Rétablissement de l'attestation, loi 2026-103 art. 125                                                                | 25/03/2026 | `docs/ref/fiscal/actu-2026-00073.html`                                                      |
| BOI-CF-IOR-60-40-20, format du FEC                                                                                    | 07/06/2017 | `docs/ref/fiscal/boi-cf-ior-60-40-20.html`                                                  |
| Art. 286 I 3° bis du CGI, version du 27/06/2026 ; loi 2026-534 art. 87 ; art. L. 216-48 du CIBS ; art. A47 A-1 du LPF |            | **Absents** : Légifrance refuse le téléchargement. Lus en ligne le 01/11/2026, sauf le CIBS |

Les paragraphes (§) ci-dessous sont ceux du BOI-TVA-DECLA-30-10-30.

## Périmètre

- **Fonction de caisse couverte** : encaissements, remboursements, annulations, sessions et comptages de caisse, clôtures, archives, et les factures et avoirs auxquels ces règlements se rattachent (§ 30, § 40, § 50).
- **Hors fonction de caisse** (§ 40) : dossier patient, agenda, stock, FSE, tiers payant.
- **Logiciel en ligne** : l'obligation s'applique aussi (§ 30). AudioGest est un SaaS, mutualisé entre clients, avec isolation par ligne.
- **Une caisse par centre** : le centre tient lieu de numéro de caisse (§ 50). Une chaîne, une série et un jeu de clôtures par centre.
- **Allègement non utilisé** : le § 170 dispense de clôtures un logiciel de facturation avec fonction de caisse. Le logiciel les réalise quand même.

## Inaltérabilité

| Exigence                                                             | Mécanisme                                                                                                                          | Code                                                                                                                                         | Preuve                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Enregistrer toutes les données d'origine des règlements (§ 50, § 75) | Numéro de pièce, date, total TTC, lignes avec taux de TVA, mode de règlement, traces de correction                                 | `encaissement`, `facture`, `ligne_facture`, `evenement_caisse`                                                                               | `caisse.int.test.ts`                                   |
| Date à la minute (§ 50)                                              | Horodatage pris sous le verrou de chaîne, non décroissant, haché dans le maillon de format 2                                       | [chaine.ts](../packages/caisse/src/chaine.ts)                                                                                                | « détecte un horodatage ou un acteur modifié »         |
| Corrections par « plus » et « moins » (§ 90)                         | Remboursement et annulation sont des lignes inverses qui pointent vers l'origine. Une facture validée se corrige par un avoir      | [encaissements.ts](../apps/web/server/services/encaissements.ts)                                                                             | « rembourse par une opération inverse »                |
| Inaltérabilité logique (§ 100)                                       | Aucune fonction ne modifie une donnée figée. Triggers d'ajout seul, et droits `SELECT, INSERT` seulement pour le rôle applicatif   | migrations `20261108090000_facture` et `20261109090000_caisse`                                                                               | « refuse toute modification, même au propriétaire »    |
| Inaltérabilité de bas niveau (§ 100, § 140)                          | Chaînage SHA-256 de tous les événements du centre, plus signature Ed25519 des clôtures et des archives par une clé hors de la base | [chaine.ts du domaine](../packages/domain/src/facture/chaine.ts), [signature-caisse.ts](../packages/adapters/src/crypto/signature-caisse.ts) | « un recalcul complet sans la clé casse la signature » |
| Détecter et démontrer un contournement (§ 100)                       | Vérification complète, à la demande, chaque nuit et en ligne de commande. Tout échec est inscrit au journal                        | [verification.ts](../packages/caisse/src/verification.ts)                                                                                    | Tests d'altération en base                             |
| Suivi des modifications (§ 100)                                      | `evenement_caisse` trace aussi duplicata, annulation, paramètres, échec de vérification et archivage                               | [chaine.ts du domaine](../packages/domain/src/facture/chaine.ts)                                                                             | « trace les changements de paramètres »                |
| Garantie dans le temps (§ 120)                                       | Formats de hachage versionnés : les maillons de l'étape 14 restent vérifiés en format 1. Un vecteur de test fige le format 2       | [chaine.test.ts](../packages/domain/src/facture/chaine.test.ts)                                                                              | « fige son format canonique »                          |

**Ce que hache un maillon de format 2** : `acteurId`, `centreId`, `charge`, `empreintePrecedente`, `format`, `horodatage`, `rang`, `type`, en JSON à clés triées. Revenir au format 1 change l'empreinte, donc se détecte.

**Série** : « sa série » désigne la chaîne du centre, toutes natures mêlées (ADR-028). Le texte n'impose pas de technique (§ 60, § 140). Chaque facture, avoir, encaissement et clôture a son maillon, qui porte l'empreinte du précédent ; la ligne garde `rang` et `empreinte`.

## Sécurisation

| Exigence                                                 | Mécanisme                                                                                                                                                                                               | Code                                                      | Preuve                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Empêcher suppression ou modification sans trace (§ 130)  | Triggers d'ajout seul ; la tête de chaîne n'avance que d'un rang, vers un maillon existant ; la série ne recule pas                                                                                     | migration `20261109090000_caisse`                         | « refuse une tête de chaîne qui recule ou qui saute » |
| Procédé technique fiable (§ 140)                         | Vérification : suite des empreintes, recalcul de chaque pièce, encaissement, session, comptage, clôture et archive depuis la base, signatures, tête, lignes sans maillon, continuité de la numérotation | [verification.ts](../packages/caisse/src/verification.ts) | Tests d'altération en base                            |
| Données permettant de produire les justificatifs (§ 130) | Lignes figées par `ligne_facture_figee`, instantanés du vendeur et du client, PDF d'origine dans le stockage                                                                                            | `facturation.ts`                                          | `facturation.int.test.ts`                             |
| Mode école ou test (§ 150)                               | Le logiciel n'a pas de mode école. Les données de démonstration sont fictives et hors production                                                                                                        | seed                                                      | sans objet                                            |

Les textes libres (motif, référence, justification) sont chiffrés au repos. Le maillon ne garde que leur empreinte : aucune donnée de santé dans la chaîne.

## Conservation

| Exigence                                                                         | Mécanisme                                                                                                                                                                    | Code                                                                                                           | Preuve                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Conservation assurée par le logiciel (§ 155)                                     | Aucune fonction de suppression sur les données de caisse. Le logiciel ne purge rien à cette version                                                                          | triggers, droits                                                                                               | « une clôture ne se modifie pas »                                 |
| Six ans, art. L. 102 B du LPF (§ 155)                                            | Pas de purge, donc au moins six ans. Durées maximales à arbitrer à l'étape 22                                                                                                |                                                                                                                |                                                                   |
| Ligne par ligne, pas seulement le Z (§ 180)                                      | Les clôtures s'ajoutent aux lignes, elles ne les remplacent pas                                                                                                              |                                                                                                                |                                                                   |
| Clôtures journalière, mensuelle et annuelle ou par exercice, impératives (§ 170) | Travail de nuit par centre, avec rattrapage. La journée en cours ne se clôture jamais. Le mois additionne ses jours, l'exercice ses mois. `mois_cloture_exercice` par centre | [cloture.ts](../packages/caisse/src/cloture.ts), [caisse-nuit.ts](../packages/jobs/src/travaux/caisse-nuit.ts) | Tests « clôtures »                                                |
| Données cumulatives et récapitulatives (§ 170)                                   | Totaux par mode de paiement et par taux de TVA, grand total de l'exercice, total perpétuel, encaissements perpétuels                                                         | [cloture.ts du domaine](../packages/domain/src/caisse/cloture.ts)                                              | « fige les totaux par mode et par taux, et les cumuls »           |
| Total perpétuel jamais remis à zéro (§ 170)                                      | `perpetuelCentimes`, en `BigInt`, repris de la clôture précédente                                                                                                            | idem                                                                                                           | « le grand total repart à l'exercice, le total perpétuel jamais » |
| Compteurs conservés au changement de version (§ 170)                             | Une version ne touche pas aux cumuls ; `version_caisse` est figée sur chaque clôture                                                                                         | idem                                                                                                           |                                                                   |
| Totaux jamais purgés et protégés (§ 170)                                         | `cloture_caisse` en ajout seul, chaînée et signée                                                                                                                            | migration                                                                                                      |                                                                   |

**Découpage** : une clôture couvre une plage de rangs. Rien n'est compté deux fois ni oublié, même à minuit (« coupe à minuit, heure de Paris »).

**Fiscal et physique** : la clôture fiscale est automatique. Le comptage humain (`session_caisse`, `comptage_caisse`) ne la conditionne pas : fond, espèces comptées, écart et justification obligatoire sont chaînés à part.

## Archivage

| Exigence                                             | Mécanisme                                                                              | Code                                                              | Preuve                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Périodicité au plus annuelle ou par exercice (§ 220) | Une archive par mois clôturé, par le travail de nuit                                   | [archive.ts](../packages/caisse/src/archive.ts)                   | « écrit une archive lisible, chaînée, signée » |
| Figer et donner date certaine (§ 220)                | Empreinte SHA-256 du fichier, chaînée dans un maillon `ARCHIVAGE`, horodatée et signée | idem                                                              |                                                |
| Format ouvert et notice en français (§ 230)          | JSON UTF-8 à clés triées, notice en tête de fichier                                    | [archive.ts du domaine](../packages/domain/src/caisse/archive.ts) |                                                |
| Lisible sans contrainte (§ 230)                      | Chiffré au repos, téléchargement en clair depuis l'écran, journalisé                   | `telechargerArchive`                                              | « chiffre l'archive au repos »                 |
| Traçabilité de la génération (§ 240)                 | Maillon `ARCHIVAGE` et ligne `archive_caisse` en ajout seul                            | migration                                                         |                                                |
| Fonction d'archive et serveur distant (§ 250)        | Fichier dans le `DocumentStore`, hors de la base                                       |                                                                   |                                                |

**Vérifier une archive** : à l'écran, ou hors ligne sans aucun secret :

```
pnpm caisse:verifier --fichier <archive.json> --empreinte <sha256>
```

## Accès de l'administration

- **Écrans** : caisse du jour, clôtures, archives, journal, vérification, export (§ 60).
- **Ligne de commande** : `pnpm caisse:verifier` vérifie toutes les chaînes et les archives stockées, code de sortie 1 en cas d'échec.
- **Export** : écritures par période, FEC par SIREN et par exercice, avec sa description. Ce FEC couvre les ventes et les encaissements, pas la comptabilité : **à faire valider par l'expert-comptable**.

## Attestation

D'après le BOI-TVA-DECLA-30-10-30 et le BOI-LETTRE-000242 :

- **Forme** (§ 370, § 390) : individuelle et nominative, sur le modèle officiel, papier ou dématérialisée. Une mention dans les CGV ne vaut pas attestation. Le document pré-rempli, signé par le représentant légal de l'éditeur puis complété par l'assujetti, est admis.
- **Volet 1** : éditeur, logiciel et références, périmètre couvert, date de mise sur le marché, version, licence s'il y en a une, signature du représentant légal.
- **Volet 2** : à compléter et signer par le client ; sans lui, l'attestation n'a pas de valeur.
- **Éditeur** (§ 300) : celui qui détient le code source. L'attestation engage sa responsabilité, tant qu'un tiers ne modifie pas les dispositifs techniques.
- **Versions** (§ 340, § 380) : l'attestation couvre les versions mineures si elle identifie la racine majeure et si l'éditeur s'engage sur ses subdivisions (`1.x`). Une version majeure, c'est-à-dire un paramètre modifié qui touche à ces conditions, exige une nouvelle attestation pour chaque client.
- **Sanction** : une fausse attestation est un délit, trois ans d'emprisonnement et 45 000 € d'amende (modèle d'attestation).

**Ce qui fait une version majeure ici** : format canonique ou formule d'empreinte, types chaînés, recalculs de la vérification, découpage des clôtures, format d'archive, algorithme de signature. Le vecteur de test du format 2 échoue si la formule change.

## Avant la première attestation

Ces points ne sont pas résolus par le code.

1. **Étape 23, obligatoire** : S3 Object Lock sur `archives-caisse/`, clé de signature en KMS, procédure de rotation, restauration de sauvegarde vérifiée avec `pnpm caisse:verifier`.
2. **Art. 286 I 3° bis, version du 27/06/2026** : déposer le texte et trouver les « normes établies par l'administration » pour la restitution des archives. Aucune norme trouvée au 01/11/2026 : le format JSON peut être à revoir.
3. **Transfert au CIBS** (art. L. 216-48, ordonnance 2025-1247) : la référence légale du modèle pourrait changer. Une abrogation est prévue au 01/01/2027 pour une partie des dispositions ; reste à établir si le 3° bis en fait partie.
4. **Portée** : le 3° bis vise les opérations « ne donnant pas lieu à facturation ». Le BOFiP couvre pourtant le logiciel de facturation avec fonction de caisse (§ 40). À clarifier avec un conseil, pour la rédaction du périmètre au volet 1.
5. **Relecture** par un conseil fiscal de ce document et du modèle : l'attestation engage personnellement le représentant légal.

## Limites connues

- **Accès administrateur à la base** : sans la clé privée, un recalcul complet casse la signature de toute clôture déjà écrite. Il reste possible sur les maillons postérieurs à la dernière clôture, soit au plus un jour d'opérations, tant que personne ne compare à une archive.
- **Détenteur de la clé** : tant qu'elle est dans une variable d'environnement, quelqu'un qui contrôle à la fois la base et l'environnement peut tout recalculer. Seul un KMS et Object Lock réduisent ce risque (étape 23).
- **Empreintes ≠ tout le contenu** : le libellé d'une ligne, son prix unitaire, le vendeur et le client sont figés par trigger, mais hors de l'empreinte.
- **Brouillons** : un brouillon abandonné n'a jamais été une pièce : il reste dans `facture` avec un statut, hors de la chaîne.
- **Taux de TVA** : table globale en ajout seul, sans maillon par centre. Le taux utilisé est figé sur chaque ligne chaînée.
- **Reçu d'encaissement** : pas de reçu PDF à cette version.

## Points À VÉRIFIER

Voir R32 à R41 dans [REGLES_AUDIO.md](REGLES_AUDIO.md). À trancher avec l'expert-comptable : TVA sur acomptes, facture d'acompte, plafond légal des espèces, plan de comptes, écritures d'écart, FEC. À trancher avec un conseil fiscal : jour sans opération sans clôture, format de restitution, portée du 3° bis.
