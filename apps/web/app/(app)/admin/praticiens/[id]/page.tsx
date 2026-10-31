import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { listerCentres } from '@/server/services/centres';
import { obtenirPraticien } from '@/server/services/praticiens';

import { modifierPraticienAction } from '../actions';
import { FormulairePraticien } from '../formulaire-praticien';

export const metadata: Metadata = { title: 'Praticien – HA-Gestion' };

export default async function PagePraticien({ params }: PageProps<'/admin/praticiens/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const [praticien, centres] = await Promise.all([
    ouIntrouvable(obtenirPraticien(acteur, id)),
    listerCentres(acteur, { type: 'tous' }),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre={`${praticien.prenom} ${praticien.nom}`}>
        <Link
          href={`/admin/utilisateurs/${praticien.utilisateurId}`}
          className="underline underline-offset-4"
        >
          Compte utilisateur et centres de rattachement
        </Link>
      </EntetePage>
      <FormulairePraticien
        action={modifierPraticienAction.bind(null, id)}
        centres={centres}
        praticien={praticien}
      />
    </div>
  );
}
