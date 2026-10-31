import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerCentres } from '@/server/services/centres';

import { creerUtilisateurAction } from '../actions';
import { FormulaireUtilisateur } from '../formulaire-utilisateur';

export const metadata: Metadata = { title: 'Nouvel utilisateur – HA-Gestion' };

export default async function PageNouvelUtilisateur() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const centres = await listerCentres(acteur, { type: 'tous' });
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvel utilisateur" />
      <FormulaireUtilisateur action={creerUtilisateurAction} centres={centres} />
    </div>
  );
}
