'use client';

import { useActionState, useEffect, useRef } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

export function FormulaireOuverture({
  action,
  centres,
  centreId,
}: {
  action: Action;
  centres: readonly { id: string; nom: string }[];
  centreId: string | undefined;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="centreId"
        libelle="Centre"
        vide="Choisir…"
        defaut={centreId}
        options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
      />
      <div>
        <BoutonEnvoi>Ouvrir un inventaire</BoutonEnvoi>
      </div>
    </form>
  );
}

/** Le champ se vide et garde le focus : la douchette enchaîne les lectures. */
export function FormulairePointage({ action }: { action: Action }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const formulaire = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (etat.succes) {
      formulaire.current?.reset();
    }
    formulaire.current?.querySelector('input')?.focus();
  }, [etat]);
  return (
    <form ref={formulaire} action={envoyer} className="grid max-w-md gap-4">
      <MessageFormulaire etat={etat} />
      <ChampTexte etat={etat} nom="numeroSerie" libelle="Numéro de série" requis />
      <div>
        <BoutonEnvoi enCours="Pointage…">Pointer</BoutonEnvoi>
      </div>
    </form>
  );
}

export function FormulaireComptage({
  action,
  libelle,
  defaut,
}: {
  action: Action;
  libelle: string;
  defaut: number | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="flex items-end gap-2">
      <ChampTexte
        etat={etat}
        nom="quantiteComptee"
        libelle={libelle}
        defaut={defaut === null ? '' : String(defaut)}
        inputMode="numeric"
        requis
      />
      <BoutonEnvoi variant="outline">Compter</BoutonEnvoi>
    </form>
  );
}

export function FormulaireJustification({
  action,
  libelle,
  defaut,
}: {
  action: Action;
  libelle: string;
  defaut: string | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="flex items-end gap-2">
      <ChampTexte
        etat={etat}
        nom="justification"
        id={`justification-${libelle}`}
        libelle={libelle}
        defaut={defaut ?? ''}
        requis
      />
      <BoutonEnvoi variant="outline">Justifier</BoutonEnvoi>
    </form>
  );
}

export function FormulaireCloture({ action }: { action: () => Promise<EtatFormulaire> }) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-2">
      <MessageFormulaire etat={etat} />
      <div>
        <BoutonEnvoi enCours="Clôture…">Clôturer l’inventaire</BoutonEnvoi>
      </div>
    </form>
  );
}
