import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirPrescripteur } from '@/server/services/prescripteurs';

import { changerActivationPrescripteurAction, modifierPrescripteurAction } from '../actions';
import { FormulairePrescripteur } from '../formulaire-prescripteur';

export const metadata: Metadata = { title: 'Prescripteur – HA-Gestion' };

export default async function PagePrescripteur({ params }: PageProps<'/prescripteurs/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN');
  const prescripteur = await ouIntrouvable(obtenirPrescripteur(acteur, id));
  return (
    <div className="grid gap-6">
      <EntetePage titre={`${prescripteur.prenom} ${prescripteur.nom}`} />
      <FormulairePrescripteur
        action={modifierPrescripteurAction.bind(null, id)}
        prescripteur={prescripteur}
      />
      <form action={changerActivationPrescripteurAction.bind(null, id, !prescripteur.actif)}>
        <Button type="submit" variant="outline">
          {prescripteur.actif ? 'Désactiver' : 'Réactiver'}
        </Button>
      </form>
    </div>
  );
}
