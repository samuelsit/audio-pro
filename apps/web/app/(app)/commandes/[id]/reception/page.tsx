import { SystemClock } from '@ha/adapters';
import { receptionPossible } from '@ha/domain';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { obtenirCommande } from '@/server/services/commandes';

import { pointerReceptionAction } from '../../actions';
import { FormulaireReception } from '../../formulaires';

export const metadata: Metadata = { title: 'Réception de commande – HA-Gestion' };

export default async function PageReceptionCommande({
  params,
}: PageProps<'/commandes/[id]/reception'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const commande = await ouIntrouvable(obtenirCommande(acteur, id));
  if (!receptionPossible(commande.statut)) {
    redirect(`/commandes/${id}`);
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Réception de ${commande.numero}`}>
        Pointez ce qui est arrivé, ligne à ligne. Les lignes laissées vides restent attendues.
      </EntetePage>
      <FormulaireReception
        action={pointerReceptionAction.bind(
          null,
          id,
          commande.lignes.map((l) => l.id),
        )}
        lignes={commande.lignes}
        aujourdhui={new SystemClock().now().slice(0, 10)}
      />
    </div>
  );
}
