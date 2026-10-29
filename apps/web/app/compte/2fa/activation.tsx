'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { ETAT_INITIAL as ETAT_FORMULAIRE_INITIAL } from '@/lib/formulaire';

import { confirmerActivation, demarrerActivation, type EtatActivation } from '../actions';

const ETAT_INITIAL: EtatActivation = {};

export function ActivationDeuxFacteurs() {
  const [etatDebut, demarrer] = useActionState(demarrerActivation, ETAT_INITIAL);
  const [etatConfirmation, confirmer] = useActionState(
    confirmerActivation,
    ETAT_FORMULAIRE_INITIAL,
  );
  const etat = etatDebut;

  if (!etat.qr || !etat.secret || !etat.codesSecours) {
    return (
      <form action={demarrer} className="grid gap-4">
        <MessageFormulaire etat={etatDebut} />
        <ChampTexte
          etat={etatDebut}
          nom="motDePasse"
          libelle="Mot de passe"
          type="password"
          autoComplete="current-password"
          aide="Confirmez votre mot de passe pour générer la clé de votre application d’authentification."
          requis
        />
        <BoutonEnvoi>Commencer l’activation</BoutonEnvoi>
      </form>
    );
  }

  return (
    <div className="grid gap-6">
      <ol className="grid list-decimal gap-2 pl-5 text-sm">
        <li>Scannez ce QR code avec votre application d’authentification.</li>
        <li>Notez les codes de secours et rangez-les en lieu sûr.</li>
        <li>Saisissez le code à 6 chiffres affiché par l’application.</li>
      </ol>
      <svg
        viewBox={`0 0 ${etat.qr.taille} ${etat.qr.taille}`}
        className="mx-auto size-48 bg-white"
        role="img"
        aria-label="QR code de configuration"
        shapeRendering="crispEdges"
      >
        <path d={etat.qr.chemin} fill="black" />
      </svg>
      <div className="grid gap-1 text-sm">
        <p>Ou saisissez cette clé à la main :</p>
        <code data-testid="secret-totp" className="rounded bg-muted px-2 py-1 font-mono break-all">
          {etat.secret}
        </code>
      </div>
      <div className="grid gap-1 text-sm">
        <p>Codes de secours (utilisables une seule fois) :</p>
        <ul className="grid grid-cols-2 gap-1 rounded bg-muted p-2 font-mono">
          {etat.codesSecours.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      <form action={confirmer} className="grid gap-4">
        <MessageFormulaire etat={etatConfirmation} />
        <ChampTexte
          etat={etatConfirmation}
          nom="code"
          libelle="Code à 6 chiffres"
          autoComplete="one-time-code"
          inputMode="numeric"
          requis
        />
        <BoutonEnvoi>Activer</BoutonEnvoi>
      </form>
    </div>
  );
}
