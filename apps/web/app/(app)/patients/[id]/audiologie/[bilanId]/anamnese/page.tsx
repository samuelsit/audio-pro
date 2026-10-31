import type { Metadata } from 'next';

import { EtatVide } from '@/components/etat-vide';

import { enregistrerFormulaireAction } from '../../actions';
import { chargerBilan } from '../../charger';
import { EnteteBilan } from '../../composants';
import { FormulaireReponses } from '../formulaire-reponses';

export const metadata: Metadata = { title: 'Anamnèse – HA-Gestion' };

export default async function PageAnamnese({
  params,
}: PageProps<'/patients/[id]/audiologie/[bilanId]/anamnese'>) {
  const { id, bilanId } = await params;
  const { bilan } = await chargerBilan(id, bilanId);
  const modele =
    bilan.anamnese?.modele ?? bilan.modeles.find((m) => m.nature === 'ANAMNESE') ?? null;

  return (
    <div className="grid gap-6">
      <EnteteBilan bilan={bilan} courant="anamnese">
        {!modele ? (
          <EtatVide titre="Aucune anamnèse disponible">
            Aucun modèle d’anamnèse n’est actif pour ce client.
          </EtatVide>
        ) : (
          <FormulaireReponses
            action={enregistrerFormulaireAction.bind(null, id, bilanId, modele.id)}
            definition={modele.definition}
            reponses={bilan.anamnese?.reponses ?? {}}
          />
        )}
      </EnteteBilan>
    </div>
  );
}
