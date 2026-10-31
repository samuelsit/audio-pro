import {
  LIBELLES_TYPES_MESURE,
  peutModifierMesure,
  peutSaisirMesure,
  rendreVocaleSvg,
  type ContexteVocale,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

import { enregistrerVocaleAction } from '../../actions';
import { chargerBilan } from '../../charger';
import { BadgeSource, EnteteBilan, Graphique } from '../../composants';
import { SaisieVocale } from './saisie-vocale';

export const metadata: Metadata = { title: 'Audiométrie vocale – HA-Gestion' };

const CONTEXTES = [
  { contexte: 'CALME', libelle: 'Dans le calme', type: 'VOCALE_CALME' },
  { contexte: 'BRUIT', libelle: 'Dans le bruit', type: 'VOCALE_BRUIT' },
] as const;

export default async function PageVocale({
  params,
  searchParams,
}: PageProps<'/patients/[id]/audiologie/[bilanId]/vocale'>) {
  const { id, bilanId } = await params;
  const { contexte: choisi } = await searchParams;
  const { acteur, bilan } = await chargerBilan(id, bilanId);
  const contexte: ContexteVocale = choisi === 'BRUIT' ? 'BRUIT' : 'CALME';
  const mesure = bilan.vocales.find((v) => v.vocale.contexte === contexte);
  const importee = mesure !== undefined && !peutModifierMesure(mesure.source);
  const type = contexte === 'CALME' ? 'VOCALE_CALME' : 'VOCALE_BRUIT';

  return (
    <div className="grid gap-6">
      <EnteteBilan bilan={bilan} courant="vocale">
        <ul className="flex gap-2 text-sm">
          {CONTEXTES.map((c) => (
            <li key={c.contexte}>
              <Link
                href={`?contexte=${c.contexte}`}
                aria-current={c.contexte === contexte ? 'true' : undefined}
                className={cn(
                  'rounded-md border px-3 py-1.5 hover:bg-accent',
                  c.contexte === contexte && 'border-primary font-medium',
                )}
              >
                {c.libelle}
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="text-lg font-semibold">{LIBELLES_TYPES_MESURE[type]}</h2>
        {peutSaisirMesure(acteur.role) && !importee ? (
          <SaisieVocale
            key={contexte}
            action={enregistrerVocaleAction.bind(null, id, bilanId)}
            contexte={contexte}
            vocale={mesure?.vocale ?? null}
            appareil={mesure?.appareil ?? null}
          />
        ) : (
          <>
            <Alert role="status">
              <AlertDescription>
                {importee
                  ? 'Cette mesure vient de NOAH : elle ne se modifie pas ici.'
                  : 'La saisie de l’audiométrie est réservée à l’audioprothésiste.'}
              </AlertDescription>
            </Alert>
            {mesure ? (
              <>
                <BadgeSource source={mesure.source} />
                <Graphique svg={rendreVocaleSvg(mesure.vocale)} />
              </>
            ) : null}
          </>
        )}
      </EnteteBilan>
    </div>
  );
}
