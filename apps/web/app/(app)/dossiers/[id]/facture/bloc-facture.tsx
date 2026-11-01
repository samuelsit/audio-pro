import {
  LIBELLES_ETATS_FACTURE,
  LIBELLES_OREILLES,
  LIBELLES_STATUTS_PEC,
  centimes,
  formatEuros,
  type LigneFacture,
} from '@ha/domain';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate, formaterJour } from '@/lib/format';
import type { ComplementaireVue } from '@/server/services/complementaires';
import type { FactureDetail } from '@/server/services/factures';

import { FormulaireTiersPayant } from '../../../factures/formulaires';
import { ListeConstats } from '../liste-constats';
import { BoutonConfirmationAmo, BoutonValidation, FormulairePec } from './formulaires-facture';

function libelleLigne({ oreille, libelle, quantite }: LigneFacture): string {
  const cote = oreille ? `${LIBELLES_OREILLES[oreille]} : ` : '';
  return `${cote}${libelle}${quantite > 1 ? ` × ${String(quantite)}` : ''}`;
}

function Lignes({ facture }: { facture: NonNullable<FactureDetail['facture']> }) {
  const { lignes, totaux } = facture;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Article</TableHead>
          <TableHead>Code LPP</TableHead>
          <TableHead>Prestation</TableHead>
          <TableHead>N° de série</TableHead>
          <TableHead className="text-right">Prix TTC</TableHead>
          <TableHead className="text-right">Base</TableHead>
          <TableHead className="text-right">AMO</TableHead>
          <TableHead className="text-right">AMC</TableHead>
          <TableHead className="text-right">Reste à charge</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lignes.map((l, index) => (
          // Une offre peut porter deux fois le même article : seule la position distingue les lignes.
          <TableRow key={index}>
            <TableCell>{libelleLigne(l)}</TableCell>
            <TableCell className="font-mono">{l.codeLpp ?? '—'}</TableCell>
            <TableCell className="font-mono">{l.codePrestation ?? '—'}</TableCell>
            <TableCell className="font-mono">{l.numeroSerie ?? '—'}</TableCell>
            <TableCell className="text-right">{formatEuros(l.prixTTC)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.baseRemboursement)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.amo)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.amc)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.resteACharge)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total</TableCell>
          <TableCell className="text-right">{formatEuros(totaux.prixTTC)}</TableCell>
          <TableCell />
          <TableCell className="text-right">{formatEuros(totaux.amo)}</TableCell>
          <TableCell className="text-right">{formatEuros(totaux.amc)}</TableCell>
          <TableCell className="text-right">{formatEuros(totaux.resteACharge)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function ResumePec({ dossierId, pec }: { dossierId: string; pec: FactureDetail['pec'] }) {
  if (!pec) {
    return <p className="text-sm text-muted-foreground">Aucune prise en charge saisie.</p>;
  }
  const details = [
    LIBELLES_STATUTS_PEC[pec.statut],
    pec.organisme,
    pec.plateforme,
    pec.numeroAccord && `accord ${pec.numeroAccord}`,
    pec.montantAccordeCentimes === null ? null : formatEuros(centimes(pec.montantAccordeCentimes)),
    pec.datePec && formaterDate(pec.datePec),
  ].filter(Boolean);
  return (
    <p className="text-sm">
      {details.join(', ')}
      {pec.justificatif ? (
        <>
          {' – '}
          <a
            href={`/dossiers/${dossierId}/facture/justificatif`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Ouvrir le justificatif
          </a>
        </>
      ) : null}
    </p>
  );
}

/** Brouillon du dossier, recalculé au jour courant : la validation le fige (ADR-028). */
export function BlocFacture({
  dossierId,
  detail,
  validable,
  complementaires,
}: {
  dossierId: string;
  detail: FactureDetail;
  validable: boolean;
  complementaires: readonly ComplementaireVue[];
}) {
  const { etat, controle, facture, dateDelivrance, pec, c2s, amoConfirmeeLe, factureId } = detail;
  const aConfirmer = controle.erreurs.some((c) => c.code === 'COUVERTURE_AMO_A_CONFIRMER');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={etat === 'PRET' ? 'secondary' : 'destructive'}>
          {etat === 'PRET' ? 'Prêt à facturer' : LIBELLES_ETATS_FACTURE.BLOQUE}
        </Badge>
        <span>Calculé au {formaterDate(dateDelivrance)}</span>
        {amoConfirmeeLe ? (
          <span className="text-muted-foreground">
            Couverture AMO confirmée le {formaterJour(amoConfirmeeLe)}
          </span>
        ) : null}
      </div>
      {controle.erreurs.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>À corriger avant la facturation</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={controle.erreurs} />
          </AlertDescription>
        </Alert>
      ) : null}
      {controle.avertissements.length > 0 ? (
        <Alert>
          <AlertTitle>Avertissements</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={controle.avertissements} />
          </AlertDescription>
        </Alert>
      ) : null}
      {facture ? <Lignes facture={facture} /> : null}
      {aConfirmer ? (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Couverture AMO</h3>
          <p className="text-sm text-muted-foreground">
            Relisez la carte Vitale depuis la fiche du patient, ou confirmez la saisie après
            vérification.
          </p>
          <BoutonConfirmationAmo dossierId={dossierId} />
        </section>
      ) : null}
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Tiers payant</h3>
        <FormulaireTiersPayant
          factureId={factureId}
          dossierId={dossierId}
          tiersPayantAmo={detail.tiersPayantAmo}
        />
      </section>
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Prise en charge complémentaire</h3>
        {c2s ? (
          <p className="text-sm text-muted-foreground">
            Bénéficiaire de la C2S : la part complémentaire est calculée, sans prise en charge à
            saisir.
          </p>
        ) : (
          <>
            <ResumePec dossierId={dossierId} pec={pec} />
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Saisir la prise en charge
              </summary>
              <div className="mt-3">
                <FormulairePec dossierId={dossierId} pec={pec} complementaires={complementaires} />
              </div>
            </details>
          </>
        )}
      </section>
      {etat === 'PRET' && validable ? (
        <BoutonValidation dossierId={dossierId} factureId={factureId} />
      ) : null}
    </>
  );
}
