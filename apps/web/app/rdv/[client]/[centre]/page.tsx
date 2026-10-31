import { JOURS_SEMAINE, LIBELLES_JOURS } from '@ha/domain';
import type { Metadata } from 'next';

import { ouIntrouvable } from '@/server/auth/gardes';
import { lireCentrePublic, resoudreCentre } from '@/server/services/reservation-en-ligne';

import { HauteurWidget } from './hauteur-widget';
import { ParcoursReservation } from './parcours-reservation';

async function chargerCentre(client: string, centre: string) {
  return ouIntrouvable(resoudreCentre(client, centre).then(lireCentrePublic));
}

export async function generateMetadata({
  params,
}: PageProps<'/rdv/[client]/[centre]'>): Promise<Metadata> {
  const { client, centre } = await params;
  const { nom } = await chargerCentre(client, centre);
  return { title: `Prendre rendez-vous – ${nom}` };
}

export default async function PageReservation({
  params,
  searchParams,
}: PageProps<'/rdv/[client]/[centre]'>) {
  const { client, centre } = await params;
  const { widget } = await searchParams;
  const vitrine = await chargerCentre(client, centre);
  const integre = widget === '1';
  return (
    <main className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      {integre ? <HauteurWidget /> : null}
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">Prendre rendez-vous – {vitrine.nom}</h1>
        <p className="text-muted-foreground">
          {vitrine.adresseLigne1}
          {vitrine.adresseLigne2 ? `, ${vitrine.adresseLigne2}` : ''}, {vitrine.codePostal}{' '}
          {vitrine.ville} – {vitrine.telephone}
        </p>
      </header>
      {integre ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Horaires d’ouverture</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {JOURS_SEMAINE.map((jour) => (
              <div key={jour} className="contents">
                <dt>{LIBELLES_JOURS[jour]}</dt>
                <dd className="text-muted-foreground">
                  {vitrine.horaires[jour].length === 0
                    ? 'Fermé'
                    : vitrine.horaires[jour].map((p) => `${p.debut}–${p.fin}`).join(', ')}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <ParcoursReservation
        adresse={{ client, centre }}
        types={vitrine.types}
        praticiens={vitrine.praticiens}
        telephoneCentre={vitrine.telephone}
      />
    </main>
  );
}
