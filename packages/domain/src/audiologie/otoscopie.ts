import { z } from 'zod';

import { OREILLES } from '../audio-rules/code-prestation';
import { texteOptionnelSchema } from '../commun/texte';
import { verifierDocument, type ResultatDocument } from '../dossier/document';

export const ETATS_CONDUIT = ['LIBRE', 'CERUMEN_PARTIEL', 'BOUCHON', 'AUTRE'] as const;
export type EtatConduit = (typeof ETATS_CONDUIT)[number];

export const LIBELLES_ETATS_CONDUIT: Readonly<Record<EtatConduit, string>> = {
  LIBRE: 'Libre',
  CERUMEN_PARTIEL: 'Cérumen partiel',
  BOUCHON: 'Bouchon',
  AUTRE: 'Autre',
};

export const ETATS_TYMPAN = ['NORMAL', 'ANORMAL', 'NON_VISIBLE'] as const;
export type EtatTympan = (typeof ETATS_TYMPAN)[number];

export const LIBELLES_ETATS_TYMPAN: Readonly<Record<EtatTympan, string>> = {
  NORMAL: 'Normal',
  ANORMAL: 'Anormal',
  NON_VISIBLE: 'Non visible',
};

export const constatOtoscopiqueSchema = z.object({
  conduit: z.enum(ETATS_CONDUIT, { error: 'Choisir l’état du conduit.' }),
  tympan: z.enum(ETATS_TYMPAN, { error: 'Choisir l’état du tympan.' }),
  observation: texteOptionnelSchema.pipe(
    z.string().max(2000, '2000 caractères au maximum.').nullable(),
  ),
});
export type ConstatOtoscopique = z.output<typeof constatOtoscopiqueSchema>;

export const otoscopieSaisieSchema = constatOtoscopiqueSchema.extend({
  oreille: z.enum(OREILLES, { error: 'Choisir l’oreille.' }),
});
export type OtoscopieSaisie = z.output<typeof otoscopieSaisieSchema>;

/** Une photo reste une image : le PDF accepté ailleurs n'a pas sa place ici. */
export function verifierPhotoOtoscopie(contenu: Uint8Array): ResultatDocument {
  const resultat = verifierDocument(contenu, 'La photo est vide.');
  if (resultat.valide && resultat.type === 'application/pdf') {
    return { valide: false, message: 'La photo doit être un JPEG ou un PNG.' };
  }
  return resultat;
}
