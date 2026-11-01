import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';

import { creerCentraleAction } from '../actions';
import { FormulaireCentrale } from '../formulaire-centrale';

export const metadata: Metadata = { title: 'Nouvelle centrale – HA-Gestion' };

export default function PageNouvelleCentrale() {
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvelle centrale d’achat" />
      <FormulaireCentrale action={creerCentraleAction} />
    </div>
  );
}
