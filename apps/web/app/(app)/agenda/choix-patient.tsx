'use client';

import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formaterDate } from '@/lib/format';
import type { PatientPropose } from '@/server/services/agenda';

import { chercherPatientsAction } from './actions';

const ATTENTE_FRAPPE_MS = 250;

/** Recherche d'un patient par nom. Le patient choisi part dans le champ caché `patientId`. */
export function ChoixPatient({
  libelle = 'Patient',
  surChoix,
}: {
  libelle?: string;
  surChoix?: (patient: PatientPropose | null) => void;
}) {
  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState<readonly PatientPropose[]>([]);
  const [choisi, setChoisi] = useState<PatientPropose | null>(null);
  const [, demarrer] = useTransition();

  useEffect(() => {
    if (choisi !== null) {
      return undefined;
    }
    const minuteur = setTimeout(() => {
      demarrer(async () => {
        setResultats(await chercherPatientsAction(terme));
      });
    }, ATTENTE_FRAPPE_MS);
    return () => {
      clearTimeout(minuteur);
    };
  }, [terme, choisi]);

  function choisir(patient: PatientPropose | null) {
    setChoisi(patient);
    surChoix?.(patient);
    if (patient === null) {
      setTerme('');
      setResultats([]);
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="recherchePatient">{libelle}</Label>
      <input type="hidden" name="patientId" value={choisi?.id ?? ''} />
      {choisi ? (
        <p className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            {choisi.nom} ({formaterDate(choisi.dateNaissance)})
          </span>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              choisir(null);
            }}
          >
            Changer
          </button>
        </p>
      ) : (
        <>
          <Input
            id="recherchePatient"
            autoComplete="off"
            placeholder="Nom ou prénom"
            value={terme}
            onChange={(e) => {
              setTerme(e.target.value);
            }}
          />
          {resultats.length > 0 ? (
            <ul className="grid max-h-48 overflow-auto rounded-md border text-sm">
              {resultats.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      choisir(patient);
                    }}
                  >
                    {patient.nom} ({formaterDate(patient.dateNaissance)})
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
