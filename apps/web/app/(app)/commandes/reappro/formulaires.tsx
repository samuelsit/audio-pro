'use client';

import { useActionState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { LigneReappro } from '@/server/services/reappro';

type Action = (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;

export function FormulaireSeuil({
  action,
  produits,
}: {
  action: Action;
  produits: readonly { valeur: string; libelle: string }[];
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  return (
    <form action={envoyer} className="grid max-w-2xl gap-4 rounded-lg border p-4">
      <MessageFormulaire etat={etat} />
      <ListeDeroulante
        etat={etat}
        nom="produit"
        libelle="Produit"
        options={produits}
        vide="Choisir…"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="minimum" libelle="Minimum" inputMode="numeric" requis />
        <ChampTexte
          etat={etat}
          nom="cible"
          libelle="Cible"
          inputMode="numeric"
          requis
          aide="Niveau visé par la proposition."
        />
      </div>
      <div>
        <BoutonEnvoi>Enregistrer le seuil</BoutonEnvoi>
      </div>
    </form>
  );
}

export function TableauReappro({
  action,
  lignes,
  retraits,
}: {
  action: Action;
  lignes: readonly LigneReappro[];
  /** Action de retrait de chaque seuil, par identifiant. */
  retraits: Readonly<Record<string, () => Promise<void>>>;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const aProposer = lignes.some((l) => l.aCommander > 0 && l.fournisseurId !== null);
  return (
    <form action={envoyer} className="grid gap-3">
      <MessageFormulaire etat={etat} />
      {etat.erreurs?.lignes ? (
        <p className="text-sm text-destructive">{etat.erreurs.lignes.join(' ')}</p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produit</TableHead>
            <TableHead>Fournisseur</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">En commande</TableHead>
            <TableHead className="text-right">Minimum</TableHead>
            <TableHead className="text-right">Cible</TableHead>
            <TableHead className="text-right">À commander</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lignes.map((l) => (
            <TableRow key={l.seuilId}>
              <TableCell>{l.designation}</TableCell>
              <TableCell>{l.fournisseur ?? 'Aucun fournisseur'}</TableCell>
              <TableCell className="text-right">{l.stock}</TableCell>
              <TableCell className="text-right">{l.enCommande}</TableCell>
              <TableCell className="text-right">{l.minimum}</TableCell>
              <TableCell className="text-right">{l.cible}</TableCell>
              <TableCell className="text-right">
                {l.fournisseurId === null ? (
                  l.aCommander
                ) : (
                  <>
                    <input type="hidden" name="produit" value={l.produit} />
                    <Input
                      name="quantite"
                      aria-label={`Quantité pour ${l.designation}`}
                      inputMode="numeric"
                      defaultValue={l.aCommander}
                      className="ml-auto w-20 text-right"
                    />
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button type="submit" variant="ghost" size="sm" formAction={retraits[l.seuilId]}>
                  Retirer
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {aProposer ? (
        <div>
          <BoutonEnvoi>Créer les demandes</BoutonEnvoi>
        </div>
      ) : null}
    </form>
  );
}
