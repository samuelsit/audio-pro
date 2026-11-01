'use client';

import {
  ACTIONS_SAV,
  AVERTISSEMENT_FACTURATION_SAV,
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
import type { FicheTicket } from '@/server/services/tickets-sav';

import {
  annulerAction,
  diagnostiquerAction,
  facturerAction,
  ouvrirTicketAction,
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
