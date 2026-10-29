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
