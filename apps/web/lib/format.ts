const formatDateHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'medium',
});

/** Date et heure de Paris, ex. « 29/10/2026 15:42:07 ». */
export function formaterDateHeure(instant: Date): string {
  return formatDateHeure.format(instant);
}

const formatJour = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
});

/** Jour à Paris d'un instant ISO, ex. « 29/10/2026 ». */
export function formaterJour(instant: string): string {
  return formatJour.format(new Date(instant));
}

/** Date calendaire ISO (AAAA-MM-JJ) en « JJ/MM/AAAA », sans passer par un fuseau. */
export function formaterDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

const formatDateLongue = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « lundi 11 janvier », pour une date calendaire AAAA-MM-JJ. */
export function formaterDateLongue(date: string): string {
  const texte = formatDateLongue.format(new Date(`${date}T12:00:00Z`));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
