'use client';

import {
  ETAPES_SALLE_ATTENTE,
  heureDepuisMinutes,
  LIBELLES_ETAPES_SALLE_ATTENTE,
  positionDansLaGrille,
} from '@ha/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { RdvGrille, SalleAttente } from '@/server/services/agenda';

import { PanneauRdv } from '../panneau-rdv';

const ACTUALISATION_MS = 30_000;

function Colonne({
  titre,
  rdv,
  surOuverture,
}: {
  titre: string;
  rdv: readonly RdvGrille[];
  surOuverture: (id: string) => void;
}) {
  return (
    <section aria-label={titre} className="grid content-start gap-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">
        {titre} ({rdv.length})
      </h2>
      {rdv.map((r) => (
        <button
          key={r.id}
          type="button"
          className="rounded border-l-4 bg-card px-2 py-1.5 text-left text-sm shadow-sm"
          style={{ borderLeftColor: r.couleur }}
          onClick={() => {
            surOuverture(r.id);
          }}
        >
          <span className="block font-medium">{r.nom}</span>
          <span className="block text-xs text-muted-foreground">
            {heureDepuisMinutes(positionDansLaGrille(r).debutMinutes)} · {r.type}
          </span>
        </button>
      ))}
    </section>
  );
}

export function SalleClient({
  salle,
  praticiens,
}: {
  salle: SalleAttente;
  praticiens: readonly { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    const minuteur = setInterval(() => {
      router.refresh();
    }, ACTUALISATION_MS);
    return () => {
      clearInterval(minuteur);
    };
  }, [router]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Colonne titre="Attendus" rdv={salle.attendus} surOuverture={setOuvert} />
        {ETAPES_SALLE_ATTENTE.map((etape) => (
          <Colonne
            key={etape}
            titre={LIBELLES_ETAPES_SALLE_ATTENTE[etape]}
            rdv={salle[etape]}
            surOuverture={setOuvert}
          />
        ))}
      </div>
      <PanneauRdv
        id={ouvert}
        praticiens={praticiens}
        surFermeture={() => {
          setOuvert(null);
        }}
      />
    </>
  );
}
