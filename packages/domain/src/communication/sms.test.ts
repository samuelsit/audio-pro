import { describe, expect, it } from 'vitest';

import { analyserSms } from './sms';

describe('analyserSms', () => {
  it.each([
    ['court', 'Bonjour', 'GSM7', 7, 1],
    ['149 caractères', 'a'.repeat(149), 'GSM7', 149, 1],
    ['150 caractères', 'a'.repeat(150), 'GSM7', 150, 2],
    ['302 caractères', 'a'.repeat(302), 'GSM7', 302, 2],
    ['303 caractères', 'a'.repeat(303), 'GSM7', 303, 3],
    ['accents de la table GSM', 'àéèùì', 'GSM7', 5, 1],
    ['extension comptée double', '€', 'GSM7', 2, 1],
    ['ê hors table', 'fête', 'UNICODE', 4, 1],
    ['apostrophe typographique', 'l’adresse', 'UNICODE', 9, 1],
    ['59 en Unicode', 'ê'.repeat(59), 'UNICODE', 59, 1],
    ['60 en Unicode', 'ê'.repeat(60), 'UNICODE', 60, 2],
  ])('%s', (_, texte, encodage, caracteres, segments) => {
    expect(analyserSms(texte)).toEqual({ encodage, caracteres, segments });
  });
});
