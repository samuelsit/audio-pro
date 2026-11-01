# Adaptateurs billing

Port : `BillingEngine` (`packages/domain/src/ports/billing-engine.ts`). `FakeBillingEngine` simule les statuts `EN_ATTENTE`, `TRANSMISE`, `ACCEPTEE` et `REJETEE` avec motif (étape 14, ADR-028). L'implémentation réelle arrive à l'étape 26 (AreaFSE), et alignera le port sur `docs/vendor/areafse`.
