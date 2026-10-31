import { AccesRefuseError } from './auth/acces';
import { ErreurSaisie } from './erreurs';
import { ErreurPrescriptionBloquee } from './services/dossiers';
import { ErreurDoublonPossible } from './services/patients';
import type { EtatFormulaire } from '@/lib/formulaire';

/**
 * Exécute une opération de service depuis une server action et convertit les erreurs attendues
 * (saisie invalide, accès refusé, doublon possible) en état de formulaire. Les autres erreurs remontent.
 */
export async function executer(
  operation: () => Promise<unknown>,
  valeurs: NonNullable<EtatFormulaire['valeurs']> = {},
): Promise<EtatFormulaire | null> {
  try {
    await operation();
    return null;
  } catch (erreur) {
    if (erreur instanceof ErreurPrescriptionBloquee) {
      return {
        message: erreur.message,
        erreurs: erreur.erreurs,
        valeurs,
        blocage: { controle: erreur.controle, forcable: erreur.forcable },
      };
    }
    if (erreur instanceof ErreurSaisie) {
      return { message: erreur.message, erreurs: erreur.erreurs, valeurs };
    }
    if (erreur instanceof ErreurDoublonPossible) {
      // Pas de `message` : le formulaire affiche les doublons dans leur propre encadré.
      return { doublons: erreur.doublons, valeurs };
    }
    if (erreur instanceof AccesRefuseError) {
      return { message: erreur.message, valeurs };
    }
    throw erreur;
  }
}
