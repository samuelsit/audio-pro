import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { enregistrerModeleAction } from '../actions';
import { EditeurModele } from '../editeur-modele';

export const metadata: Metadata = { title: 'Nouveau formulaire – HA-Gestion' };

export default function PageNouveauFormulaire() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau formulaire" />
      <EditeurModele action={enregistrerModeleAction.bind(null, null)} modele={null} />
    </div>
  );
}
