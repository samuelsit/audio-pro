# Cartes Vitale simulées

Cartes **fictives** lues par `FakeVitaleReader` (packages/adapters/src/vitale) en développement et en test. Aucune donnée réelle : NIR construits avec la commune « 999 », clés calculées par le domaine.

Format (propre au lecteur simulé, il n'imite pas un format éditeur) :

```json
{ "libelle": "…", "etat": "VALIDE | BLOQUEE", "source": "CARTE | APCV", "beneficiaires": [ … ] }
```

Chaque bénéficiaire suit `beneficiaireVitaleSchema` (packages/domain/src/ports/vitale-reader.ts).

| Fichier | Cas |
|---|---|
| `assure-seul.json` | Assuré seul. Correspond à Michel Lefebvre du seed : caisse, fin de droits et complémentaire différentes (comparaison). |
| `famille.json` | Famille Durand, 3 bénéficiaires : Claire et Hugo existent dans le seed, Jules est inconnu (création). |
| `beneficiaire-c2s.json` | Bénéficiaire de la C2S, inconnu du seed. |
| `droits-expires.json` | Droits AMO expirés le 31/12/2025, inconnu du seed. |
| `carte-bloquee.json` | Carte bloquée : la lecture échoue (CARTE_BLOQUEE). |

Les autres cas d'erreur (aucun lecteur, lecteur sans carte, carte illisible, panne) se choisissent dans le sélecteur de simulation, sans fichier.
