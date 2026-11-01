import {
  centimes,
  commandeAnnulable,
  commandeCloturable,
  commandeModifiable,
  formatEuros,
  LIBELLES_TYPE_PRODUIT,
  peutApprouverCommande,
  peutVoirPrixAchat,
  prixCommandeModifiable,
  type StatutCommande,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BoutonConfirmation } from '@/components/confirmation';
import { EntetePage } from '@/components/entete-page';
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
import {
  obtenirCommande,
  produitsDuFournisseur,
  type StatutEnvoi,
} from '@/server/services/commandes';

import {
  ajouterLigneAction,
  annulerCommandeAction,
  approuverCommandeAction,
  cloturerCommandeAction,
  fixerPrixLigneAction,
  refuserCommandeAction,
  retirerLigneAction,
  saisirAccuseAction,
  soumettreCommandeAction,
  transmettreCommandeAction,
} from '../actions';
import { BadgeStatutCommande } from '../badge-statut';
import { FormulaireAccuse, FormulaireLigne, FormulaireMotif, FormulairePrix } from '../formulaires';

export const metadata: Metadata = { title: 'Commande – HA-Gestion' };

const LIBELLES_ENVOI: Readonly<Record<StatutEnvoi, string>> = {
  A_ENVOYER: 'Envoi en attente',
  ENVOYEE: 'E-mail parti',
  ABANDONNEE: 'Envoi en échec',
};

const euros = (valeur: number | null) => (valeur === null ? '—' : formatEuros(centimes(valeur)));

export default async function PageCommande({ params }: PageProps<'/commandes/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const commande = await ouIntrouvable(obtenirCommande(acteur, id));
  const statut: StatutCommande = commande.statut;
  const voitPrix = peutVoirPrixAchat(acteur.role);
  const gere = peutApprouverCommande(acteur.role);
  const modifiable = commandeModifiable(statut);
  const produits = modifiable ? await produitsDuFournisseur(acteur, commande.fournisseurId) : [];
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Commande ${commande.numero}`}>
        {commande.fournisseur} · livraison à {commande.centre} · demandée par {commande.demandeur}
      </EntetePage>
      <div className="flex flex-wrap items-center gap-3">
        <BadgeStatutCommande statut={statut} />
        {voitPrix ? <span>Montant : {euros(commande.montantCentimes)}</span> : null}
        {commande.approbateur ? <span>Approuvée par {commande.approbateur}</span> : null}
        {commande.envoiDirect ? <span>Sans approbation, selon une règle</span> : null}
      </div>
      {commande.envoyeeLe ? (
        <section className="grid gap-1 text-sm">
          <p>
            {LIBELLES_ENVOI[commande.envoi ?? 'A_ENVOYER']}, bon confié le{' '}
            {formaterDate(commande.envoyeeLe.toISOString().slice(0, 10))}
            {commande.relances > 0 ? ` · ${String(commande.relances)} relance(s)` : ''}
          </p>
          <p>
            {commande.accuseLe
              ? `Accusé reçu le ${formaterDate(commande.accuseLe.toISOString().slice(0, 10))}`
              : 'Aucun accusé du fabricant.'}
            {commande.referenceFournisseur ? ` · référence ${commande.referenceFournisseur}` : ''}
          </p>
        </section>
      ) : null}
      {commande.envoi === 'ABANDONNEE' ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
          L’envoi du bon a échoué après plusieurs tentatives. Contactez le fabricant.
        </p>
      ) : null}
      {voitPrix ? (
        <div>
          <Button asChild variant="outline" size="sm">
            <a href={`/commandes/${id}/bon`}>
              {commande.envoyeeLe ? 'Bon de commande' : 'Aperçu du bon'}
            </a>
          </Button>
        </div>
      ) : null}
      {commande.motifRefus ? (
        <p className="rounded-md border p-3 text-sm">Refus : {commande.motifRefus}</p>
      ) : null}
      {commande.motifAnnulation ? (
        <p className="rounded-md border p-3 text-sm">Annulation : {commande.motifAnnulation}</p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produit</TableHead>
            <TableHead>Nominative</TableHead>
            <TableHead className="text-right">Commandé</TableHead>
            <TableHead className="text-right">Reçu</TableHead>
            {voitPrix ? <TableHead className="text-right">Prix d’achat</TableHead> : null}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {commande.lignes.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <div>{l.designation}</div>
                <div className="text-sm text-muted-foreground">
                  {LIBELLES_TYPE_PRODUIT[l.type]}
                  {l.enConsignation ? ' · consignation' : ''}
                </div>
              </TableCell>
              <TableCell>
                {l.patient ? (
                  <Link
                    href={`/patients/${l.patient.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {l.patient.nom}
                  </Link>
                ) : (
                  '—'
                )}
                {l.referencePatient ? (
                  <div className="font-mono text-sm text-muted-foreground">
                    {l.referencePatient}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="text-right">{l.quantite}</TableCell>
              <TableCell className="text-right">{l.quantiteRecue}</TableCell>
              {voitPrix ? (
                <TableCell className="text-right">
                  {prixCommandeModifiable(statut) ? (
                    <FormulairePrix
                      action={fixerPrixLigneAction.bind(null, id, l.id)}
                      defaut={
                        l.prixAchatCentimes === null
                          ? ''
                          : (l.prixAchatCentimes / 100).toFixed(2).replace('.', ',')
                      }
                    />
                  ) : (
                    euros(l.prixAchatCentimes)
                  )}
                </TableCell>
              ) : null}
              <TableCell className="text-right">
                {modifiable ? (
                  <form action={retirerLigneAction.bind(null, id, l.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Retirer
                    </Button>
                  </form>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {modifiable ? (
        <section className="grid gap-3">
          <h2 className="font-medium">Ajouter une ligne</h2>
          <FormulaireLigne
            action={ajouterLigneAction.bind(null, id)}
            produits={produits}
            centreId={commande.centreId}
            saisitPrix={voitPrix}
          />
          <div>
            <BoutonConfirmation
              libelle="Soumettre"
              titre="Soumettre cette demande ?"
              description="Selon les règles du client, elle part directement ou attend une approbation."
              variant="default"
              action={soumettreCommandeAction.bind(null, id)}
            />
          </div>
        </section>
      ) : null}
      {gere && statut === 'A_APPROUVER' ? (
        <section className="grid gap-3">
          <h2 className="font-medium">Approbation</h2>
          <div>
            <BoutonConfirmation
              libelle="Approuver"
              titre="Approuver cette commande ?"
              description="Son contenu sera figé."
              variant="default"
              action={approuverCommandeAction.bind(null, id)}
            />
          </div>
          <FormulaireMotif
            action={refuserCommandeAction.bind(null, id)}
            libelle="Motif du refus"
            bouton="Refuser"
          />
        </section>
      ) : null}
      {gere && statut === 'APPROUVEE' ? (
        <div>
          <BoutonConfirmation
            libelle="Envoyer au fabricant"
            titre="Envoyer cette commande ?"
            description="Le bon de commande part par e-mail."
            variant="default"
            action={transmettreCommandeAction.bind(null, id)}
          />
        </div>
      ) : null}
      {statut === 'ENVOYEE' && commande.accuseLe === null ? (
        <section className="grid gap-3">
          <h2 className="font-medium">Accusé de réception</h2>
          <FormulaireAccuse action={saisirAccuseAction.bind(null, id)} />
        </section>
      ) : null}
      {gere && commandeCloturable(statut, commande.lignes, 0) ? (
        <div>
          <BoutonConfirmation
            libelle="Clore la commande"
            titre="Clore cette commande ?"
            description="Elle ne bougera plus."
            variant="default"
            action={cloturerCommandeAction.bind(null, id)}
          />
        </div>
      ) : null}
      {(gere || modifiable) && commandeAnnulable(statut, commande.lignes) ? (
        <section className="grid gap-3">
          <h2 className="font-medium">Annuler</h2>
          {commande.envoyeeLe ? (
            <p className="text-sm text-muted-foreground">
              Le bon est parti : prévenez le fabricant, il n’est pas averti automatiquement.
            </p>
          ) : null}
          <FormulaireMotif
            action={annulerCommandeAction.bind(null, id)}
            libelle="Motif de l’annulation"
            bouton="Annuler la commande"
          />
        </section>
      ) : null}
    </div>
  );
}
