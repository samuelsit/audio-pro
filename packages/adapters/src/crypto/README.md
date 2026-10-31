# Chiffrement applicatif

Chiffrement des champs sensibles (NIR, données de santé) avant leur écriture en base. Décision : ADR-005 (docs/DECISIONS.md).

- `aes-gcm.ts` : `ChiffreurAesGcm`, AES-256-GCM, IV aléatoire de 96 bits. Enveloppe stockée en texte :
  `v1.<idCle>.<iv>.<chiffré + tag>` (base64url). Le contexte (ex. `patient.nir`) est authentifié avec la valeur.
- `chiffrerOctets` / `dechiffrerOctets` : mêmes clés pour un document binaire, enveloppe `v1.<idCle>.` puis IV, tag et chiffré (voir `storage/`).
- `trousseau.ts` : clés lues dans l'environnement.
  - `CHIFFREMENT_CLES="k2026a:<base64 32 octets>,k2026b:<…>"` (générer une clé : `openssl rand -base64 32`) ;
  - `CHIFFREMENT_CLE_ACTIVE="k2026b"` : la clé qui chiffre les nouvelles valeurs.
- Rotation : ajouter la nouvelle clé au trousseau et la rendre active ; les anciennes valeurs restent lisibles
  grâce à l'identifiant de clé de leur enveloppe. `rechiffrer()` les passe sur la clé active ; l'ancienne clé
  ne peut être retirée qu'une fois toutes les valeurs rechiffrées.
- `prisma.ts` : `extensionChampsChiffres(chiffreur, { Modele: { champ: 'modele.champ' } })`, à brancher avec
  `prisma().$extends(...)`. Chiffre à l'écriture, déchiffre à la lecture, refuse filtre, tri et regroupement
  sur un champ chiffré. Les écritures et lectures imbriquées via une relation ne sont **pas** traitées : on lit
  et on écrit le modèle chiffré directement. Défense en profondeur : chaque colonne chiffrée porte en base une
  contrainte `CHECK (colonne LIKE 'v1.%')`, qui refuse une valeur écrite en clair par erreur.

- `empreinte.ts` : `EmpreinteHmac`, HMAC-SHA256 déterministe (hexadécimal) pour chercher ou dédoublonner une
  valeur chiffrée (NIR). Clé `EMPREINTE_CLE` (base64, 32 octets), distincte des clés AES ; le contexte sépare
  les usages. Changer la clé impose de recalculer toutes les empreintes depuis les valeurs déchiffrées (ADR-006).

Pas de port dans le domaine (il ne chiffre jamais) ni d'adaptateur Fake : les tests utilisent le vrai
chiffrement avec une clé de test, pour qu'aucun environnement n'écrive de valeur en clair.
