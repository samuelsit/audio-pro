import type { Metadata } from 'next';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { perimetreCourant } from '@/server/auth/gardes';

export const metadata: Metadata = { title: 'Accueil – HA-Gestion' };

export default async function Accueil() {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const centreCourant =
    perimetre.type === 'tous'
      ? 'Tous mes centres'
      : (centres.find((c) => c.id === perimetre.centreId)?.nom ?? '');

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Bonjour {acteur.prenom}</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            Centre courant : <span data-testid="centre-courant">{centreCourant}</span>
          </CardTitle>
          <CardDescription>
            Les listes de l’application sont filtrées sur ce périmètre. Changez-le depuis l’en-tête.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
