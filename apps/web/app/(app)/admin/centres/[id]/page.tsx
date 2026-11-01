import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirCentre } from '@/server/services/centres';
import { prefixeDuCentre } from '@/server/services/facturation';

import { modifierCentreAction } from '../actions';
import { FormulaireCentre } from '../formulaire-centre';
import { FormulairePrefixe } from '../formulaire-prefixe';

export const metadata: Metadata = { title: 'Centre – HA-Gestion' };

export default async function PageCentre({ params }: PageProps<'/admin/centres/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const centre = await ouIntrouvable(obtenirCentre(acteur, id));
  const prefixe = await prefixeDuCentre(acteur, id);
  return (
    <div className="grid gap-6">
      <EntetePage titre={centre.nom} />
      <FormulaireCentre action={modifierCentreAction.bind(null, id)} centre={centre} />
      <FormulairePrefixe centreId={id} prefixe={prefixe} />
    </div>
  );
}
