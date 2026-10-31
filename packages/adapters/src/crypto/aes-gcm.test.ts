import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ChiffreurAesGcm } from './aes-gcm';
import { ErreurDechiffrement } from './chiffreur';
import { chargerTrousseau } from './trousseau';

const CLE_A = randomBytes(32).toString('base64');
const CLE_B = randomBytes(32).toString('base64');

function chiffreur(cles: string, active: string) {
  return new ChiffreurAesGcm(
    chargerTrousseau({ CHIFFREMENT_CLES: cles, CHIFFREMENT_CLE_ACTIVE: active }),
  );
}

const aSeul = chiffreur(`a:${CLE_A}`, 'a');
const NIR_FICTIF = '1850578006084';

/** Remplace la partie `index` de l'enveloppe. */
function remplacerPartie(enveloppe: string, index: number, valeur: string): string {
  const parties = enveloppe.split('.');
  parties[index] = valeur;
  return parties.join('.');
}

/** Inverse un bit d'une partie base64url de l'enveloppe. */
function alterer(enveloppe: string, index: number, octet = 0): string {
  const octets = Buffer.from(enveloppe.split('.')[index] ?? '', 'base64url');
  octets[octet] = (octets[octet] ?? 0) ^ 1;
  return remplacerPartie(enveloppe, index, octets.toString('base64url'));
}

describe('ChiffreurAesGcm', () => {
  it.each([
    { cas: 'NIR', clair: NIR_FICTIF },
    { cas: 'chaîne vide', clair: '' },
    { cas: 'unicode', clair: 'Œdème « auriculaire » – 耳 🦻' },
    { cas: 'long', clair: 'x'.repeat(10_000) },
  ])('aller-retour : $cas', ({ clair }) => {
    const enveloppe = aSeul.chiffrer(clair, 'patient.nir');
    expect(enveloppe).toMatch(/^v1\.a\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(enveloppe).not.toContain(clair || '\u0000');
    expect(aSeul.dechiffrer(enveloppe, 'patient.nir')).toBe(clair);
  });

  it('utilise un IV aléatoire : deux chiffrements diffèrent', () => {
    expect(aSeul.chiffrer(NIR_FICTIF, 'patient.nir')).not.toBe(
      aSeul.chiffrer(NIR_FICTIF, 'patient.nir'),
    );
  });

  it.each([
    { cas: 'IV altéré', alteration: (e: string) => alterer(e, 2) },
    { cas: 'chiffré altéré', alteration: (e: string) => alterer(e, 3, 0) },
    { cas: 'tag altéré', alteration: (e: string) => alterer(e, 3, 13 + 15) },
    { cas: 'identifiant de clé modifié', alteration: (e: string) => remplacerPartie(e, 1, 'b') },
  ])('refuse : $cas', ({ alteration }) => {
    const deuxCles = chiffreur(`a:${CLE_A},b:${CLE_A}`, 'a');
    const enveloppe = deuxCles.chiffrer(NIR_FICTIF, 'patient.nir');
    expect(() => deuxCles.dechiffrer(alteration(enveloppe), 'patient.nir')).toThrow(
      new ErreurDechiffrement(),
    );
  });

  it('refuse un autre contexte (valeur copiée dans une autre colonne)', () => {
    const enveloppe = aSeul.chiffrer(NIR_FICTIF, 'patient.nir');
    expect(() => aSeul.dechiffrer(enveloppe, 'medecin.nir')).toThrow(ErreurDechiffrement);
  });

  it('refuse une clé absente du trousseau', () => {
    const enveloppe = chiffreur(`z:${CLE_B}`, 'z').chiffrer(NIR_FICTIF, 'patient.nir');
    expect(() => aSeul.dechiffrer(enveloppe, 'patient.nir')).toThrow(
      'Déchiffrement impossible : clé « z » absente du trousseau.',
    );
  });

  it('refuse une mauvaise clé sous le même identifiant', () => {
    const enveloppe = chiffreur(`a:${CLE_B}`, 'a').chiffrer(NIR_FICTIF, 'patient.nir');
    expect(() => aSeul.dechiffrer(enveloppe, 'patient.nir')).toThrow(ErreurDechiffrement);
  });

  it.each([
    { cas: 'texte en clair', enveloppe: NIR_FICTIF },
    { cas: 'version inconnue', enveloppe: 'v2.a.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA' },
    { cas: 'partie manquante', enveloppe: 'v1.a.AAAAAAAAAAAAAAAA' },
    { cas: 'partie en trop', enveloppe: 'v1.a.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.x' },
    { cas: 'identifiant vide', enveloppe: 'v1..AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA' },
    { cas: 'IV vide', enveloppe: 'v1.a..AAAAAAAAAAAAAAAAAAAAAA' },
    { cas: 'données vides', enveloppe: 'v1.a.AAAAAAAAAAAAAAAA.' },
    { cas: 'IV non base64url', enveloppe: 'v1.a.AAAAAAAA+AAAAAAA.AAAAAAAAAAAAAAAAAAAAAA' },
    { cas: 'données non base64url', enveloppe: 'v1.a.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAA/' },
    { cas: 'IV trop court', enveloppe: 'v1.a.AAAA.AAAAAAAAAAAAAAAAAAAAAA' },
    { cas: 'tag tronqué', enveloppe: 'v1.a.AAAAAAAAAAAAAAAA.AAAA' },
  ])('refuse une enveloppe mal formée : $cas', ({ enveloppe }) => {
    expect(() => aSeul.dechiffrer(enveloppe, 'patient.nir')).toThrow(
      'Déchiffrement impossible : format d’enveloppe inconnu.',
    );
  });

  it('ne cite jamais la valeur ni la clé dans ses erreurs', () => {
    const enveloppe = aSeul.chiffrer(NIR_FICTIF, 'patient.nir');
    const erreur = (() => {
      try {
        aSeul.dechiffrer(alterer(enveloppe, 3), 'patient.nir');
      } catch (e) {
        return e;
      }
    })();
    expect(String(erreur)).not.toContain(NIR_FICTIF);
    expect(String(erreur)).not.toContain(CLE_A);
  });
});

describe('rotation des clés', () => {
  const ancien = chiffreur(`k1:${CLE_A}`, 'k1');
  const apresRotation = chiffreur(`k1:${CLE_A},k2:${CLE_B}`, 'k2');

  it('déchiffre les anciennes valeurs et chiffre avec la clé active', () => {
    const vieille = ancien.chiffrer(NIR_FICTIF, 'patient.nir');
    expect(apresRotation.dechiffrer(vieille, 'patient.nir')).toBe(NIR_FICTIF);
    expect(apresRotation.idCle(apresRotation.chiffrer(NIR_FICTIF, 'patient.nir'))).toBe('k2');
  });

  it('rechiffre seulement ce qui doit l’être', () => {
    const vieille = ancien.chiffrer(NIR_FICTIF, 'patient.nir');
    expect(apresRotation.aRechiffrer(vieille)).toBe(true);

    const nouvelle = apresRotation.rechiffrer(vieille, 'patient.nir');
    expect(apresRotation.idCle(nouvelle)).toBe('k2');
    expect(apresRotation.aRechiffrer(nouvelle)).toBe(false);
    expect(apresRotation.dechiffrer(nouvelle, 'patient.nir')).toBe(NIR_FICTIF);
    expect(apresRotation.rechiffrer(nouvelle, 'patient.nir')).toBe(nouvelle);
  });

  it('une fois l’ancienne clé retirée, les valeurs rechiffrées restent lisibles', () => {
    const nouvelle = apresRotation.rechiffrer(
      ancien.chiffrer(NIR_FICTIF, 'patient.nir'),
      'patient.nir',
    );
    const sansAncienne = chiffreur(`k2:${CLE_B}`, 'k2');
    expect(sansAncienne.dechiffrer(nouvelle, 'patient.nir')).toBe(NIR_FICTIF);
  });
});

describe('ChiffreurAesGcm : documents binaires', () => {
  const SCAN = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x2e]);
  const CONTEXTE = 'document.prescriptions/a';

  it.each([
    { cas: 'document', clair: SCAN },
    { cas: 'vide', clair: new Uint8Array(0) },
    { cas: 'gros', clair: randomBytes(1024 * 1024) },
  ])('aller-retour : $cas', ({ clair }) => {
    const enveloppe = aSeul.chiffrerOctets(clair, CONTEXTE);
    expect(Buffer.from(aSeul.dechiffrerOctets(enveloppe, CONTEXTE))).toEqual(Buffer.from(clair));
  });

  it('accepte une vue partielle d’un tampon', () => {
    const enveloppe = aSeul.chiffrerOctets(SCAN, CONTEXTE);
    const tampon = new Uint8Array(enveloppe.length + 8);
    tampon.set(enveloppe, 8);
    const dechiffre = aSeul.dechiffrerOctets(tampon.subarray(8), CONTEXTE);
    expect(Buffer.from(dechiffre)).toEqual(Buffer.from(SCAN));
  });

  it('ne laisse pas le contenu lisible', () => {
    const clair = Buffer.from('ORDONNANCE FICTIVE', 'utf8');
    expect(Buffer.from(aSeul.chiffrerOctets(clair, CONTEXTE)).includes(clair)).toBe(false);
  });

  it('refuse un autre contexte', () => {
    const enveloppe = aSeul.chiffrerOctets(SCAN, CONTEXTE);
    expect(() => aSeul.dechiffrerOctets(enveloppe, 'document.prescriptions/b')).toThrow(
      ErreurDechiffrement,
    );
  });

  it('refuse une enveloppe altérée', () => {
    const enveloppe = Uint8Array.from(aSeul.chiffrerOctets(SCAN, CONTEXTE));
    enveloppe[enveloppe.length - 1] = (enveloppe[enveloppe.length - 1] ?? 0) ^ 1;
    expect(() => aSeul.dechiffrerOctets(enveloppe, CONTEXTE)).toThrow(ErreurDechiffrement);
  });

  it.each([
    { cas: 'sans séparateur', enveloppe: Buffer.from('xxxxxxxxxxxxxxxx') },
    { cas: 'sans clé', enveloppe: Buffer.from('v1.xxxxxxxxxxxxx') },
    { cas: 'trop courte', enveloppe: Buffer.from('v1.a.xxxx') },
    { cas: 'autre version', enveloppe: Buffer.from(`v9.a.${'x'.repeat(40)}`) },
  ])('refuse un format inconnu : $cas', ({ enveloppe }) => {
    expect(() => aSeul.dechiffrerOctets(enveloppe, CONTEXTE)).toThrow(ErreurDechiffrement);
  });

  it('une ancienne clé reste lisible après rotation', () => {
    const enveloppe = aSeul.chiffrerOctets(SCAN, CONTEXTE);
    const apresRotation = chiffreur(`a:${CLE_A},b:${CLE_B}`, 'b');
    expect(Buffer.from(apresRotation.dechiffrerOctets(enveloppe, CONTEXTE))).toEqual(
      Buffer.from(SCAN),
    );
  });
});
