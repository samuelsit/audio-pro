import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirCentrale } from '@/server/services/fournisseurs';

import { modifierCentraleAction } from '../actions';
import { FormulaireCentrale } from '../formulaire-centrale';

export const metadata: Metadata = { title: 'Centrale d’achat – HA-Gestion' };

export default async function PageCentrale({ params }: PageProps<'/admin/centrales/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const centrale = await ouIntrouvable(obtenirCentrale(acteur, id));
  return (
    <div className="grid gap-6">
      <EntetePage titre={centrale.nom} />
      <FormulaireCentrale action={modifierCentraleAction.bind(null, id)} centrale={centrale} />
    </div>
  );
}
