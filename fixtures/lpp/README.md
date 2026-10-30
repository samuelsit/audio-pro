# Fixtures LPP

Petit extrait pour les tests. Aucune donnée patient : la LPP est une nomenclature publique.

- `908/` : extrait réel de la base LPP 908 (codes audio, plus 2 codes hors chapitre pour tester le filtre).
- `907/` : version **synthétique**, dérivée de l'extrait : le code `7322675` n'y figure pas et le tarif de `2381242` n'y a pas encore changé. Elle ne reproduit pas la vraie base 907.

Régénération, depuis la base complète déposée dans `docs/ref/lpp/908` :

```sh
pnpm --filter @ha/web exec tsx scripts/extraire-fixtures-lpp.ts
```
