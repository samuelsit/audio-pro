'use client';

import {
  ETATS_CONDUIT,
  ETATS_TYMPAN,
  LIBELLES_ETATS_CONDUIT,
  LIBELLES_ETATS_TYMPAN,
  type ConstatOtoscopique,
  type Oreille,
} from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

export function FormulaireOtoscopie({
  action,
  oreille,
  constat,
  photo,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  oreille: Oreille;
  constat: ConstatOtoscopique | null;
  photo: boolean;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const erreurPhoto = etat.erreurs?.photo;
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="oreille" value={oreille} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="conduit"
          libelle="Conduit"
          vide="Choisir…"
          defaut={constat?.conduit}
          options={ETATS_CONDUIT.map((e) => ({ valeur: e, libelle: LIBELLES_ETATS_CONDUIT[e] }))}
        />
        <ListeDeroulante
          etat={etat}
          nom="tympan"
          libelle="Tympan"
          vide="Choisir…"
          defaut={constat?.tympan}
          options={ETATS_TYMPAN.map((e) => ({ valeur: e, libelle: LIBELLES_ETATS_TYMPAN[e] }))}
        />
      </div>
      <ZoneDeTexte
        etat={etat}
        nom="observation"
        libelle="Observation"
        defaut={constat?.observation}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="photo">
          {photo ? 'Remplacer la photo' : 'Photo'}{' '}
          <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png" />
        {erreurPhoto ? <p className="text-sm text-destructive">{erreurPhoto.join(' ')}</p> : null}
      </div>
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
