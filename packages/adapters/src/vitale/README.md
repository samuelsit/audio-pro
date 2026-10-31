# Adaptateurs vitale

Port : `VitaleReader` (packages/domain/src/ports/vitale-reader.ts).

- `FakeVitaleReader` : lecteur simulé, lit les cartes fictives de `fixtures/vitale/` (voir son README). La carte « insérée » ou l'incident simulé (aucun lecteur, lecteur sans carte, carte illisible, panne) est choisi en développement par un sélecteur. Jamais utilisé en production.
- `LecteurVitaleAbsent` : utilisé hors simulation tant qu'aucun lecteur réel n'est branché ; toute lecture échoue avec `AUCUN_LECTEUR`.
- Lecteur réel : AreaFSE (Area Santé) en mode masqué, à l'étape 25, d'après docs/vendor/areafse.
