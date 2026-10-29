import { LIBELLES_ETAT_DROITS_AMO, type EtatDroitsAmo } from '@ha/domain';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formaterDate } from '@/lib/format';
import type { PatientDetail } from '@/server/services/patients';

import { dateEtAge, identiteComplete } from './affichage';

/** Les droits AMO ne couvrent pas le jour : bandeau d'alerte. */
export function droitsEnAlerte(etat: EtatDroitsAmo | undefined): boolean {
  return etat === 'EXPIRES' || etat === 'NON_OUVERTS';
}

/** Badge C2S : affiché sur tout le dossier du patient. */
export function BadgeC2s() {
  return (
    <Badge variant="secondary" title="Complémentaire santé solidaire">
      C2S
    </Badge>
  );
}

/** Bandeau des droits AMO expirés ou pas encore ouverts. */
export function AlerteDroits({
  etat,
  fin,
  debut = null,
}: {
  etat: EtatDroitsAmo;
  fin: string | null;
  debut?: string | null;
}) {
  if (!droitsEnAlerte(etat)) {
    return null;
  }
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{LIBELLES_ETAT_DROITS_AMO[etat]}</AlertTitle>
      <AlertDescription>
        {etat === 'EXPIRES'
          ? `Les droits AMO ont pris fin le ${formaterDate(fin)}.`
          : `Les droits AMO ne sont ouverts qu’à partir du ${formaterDate(debut)}.`}{' '}
        Vérifiez la situation de l’assuré (mise à jour de la carte ou attestation de droits) avant
        toute facturation en dispense d’avance des frais.
      </AlertDescription>
    </Alert>
  );
}

/**
 * En-tête commun aux écrans du dossier patient : identité, badges (C2S, droits) et actions.
 * Les écrans de dossier à venir (devis, essai, facture) le reprennent pour garder le badge C2S visible.
 */
export function EntetePatient({
  fiche,
  titre,
  children,
}: {
  fiche: PatientDetail;
  /** Titre de l'écran ; l'identité du patient par défaut. */
  titre?: string | undefined;
  /** Actions (boutons) à droite. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {titre ?? identiteComplete(fiche)}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {titre ? `${identiteComplete(fiche)}, ` : ''}
            {dateEtAge(fiche)} — {fiche.centre.nom}
          </span>
          {fiche.c2s ? <BadgeC2s /> : null}
          {droitsEnAlerte(fiche.amo?.etatDroits) ? (
            <Badge variant="destructive">Droits AMO à vérifier</Badge>
          ) : null}
        </div>
      </div>
      {children ? <div className="flex flex-wrap items-start gap-2">{children}</div> : null}
    </div>
  );
}
