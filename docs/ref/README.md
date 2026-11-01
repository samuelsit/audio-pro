# Documents de référence

Textes officiels sur lesquels s'appuient les règles métier. Ils sont déposés à la main ou enregistrés tels quels depuis le site officiel, jamais générés ni résumés de mémoire.

**Règle** : une règle réglementaire cite sa source (`// Source : <fichier> <article ou page>`). Si la source n'est pas ici, on écrit `// À VÉRIFIER` et on le signale.

| Fichier | Contenu attendu | État |
|---|---|---|
| `convention-audioprothesistes.pdf` | Convention nationale des audioprothésistes et ses avenants | présent |
| `ameli-100-sante-audio.pdf` | Guide ameli du 100 % Santé en audiologie (classes I et II, prix limites, renouvellement) | présent |
| `fr201-codes-prestation.pdf` | Codes de prestation FR 201 | présent |
| `modele-devis-audio.pdf` | Modèle réglementaire du devis normalisé en audioprothèse | présent |
| `biap-rec-02-2-en.pdf` | Recommandation BIAP 02/2, classification audiométrique des pertes auditives (version anglaise, langue d'origine, 01/09/2026). Téléchargée sur biap.org, non modifiée | présent |
| `lpp/<version>/` | Base LPP diffusée par ameli : `lpp_fiche_tot`, `lpp_histo_tot`, `lpp_comp_tot`, `lpp_incomp_tot` (`.dbf`) et note de version. Importée par `pnpm import:lpp` (ADR-008) | version 908, actualisée au 16/10/2026 ; DBF non versionnés (`.gitignore`), à déposer sur chaque poste ; extrait dans `fixtures/lpp` |

## Textes fiscaux (`fiscal/`)

Pages officielles enregistrées telles quelles le 01/11/2026 depuis bofip.impots.gouv.fr. Elles s'ouvrent dans un navigateur.

| Fichier | Contenu | Source | État |
|---|---|---|---|
| `fiscal/boi-tva-decla-30-10-30.html` | Logiciels et systèmes de caisse : conditions, clôtures, archivage, attestation. Version du 25/03/2026 | https://bofip.impots.gouv.fr/bofip/10691-PGP.html | présent |
| `fiscal/boi-lettre-000242.html` | Modèle d'attestation individuelle de l'éditeur. Version du 25/03/2026 | https://bofip.impots.gouv.fr/bofip/10692-PGP.html | présent |
| `fiscal/actu-2026-00073.html` | Rétablissement de l'attestation, loi 2026-103 art. 125 | https://bofip.impots.gouv.fr/bofip/15035-PGP.html/ACTU-2026-00073 | présent |
| `fiscal/boi-cf-ior-60-40-20.html` | Format du fichier des écritures comptables (FEC) | https://bofip.impots.gouv.fr/bofip/9028-PGP.html | présent |
| Art. 286 du CGI, version du 27/06/2026 ; loi 2026-534 art. 87 ; art. L. 216-48 du CIBS | Conditions légales, format de restitution des archives, transfert au CIBS | legifrance.gouv.fr refuse le téléchargement (403) | **à déposer** |
| Art. A47 A-1 du LPF | Normes du FEC : séparateur, codage, dates, nom de fichier | legifrance.gouv.fr refuse le téléchargement (403) | **à déposer** |

## Documentation éditeur

| Dossier | Contenu attendu | État |
|---|---|---|
| `docs/vendor/areafse/` | Documentation d'intégration AreaFSE (Area Santé), mode masqué : API, formats, champs | à déposer |

Quand un document est mis à jour (nouvel avenant, nouvelle version de la LPP), on remplace le fichier, on met à jour ce tableau et on vérifie les règles qui le citent.
