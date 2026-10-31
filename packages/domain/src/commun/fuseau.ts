import { JOURS_SEMAINE, type JourSemaine } from '../centre/horaires';
import { FUSEAU_HORAIRE } from '../ports/clock';
import { ajouterJours, decomposerDate, joursEntre } from './date';

// Instants en millisecondes depuis l'époque : le domaine n'a pas le droit de `new Date()`, et un entier se
// compare et s'additionne sans piège de fuseau. Heures locales : « HH:MM », Europe/Paris.

const MS_PAR_MINUTE = 60_000;
const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;

const formatDecalage = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_HORAIRE,
  timeZoneName: 'longOffset',
});

/** Décalage de Paris par rapport à UTC à cet instant, en millisecondes (+1 h ou +2 h). */
export function decalageParisMs(instantMs: number): number {
  // « 1/15/2026, GMT+01:00 ». Paris est toujours à l'est de Greenwich : pas de signe à lire.
  const texte = formatDecalage.format(instantMs);
  const decalage = texte.slice(texte.indexOf('GMT') + 'GMT'.length);
  return (Number(decalage.slice(1, 3)) * 60 + Number(decalage.slice(4, 6))) * MS_PAR_MINUTE;
}

function instantNaif(date: string, heure: string): number {
  const [annee, mois, jour] = decomposerDate(date);
  const [heures = 0, minutes = 0] = heure.split(':').map(Number);
  return Date.UTC(annee, mois - 1, jour, heures, minutes);
}

/** Instants réels de cette heure locale, dans l'ordre : aucun (printemps), un, ou deux (automne). */
function occurrences(date: string, heure: string): number[] {
  const naif = instantNaif(date, heure);
  return [naif - 2 * MS_PAR_HEURE, naif - MS_PAR_HEURE].filter(
    (instant) => instant + decalageParisMs(instant) === naif,
  );
}

/**
 * Heure saisie pour un rendez-vous : `null` si elle n'existe pas (le dimanche du passage à l'heure d'été).
 * Une heure qui existe deux fois (passage à l'heure d'hiver) désigne sa première occurrence.
 */
export function instantSaisi(date: string, heure: string): number | null {
  return occurrences(date, heure)[0] ?? null;
}

/**
 * Borne d'une plage horaire, qui ne se refuse pas : une heure inexistante donne le premier instant valide, et
 * une heure ambiguë s'élargit (première occurrence en début, dernière en fin) pour ne perdre aucune minute.
 */
export function instantDePlage(date: string, heure: string, borne: 'DEBUT' | 'FIN'): number {
  const instants = occurrences(date, heure);
  const retenu = borne === 'DEBUT' ? instants[0] : instants.at(-1);
  // Le passage à l'heure d'été saute de 2 h à 3 h : 3 h, à +2 h, est le premier instant valide.
  return retenu ?? instantNaif(date, '03:00') - 2 * MS_PAR_HEURE;
}

export interface HeureLocale {
  readonly date: string;
  readonly heure: string;
}

const formatLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_HORAIRE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Date et heure locales de Paris à cet instant. */
export function localDepuisInstant(instantMs: number): HeureLocale {
  const parties = Object.fromEntries(
    formatLocal.formatToParts(instantMs).map((partie) => [partie.type, partie.value]),
  );
  return {
    date: `${parties.year}-${parties.month}-${parties.day}`,
    heure: `${parties.hour}:${parties.minute}`,
  };
}

/** Bornes d'une journée de Paris, fin exclue. Une journée de changement d'heure dure 23 h ou 25 h. */
export function bornesJourMs(date: string): { readonly debut: number; readonly fin: number } {
  return {
    debut: instantDePlage(date, '00:00', 'DEBUT'),
    fin: instantDePlage(ajouterJours(date, 1), '00:00', 'DEBUT'),
  };
}

/** Jour de la semaine d'une date calendaire. */
export function jourSemaine(date: string): JourSemaine {
  // Le 1er janvier 1970 était un jeudi, indice 3 de JOURS_SEMAINE.
  const indice = (((joursEntre('1970-01-01', date) + 3) % 7) + 7) % 7;
  return JOURS_SEMAINE[indice] as JourSemaine;
}

/** Lundi de la semaine de cette date. */
export function lundiDeLaSemaine(date: string): string {
  return ajouterJours(date, -JOURS_SEMAINE.indexOf(jourSemaine(date)));
}

/** Minutes depuis minuit d'une heure locale, pour les comparaisons et le dessin de l'agenda. */
export function minutesDepuisMinuit(heure: string): number {
  const [heures = 0, minutes = 0] = heure.split(':').map(Number);
  return heures * 60 + minutes;
}

/** Inverse de `minutesDepuisMinuit`. */
export function heureDepuisMinutes(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
