'use client';

import { ENTETES_CSV_RELEVE } from '@ha/domain';
import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL } from '@/lib/formulaire';
import type { ApercuReleve } from '@/server/services/releves-centrale';

import { importerReleveAction, previsualiserReleveAction, type EtatReleve } from './actions';
import { LignesReleve } from './lignes-releve';

function Confirmation({
  centraleAchatId,
  mois,
  csv,
  apercu,
}: {
  centraleAchatId: string;
  mois: string;
  csv: string;
  apercu: ApercuReleve;
}) {
  const [etat, envoyer] = useActionState(importerReleveAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid gap-3">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="centraleAchatId" value={centraleAchatId} />
      <input type="hidden" name="mois" value={mois} />
      <input type="hidden" name="csv" value={csv} />
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="pdf">Relevé en PDF (facultatif)</Label>
        <Input id="pdf" name="pdf" type="file" accept="application/pdf" />
      </div>
      <div>
        <BoutonEnvoi>Importer {apercu.lignes.length} ligne(s)</BoutonEnvoi>
      </div>
    </form>
  );
}

const ETAT_RELEVE: EtatReleve = ETAT_INITIAL;

export function FormulaireReleve({
  centrales,
}: {
  centrales: readonly { id: string; nom: string }[];
}) {
  const [etat, envoyer] = useActionState(previsualiserReleveAction, ETAT_RELEVE);
  const { apercu, csv, valeurs } = etat;
  return (
    <div className="grid gap-6">
      <form action={envoyer} className="grid max-w-2xl gap-4">
        <MessageFormulaire etat={etat} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ListeDeroulante
            etat={etat}
            nom="centraleAchatId"
            libelle="Centrale d’achat"
            options={centrales.map((c) => ({ valeur: c.id, libelle: c.nom }))}
            vide="Choisir…"
          />
          <ChampTexte etat={etat} nom="mois" libelle="Mois (AAAA-MM)" requis />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fichier">Fichier CSV du relevé</Label>
          <Input id="fichier" name="fichier" type="file" accept=".csv,text/csv" required />
          <p className="text-sm text-muted-foreground">
            Colonnes séparées par des points-virgules : {ENTETES_CSV_RELEVE.join(' ; ')}.
          </p>
        </div>
        <div>
          <BoutonEnvoi>Prévisualiser</BoutonEnvoi>
        </div>
      </form>
      {apercu ? (
        <section className="grid gap-3">
          <h2 className="font-medium">Pointage</h2>
          {apercu.erreurs.length > 0 ? (
            <ul className="list-inside list-disc text-sm text-destructive">
              {apercu.erreurs.map((e) => (
                <li key={`${String(e.ligne)}-${e.message}`}>
                  Ligne {e.ligne} : {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          <LignesReleve lignes={apercu.lignes} />
          {apercu.erreurs.length === 0 && apercu.lignes.length > 0 ? (
            <Confirmation
              centraleAchatId={String(valeurs?.centraleAchatId ?? '')}
              mois={String(valeurs?.mois ?? '')}
              csv={csv ?? ''}
              apercu={apercu}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
