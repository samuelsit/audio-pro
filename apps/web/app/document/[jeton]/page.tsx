import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adresseVisiteur } from '@/server/reservation-actions';
import { lienDocumentOuvrable, MESSAGE_LIEN_FERME } from '@/server/services/liens-document';

export const metadata: Metadata = {
  title: 'Votre document',
  robots: { index: false, follow: false },
};

export default async function PageDocument({
  params,
  searchParams,
}: PageProps<'/document/[jeton]'>) {
  const { jeton } = await params;
  const { erreur } = await searchParams;
  const ouvrable = await lienDocumentOuvrable(jeton, await adresseVisiteur());
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <h1 className="text-xl font-medium">Votre document</h1>
      {ouvrable ? (
        <form action={`/document/${jeton}/ouvrir`} method="post" className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Pour ouvrir ce document, saisissez la date de naissance de la personne concernée.
          </p>
          {typeof erreur === 'string' ? (
            <p role="alert" className="text-sm text-destructive">
              Cette date de naissance ne convient pas, ou trop de tentatives ont eu lieu.
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="dateNaissance">Date de naissance</Label>
            <Input
              id="dateNaissance"
              name="dateNaissance"
              type="date"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Button type="submit">Ouvrir le document</Button>
          </div>
        </form>
      ) : (
        <p>{MESSAGE_LIEN_FERME}</p>
      )}
    </main>
  );
}
