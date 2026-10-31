'use client';

import { LIBELLES_SPECIALITES_PRESCRIPTEUR } from '@ha/domain';
import { useActionState, useEffect, useState, useTransition } from 'react';

import { BoutonEnvoi, MessageFormulaire } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PrescripteurResume } from '@/server/services/prescripteurs';

import {
  creerPrescripteurVoleeAction,
  rechercherPrescripteursAction,
  type EtatCreationVolee,
} from './actions';
import { ChampsPrescripteur } from './champs-prescripteur';

const LONGUEUR_MIN = 2;
const DELAI_MS = 200;
const ETAT_VOLEE: EtatCreationVolee = {};

function resume(p: PrescripteurResume): string {
  const specialite = LIBELLES_SPECIALITES_PRESCRIPTEUR[p.specialite];
  return [`${p.prenom} ${p.nom}`, specialite, p.rpps, p.cabinet].filter(Boolean).join(' · ');
}

function CreationVolee({
  ouvert,
  fermer,
  choisir,
}: {
  ouvert: boolean;
  fermer: () => void;
  choisir: (p: PrescripteurResume) => void;
}) {
  const [etat, envoyer] = useActionState(creerPrescripteurVoleeAction, ETAT_VOLEE);
  useEffect(() => {
    if (etat.cree) {
      choisir(etat.cree);
      fermer();
    }
  }, [etat.cree, choisir, fermer]);

  return (
    <Sheet open={ouvert} onOpenChange={(o) => (o ? undefined : fermer())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nouveau prescripteur</SheetTitle>
          <SheetDescription>
            La fiche sera disponible pour toute votre organisation.
          </SheetDescription>
        </SheetHeader>
        <form action={envoyer} className="grid gap-4 px-4 pb-4">
          <MessageFormulaire etat={etat} />
          <ChampsPrescripteur etat={etat} />
          <div>
            <BoutonEnvoi>Créer et sélectionner</BoutonEnvoi>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Recherche rapide d'un prescripteur, avec création à la volée. Le choix est porté par un champ
 * caché `nom` : le dossier de l'étape 8 l'utilisera dans son propre formulaire.
 */
export function SelecteurPrescripteur({
  nom = 'prescripteurId',
  defaut,
}: {
  nom?: string;
  defaut?: PrescripteurResume;
}) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<readonly PrescripteurResume[]>([]);
  const [choisi, setChoisi] = useState<PrescripteurResume | null>(defaut ?? null);
  const [creation, setCreation] = useState(false);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (q.trim().length < LONGUEUR_MIN) {
      return undefined;
    }
    const minuteur = setTimeout(() => {
      demarrer(async () => {
        setSuggestions(await rechercherPrescripteursAction(q));
      });
    }, DELAI_MS);
    return () => clearTimeout(minuteur);
  }, [q]);

  const recherche = q.trim().length >= LONGUEUR_MIN;
  return (
    <div className="grid max-w-2xl gap-2">
      <input type="hidden" name={nom} value={choisi?.id ?? ''} />
      {choisi ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>
            <span className="text-muted-foreground">Prescripteur : </span>
            {resume(choisi)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setChoisi(null)}>
            Changer
          </Button>
        </div>
      ) : (
        <>
          <Label htmlFor={`${nom}-recherche`}>Rechercher un prescripteur</Label>
          <Input
            id={`${nom}-recherche`}
            type="search"
            autoComplete="off"
            placeholder="Nom, prénom ou RPPS"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {recherche ? (
            <ul aria-label="Suggestions" className="grid gap-1">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start text-left whitespace-normal"
                    onClick={() => {
                      setChoisi(p);
                      setQ('');
                      setSuggestions([]);
                    }}
                  >
                    {resume(p)}
                  </Button>
                </li>
              ))}
              {!enCours && suggestions.length === 0 ? (
                <li className="text-sm text-muted-foreground">Aucun prescripteur trouvé.</li>
              ) : null}
            </ul>
          ) : null}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setCreation(true)}>
              Créer un prescripteur
            </Button>
          </div>
          {/* Remonté à chaque ouverture : le formulaire repart vide. */}
          {creation ? (
            <CreationVolee ouvert fermer={() => setCreation(false)} choisir={setChoisi} />
          ) : null}
        </>
      )}
    </div>
  );
}
