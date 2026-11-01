'use client';

import {
  LIBELLES_MODES_PAIEMENT,
  LIBELLES_NATURES_MOUVEMENT,
  MODES_PAIEMENT,
  type ModePaiement,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

import {
  compterCaisseAction,
  encaisserAcompteAction,
  encaisserFactureAction,
  lancerArchivageAction,
  lancerCloturesAction,
  ouvrirCaisseAction,
  rembourserAction,
  verifierArchiveAction,
  verifierChaineAction,
} from './actions';

const OPTIONS_MODES = MODES_PAIEMENT.map((m) => ({
  valeur: m,
  libelle: LIBELLES_MODES_PAIEMENT[m],
}));

type ActionEncaissement = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

function ChampsEncaissement({
  etat,
  envoyer,
  montantPropose,
  libelle,
}: {
  etat: EtatFormulaire;
  envoyer: (formData: FormData) => void;
  montantPropose: string;
  libelle: string;
}) {
  const [mode, choisirMode] = useState<ModePaiement | ''>('');
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-1">
        <label htmlFor="encaissement-mode" className="text-sm font-medium">
          Mode de paiement
        </label>
        <select
          id="encaissement-mode"
          name="mode"
          required
          value={mode}
          onChange={(e) => {
            choisirMode(e.target.value as ModePaiement | '');
          }}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">Choisir…</option>
          {OPTIONS_MODES.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      </div>
      <ChampTexte
        etat={etat}
        id="encaissement-montant"
        nom="montant"
        libelle="Montant (€)"
        defaut={montantPropose}
        requis
      />
      {mode === 'ESPECES' ? (
        <ChampTexte
          etat={etat}
          id="encaissement-remis"
          nom="remis"
          libelle="Montant remis par le patient (€)"
        />
      ) : null}
      {mode === 'CHEQUE' || mode === 'VIREMENT' ? (
        <ChampTexte etat={etat} id="encaissement-reference" nom="reference" libelle="Référence" />
      ) : null}
      {mode === 'FINANCEMENT' ? (
        <>
          <ChampTexte etat={etat} nom="partenaire" libelle="Partenaire de financement" requis />
          <ChampTexte etat={etat} nom="echeances" libelle="Nombre d’échéances" requis />
        </>
      ) : null}
      <div>
        <BoutonEnvoi>{libelle}</BoutonEnvoi>
      </div>
    </form>
  );
}

function FormulaireMouvement({
  action,
  montantPropose,
  libelle,
}: {
  action: ActionEncaissement;
  montantPropose: string;
  libelle: string;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <ChampsEncaissement
      etat={etat}
      envoyer={envoyer}
      montantPropose={montantPropose}
      libelle={libelle}
    />
  );
}

export function FormulaireEncaissement({
  factureId,
  montantPropose,
}: {
  factureId: string;
  montantPropose: string;
}) {
  return (
    <FormulaireMouvement
      action={encaisserFactureAction.bind(null, factureId)}
      montantPropose={montantPropose}
      libelle="Encaisser"
    />
  );
}

export function FormulaireAcompte({ devisId }: { devisId: string }) {
  return (
    <FormulaireMouvement
      action={encaisserAcompteAction.bind(null, devisId)}
      montantPropose=""
      libelle="Prendre l’acompte"
    />
  );
}

export function FormulaireRemboursement({
  encaissementId,
  mode,
}: {
  encaissementId: string;
  mode: ModePaiement;
}) {
  const [etat, envoyer] = useActionState(rembourserAction.bind(null, encaissementId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        id={`nature-${encaissementId}`}
        nom="nature"
        libelle="Opération"
        vide="Choisir…"
        options={(['REMBOURSEMENT', 'ANNULATION'] as const).map((n) => ({
          valeur: n,
          libelle: LIBELLES_NATURES_MOUVEMENT[n],
        }))}
      />
      <ListeDeroulante
        etat={etat}
        id={`mode-${encaissementId}`}
        nom="mode"
        libelle="Mode"
        vide="Choisir…"
        defaut={mode}
        options={OPTIONS_MODES}
      />
      <ChampTexte
        etat={etat}
        id={`montant-${encaissementId}`}
        nom="montant"
        libelle="Montant (€)"
        requis
      />
      <ZoneDeTexte etat={etat} id={`motif-${encaissementId}`} nom="motif" libelle="Motif" requis />
      <ChampTexte
        etat={etat}
        id={`reference-${encaissementId}`}
        nom="reference"
        libelle="Référence"
      />
      <div>
        <BoutonEnvoi variant="outline">Enregistrer l’opération</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireOuverture({
  centreId,
  fondPropose,
}: {
  centreId: string;
  fondPropose: string;
}) {
  const [etat, envoyer] = useActionState(ouvrirCaisseAction.bind(null, centreId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="fond" libelle="Fond de caisse (€)" defaut={fondPropose} requis />
      <ZoneDeTexte
        etat={etat}
        nom="justification"
        libelle="Justification si le fond diffère du montant attendu"
      />
      <div>
        <BoutonEnvoi>Ouvrir la caisse</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComptage({ centreId }: { centreId: string }) {
  const [etat, envoyer] = useActionState(compterCaisseAction.bind(null, centreId), ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="comptees" libelle="Espèces comptées (€)" requis />
      <ChampTexte etat={etat} nom="remiseBanque" libelle="Remise en banque (€)" />
      <ZoneDeTexte etat={etat} nom="justification" libelle="Justification de l’écart" />
      <div>
        <BoutonEnvoi>Enregistrer le comptage</BoutonEnvoi>
      </div>
    </form>
  );
}

function BoutonAction({
  action,
  libelle,
  variante,
}: {
  action: (etat: EtatFormulaire) => Promise<EtatFormulaire>;
  libelle: string;
  variante?: 'outline';
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi {...(variante ? { variant: variante } : {})}>{libelle}</BoutonEnvoi>
      </div>
    </form>
  );
}

export function BoutonClotures({ centreId }: { centreId: string }) {
  return (
    <BoutonAction action={lancerCloturesAction.bind(null, centreId)} libelle="Lancer la clôture" />
  );
}

export function BoutonArchivage({ centreId }: { centreId: string }) {
  return (
    <BoutonAction
      action={lancerArchivageAction.bind(null, centreId)}
      libelle="Archiver les mois clôturés"
    />
  );
}

export function BoutonVerifierArchive({ archiveId }: { archiveId: string }) {
  return (
    <BoutonAction
      action={verifierArchiveAction.bind(null, archiveId)}
      libelle="Vérifier"
      variante="outline"
    />
  );
}

export function BoutonVerifierChaine({ centreId }: { centreId: string }) {
  return (
    <BoutonAction action={verifierChaineAction.bind(null, centreId)} libelle="Vérifier la chaîne" />
  );
}
