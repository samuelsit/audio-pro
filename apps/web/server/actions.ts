import { AccesRefuseError } from './auth/acces';
import { ErreurSaisie } from './erreurs';
import type { EtatFormulaire } from '@/lib/formulaire';

/**
 * Exécute une opération de service depuis une server action et convertit les erreurs attendues
 * (saisie invalide, accès refusé) en état de formulaire. Les autres erreurs remontent.
 */
export async function executer(
  operation: () => Promise<unknown>,
  valeurs: NonNullable<EtatFormulaire['valeurs']> = {},
): Promise<EtatFormulaire | null> {
  try {
    await operation();
    return null;
  } catch (erreur) {
    if (erreur instanceof ErreurSaisie) {
      return { message: erreur.message, erreurs: erreur.erreurs, valeurs };
    }
    if (erreur instanceof AccesRefuseError) {
      return { message: erreur.message, valeurs };
    }
    throw erreur;
  }
}
