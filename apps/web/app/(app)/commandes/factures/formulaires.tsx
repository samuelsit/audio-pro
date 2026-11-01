'use client';

import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { CandidatRapprochement, FactureDetail } from '@/server/services/factures-fournisseurs';

import { deposerFactureAction } from './actions';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
type Choix = readonly { id: string; nom: string }[];

const euros = (valeur: number | null) =>
  valeur === null ? '' : (valeur / 100).toFixed(2).replace('.', ',');

export function FormulaireDepot() {
  const [etat, envoyer] = useActionState(deposerFactureAction, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-md gap-3 rounded-lg border p-4">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-1.5">
        <Label htmlFor="fichier">Facture en PDF</Label>
        <Input id="fichier" name="fichier" type="file" accept="application/pdf" required />
        {etat.erreurs?.fichier ? (
          <p className="text-sm text-destructive">{etat.erreurs.fichier.join(' ')}</p>
        ) : null}
      </div>
      <div>
        <BoutonEnvoi>Déposer</BoutonEnvoi>
      </div>
    </form>
  );
}

interface LigneEditee {
  cle: number;
  reference: string;
  designation: string;
  quantite: string;
  prix: string;
  tva: string;
  numeros: string;
  commande: string;
}

function ligneVide(cle: number): LigneEditee {
  return {
    cle,
    reference: '',
    designation: '',
    quantite: '1',
    prix: '',
    tva: '',
    numeros: '',
    commande: '',
  };
}

function ChampLigne({ nom, libelle, defaut }: { nom: string; libelle: string; defaut: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm">{libelle}</span>
      <Input name={nom} aria-label={libelle} defaultValue={defaut} autoComplete="off" />
    </div>
  );
}

export function FormulaireFacture({
  action,
  facture,
  fournisseurs,
  centres,
  candidats,
}: {
  action: Action;
  facture: FactureDetail;
  fournisseurs: Choix;
  centres: Choix;
  candidats: readonly CandidatRapprochement[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [lignes, setLignes] = useState<readonly LigneEditee[]>(() =>
    facture.lignes.map((l, rang) => ({
      cle: rang,
      reference: l.reference ?? '',
      designation: l.designation,
      quantite: String(l.quantite),
      prix: euros(l.prixUnitaireCentimes),
      tva: euros(l.tauxTvaPointsBase),
      numeros: l.numerosSerie.join(' '),
      commande: l.commandeLigneProposee ?? '',
    })),
  );
  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <ListeDeroulante
          etat={etat}
          nom="fournisseurId"
          libelle="Fournisseur"
          options={fournisseurs.map((f) => ({ valeur: f.id, libelle: f.nom }))}
          defaut={facture.fournisseurId ?? ''}
          vide="À choisir"
          requis={false}
        />
        <ListeDeroulante
          etat={etat}
          nom="centreId"
          libelle="Centre"
          options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          defaut={facture.centreId ?? ''}
          vide="À choisir"
          requis={false}
        />
        <ChampTexte etat={etat} nom="numero" libelle="Numéro" defaut={facture.numero} />
        <ChampTexte
          etat={etat}
          nom="dateFacture"
          libelle="Date"
          type="date"
          defaut={facture.dateFacture?.toISOString().slice(0, 10)}
        />
        <ChampTexte
          etat={etat}
          nom="montantHt"
          libelle="Total HT (€)"
          defaut={euros(facture.montantHtCentimes)}
        />
        <ChampTexte
          etat={etat}
          nom="montantTva"
          libelle="TVA (€)"
          defaut={euros(facture.montantTvaCentimes)}
        />
        <ChampTexte
          etat={etat}
          nom="montantTtc"
          libelle="Total TTC (€)"
          defaut={euros(facture.montantTtcCentimes)}
        />
      </div>
      <h2 className="font-medium">Lignes</h2>
      {etat.erreurs?.lignes ? (
        <p className="text-sm text-destructive">{etat.erreurs.lignes.join(' ')}</p>
      ) : null}
      {lignes.map((l) => (
        <fieldset key={l.cle} className="grid max-w-3xl gap-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChampLigne nom="ligne-designation" libelle="Désignation" defaut={l.designation} />
            <ChampLigne nom="ligne-reference" libelle="Référence" defaut={l.reference} />
            <ChampLigne nom="ligne-quantite" libelle="Quantité" defaut={l.quantite} />
            <ChampLigne nom="ligne-prix" libelle="Prix unitaire HT (€)" defaut={l.prix} />
            <ChampLigne nom="ligne-tva" libelle="Taux de TVA (%)" defaut={l.tva} />
            <ChampLigne nom="ligne-numeros" libelle="Numéros de série" defaut={l.numeros} />
          </div>
          <div className="grid gap-1">
            <span className="text-sm">Ligne de commande</span>
            <select
              name="ligne-commande"
              aria-label="Ligne de commande"
              defaultValue={l.commande}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Aucune</option>
              {candidats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLignes(lignes.filter((autre) => autre.cle !== l.cle))}
            >
              Retirer la ligne
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setLignes([...lignes, ligneVide(Math.max(0, ...lignes.map((l) => l.cle)) + 1)])
          }
        >
          Ajouter une ligne
        </Button>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
