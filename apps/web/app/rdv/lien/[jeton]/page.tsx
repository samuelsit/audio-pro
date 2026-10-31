import type { Metadata } from 'next';

import { formaterDateLongue } from '@/lib/format';
import { ouIntrouvable } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { adresseVisiteur } from '@/server/reservation-actions';
import { lireLien } from '@/server/services/reservation-en-ligne';

import { GestionRdv } from './gestion-rdv';

export const metadata: Metadata = {
  title: 'Votre rendez-vous',
  robots: { index: false, follow: false },
};

export default async function PageLienRdv({ params }: PageProps<'/rdv/lien/[jeton]'>) {
  const { jeton } = await params;
  const lecture = await ouIntrouvable(
    adresseVisiteur()
      .then((ip) => lireLien(jeton, ip))
      .catch((erreur: unknown) => {
        if (erreur instanceof ErreurSaisie) {
          return erreur;
        }
        throw erreur;
      }),
  );
  if (lecture instanceof ErreurSaisie) {
    return <main className="mx-auto max-w-2xl px-4 py-6">{lecture.message}</main>;
  }
  const lien = lecture;
  const { centre } = lien;
  const annule = lien.statut === 'ANNULE';
  return (
    <main className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">
          {annule ? 'Rendez-vous annulé' : 'Votre rendez-vous'}
        </h1>
        <p>
          {formaterDateLongue(lien.date)} à {lien.heure.replace(':', 'h')}
        </p>
        <p className="text-muted-foreground">
          {centre.nom}, {centre.adresseLigne1}
          {centre.adresseLigne2 ? `, ${centre.adresseLigne2}` : ''}, {centre.codePostal}{' '}
          {centre.ville}
        </p>
      </header>
      {lien.modifiable ? (
        <GestionRdv jeton={jeton} deplacable={lien.deplacable} />
      ) : annule ? null : (
        <p>
          Ce rendez-vous ne peut plus être modifié en ligne
          {lien.delaiModificationHeures > 0
            ? ` (jusqu’à ${String(lien.delaiModificationHeures)} heures avant)`
            : ''}
          . Appelez le centre au {centre.telephone}.
        </p>
      )}
    </main>
  );
}
