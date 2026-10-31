import { perimetreCourant } from '@/server/auth/gardes';

export interface CentreAgenda {
  centreId: string | null;
  /** Centres proposés quand le sélecteur général est sur « Tous mes centres » : l'agenda est par centre. */
  choix: readonly { id: string; nom: string }[];
}

/** Centre affiché : le centre courant, ou celui choisi dans la page, jamais cru sur parole. */
export async function centreDeLAgenda(demande: string | undefined): Promise<CentreAgenda> {
  const { perimetre, centres } = await perimetreCourant();
  if (perimetre.type === 'centre') {
    return { centreId: perimetre.centreId, choix: [] };
  }
  const centre = centres.find((c) => c.id === demande) ?? centres[0];
  return { centreId: centre?.id ?? null, choix: centres };
}
