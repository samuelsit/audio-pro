export const TYPES_DOCUMENT = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const TAILLE_MAX_DOCUMENT_OCTETS = 10 * 1024 * 1024;

const SIGNATURES: readonly { readonly type: TypeDocument; readonly octets: readonly number[] }[] = [
  { type: 'application/pdf', octets: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: 'image/jpeg', octets: [0xff, 0xd8, 0xff] },
  { type: 'image/png', octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

const EXTENSIONS: Readonly<Record<TypeDocument, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Type réel du fichier, lu dans ses premiers octets : le type annoncé par le navigateur ne prouve rien. */
export function detecterTypeDocument(contenu: Uint8Array): TypeDocument | null {
  const trouve = SIGNATURES.find(({ octets }) => octets.every((o, i) => contenu[i] === o));
  return trouve?.type ?? null;
}

export function extensionDocument(type: TypeDocument): string {
  return EXTENSIONS[type];
}

export type ResultatDocument =
  | { readonly valide: true; readonly type: TypeDocument }
  | { readonly valide: false; readonly message: string };

export function verifierDocument(contenu: Uint8Array, messageVide: string): ResultatDocument {
  if (contenu.length === 0) {
    return { valide: false, message: messageVide };
  }
  if (contenu.length > TAILLE_MAX_DOCUMENT_OCTETS) {
    return { valide: false, message: 'Le fichier dépasse 10 Mo.' };
  }
  const type = detecterTypeDocument(contenu);
  return type === null
    ? { valide: false, message: 'Le fichier doit être un PDF, un JPEG ou un PNG.' }
    : { valide: true, type };
}
