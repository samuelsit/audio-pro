import {
  filtreCreancesSchema,
  formatEuros,
  LIBELLES_STATUTS_CREANCE,
  LIBELLES_STATUTS_FSE,
  LIBELLES_TRANCHES_ANCIENNETE,
  LIBELLES_TYPES_CREANCE,
  STATUTS_CREANCE,
  TRANCHES_ANCIENNETE,
  TYPES_CREANCE,
  type LigneSynthese,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ListeDeroulante, ChampTexte } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
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
import { ETAT_INITIAL } from '@/lib/formulaire';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import {
  listerCreances,
  syntheseParOrganisme,
  type CreanceListee,
} from '@/server/services/tiers-payant';

export const metadata: Metadata = { title: 'Tiers payant – HA-Gestion' };

const CHEMIN = '/tiers-payant';

const options = <T extends string>(valeurs: readonly T[], libelles: Readonly<Record<T, string>>) =>
  valeurs.map((valeur) => ({ valeur, libelle: libelles[valeur] }));

const COLONNES: readonly Colonne<CreanceListee>[] = [
  {
    libelle: 'Facture',
    rendu: (c) => (
      <Link href={`${CHEMIN}/creances/${c.id}`} className="underline underline-offset-2">
        {c.numeroFacture}
      </Link>
    ),
  },
  { libelle: 'Part', rendu: (c) => c.type },
  { libelle: 'Organisme', rendu: (c) => c.organisme },
  { libelle: 'Patient', rendu: (c) => c.patient },
  { libelle: 'Date', rendu: (c) => formaterDate(c.dateEmission) },
  { libelle: 'Échéance', rendu: (c) => formaterDate(c.echeanceAttendue) },
  { libelle: 'Ancienneté', rendu: (c) => LIBELLES_TRANCHES_ANCIENNETE[c.tranche] },
  { libelle: 'Montant', rendu: (c) => formatEuros(c.montant), className: 'text-right' },
  { libelle: 'Solde', rendu: (c) => formatEuros(c.solde), className: 'text-right' },
  {
    libelle: 'FSE',
    rendu: (c) => (c.fse ? LIBELLES_STATUTS_FSE[c.fse] : 'Non transmise'),
  },
  {
    libelle: 'Statut',
    rendu: (c) => <Badge variant="secondary">{LIBELLES_STATUTS_CREANCE[c.statut]}</Badge>,
  },
];

function Synthese({ lignes }: { lignes: readonly LigneSynthese[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-medium">Encours par organisme et par ancienneté</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organisme</TableHead>
            <TableHead className="text-right">Créances</TableHead>
            {TRANCHES_ANCIENNETE.map((t) => (
              <TableHead key={t} className="text-right">
                {LIBELLES_TRANCHES_ANCIENNETE[t]}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lignes.map((l) => (
            <TableRow key={l.organisme}>
              <TableCell>
                <Link
                  href={urlAvecParametres(CHEMIN, { organisme: l.organisme })}
                  className="underline underline-offset-2"
                >
                  {l.organisme}
                </Link>
              </TableCell>
              <TableCell className="text-right">{l.nombre}</TableCell>
              {TRANCHES_ANCIENNETE.map((t) => (
                <TableCell key={t} className="text-right">
                  {formatEuros(l.parTranche[t])}
                </TableCell>
              ))}
              <TableCell className="text-right font-medium">{formatEuros(l.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** La liste n'ouvre aucun dossier : pas de ligne READ (ADR-006). */
export default async function PageTiersPayant({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { organisme, type, statut, tranche } = filtreCreancesSchema.parse(parametres);
  const [{ lignes, pagination }, synthese] = await Promise.all([
    listerCreances(acteur, perimetre, parametres),
    syntheseParOrganisme(acteur, perimetre),
  ]);
  const filtres = {
    ...(organisme ? { organisme } : {}),
    ...(type ? { type } : {}),
    ...(statut ? { statut } : {}),
    ...(tranche ? { tranche } : {}),
  };
  return (
    <div className="grid gap-6">
      <EntetePage titre="Tiers payant">
        Ce que doivent les organismes, facture par facture. Les créances naissent à la validation
        des factures.
      </EntetePage>
      {synthese.length > 0 ? <Synthese lignes={synthese} /> : null}
      <FormulaireFiltres chemin={CHEMIN}>
        <ChampTexte etat={ETAT_INITIAL} nom="organisme" libelle="Organisme" defaut={organisme} />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="type"
          libelle="Part"
          vide="Toutes"
          requis={false}
          defaut={type}
          options={options(TYPES_CREANCE, LIBELLES_TYPES_CREANCE)}
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="statut"
          libelle="Statut"
          vide="À suivre"
          requis={false}
          defaut={statut}
          options={options(STATUTS_CREANCE, LIBELLES_STATUTS_CREANCE)}
        />
        <ListeDeroulante
          etat={ETAT_INITIAL}
          nom="tranche"
          libelle="Ancienneté"
          vide="Toutes"
          requis={false}
          defaut={tranche}
          options={options(TRANCHES_ANCIENNETE, LIBELLES_TRANCHES_ANCIENNETE)}
        />
      </FormulaireFiltres>
      <div>
        <Button asChild variant="outline">
          <a href={urlAvecParametres(`${CHEMIN}/export`, filtres)}>Exporter en CSV</a>
        </Button>
      </div>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(c) => c.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={filtres}
        vide="Aucune créance à suivre."
      />
    </div>
  );
}
