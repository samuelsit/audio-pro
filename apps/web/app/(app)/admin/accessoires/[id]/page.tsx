import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirAccessoire } from '@/server/services/catalogue';

import { modifierAccessoireAction } from '../actions';
import { FormulaireAccessoire } from '../formulaire-accessoire';

export const metadata: Metadata = { title: 'Accessoire – HA-Gestion' };

export default async function PageAccessoire({ params }: PageProps<'/admin/accessoires/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN');
  const accessoire = await ouIntrouvable(obtenirAccessoire(acteur, id));
  return (
    <div className="grid gap-6">
      <EntetePage titre={accessoire.nom} />
      <FormulaireAccessoire
        action={modifierAccessoireAction.bind(null, id)}
        accessoire={accessoire}
      />
    </div>
  );
}
