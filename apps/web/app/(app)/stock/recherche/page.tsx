import { LIBELLES_STATUTS_APPAREIL } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { requireSession } from '@/server/auth/gardes';
import { rechercherParNumeroSerie } from '@/server/services/stock';

export const metadata: Metadata = { title: 'Recherche par numéro de série – HA-Gestion' };

export default async function PageRechercheSerie({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { numero = '' } = premieresValeurs(await searchParams);
  const resultats = await rechercherParNumeroSerie(acteur, numero);
  const [unique] = resultats;
  if (resultats.length === 1 && unique?.id) {
    redirect(`/stock/appareils/${unique.id}`);
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre="Recherche par numéro de série">{numero}</EntetePage>
      {resultats.length === 0 ? (
        <EtatVide titre="Aucun appareil">Ce numéro de série n’est pas connu du réseau.</EtatVide>
      ) : (
        <ul className="grid gap-2">
          {resultats.map((r) => (
            <li
              key={`${r.fabricant}-${r.modele}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <span>
                {r.fabricant} – {r.modele} · {r.centre}
                {r.statut ? ` · ${LIBELLES_STATUTS_APPAREIL[r.statut]}` : ''}
              </span>
              {r.id ? (
                <Link href={`/stock/appareils/${r.id}`} className="underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              ) : (
                <span className="text-muted-foreground">Fiche réservée à ce centre.</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button asChild variant="outline">
          <Link href="/stock">Retour au stock</Link>
        </Button>
      </div>
    </div>
  );
}
