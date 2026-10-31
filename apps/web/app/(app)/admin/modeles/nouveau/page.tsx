import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerFabricants } from '@/server/services/catalogue';

import { creerModeleAction } from '../actions';
import { FormulaireModele } from '../formulaire-modele';

export const metadata: Metadata = { title: 'Nouveau modèle – HA-Gestion' };

export default async function PageNouveauModele() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const fabricants = await listerFabricants(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau modèle" />
      <FormulaireModele action={creerModeleAction} fabricants={fabricants} />
    </div>
  );
}
