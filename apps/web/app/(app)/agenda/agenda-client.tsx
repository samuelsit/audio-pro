'use client';

import type { Intervalle } from '@ha/domain';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { RdvGrille } from '@/server/services/agenda';
import type { TypeRdvResume } from '@/server/services/agenda-parametres';

import { FormulaireRdv, type ValeursRdv } from './formulaire-rdv';
import { GrilleAgenda, type Colonne } from './grille-agenda';
import { PanneauRdv } from './panneau-rdv';

export function AgendaClient({
  centreId,
  colonnes,
  rdv,
  bornes,
  types,
  praticiens,
  cabines,
  dateCourante,
  nouveau,
}: {
  centreId: string;
  colonnes: readonly Colonne[];
  rdv: readonly RdvGrille[];
  bornes: Intervalle;
  types: readonly TypeRdvResume[];
  praticiens: readonly { id: string; nom: string }[];
  cabines: readonly { id: string; nom: string }[];
  dateCourante: string;
  /** Réservation ouverte depuis la recherche du prochain créneau. */
  nouveau: ValeursRdv | null;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState<ValeursRdv | null>(nouveau);
  const fermerCreation = useCallback(() => {
    setCreation(null);
    toast.success('Rendez-vous créé.');
  }, []);

  return (
    <div className="grid gap-3">
      <div>
        <Button
          onClick={() => {
            setCreation({ date: dateCourante, heure: '09:00' });
          }}
        >
          Nouveau rendez-vous
        </Button>
      </div>
      <GrilleAgenda
        colonnes={colonnes}
        rdv={rdv}
        bornes={bornes}
        surOuverture={setOuvert}
        surCreneau={(date, heure, praticienId) => {
          setCreation({ date, heure, praticienId });
        }}
      />
      <PanneauRdv
        id={ouvert}
        praticiens={praticiens}
        surFermeture={() => {
          setOuvert(null);
        }}
      />
      <Sheet
        open={creation !== null}
        onOpenChange={(valeur) => {
          if (!valeur) {
            setCreation(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nouveau rendez-vous</SheetTitle>
          </SheetHeader>
          {creation ? (
            <FormulaireRdv
              centreId={centreId}
              valeurs={creation}
              types={types}
              praticiens={praticiens}
              cabines={cabines}
              surSucces={fermerCreation}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
