'use client';

import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formaterDate } from '@/lib/format';
import type { PatientResume } from '@/server/services/patients';

import { rechercherPatientsAction } from './actions';

const LONGUEUR_MIN = 2;
const DELAI_MS = 200;

function resume(p: PatientResume): string {
  return `${p.nomUsage ?? p.nomNaissance} ${p.prenoms} · ${formaterDate(p.dateNaissance)} · ${p.centre.nom}`;
}

/** Recherche d'un patient du centre de l'appareil. Le choix est porté par le champ caché `patientId`. */
export function SelecteurPatient({
  centreId,
  erreurs,
}: {
  centreId: string;
  erreurs: readonly string[] | undefined;
}) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<readonly PatientResume[]>([]);
  const [choisi, setChoisi] = useState<PatientResume | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (q.trim().length < LONGUEUR_MIN) {
      return undefined;
    }
    const minuteur = setTimeout(() => {
      demarrer(async () => {
        setSuggestions(await rechercherPatientsAction(centreId, q));
      });
    }, DELAI_MS);
    return () => clearTimeout(minuteur);
  }, [centreId, q]);

  const recherche = q.trim().length >= LONGUEUR_MIN;
  return (
    <div className="grid gap-2">
      <input type="hidden" name="patientId" value={choisi?.id ?? ''} />
      {choisi ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>{resume(choisi)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setChoisi(null)}>
            Changer
          </Button>
        </div>
      ) : (
        <>
          <Label htmlFor="patient-recherche">Patient</Label>
          <Input
            id="patient-recherche"
            type="search"
            autoComplete="off"
            placeholder="Nom du patient"
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
                <li className="text-sm text-muted-foreground">Aucun patient trouvé.</li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}
      {erreurs?.length ? <p className="text-sm text-destructive">{erreurs.join(' ')}</p> : null}
    </div>
  );
}
