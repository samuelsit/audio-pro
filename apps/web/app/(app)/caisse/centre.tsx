import { EtatVide } from '@/components/etat-vide';
import { perimetreCourant } from '@/server/auth/gardes';

/** La caisse se tient par centre : « Tous mes centres » ne désigne aucun tiroir ni aucune chaîne. */
export async function centreDeCaisse() {
  const { acteur, perimetre } = await perimetreCourant();
  return { acteur, centreId: perimetre.type === 'centre' ? perimetre.centreId : null };
}

export function ChoisirUnCentre() {
  return (
    <EtatVide titre="Choisissez un centre">
      La caisse se tient centre par centre. Sélectionnez-en un en haut de la page.
    </EtatVide>
  );
}
