import { FUSEAU_HORAIRE, type Clock } from '@ha/domain';

/** Horloge réelle : instant courant, au format ISO 8601 avec le décalage Europe/Paris. */
export class SystemClock implements Clock {
  now(): string {
    return formaterInstantParis(new Date());
  }
}

const formatParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_HORAIRE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

export function formaterInstantParis(instant: Date): string {
  const parties = Object.fromEntries(
    formatParis.formatToParts(instant).map((partie) => [partie.type, partie.value]),
  );
  // timeZoneName vaut « GMT+01:00 », « GMT+02:00 » (ou « GMT » si décalage nul).
  const decalage = (parties.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
  const millisecondes = String(instant.getUTCMilliseconds()).padStart(3, '0');
  return `${parties.year}-${parties.month}-${parties.day}T${parties.hour}:${parties.minute}:${parties.second}.${millisecondes}${decalage}`;
}

const decalageParis = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_HORAIRE,
  timeZoneName: 'longOffset',
});

/** Décalage de Paris par rapport à UTC à cet instant, en millisecondes (+1 h ou +2 h). */
function decalageParisMs(instantMs: number): number {
  const nom =
    decalageParis.formatToParts(instantMs).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const [, signe = '+', heures = '0', minutes = '0'] = /GMT([+-])(\d{2}):(\d{2})/.exec(nom) ?? [];
  return (signe === '-' ? -1 : 1) * (Number(heures) * 60 + Number(minutes)) * 60_000;
}

/** Instant de minuit, heure de Paris, du jour donné (le changement d'heure a lieu à 2 h ou 3 h, jamais à minuit). */
function minuitParis(annee: number, mois: number, jour: number): Date {
  const minuitUtc = Date.UTC(annee, mois - 1, jour);
  const estimation = minuitUtc - decalageParisMs(minuitUtc);
  return new Date(minuitUtc - decalageParisMs(estimation));
}

/**
 * Bornes d'une journée calendaire (AAAA-MM-JJ, déjà validée) en heure de Paris :
 * `debut` incluse, `fin` exclue (minuit du lendemain). Une journée de changement d'heure dure 23 h ou 25 h.
 */
export function bornesJourneeParis(date: string): { debut: string; fin: string } {
  const [annee = 0, mois = 0, jour = 0] = date.split('-').map(Number);
  return {
    debut: formaterInstantParis(minuitParis(annee, mois, jour)),
    fin: formaterInstantParis(minuitParis(annee, mois, jour + 1)),
  };
}
