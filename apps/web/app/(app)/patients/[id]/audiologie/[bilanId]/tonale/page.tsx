import { peutModifierMesure, peutSaisirMesure } from '@ha/domain';
import type { Metadata } from 'next';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { enregistrerTonaleAction } from '../../actions';
import { chargerBilan } from '../../charger';
import { BlocTonale, EnteteBilan } from '../../composants';
import { SaisieTonale } from './saisie-tonale';

export const metadata: Metadata = { title: 'Audiométrie tonale – HA-Gestion' };

export default async function PageTonale({
  params,
}: PageProps<'/patients/[id]/audiologie/[bilanId]/tonale'>) {
  const { id, bilanId } = await params;
  const { acteur, bilan } = await chargerBilan(id, bilanId);
  const { tonale } = bilan;
  const importee = tonale !== null && !peutModifierMesure(tonale.source);

  return (
    <div className="grid gap-6">
      <EnteteBilan bilan={bilan} courant="tonale">
        {peutSaisirMesure(acteur.role) && !importee ? (
          <SaisieTonale
            action={enregistrerTonaleAction.bind(null, id, bilanId)}
            audiogramme={tonale?.audiogramme ?? null}
            appareil={tonale?.appareil ?? null}
          />
        ) : (
          <>
            <Alert role="status">
              <AlertDescription>
                {importee
                  ? 'Cet audiogramme vient de NOAH : il ne se modifie pas ici.'
                  : 'La saisie de l’audiométrie est réservée à l’audioprothésiste.'}
              </AlertDescription>
            </Alert>
            {tonale ? <BlocTonale tonale={tonale} /> : null}
          </>
        )}
      </EnteteBilan>
    </div>
  );
}
