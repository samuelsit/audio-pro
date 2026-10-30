'use client';

import type { StatutAppareil } from '@ha/domain';
import { useActionState, useState, type ReactNode } from 'react';

import {
  BoutonEnvoi,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { FicheAppareil } from '@/server/services/stock';

import { annulerVenteAction, changerStatutAction, transfererAction } from '../../actions';
import { SelecteurPatient } from '../../selecteur-patient';

const LIBELLES_ACTION: Readonly<Record<StatutAppareil, string>> = {
  EN_STOCK: 'Remettre en stock',
  RESERVE: 'Réserver',
  EN_ESSAI: 'Mettre en essai',
  VENDU: 'Vendre',
  RETOUR_FABRICANT: 'Retour fabricant',
  SAV: 'Passer en SAV',
  PRET: 'Prêter',
};

/** Depuis la réparation, VENDU rend l'appareil au patient : ce n'est pas une nouvelle vente. */
function libelleAction(de: StatutAppareil, vers: StatutAppareil): string {
  return vers === 'VENDU' && de !== 'EN_ESSAI' ? 'Rendre au patient' : LIBELLES_ACTION[vers];
}

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

function Panneau({
  libelle,
  description,
  action,
  variant = 'outline',
  children,
}: {
  libelle: string;
  description: string;
  action: Action;
  variant?: 'outline' | 'destructive';
  children: (etat: EtatFormulaire) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOuvert(true)}>
        {libelle}
      </Button>
      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{libelle}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <form action={envoyer} className="grid gap-4 px-4 pb-4">
            <MessageFormulaire etat={etat} />
            {children(etat)}
            <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" lignes={3} requis />
            <div>
              <BoutonEnvoi>Confirmer</BoutonEnvoi>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Seules les opérations que la machine à états autorise sont proposées ; le serveur revérifie. */
export function ActionsAppareil({
  fiche,
  destinations,
}: {
  fiche: FicheAppareil;
  destinations: readonly { id: string; nom: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {fiche.transitions.map(({ statut, patientAChoisir }) => (
        <Panneau
          key={statut}
          libelle={libelleAction(fiche.statut, statut)}
          description={`Appareil ${fiche.numeroSerie}.`}
          action={changerStatutAction.bind(null, fiche.id)}
        >
          {(etat) => (
            <>
              <input type="hidden" name="statut" value={statut} />
              <input type="hidden" name="statutAttendu" value={fiche.statut} />
              {patientAChoisir ? <SelecteurPatient erreurs={etat.erreurs?.['patientId']} /> : null}
            </>
          )}
        </Panneau>
      ))}
      {fiche.transferable ? (
        <Panneau
          libelle="Transférer"
          description={`Le centre change dès la validation. Départ : ${fiche.centre}.`}
          action={transfererAction.bind(null, fiche.id)}
        >
          {(etat) => (
            <>
              <input type="hidden" name="centreOrigineId" value={fiche.centreId} />
              <ListeDeroulante
                etat={etat}
                nom="centreDestinationId"
                libelle="Centre de destination"
                vide="Choisir un centre…"
                options={destinations.map((c) => ({ valeur: c.id, libelle: c.nom }))}
              />
            </>
          )}
        </Panneau>
      ) : null}
      {fiche.annulable ? (
        <Panneau
          libelle="Annuler la vente"
          description="L’appareil revient en stock, détaché du patient. L’annulation reste dans l’historique."
          action={annulerVenteAction.bind(null, fiche.id)}
          variant="destructive"
        >
          {() => null}
        </Panneau>
      ) : null}
    </div>
  );
}
