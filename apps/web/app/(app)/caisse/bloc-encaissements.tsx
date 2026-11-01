import {
  centimes,
  formatEuros,
  LIBELLES_MODES_PAIEMENT,
  LIBELLES_NATURES_MOUVEMENT,
  peutRembourser,
} from '@ha/domain';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDateHeure } from '@/lib/format';
import { requireSession } from '@/server/auth/gardes';
import {
  acomptesDuDevis,
  encaissementsDeFacture,
  type MouvementVue,
} from '@/server/services/encaissements';

import { FormulaireAcompte, FormulaireEncaissement, FormulaireRemboursement } from './formulaires';

const euros = (valeur: number) => formatEuros(centimes(valeur));
const saisie = (valeur: number) => (valeur / 100).toFixed(2).replace('.', ',');

function Mouvements({
  mouvements,
  remboursable,
}: {
  mouvements: readonly MouvementVue[];
  remboursable: boolean;
}) {
  if (mouvements.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun mouvement.</p>;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Opération</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead className="text-right">Montant</TableHead>
            <TableHead className="text-right">Rendu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mouvements.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{formaterDateHeure(m.createdAt)}</TableCell>
              <TableCell>
                {LIBELLES_NATURES_MOUVEMENT[m.nature]}
                {m.motif ? ` : ${m.motif}` : ''}
              </TableCell>
              <TableCell>{LIBELLES_MODES_PAIEMENT[m.mode]}</TableCell>
              <TableCell className="text-right">{euros(m.montantCentimes)}</TableCell>
              <TableCell className="text-right">{euros(m.renduCentimes)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {remboursable
        ? mouvements
            .filter((m) => m.remboursable > 0)
            .map((m) => (
              <details key={m.id} className="text-sm">
                <summary>
                  Rembourser ou annuler {euros(m.montantCentimes)} (
                  {LIBELLES_MODES_PAIEMENT[m.mode]}), {euros(m.remboursable)} disponibles
                </summary>
                <div className="pt-2">
                  <FormulaireRemboursement encaissementId={m.id} mode={m.mode} />
                </div>
              </details>
            ))
        : null}
    </>
  );
}

/** Encaissements d'une facture validée : solde calculé, mouvements et saisie. */
export async function BlocEncaissements({ factureId }: { factureId: string }) {
  const acteur = await requireSession();
  const { solde, mouvements } = await encaissementsDeFacture(acteur, factureId);
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-medium">Encaissements</h2>
      <dl className="grid max-w-sm grid-cols-2 gap-1 text-sm">
        <dt>Encaissé</dt>
        <dd className="text-right">{formatEuros(solde.encaisse)}</dd>
        <dt>Reste dû par le patient</dt>
        <dd className="text-right">{formatEuros(solde.du)}</dd>
        {solde.tropPercu > 0 ? (
          <>
            <dt>Trop-perçu à rembourser</dt>
            <dd className="text-right">{formatEuros(solde.tropPercu)}</dd>
          </>
        ) : null}
      </dl>
      <Mouvements mouvements={mouvements} remboursable={peutRembourser(acteur.role)} />
      {solde.du > 0 ? (
        <FormulaireEncaissement factureId={factureId} montantPropose={saisie(solde.du)} />
      ) : null}
    </section>
  );
}

/** Acomptes d'un devis signé : ils seront repris par la facture du dossier. */
export async function BlocAcomptes({ devisId }: { devisId: string }) {
  const acteur = await requireSession();
  const { mouvements, net } = await acomptesDuDevis(acteur, devisId);
  return (
    <div className="grid gap-3">
      <p className="text-sm">Acomptes reçus : {euros(net)}</p>
      <Mouvements mouvements={mouvements} remboursable={peutRembourser(acteur.role)} />
      <FormulaireAcompte devisId={devisId} />
    </div>
  );
}
