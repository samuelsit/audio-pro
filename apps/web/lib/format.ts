const formatDateHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'medium',
});

/** Date et heure de Paris, ex. « 29/10/2026 15:42:07 ». */
export function formaterDateHeure(instant: Date): string {
  return formatDateHeure.format(instant);
}
