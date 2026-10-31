import {
  LIBELLES_OREILLES,
  OREILLES,
  peutModifierMesure,
  peutSaisirMesure,
  type Oreille,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

import { enregistrerOtoscopieAction } from '../../actions';
import { chargerBilan } from '../../charger';
import { EnteteBilan } from '../../composants';
import { FormulaireOtoscopie } from './formulaire-otoscopie';

export const metadata: Metadata = { title: 'Otoscopie – HA-Gestion' };

export default async function PageOtoscopie({
  params,
  searchParams,
}: PageProps<'/patients/[id]/audiologie/[bilanId]/otoscopie'>) {
  const { id, bilanId } = await params;
  const { oreille: choisie } = await searchParams;
  const { acteur, bilan } = await chargerBilan(id, bilanId);
  const oreille: Oreille = choisie === 'GAUCHE' ? 'GAUCHE' : 'DROITE';
  const existante = bilan.otoscopies.find((o) => o.oreille === oreille);
  const modifiable =
    peutSaisirMesure(acteur.role) && (!existante || peutModifierMesure(existante.source));

  return (
    <div className="grid gap-6">
      <EnteteBilan bilan={bilan} courant="otoscopie">
        <ul className="flex gap-2 text-sm">
          {[...OREILLES].reverse().map((o) => (
            <li key={o}>
              <Link
                href={`?oreille=${o}`}
                aria-current={o === oreille ? 'true' : undefined}
                className={cn(
                  'rounded-md border px-3 py-1.5 hover:bg-accent',
                  o === oreille && 'border-primary font-medium',
                )}
              >
                {LIBELLES_OREILLES[o]}
              </Link>
            </li>
          ))}
        </ul>
        {modifiable ? (
          <FormulaireOtoscopie
            key={oreille}
            action={enregistrerOtoscopieAction.bind(null, id, bilanId)}
            oreille={oreille}
            constat={existante?.constat ?? null}
            photo={existante?.photo ?? false}
          />
        ) : (
          <Alert role="status">
            <AlertDescription>
              {existante?.source === 'NOAH'
                ? 'Ce constat vient de NOAH : il ne se modifie pas ici.'
                : 'La saisie de l’otoscopie est réservée à l’audioprothésiste.'}
            </AlertDescription>
          </Alert>
        )}
      </EnteteBilan>
    </div>
  );
}
