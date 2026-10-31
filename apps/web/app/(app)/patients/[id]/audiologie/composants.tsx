import {
  formaterDb,
  LIBELLES_GRADES,
  LIBELLES_OREILLES,
  LIBELLES_SOURCES_MESURE,
  MENTION_GRADE,
  rendreAudiogrammeSvg,
  rendreLegendeAudiogrammeSvg,
  type Oreille,
  type ResultatOreille,
  type SourceMesure,
  type SyntheseTonale,
} from '@ha/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BilanDetail, TonaleLue } from '@/server/services/audiologie';

/** SVG produit par le domaine : données numériques et libellés échappés, aucune saisie brute. */
export function Graphique({ svg, className }: { svg: string; className?: string }) {
  return (
    <div className={cn('max-w-full overflow-x-auto', className)}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export function BadgeSource({ source }: { source: SourceMesure }) {
  return (
    <Badge variant={source === 'NOAH' ? 'secondary' : 'outline'}>
      {LIBELLES_SOURCES_MESURE[source]}
    </Badge>
  );
}

const SECTIONS = [
  { cle: 'bilan', libelle: 'Vue d’ensemble', suffixe: '' },
  { cle: 'anamnese', libelle: 'Anamnèse', suffixe: '/anamnese' },
  { cle: 'otoscopie', libelle: 'Otoscopie', suffixe: '/otoscopie' },
  { cle: 'tonale', libelle: 'Tonale', suffixe: '/tonale' },
  { cle: 'vocale', libelle: 'Vocale', suffixe: '/vocale' },
  { cle: 'questionnaires', libelle: 'Questionnaires', suffixe: '/questionnaires' },
] as const;

export function EnteteBilan({
  bilan,
  courant,
  children,
}: {
  bilan: BilanDetail;
  courant: (typeof SECTIONS)[number]['cle'];
  children?: ReactNode;
}) {
  const racine = `/patients/${bilan.patientId}/audiologie`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <Link href={racine} className="text-sm text-muted-foreground hover:text-foreground">
            ← Tous les bilans
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bilan du {formaterDate(bilan.dateBilan)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[bilan.centreNom, bilan.praticien].filter(Boolean).join(' – ')}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`${racine}/${bilan.id}/synthese`}>Synthèse PDF</a>
        </Button>
      </div>
      <nav aria-label="Sections du bilan" className="flex flex-wrap gap-4 border-b">
        {SECTIONS.map(({ cle, libelle, suffixe }) => (
          <Link
            key={cle}
            href={`${racine}/${bilan.id}${suffixe}`}
            aria-current={cle === courant ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground hover:text-foreground',
              cle === courant && 'border-primary font-medium text-foreground',
            )}
          >
            {libelle}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}

export function libelleGrade({ grade }: Pick<ResultatOreille, 'grade'>): string {
  return grade === null ? 'Non calculable' : `Grade ${String(grade)} – ${LIBELLES_GRADES[grade]}`;
}

function LigneGrade({ oreille, resultat }: { oreille: Oreille; resultat: ResultatOreille }) {
  return (
    <TableRow>
      <TableCell>{LIBELLES_OREILLES[oreille]}</TableCell>
      <TableCell>
        {resultat.perteMoyenne === null ? '—' : formaterDb(resultat.perteMoyenne)}
      </TableCell>
      <TableCell>{libelleGrade(resultat)}</TableCell>
    </TableRow>
  );
}

export function TableauGrades({ synthese }: { synthese: SyntheseTonale }) {
  const { asymetrique, unilaterale, global } = synthese;
  return (
    <div className="grid gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Oreille</TableHead>
            <TableHead>Perte moyenne</TableHead>
            <TableHead>Grade audiométrique</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <LigneGrade oreille="DROITE" resultat={synthese.droite} />
          <LigneGrade oreille="GAUCHE" resultat={synthese.gauche} />
        </TableBody>
      </Table>
      {unilaterale ? <p className="text-sm">Perte unilatérale.</p> : null}
      {asymetrique ? <p className="text-sm">Perte asymétrique.</p> : null}
      {global ? (
        <p className="text-sm">
          Grade global : {libelleGrade(global)} ({formaterDb(global.perteMoyenne)}).
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{MENTION_GRADE}</p>
    </div>
  );
}

export function BlocTonale({ tonale }: { tonale: TonaleLue }) {
  const libelle = formaterDate(tonale.date);
  const { droite, gauche } = tonale.audiogramme;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <BadgeSource source={tonale.source} />
        <span>
          Mesure du {libelle}
          {tonale.appareil ? `, ${tonale.appareil}` : ''}
        </span>
      </div>
      {tonale.avertissements.length > 0 ? (
        <Alert role="status">
          <AlertDescription>{tonale.avertissements.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <Graphique svg={rendreAudiogrammeSvg('DROITE', { libelle, courbes: droite })} />
        <Graphique svg={rendreAudiogrammeSvg('GAUCHE', { libelle, courbes: gauche })} />
      </div>
      <Graphique svg={rendreLegendeAudiogrammeSvg()} />
      <TableauGrades synthese={tonale.synthese} />
    </div>
  );
}
