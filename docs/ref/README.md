# Documents de référence

Textes officiels sur lesquels s'appuient les règles métier. Ils sont déposés à la main, jamais générés ni résumés de mémoire.

**Règle** : une règle réglementaire cite sa source (`// Source : <fichier> <article ou page>`). Si la source n'est pas ici, on écrit `// À VÉRIFIER` et on le signale.

| Fichier | Contenu attendu | État |
|---|---|---|
| `convention-audioprothesistes.pdf` | Convention nationale des audioprothésistes et ses avenants | présent |
| `ameli-100-sante-audio.pdf` | Guide ameli du 100 % Santé en audiologie (classes I et II, prix limites, renouvellement) | présent |
| `fr201-codes-prestation.pdf` | Codes de prestation FR 201 | présent |
| `modele-devis-audio.pdf` | Modèle réglementaire du devis normalisé en audioprothèse | présent |
| `lpp/<version>/` | Base LPP diffusée par ameli : `lpp_fiche_tot`, `lpp_histo_tot`, `lpp_comp_tot`, `lpp_incomp_tot` (`.dbf`) et note de version. Importée par `pnpm import:lpp` (ADR-008) | version 908, actualisée au 16/10/2026 ; DBF non versionnés (`.gitignore`), à déposer sur chaque poste ; extrait dans `fixtures/lpp` |

## Documentation éditeur

| Dossier | Contenu attendu | État |
|---|---|---|
| `docs/vendor/areafse/` | Documentation d'intégration AreaFSE (Area Santé), mode masqué : API, formats, champs | à déposer |

Quand un document est mis à jour (nouvel avenant, nouvelle version de la LPP), on remplace le fichier, on met à jour ce tableau et on vérifie les règles qui le citent.
