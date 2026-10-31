import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirFabricant } from '@/server/services/catalogue';

import { modifierFabricantAction } from '../actions';
import { FormulaireFabricant } from '../formulaire-fabricant';

export const metadata: Metadata = { title: 'Fabricant – HA-Gestion' };

export default async function PageFabricant({ params }: PageProps<'/admin/fabricants/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const fabricant = await ouIntrouvable(obtenirFabricant(acteur, id));
  return (
    <div className="grid gap-6">
      <EntetePage titre={fabricant.nom} />
      <FormulaireFabricant action={modifierFabricantAction.bind(null, id)} fabricant={fabricant} />
    </div>
  );
}
