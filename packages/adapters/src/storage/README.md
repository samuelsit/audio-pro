# Adaptateurs storage

Port : `DocumentStore` (`put`, `get`, `delete`). Décision : ADR-011 (docs/DECISIONS.md).

- `s3-document-store.ts` : `S3DocumentStore`, tout service compatible S3 (MinIO en local). Configuration `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`.
- `fake-document-store.ts` : `FakeDocumentStore`, en mémoire, pour les tests.
- `document-store-chiffre.ts` : `DocumentStoreChiffre`, décorateur AES-256-GCM. **Il enveloppe tout adaptateur**, Fake compris : rien n'arrive en clair au stockage, même en développement. Le contexte authentifié contient la clé de l'objet : un objet copié sous une autre clé ne se déchiffre pas.

Les clés d'objet sont aléatoires et ne contiennent aucune donnée patient. Le type de contenu réel reste en base : le stockage ne voit que `application/octet-stream`.

`s3-document-store.test.ts` tourne contre MinIO (`docker compose up -d minio minio-init`). Il est ignoré sans `S3_ENDPOINT`, donc en CI.
