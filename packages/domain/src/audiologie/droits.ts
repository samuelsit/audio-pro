import { peutActerAppareillage, type Role } from '../acces/roles';
import type { SourceMesure } from './mesure';

/** Otoscopie et audiométrie : actes de l'audioprothésiste (ADR-022). */
export function peutSaisirMesure(role: Role): boolean {
  return peutActerAppareillage(role);
}

/** Anamnèse et questionnaires : l'assistante les recueille aussi (ADR-022). */
export function peutSaisirFormulaire(role: Role): boolean {
  return peutActerAppareillage(role) || role === 'ASSISTANT';
}

/** Les modèles sont communs au client. */
export function peutGererModelesFormulaire(role: Role): boolean {
  return role === 'ADMIN_CLIENT';
}

/** Une mesure importée fait foi dans le logiciel d'origine : on ne la retouche pas ici. */
export function peutModifierMesure(source: SourceMesure): boolean {
  return source === 'SAISIE';
}
