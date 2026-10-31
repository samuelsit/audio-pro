'use client';

import type { StatutDossier } from '@ha/domain';
import { useActionState, useState } from 'react';

import { BoutonEnvoi, MessageFormulaire, ZoneDeTexte } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ETAT_INITIAL } from '@/lib/formulaire';

import { abandonnerDossierAction } from '../actions';

export function AbandonDossier({
  dossierId,
  statut,
}: {
  dossierId: string;
  statut: StatutDossier;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState(
    abandonnerDossierAction.bind(null, dossierId),
    ETAT_INITIAL,
  );
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOuvert(true)}>
        Abandonner
      </Button>
      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Abandonner le dossier</SheetTitle>
            <SheetDescription>
              L’abandon est définitif : le dossier ne pourra plus avancer.
            </SheetDescription>
          </SheetHeader>
          <form action={envoyer} className="grid gap-4 px-4 pb-4">
            <MessageFormulaire etat={etat} />
            <input type="hidden" name="statutAttendu" value={statut} />
            <ZoneDeTexte etat={etat} nom="motif" libelle="Motif" lignes={3} requis />
            <div>
              <BoutonEnvoi variant="destructive">Confirmer l’abandon</BoutonEnvoi>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
