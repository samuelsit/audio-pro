'use client';

import {
  ACTIONS_SAV,
  AVERTISSEMENT_FACTURATION_SAV,
  centimes,
  formatEuros,
  LIBELLES_ACTIONS_SAV,
  LIBELLES_MOTIFS_SAV,
  MOTIFS_SAV,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { ArticleComptoir } from '@/server/services/comptoir';
import type { FicheTicket } from '@/server/services/tickets-sav';

import { SelecteurPatient } from '../stock/selecteur-patient';

import {
  abandonnerRemplacantAction,
  annulerAction,
  annulerRetourAction,
  corrigerSerieAction,
  diagnostiquerAction,
  echangerStockAction,
  enregistrerIssueAction,
  enregistrerRemplacantAction,
  envoyerRetourAction,
  facturerAction,
  ouvrirTicketAction,
  preparerRetourAction,
  preterAction,
  remettreRemplacantAction,
  rendrePretAction,
  venteComptoirAction,
  restituerAction,
  terminerReparationAction,
} from './actions';

const OPTIONS_MOTIFS = MOTIFS_SAV.map((m) => ({ valeur: m, libelle: LIBELLES_MOTIFS_SAV[m] }));
const OPTIONS_ACTIONS = ACTIONS_SAV.map((a) => ({ valeur: a, libelle: LIBELLES_ACTIONS_SAV[a] }));

export function FormulaireOuverture({ serie }: { serie: string }) {
  const [etat, envoyer] = useActionState(ouvrirTicketAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="numeroSerie" libelle="Numéro de série" defaut={serie} requis />
      <ListeDeroulante
        etat={etat}
        nom="motif"
        libelle="Motif"
        options={OPTIONS_MOTIFS}
        defaut=""
        vide="Choisir"
      />
      <ZoneDeTexte etat={etat} nom="description" libelle="Ce que signale le patient" />
      <div>
        <BoutonEnvoi>Ouvrir le ticket</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireDiagnostic({ ticket }: { ticket: FicheTicket }) {
  const [etat, envoyer] = useActionState(diagnostiquerAction.bind(null, ticket.id), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="motif"
          libelle="Motif retenu"
          options={OPTIONS_MOTIFS}
          defaut={ticket.motif}
        />
        <ListeDeroulante
          etat={etat}
          nom="action"
          libelle="Action"
          options={OPTIONS_ACTIONS}
          defaut={ticket.action ?? ''}
          vide="Choisir"
        />
      </div>
      <ZoneDeTexte
        etat={etat}
        nom="diagnostic"
        libelle="Diagnostic"
        defaut={ticket.diagnostic}
        requis
      />
      <ChampTexte
        etat={etat}
        nom="cout"
        libelle="Coût éventuel (€)"
        defaut={
          ticket.coutCentimes === null
            ? ''
            : (ticket.coutCentimes / 100).toFixed(2).replace('.', ',')
        }
      />
      <div>
        <BoutonEnvoi>Enregistrer le diagnostic</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireFacturation({ ticketId }: { ticketId: string }) {
  const [etat, envoyer] = useActionState(facturerAction.bind(null, ticketId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <p className="text-sm text-muted-foreground">{AVERTISSEMENT_FACTURATION_SAV}</p>
      <ZoneDeTexte etat={etat} nom="motif" libelle="Pourquoi cette facturation" requis />
      <div>
        <BoutonEnvoi>Préparer la facture</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireAnnulation({ ticketId }: { ticketId: string }) {
  const [etat, envoyer] = useActionState(annulerAction.bind(null, ticketId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif d’annulation" requis />
      <div>
        <BoutonEnvoi variant="outline">Annuler le ticket</BoutonEnvoi>
      </div>
    </form>
  );
}

function BoutonAction({
  libelle,
  action,
}: {
  libelle: string;
  action: () => Promise<EtatFormulaire>;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi>{libelle}</BoutonEnvoi>
      </div>
    </form>
  );
}

export function ActionReparationTerminee({ ticketId }: { ticketId: string }) {
  return (
    <BoutonAction
      libelle="Réparation terminée"
      action={terminerReparationAction.bind(null, ticketId)}
    />
  );
}

export function ActionRestitution({ ticketId }: { ticketId: string }) {
  return <BoutonAction libelle="Rendre l’appareil" action={restituerAction.bind(null, ticketId)} />;
}

export interface OptionsRetour {
  readonly ticketId?: string | undefined;
  readonly appareilId?: string | undefined;
  readonly ecartId?: string | undefined;
  readonly fournisseurs: readonly { id: string; nom: string }[];
  readonly defaut: string;
}

export function FormulairePreparationRetour({
  ticketId,
  appareilId,
  ecartId,
  fournisseurs,
  defaut,
}: OptionsRetour) {
  const [etat, envoyer] = useActionState(preparerRetourAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="ticketId" value={ticketId ?? ''} />
      <input type="hidden" name="appareilId" value={appareilId ?? ''} />
      <input type="hidden" name="ecartId" value={ecartId ?? ''} />
      <ListeDeroulante
        etat={etat}
        nom="fournisseurId"
        libelle="Fournisseur"
        options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
        defaut={defaut}
        vide="Choisir"
      />
      <ZoneDeTexte
        etat={etat}
        nom="descriptionPanne"
        libelle="Description pour le fabricant"
        aide="Elle part sur le bon de retour : ni nom, ni donnée de santé du patient."
      />
      <div>
        <BoutonEnvoi>Préparer le bon de retour</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireEnvoi({ retourId, jour }: { retourId: string; jour: string }) {
  const [etat, envoyer] = useActionState(envoyerRetourAction.bind(null, retourId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-3">
        <ChampTexte etat={etat} nom="transporteur" libelle="Transporteur" />
        <ChampTexte etat={etat} nom="numeroSuivi" libelle="Numéro de suivi" />
        <ChampTexte
          etat={etat}
          nom="dateEnvoi"
          libelle="Envoyé le"
          type="date"
          defaut={jour}
          requis
        />
      </div>
      <div>
        <BoutonEnvoi>Marquer envoyé</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireIssue({ retourId }: { retourId: string }) {
  const [etat, envoyer] = useActionState(enregistrerIssueAction.bind(null, retourId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="issue"
        libelle="Retour du fabricant"
        options={[
          { valeur: 'REPARE', libelle: 'Réparé' },
          { valeur: 'REFUSE', libelle: 'Refusé' },
        ]}
        defaut=""
        vide="Choisir"
      />
      <div>
        <BoutonEnvoi>Enregistrer le retour</BoutonEnvoi>
      </div>
    </form>
  );
}

export function ActionAnnulerRetour({ retourId }: { retourId: string }) {
  return (
    <BoutonAction libelle="Annuler ce retour" action={annulerRetourAction.bind(null, retourId)} />
  );
}

function ChampsRemplacant({
  etat,
  modeles,
  modeleId,
}: {
  etat: EtatFormulaire;
  modeles: readonly { id: string; libelle: string }[];
  modeleId: string;
}) {
  return (
    <>
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="modeleId"
        libelle="Modèle"
        options={modeles.map((m) => ({ valeur: m.id, libelle: m.libelle }))}
        defaut={modeleId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="numeroSerie" libelle="Nouveau numéro de série" requis />
        <ChampTexte etat={etat} nom="confirmation" libelle="Confirmer le numéro" requis />
      </div>
      <ChampTexte etat={etat} nom="referenceBonLivraison" libelle="Bon de livraison" requis />
      <div>
        <BoutonEnvoi>Enregistrer le remplaçant</BoutonEnvoi>
      </div>
    </>
  );
}

export function FormulaireRemplacant({
  ticketId,
  modeles,
  modeleId,
}: {
  ticketId: string;
  modeles: readonly { id: string; libelle: string }[];
  modeleId: string;
}) {
  const [etat, envoyer] = useActionState(
    enregistrerRemplacantAction.bind(null, ticketId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <ChampsRemplacant etat={etat} modeles={modeles} modeleId={modeleId} />
    </form>
  );
}

export function FormulaireEchangeStock({
  retourId,
  modeles,
  modeleId,
}: {
  retourId: string;
  modeles: readonly { id: string; libelle: string }[];
  modeleId: string;
}) {
  const [etat, envoyer] = useActionState(echangerStockAction.bind(null, retourId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <ChampsRemplacant etat={etat} modeles={modeles} modeleId={modeleId} />
    </form>
  );
}

export function FormulaireCorrectionSerie({ ticketId }: { ticketId: string }) {
  const [etat, envoyer] = useActionState(corrigerSerieAction.bind(null, ticketId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="numeroSerie" libelle="Numéro corrigé" requis />
        <ChampTexte etat={etat} nom="confirmation" libelle="Confirmer le numéro" requis />
      </div>
      <div>
        <BoutonEnvoi variant="outline">Corriger le numéro</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireAbandonRemplacant({ ticketId }: { ticketId: string }) {
  const [etat, envoyer] = useActionState(
    abandonnerRemplacantAction.bind(null, ticketId),
    ETAT_INITIAL,
  );
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" requis />
      <div>
        <BoutonEnvoi variant="outline">Remettre le remplaçant en stock</BoutonEnvoi>
      </div>
    </form>
  );
}

export function ActionRemise({ ticketId }: { ticketId: string }) {
  return (
    <BoutonAction
      libelle="Remettre le remplaçant au patient"
      action={remettreRemplacantAction.bind(null, ticketId)}
    />
  );
}

export function FormulairePret({
  appareilId,
  centreId,
  dureeJours,
}: {
  appareilId: string;
  centreId: string;
  dureeJours: number;
}) {
  const [etat, envoyer] = useActionState(preterAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="appareilId" value={appareilId} />
      <SelecteurPatient centreId={centreId} erreurs={etat.erreurs?.patientId} />
      <ChampTexte
        etat={etat}
        nom="dateRetourPrevue"
        libelle="Retour prévu le"
        type="date"
        aide={`Sans date, ${String(dureeJours)} jours.`}
      />
      <div>
        <BoutonEnvoi>Prêter</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireRetourPret({ pretId }: { pretId: string }) {
  const [etat, envoyer] = useActionState(rendrePretAction.bind(null, pretId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="etatRetour" libelle="État au retour" id={`etat-${pretId}`} />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer le retour</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComptoir({
  patientId,
  centreId,
  articles,
  prescriptions,
}: {
  patientId: string;
  centreId: string;
  articles: readonly ArticleComptoir[];
  prescriptions: readonly { id: string; libelle: string }[];
}) {
  const [etat, envoyer] = useActionState(venteComptoirAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="centreId" value={centreId} />
      <ListeDeroulante
        etat={etat}
        nom="prescriptionId"
        libelle="Prescription (ouvre le remboursement des lignes LPP)"
        vide="Sans prescription : tout en reste à charge"
        requis={false}
        options={prescriptions.map((p) => ({ valeur: p.id, libelle: p.libelle }))}
      />
      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun article en stock dans ce centre.</p>
      ) : (
        <ul className="grid gap-2">
          {articles.map((a) => (
            <li key={a.id} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem]">
              <p className="text-sm">
                {a.nom} ({a.categorie}), {formatEuros(centimes(a.prixCentimes))},{' '}
                {a.quantiteEnStock} en stock
              </p>
              <ChampTexte
                etat={etat}
                nom={`quantite:${a.id}`}
                libelle="Quantité"
                inputMode="numeric"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <ChampTexte etat={etat} nom="entretienLibelle" libelle="Entretien (hors LPP)" />
        <ChampTexte etat={etat} nom="entretienPrix" libelle="Prix (€)" />
      </div>
      <div>
        <BoutonEnvoi>Préparer la vente</BoutonEnvoi>
      </div>
    </form>
  );
}
