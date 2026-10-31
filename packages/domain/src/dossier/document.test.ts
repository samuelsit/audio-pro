import { describe, expect, it } from 'vitest';

import {
  detecterTypeDocument,
  extensionDocument,
  TAILLE_MAX_DOCUMENT_OCTETS,
  verifierDocument,
} from './document';

function octets(texte: string): Uint8Array {
  return Uint8Array.from(texte, (c) => c.charCodeAt(0));
}

const PDF = octets('%PDF-1.7 fictif');
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00);
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const HTML = octets('<html><script>alert(1)</script></html>');
const VIDE = 'Joindre le scan.';

describe('detecterTypeDocument', () => {
  it.each([
    { cas: 'PDF', contenu: PDF, attendu: 'application/pdf' },
    { cas: 'JPEG', contenu: JPEG, attendu: 'image/jpeg' },
    { cas: 'PNG', contenu: PNG, attendu: 'image/png' },
    { cas: 'HTML renommé', contenu: HTML, attendu: null },
    { cas: 'début de signature seul', contenu: Uint8Array.of(0xff, 0xd8), attendu: null },
  ])('$cas', ({ contenu, attendu }) => {
    expect(detecterTypeDocument(contenu)).toBe(attendu);
  });
});

describe('extensionDocument', () => {
  it.each([
    { type: 'application/pdf', extension: 'pdf' },
    { type: 'image/jpeg', extension: 'jpg' },
    { type: 'image/png', extension: 'png' },
  ] as const)('$type', ({ type, extension }) => {
    expect(extensionDocument(type)).toBe(extension);
  });
});

describe('verifierDocument', () => {
  it('accepte un fichier de la taille maximale', () => {
    const contenu = new Uint8Array(TAILLE_MAX_DOCUMENT_OCTETS);
    contenu.set(PDF);
    expect(verifierDocument(contenu, VIDE)).toEqual({ valide: true, type: 'application/pdf' });
  });

  it.each([
    {
      cas: 'fichier vide',
      contenu: new Uint8Array(0),
      message: VIDE,
    },
    {
      cas: 'un octet de trop',
      contenu: new Uint8Array(TAILLE_MAX_DOCUMENT_OCTETS + 1),
      message: 'Le fichier dépasse 10 Mo.',
    },
    {
      cas: 'type non reconnu',
      contenu: HTML,
      message: 'Le fichier doit être un PDF, un JPEG ou un PNG.',
    },
  ])('refuse : $cas', ({ contenu, message }) => {
    expect(verifierDocument(contenu, VIDE)).toEqual({ valide: false, message });
  });
});
