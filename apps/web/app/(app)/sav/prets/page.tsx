import { LIBELLES_ETATS_PRET, LIBELLES_STATUTS_APPAREIL, type EtatPret } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerParc, listerPrets, type PretListe } from '@/server/services/prets';

import { FormulaireRetourPret } from '../formulaires';

export const metadata: Metadata = { title: 'Prêts – HA-Gestion' };

const VARIANTES: Readonly<Record<EtatPret, 'default' | 'secondary' | 'destructive' | 'outline'>> = {
  EN_COURS: 'secondary',
  A_ECHEANCE: 'default',
  EN_RETARD: 'destructive',
  RENDU: 'outline',
};

const COLONNES: readonly Colonne<PretListe>[] = [
  {
    libelle: 'Appareil',
    rendu: (p) => (
      <Link
        href={`/stock/appareils/${p.appareilId}`}
        className="underline-offset-4 hover:underline"
      >
        {p.numeroSerie}
      </Link>
    ),
  },
  {
    libelle: 'Patient',
    rendu: (p) => (p.patientMasque ? 'Autre centre' : (p.patient?.libelle ?? '—')),
  },
  { libelle: 'Centre', rendu: (p) => p.centre },
  { libelle: 'Prêté le', rendu: (p) => formaterDate(p.dateDebut) },
  { libelle: 'Retour prévu', rendu: (p) => formaterDate(p.dateRetourPrevue) },
  { libelle: 'Rendu le', rendu: (p) => formaterDate(p.dateRetour) },
  {
    libelle: 'État',
    rendu: (p) => <Badge variant={VARIANTES[p.etat]}>{LIBELLES_ETATS_PRET[p.etat]}</Badge>,
  },
  {
    libelle: 'Retour',
    rendu: (p) => (p.dateRetour === null ? <FormulaireRetourPret pretId={p.id} /> : null),
  },
];

export default async function PagePrets({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const [{ lignes, pagination }, parc] = await Promise.all([
    listerPrets(acteur, perimetre, parametres),
    listerParc(acteur, perimetre),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Prêts">
        Parc de prêt de chaque centre. Un appareil y entre depuis sa fiche.
      </EntetePage>
      <section className="grid gap-2">
        <h2 className="font-medium">Parc</h2>
        {parc.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun appareil dans le parc.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {parc.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/stock/appareils/${a.id}`} className="underline underline-offset-2">
                  {a.numeroSerie}
                </Link>
                <span>
                  {a.designation}, {a.centre} : {LIBELLES_STATUTS_APPAREIL[a.statut]}
                </span>
                {a.statut === 'EN_STOCK' ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/sav/prets/nouveau?appareil=${a.id}`}>Prêter</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(p) => p.id}
        pagination={pagination}
        chemin="/sav/prets"
        parametres={parametres}
        vide="Aucun prêt."
      />
    </div>
  );
}
