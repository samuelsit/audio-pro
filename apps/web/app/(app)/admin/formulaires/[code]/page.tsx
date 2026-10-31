import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { obtenirModele } from '@/server/services/modeles-formulaire';

import { enregistrerModeleAction } from '../actions';
import { EditeurModele } from '../editeur-modele';

export const metadata: Metadata = { title: 'Formulaire clinique – HA-Gestion' };

export default async function PageFormulaire({ params }: PageProps<'/admin/formulaires/[code]'>) {
  const { code } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const modele = await obtenirModele(acteur, code);
  if (!modele) {
    notFound();
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre={modele.nom}>
        Version {modele.version}. Enregistrer crée la version {modele.version + 1}.
      </EntetePage>
      <EditeurModele action={enregistrerModeleAction.bind(null, code)} modele={modele} />
    </div>
  );
}
