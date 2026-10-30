import type { EtatImportCsv } from '@/components/import-csv';

import { ErreurImportCsv, TAILLE_MAX_CSV, type BilanImportCsv } from './services/catalogue';

/** Lit le fichier déposé, lance l'import et traduit le résultat pour le formulaire. */
export async function executerImportCsv(
  formData: FormData,
  importer: (texte: string) => Promise<BilanImportCsv>,
): Promise<EtatImportCsv> {
  const fichier = formData.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { message: 'Choisir un fichier CSV.' };
  }
  if (fichier.size > TAILLE_MAX_CSV) {
    return { message: 'Fichier trop volumineux (1 Mo au maximum).' };
  }
  try {
    const { crees, modifies } = await importer(await fichier.text());
    return { succes: `Import terminé : ${crees} créé(s), ${modifies} mis à jour.` };
  } catch (erreur) {
    if (erreur instanceof ErreurImportCsv) {
      return { message: erreur.message, erreursLignes: erreur.erreurs };
    }
    throw erreur;
  }
}
