import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerCentrales } from '@/server/services/fournisseurs';

import { FormulaireReleve } from '../formulaire-releve';

export const metadata: Metadata = { title: 'Importer un relevé – HA-Gestion' };

export default async function PageNouveauReleve() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const centrales = await listerCentrales(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Importer un relevé">
        Le pointage s’affiche avant l’import : rien n’est écrit tant que vous ne confirmez pas.
      </EntetePage>
      <FormulaireReleve centrales={centrales.filter((c) => c.actif)} />
    </div>
  );
}
