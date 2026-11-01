import {
  centimes,
  formatEuros,
  LIBELLES_STATUT_FACTURE_FOURNISSEUR,
  LIBELLES_TYPE_ECART,
  type EcartRapproche,
} from '@ha/domain';
import type { Metadata } from 'next';

import { BoutonConfirmation } from '@/components/confirmation';
import { EntetePage } from '@/components/entete-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ouIntrouvable, perimetreCourant } from '@/server/auth/gardes';
import { obtenirFactureFournisseur } from '@/server/services/factures-fournisseurs';
import { listerFournisseurs } from '@/server/services/fournisseurs';

import { FormulaireMotif } from '../../formulaires';
import { modifierFactureAction, rejeterFactureAction, validerFactureAction } from '../actions';
import { FormulaireFacture } from '../formulaires';

export const metadata: Metadata = { title: 'Facture fournisseur – HA-Gestion' };

function detailEcart(e: EcartRapproche): string {
  const { montantAttenduCentimes: attendu, montantConstateCentimes: constate } = e;
  if (constate !== null) {
    const montant = formatEuros(centimes(constate));
    return attendu === null
      ? montant
      : `${formatEuros(centimes(attendu))} attendu, ${montant} facturé`;
  }
  if (e.quantiteAttendue !== null) {
    return `${String(e.quantiteAttendue)} attendu, ${String(e.quantiteConstatee)} constaté`;
  }
  return e.numeroSerie ?? '';
}

export default async function PageFactureFournisseur({
  params,
}: PageProps<'/commandes/factures/[id]'>) {
  const { id } = await params;
  const { acteur, centres } = await perimetreCourant();
  const [facture, fournisseurs] = await Promise.all([
    ouIntrouvable(obtenirFactureFournisseur(acteur, id)),
    listerFournisseurs(acteur),
  ]);
  const aValider = facture.statut === 'A_VALIDER';
  const manquants = Object.values(facture.manquants);
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Facture ${facture.numero ?? 'sans numéro'}`}>
        {facture.fournisseur ?? 'Fournisseur à choisir'} · {facture.centre ?? 'centre à choisir'}
      </EntetePage>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{LIBELLES_STATUT_FACTURE_FOURNISSEUR[facture.statut]}</Badge>
        <Button asChild variant="outline" size="sm">
          <a href={`/commandes/factures/${id}/pdf`}>Télécharger le PDF reçu</a>
        </Button>
      </div>
      {facture.expediteurInconnu ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
          Expéditeur inconnu : {facture.expediteur}. Vérifiez la facture avant de la valider.
        </p>
      ) : null}
      {facture.motifRejet ? (
        <p className="rounded-md border p-3 text-sm">Rejet : {facture.motifRejet}</p>
      ) : null}
      {aValider ? (
        <>
          <FormulaireFacture
            key={`${facture.fournisseurId ?? ''}-${facture.centreId ?? ''}-${String(facture.lignes.length)}`}
            action={modifierFactureAction.bind(null, id)}
            facture={facture}
            fournisseurs={fournisseurs.filter((f) => f.actif)}
            centres={centres}
            candidats={facture.candidats}
          />
          <section className="grid gap-2">
            <h2 className="font-medium">Rapprochement</h2>
            {manquants.length > 0 ? (
              <ul className="list-inside list-disc text-sm">
                {manquants.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
            {manquants.length === 0 && facture.ecarts.length === 0 ? (
              <p className="text-sm">Facture conforme à la commande et à la réception.</p>
            ) : null}
            {facture.ecarts.length > 0 ? (
              <ul className="list-inside list-disc text-sm">
                {facture.ecarts.map((e, rang) => (
                  <li key={rang}>
                    {LIBELLES_TYPE_ECART[e.type]} {detailEcart(e)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <BoutonConfirmation
                libelle="Valider la facture"
                titre="Valider cette facture ?"
                description="Elle sera figée. Les écarts affichés passeront à traiter."
                variant="default"
                action={validerFactureAction.bind(null, id)}
              />
            </div>
          </section>
          <section className="grid gap-2">
            <h2 className="font-medium">Rejeter</h2>
            <FormulaireMotif
              action={rejeterFactureAction.bind(null, id)}
              libelle="Motif du rejet"
              bouton="Rejeter la facture"
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
