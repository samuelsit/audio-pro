'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formaterDateHeure } from '@/lib/format';
import type { RdvGrille } from '@/server/services/agenda';

import { annulerRdvAction, changerStatutRdvAction } from '../actions';

export function DemandesClient({ demandes }: { demandes: readonly RdvGrille[] }) {
  const [message, setMessage] = useState<string | undefined>();
  const [enCours, demarrer] = useTransition();

  function executer(action: () => ReturnType<typeof annulerRdvAction>) {
    demarrer(async () => {
      setMessage((await action()).message);
    });
  }

  return (
    <div className="grid gap-3">
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <ul className="grid gap-2">
        {demandes.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <span>
              {formaterDateHeure(new Date(r.debut))} – {r.type} – {r.nom}
              {r.telephone ? ` – ${r.telephone}` : ''}
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                disabled={enCours}
                onClick={() => {
                  executer(() => changerStatutRdvAction(r.id, r.version, 'CONFIRME'));
                }}
              >
                Accepter
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={enCours}
                onClick={() => {
                  executer(() => annulerRdvAction(r.id, r.version));
                }}
              >
                Refuser
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
