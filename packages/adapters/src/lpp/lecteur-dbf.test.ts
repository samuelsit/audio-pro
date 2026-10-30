import { describe, expect, it } from 'vitest';

import { ErreurDbf, lireDbf } from './lecteur-dbf';

/** Construit un petit fichier dBase III en mémoire. */
function dbf(
  champs: readonly (readonly [string, string, number])[],
  lignes: readonly (readonly string[])[],
  suppressions: readonly number[] = [],
): Buffer {
  const tailleEnTete = 32 + champs.length * 32 + 1;
  const tailleLigne = 1 + champs.reduce((total, [, , longueur]) => total + longueur, 0);
  const octets = Buffer.alloc(tailleEnTete + lignes.length * tailleLigne + 1, 0x20);
  octets.fill(0, 0, tailleEnTete);
  octets.writeUInt8(0x03, 0);
  octets.writeUInt8(126, 1);
  octets.writeUInt8(10, 2);
  octets.writeUInt8(29, 3);
  octets.writeUInt32LE(lignes.length, 4);
  octets.writeUInt16LE(tailleEnTete, 8);
  octets.writeUInt16LE(tailleLigne, 10);
  champs.forEach(([nom, type, longueur], i) => {
    const position = 32 + i * 32;
    octets.write(nom, position, 'latin1');
    octets.write(type, position + 11, 'latin1');
    octets.writeUInt8(longueur, position + 16);
  });
  octets.writeUInt8(0x0d, tailleEnTete - 1);
  lignes.forEach((ligne, i) => {
    const debut = tailleEnTete + i * tailleLigne;
    if (suppressions.includes(i)) {
      octets.write('*', debut, 'latin1');
    }
    let position = debut + 1;
    ligne.forEach((valeur, j) => {
      octets.write(valeur, position, 'latin1');
      position += champs[j]?.[2] ?? 0;
    });
  });
  octets.writeUInt8(0x1a, octets.length - 1);
  return octets;
}

const CHAMPS = [
  ['CODE_TIPS', 'C', 13],
  ['DATE_FIN', 'D', 8],
  ['TARIF', 'N', 12],
] as const;

describe('lireDbf', () => {
  it('lit l’en-tête, les champs et les lignes', () => {
    const table = lireDbf(dbf(CHAMPS, [['2351057', '20040922', '      400.00']]));
    expect(table.dateMiseAJour).toBe('2026-10-29');
    expect(table.champs).toEqual([
      { nom: 'CODE_TIPS', type: 'C', longueur: 13 },
      { nom: 'DATE_FIN', type: 'D', longueur: 8 },
      { nom: 'TARIF', type: 'N', longueur: 12 },
    ]);
    expect(table.lignes).toEqual([{ CODE_TIPS: '2351057', DATE_FIN: '20040922', TARIF: '400.00' }]);
  });

  it.each([
    { octet: 126, cas: 'à compter de 1900' },
    { octet: 26, cas: 'sur 2 chiffres, comme la base 908' },
  ])('lit l’année $cas', ({ octet }) => {
    const octets = dbf(CHAMPS, []);
    octets.writeUInt8(octet, 1);
    expect(lireDbf(octets).dateMiseAJour).toBe('2026-10-29');
  });

  it('décode le texte en Latin-1', () => {
    const table = lireDbf(dbf([['NOM', 'C', 12]], [['15° CM³']]));
    expect(table.lignes[0]?.['NOM']).toBe('15° CM³');
  });

  it('saute les lignes supprimées', () => {
    const table = lireDbf(dbf([['CODE', 'C', 7]], [['1'], ['2'], ['3']], [1]));
    expect(table.lignes.map((l) => l['CODE'])).toEqual(['1', '3']);
  });

  it('accepte un fichier sans ligne', () => {
    expect(lireDbf(dbf(CHAMPS, [])).lignes).toEqual([]);
  });

  it.each([
    { cas: 'trop court', octets: Buffer.from([0x03]), message: /dBase III/ },
    { cas: 'autre version', octets: Buffer.alloc(64, 0x30), message: /dBase III/ },
    {
      cas: 'tronqué',
      octets: dbf(CHAMPS, [['2351057', '', '']]).subarray(0, 120),
      message: /tronqué/,
    },
  ])('refuse : $cas', ({ octets, message }) => {
    expect(() => lireDbf(octets)).toThrow(message);
    expect(() => lireDbf(octets)).toThrow(ErreurDbf);
  });

  it('refuse des descripteurs non terminés', () => {
    const octets = dbf([['CODE', 'C', 7]], [['1']]);
    octets.writeUInt8(0x20, 32 + 32);
    expect(() => lireDbf(octets)).toThrow(/descripteurs/);
  });
});
