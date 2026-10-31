import { formaterDb, rendreAudiogrammeSvg, rendreLegendeAudiogrammeSvg } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerBilans, type TonaleLue } from '@/server/services/audiologie';

import { Graphique, TableauGrades } from '../composants';

export const metadata: Metadata = { title: 'Comparer deux audiogrammes – HA-Gestion' };

const CLASSE_LISTE =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function ecart(ancienne: number | null, recente: number | null): string {
  if (ancienne === null || recente === null) {
    return 'non calculable';
  }
  const difference = recente - ancienne;
  return `${difference > 0 ? '+' : ''}${formaterDb(difference)}`;
}

function Selection({
  nom,
  libelle,
  bilans,
  valeur,
}: {
  nom: string;
  libelle: string;
  bilans: readonly { id: string; dateBilan: string }[];
  valeur: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={nom}>{libelle}</Label>
      <select id={nom} name={nom} defaultValue={valeur} className={CLASSE_LISTE}>
        {bilans.map((b) => (
          <option key={b.id} value={b.id}>
            {formaterDate(b.dateBilan)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function PageComparer({
  params,
  searchParams,
}: PageProps<'/patients/[id]/audiologie/comparer'>) {
  const { id } = await params;
  const { a, b } = await searchParams;
  const acteur = await requireSession();
  const bilans = (await ouIntrouvable(listerBilans(acteur, id))).flatMap((bilan) =>
    bilan.tonale ? [{ ...bilan, tonale: bilan.tonale }] : [],
  );
  const dernier = bilans.at(-1);
  const avantDernier = bilans.at(-2);
  if (!dernier || !avantDernier) {
    return (
      <EtatVide titre="Deux audiogrammes sont nécessaires">
        Enregistrez un audiogramme dans au moins deux bilans pour les comparer.
      </EtatVide>
    );
  }
  const recent = bilans.find((bilan) => bilan.id === a) ?? dernier;
  const ancien = bilans.find((bilan) => bilan.id === b) ?? avantDernier;
  const serie = (date: string, tonale: TonaleLue, cote: 'droite' | 'gauche') => ({
    libelle: formaterDate(date),
    courbes: tonale.audiogramme[cote],
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link
          href={`/patients/${id}/audiologie`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tous les bilans
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Comparer deux audiogrammes</h1>
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <Selection nom="a" libelle="Trait plein" bilans={bilans} valeur={recent.id} />
        <Selection nom="b" libelle="Pointillés" bilans={bilans} valeur={ancien.id} />
        <Button type="submit" variant="outline">
          Comparer
        </Button>
      </form>
      <div className="flex flex-wrap gap-4">
        <Graphique
          svg={rendreAudiogrammeSvg(
            'DROITE',
            serie(recent.dateBilan, recent.tonale, 'droite'),
            serie(ancien.dateBilan, ancien.tonale, 'droite'),
          )}
        />
        <Graphique
          svg={rendreAudiogrammeSvg(
            'GAUCHE',
            serie(recent.dateBilan, recent.tonale, 'gauche'),
            serie(ancien.dateBilan, ancien.tonale, 'gauche'),
          )}
        />
      </div>
      <Graphique svg={rendreLegendeAudiogrammeSvg()} />
      <p className="text-sm">
        Écart de perte moyenne, du {formaterDate(ancien.dateBilan)} au{' '}
        {formaterDate(recent.dateBilan)} : droite{' '}
        {ecart(
          ancien.tonale.synthese.droite.perteMoyenne,
          recent.tonale.synthese.droite.perteMoyenne,
        )}
        , gauche{' '}
        {ecart(
          ancien.tonale.synthese.gauche.perteMoyenne,
          recent.tonale.synthese.gauche.perteMoyenne,
        )}
        .
      </p>
      <section className="grid gap-2" aria-label="Grades du trait plein">
        <h2 className="text-lg font-semibold">Bilan du {formaterDate(recent.dateBilan)}</h2>
        <TableauGrades synthese={recent.tonale.synthese} />
      </section>
    </div>
  );
}
