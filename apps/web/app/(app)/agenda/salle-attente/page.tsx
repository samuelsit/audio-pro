import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { lireAgenda, lireSalleAttente } from '@/server/services/agenda';
import { aujourdhui } from '@/server/services/patients';

import { centreDeLAgenda } from '../centre';
import { SalleClient } from './salle-client';

export const metadata: Metadata = { title: 'Salle d’attente – HA-Gestion' };

export default async function PageSalleAttente({
  searchParams,
}: PageProps<'/agenda/salle-attente'>) {
  const acteur = await requireSession();
  const { centre } = await searchParams;
  const { centreId } = await centreDeLAgenda(typeof centre === 'string' ? centre : undefined);
  if (centreId === null) {
    return <EtatVide titre="Aucun centre">Aucun centre n’est accessible.</EtatVide>;
  }
  const jour = aujourdhui();
  const [salle, { praticiens }] = await Promise.all([
    ouIntrouvable(lireSalleAttente(acteur, centreId, jour)),
    ouIntrouvable(lireAgenda(acteur, centreId, jour, jour)),
  ]);
  return (
    <div className="grid gap-4">
      <EntetePage titre="Salle d’attente">{`Journée du ${formaterDate(jour)}`}</EntetePage>
      <SalleClient salle={salle} praticiens={praticiens} />
    </div>
  );
}
