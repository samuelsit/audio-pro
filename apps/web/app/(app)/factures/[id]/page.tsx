import {
  formatEuros,
  fseAEnvoyer,
  LIBELLES_NATURES_PIECE,
  LIBELLES_OREILLES,
  LIBELLES_STATUTS_CREANCE,
  LIBELLES_STATUTS_FACTURE,
  LIBELLES_STATUTS_FSE,
  peutEmettreAvoir,
  peutVendreAuComptoir,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerAccessoires } from '@/server/services/catalogue';
import { obtenirFactureDetail, type FactureDetaillee } from '@/server/services/facturation';
import { creancesDeLaFacture, type CreanceDeFacture } from '@/server/services/tiers-payant';

import { BlocEncaissements } from '../../caisse/bloc-encaissements';
import { ListeConstats } from '../../dossiers/[id]/liste-constats';
import { abandonnerAction, retirerLigneAction } from '../actions';
import {
  BoutonActualiserFse,
  BoutonConfirmerCouverture,
  BoutonPreparerFse,
  BoutonValider,
  FormulaireAvoir,
  FormulaireEnvoi,
  FormulaireLigne,
  FormulaireTiersPayant,
} from '../formulaires';

export const metadata: Metadata = { title: 'Facture – HA-Gestion' };

function Lignes({ detail, retirable }: { detail: FactureDetaillee; retirable: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Article</TableHead>
          <TableHead>Code LPP</TableHead>
          <TableHead>Prestation</TableHead>
          <TableHead>N° de série</TableHead>
          <TableHead className="text-right">Qté</TableHead>
          <TableHead className="text-right">Prix TTC</TableHead>
          <TableHead className="text-right">AMO</TableHead>
          <TableHead className="text-right">AMC</TableHead>
          <TableHead className="text-right">Reste à charge</TableHead>
          {retirable ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {detail.lignes.map((l) => (
          <TableRow key={l.id}>
            <TableCell>
              {l.oreille ? `${LIBELLES_OREILLES[l.oreille]} : ` : ''}
              {l.libelle}
            </TableCell>
            <TableCell className="font-mono">{l.codeLpp ?? '—'}</TableCell>
            <TableCell className="font-mono">{l.codePrestation ?? '—'}</TableCell>
            <TableCell className="font-mono">{l.numeroSerie ?? '—'}</TableCell>
            <TableCell className="text-right">{l.quantite}</TableCell>
            <TableCell className="text-right">{formatEuros(l.prixTTC)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.amo)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.amc)}</TableCell>
            <TableCell className="text-right">{formatEuros(l.resteACharge)}</TableCell>
            {retirable ? (
              <TableCell>
                <form action={retirerLigneAction.bind(null, detail.id, l.id)}>
                  <Button type="submit" size="sm" variant="ghost">
                    Retirer
                  </Button>
                </form>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BlocBrouillon({
  detail,
  accessoires,
  validable,
}: {
  detail: FactureDetaillee;
  accessoires: readonly { id: string; nom: string }[];
  validable: boolean;
}) {
  const { evaluation } = detail;
  return (
    <div className="grid gap-4">
      <Lignes detail={detail} retirable />
      {evaluation?.facture ? (
        <p className="text-sm">
          Total TTC {formatEuros(evaluation.facture.totaux.prixTTC)}, dont reste à charge{' '}
          {formatEuros(evaluation.facture.totaux.resteACharge)}.
        </p>
      ) : null}
      {evaluation && evaluation.controle.erreurs.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>À corriger avant la validation</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={evaluation.controle.erreurs} />
          </AlertDescription>
        </Alert>
      ) : null}
      {evaluation?.controle.erreurs.some((c) => c.code === 'COUVERTURE_AMO_A_CONFIRMER') ? (
        <BoutonConfirmerCouverture factureId={detail.id} />
      ) : null}
      <FormulaireLigne factureId={detail.id} accessoires={accessoires} />
      <FormulaireTiersPayant
        factureId={detail.id}
        dossierId={null}
        tiersPayantAmo={detail.tiersPayantAmo}
      />
      <div className="flex flex-wrap gap-2">
        {validable && evaluation?.etat === 'PRET' ? <BoutonValider factureId={detail.id} /> : null}
        {detail.dossierId === null ? (
          <form action={abandonnerAction.bind(null, detail.id)}>
            <Button type="submit" variant="outline">
              Abandonner la vente
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function BlocCreances({ creances }: { creances: readonly CreanceDeFacture[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-medium">Tiers payant</h2>
      <ul className="grid gap-1 text-sm">
        {creances.map((c) => (
          <li key={c.id}>
            <Link href={`/tiers-payant/creances/${c.id}`} className="underline underline-offset-2">
              {c.type} : {c.organisme}
            </Link>
            {`, ${formatEuros(c.montant)}, solde ${formatEuros(c.solde)}, ${LIBELLES_STATUTS_CREANCE[c.statut].toLowerCase()}, échéance ${formaterDate(c.echeanceAttendue)}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlocFse({ detail }: { detail: FactureDetaillee }) {
  const { fse, id } = detail;
  const statut = fse?.statut ?? null;
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-medium">Feuille de soins électronique</h2>
      {fse ? (
        <p className="text-sm">
          {LIBELLES_STATUTS_FSE[fse.statut]}
          {fse.motif ? ` : ${fse.motif}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {fseAEnvoyer(statut) ? (
          <BoutonPreparerFse factureId={id} libelle={fse ? 'Renvoyer' : 'Préparer la FSE'} />
        ) : null}
        {fse?.reference ? <BoutonActualiserFse factureId={id} /> : null}
      </div>
    </section>
  );
}

/** Ouvrir une pièce écrit une ligne READ dans le journal d'audit (service). */
export default async function PageFacture({ params }: PageProps<'/factures/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const detail = await ouIntrouvable(obtenirFactureDetail(acteur, id));
  const brouillon = detail.statut === 'BROUILLON';
  const validee = detail.statut === 'VALIDEE';
  const facture = detail.nature === 'FACTURE';
  const lignesCreditables = detail.lignes.filter((l) => l.resteACrediter > 0);
  const accessoires = brouillon ? await listerAccessoires(acteur) : [];
  const creances = validee && facture ? await creancesDeLaFacture(acteur, id) : [];
  const titre = `${LIBELLES_NATURES_PIECE[detail.nature]} ${detail.numero ?? '(brouillon)'}`;
  return (
    <div className="grid gap-6">
      <EntetePage titre={titre}>
        {detail.patient}
        {detail.dateFacture ? `, ${formaterDate(detail.dateFacture)}` : ''}
      </EntetePage>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{LIBELLES_STATUTS_FACTURE[detail.statut]}</Badge>
        {validee ? (
          <Button asChild variant="outline">
            <a href={`/factures/${id}/pdf`} target="_blank" rel="noreferrer">
              Ouvrir le PDF
            </a>
          </Button>
        ) : null}
        {detail.dossierId ? (
          <Button asChild variant="outline">
            <Link href={`/dossiers/${detail.dossierId}`}>Dossier</Link>
          </Button>
        ) : null}
        {detail.origine ? (
          <Button asChild variant="outline">
            <Link href={`/factures/${detail.origine.id}`}>Facture {detail.origine.numero}</Link>
          </Button>
        ) : null}
      </div>

      {brouillon && detail.dossierId === null ? (
        <BlocBrouillon
          detail={detail}
          accessoires={accessoires}
          validable={peutVendreAuComptoir(acteur.role)}
        />
      ) : (
        <Lignes detail={detail} retirable={false} />
      )}

      {validee ? (
        <dl className="grid max-w-sm grid-cols-2 gap-1 text-sm">
          <dt>Total HT</dt>
          <dd className="text-right">{formatEuros(detail.totaux.ht)}</dd>
          <dt>TVA</dt>
          <dd className="text-right">{formatEuros(detail.totaux.tva)}</dd>
          <dt>Total TTC</dt>
          <dd className="text-right">{formatEuros(detail.totaux.prixTTC)}</dd>
          <dt>Part AMO</dt>
          <dd className="text-right">{formatEuros(detail.totaux.amo)}</dd>
          <dt>Part AMC</dt>
          <dd className="text-right">{formatEuros(detail.totaux.amc)}</dd>
          <dt>Reste à charge</dt>
          <dd className="text-right">{formatEuros(detail.totaux.resteACharge)}</dd>
        </dl>
      ) : null}

      {creances.length > 0 ? <BlocCreances creances={creances} /> : null}

      {validee && facture ? <BlocEncaissements factureId={id} /> : null}

      {detail.avoirs.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Avoirs</h2>
          <ul className="grid gap-1 text-sm">
            {detail.avoirs.map((a) => (
              <li key={a.id}>
                <Link href={`/factures/${a.id}`} className="underline underline-offset-2">
                  Avoir {a.numero}
                </Link>
                {`, ${formatEuros(a.totalTTC)}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {validee && detail.canaux.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Envoi au patient</h2>
          <FormulaireEnvoi factureId={id} canaux={detail.canaux} />
        </section>
      ) : null}

      {validee && facture ? <BlocFse detail={detail} /> : null}

      {validee && facture && lignesCreditables.length > 0 && peutEmettreAvoir(acteur.role) ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-medium">Émettre un avoir</h2>
          <FormulaireAvoir factureId={id} lignes={lignesCreditables} />
        </section>
      ) : null}
    </div>
  );
}
