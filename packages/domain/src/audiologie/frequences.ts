/**
 * Grille de saisie, de 125 à 8 000 Hz : octaves et demi-octaves.
 * À VÉRIFIER : grille d'usage courant, absente de docs/ref (R25).
 */
export const FREQUENCES_AUDIOGRAMME = [
  125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000,
] as const;
export type FrequenceAudiogramme = (typeof FREQUENCES_AUDIOGRAMME)[number];

/** Source : biap-rec-02-2-en.pdf p. 2 et note 1 p. 4. */
export const FREQUENCES_PERTE_MOYENNE = [500, 1000, 2000, 4000] as const;

export function libelleFrequence(frequence: FrequenceAudiogramme): string {
  return frequence >= 1000 ? `${String(frequence / 1000).replace('.', ',')} k` : String(frequence);
}
