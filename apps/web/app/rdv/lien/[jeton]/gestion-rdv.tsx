'use client';

import type { InstantDisponible } from '@ha/domain';
import { useState, useTransition } from 'react';

import { MessageFormulaire } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import type { EtatFormulaire } from '@/lib/formulaire';
import { formaterDateLongue } from '@/lib/format';

import { annulerAction, creneauxDuLienAction, deplacerAction } from './actions';

/** Actions en POST, derrière un clic : un scanner de liens qui ouvre la page n'annule rien. */
export function GestionRdv({ jeton, deplacable }: { jeton: string; deplacable: boolean }) {
  const [etat, setEtat] = useState<EtatFormulaire>({});
  const [confirmer, setConfirmer] = useState(false);
  const [instants, setInstants] = useState<readonly InstantDisponible[] | null>(null);
  const [occupe, demarrer] = useTransition();

  function annuler() {
    demarrer(async () => {
      const reponse = await annulerAction(jeton);
      setEtat(reponse.ok ? {} : reponse.etat);
    });
  }

  function voirCreneaux() {
    demarrer(async () => {
      const aujourdhui = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
      const reponse = await creneauxDuLienAction(jeton, aujourdhui);
      if (reponse.ok) {
        setInstants(reponse.valeur.instants);
      } else {
        setEtat(reponse.etat);
      }
    });
  }

  function deplacer(debut: number) {
    demarrer(async () => {
      const reponse = await deplacerAction(jeton, debut);
      if (reponse.ok) {
        setInstants(null);
        setEtat({});
      } else {
        setEtat(reponse.etat);
      }
    });
  }

  return (
    <div className="grid gap-4">
      <MessageFormulaire etat={etat} />
      <div className="flex flex-wrap gap-2">
        {confirmer ? (
          <Button variant="destructive" size="lg" disabled={occupe} onClick={annuler}>
            Confirmer l’annulation
          </Button>
        ) : (
          <Button
            variant="outline"
            size="lg"
            disabled={occupe}
            onClick={() => {
              setConfirmer(true);
            }}
          >
            Annuler ce rendez-vous
          </Button>
        )}
        {deplacable ? (
          <Button variant="outline" size="lg" disabled={occupe} onClick={voirCreneaux}>
            Déplacer ce rendez-vous
          </Button>
        ) : null}
      </div>
      {instants !== null && instants.length === 0 ? (
        <p>Aucun autre créneau cette semaine.</p>
      ) : null}
      {instants !== null && instants.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {instants.map((instant) => (
            <Button
              key={instant.debut}
              variant="outline"
              size="lg"
              disabled={occupe}
              onClick={() => {
                deplacer(instant.debut);
              }}
            >
              {formaterDateLongue(instant.date)} à {instant.heure.replace(':', 'h')}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
