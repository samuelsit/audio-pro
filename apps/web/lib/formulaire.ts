import type { DoublonsPossibles, ResultatControlePrescription } from '@ha/domain';

/** État renvoyé par une server action de formulaire (partagé client/serveur). */
export interface EtatFormulaire {
  message?: string;
  /** Confirmation affichée quand l'action réussit sans rediriger. */
  succes?: string;
  erreurs?: Readonly<Record<string, readonly string[]>>;
  /** Saisie renvoyée en cas d'erreur, pour la réafficher après la réinitialisation du formulaire. */
  valeurs?: Readonly<Record<string, string | readonly string[] | boolean>>;
  /** Création suspendue : fiches patient qui correspondent peut-être à la saisie. */
  doublons?: DoublonsPossibles;
  /** Prescription arrêtée par des erreurs bloquantes ; `forcable` si l'utilisateur peut passer outre. */
  blocage?: { controle: ResultatControlePrescription; forcable: boolean };
}

export const ETAT_INITIAL: EtatFormulaire = {};

export function texte(formData: FormData, nom: string): string {
  const valeur = formData.get(nom);
  return typeof valeur === 'string' ? valeur : '';
}

export function liste(formData: FormData, nom: string): string[] {
  return formData.getAll(nom).filter((v): v is string => typeof v === 'string');
}

export function coche(formData: FormData, nom: string): boolean {
  return formData.get(nom) === 'on';
}
