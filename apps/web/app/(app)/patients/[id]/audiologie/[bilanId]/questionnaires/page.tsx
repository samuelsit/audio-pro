import { LIBELLES_NATURES_FORMULAIRE } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EtatVide } from '@/components/etat-vide';
import { cn } from '@/lib/utils';

import { enregistrerFormulaireAction } from '../../actions';
import { chargerBilan } from '../../charger';
import { EnteteBilan } from '../../composants';
import { FormulaireReponses } from '../formulaire-reponses';

export const metadata: Metadata = { title: 'Questionnaires – HA-Gestion' };

export default async function PageQuestionnaires({
  params,
  searchParams,
}: PageProps<'/patients/[id]/audiologie/[bilanId]/questionnaires'>) {
  const { id, bilanId } = await params;
  const { modele: choisi } = await searchParams;
  const { bilan } = await chargerBilan(id, bilanId);
  // Une réponse existante reste sur sa version de modèle, même si une autre a pris sa place.
  const remplis = bilan.questionnaires.map((q) => q.modele);
  const codes = new Set(remplis.map((m) => m.code));
  const proposes = [
    ...remplis,
    ...bilan.modeles.filter((m) => m.nature !== 'ANAMNESE' && !codes.has(m.code)),
  ];
  const modele = proposes.find((m) => m.id === choisi) ?? proposes[0];
  const reponses = bilan.questionnaires.find((q) => q.modele.id === modele?.id)?.reponses ?? {};

  return (
    <div className="grid gap-6">
      <EnteteBilan bilan={bilan} courant="questionnaires">
        {!modele ? (
          <EtatVide titre="Aucun questionnaire disponible">
            Aucun modèle de questionnaire n’est actif pour ce client.
          </EtatVide>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2 text-sm">
              {proposes.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`?modele=${m.id}`}
                    aria-current={m.id === modele.id ? 'true' : undefined}
                    className={cn(
                      'rounded-md border px-3 py-1.5 hover:bg-accent',
                      m.id === modele.id && 'border-primary font-medium',
                    )}
                  >
                    {m.nom}
                    <span className="sr-only"> ({LIBELLES_NATURES_FORMULAIRE[m.nature]})</span>
                  </Link>
                </li>
              ))}
            </ul>
            <FormulaireReponses
              key={modele.id}
              action={enregistrerFormulaireAction.bind(null, id, bilanId, modele.id)}
              definition={modele.definition}
              reponses={reponses}
            />
          </>
        )}
      </EnteteBilan>
    </div>
  );
}
