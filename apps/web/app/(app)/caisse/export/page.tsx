import { peutGererCaisse } from '@ha/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aujourdhui } from '@/server/services/patients';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';

export const metadata: Metadata = { title: 'Export comptable – HA-Gestion' };

export default async function PageExport() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!peutGererCaisse(acteur.role)) {
    notFound();
  }
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const jour = aujourdhui();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Export comptable">
        Écritures de ventes et d’encaissements, au format réglé dans les paramètres.
      </EntetePage>
      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Écritures d’une période</h2>
        <form action="/caisse/export/ecritures" className="grid max-w-md gap-3">
          <div className="grid gap-1">
            <Label htmlFor="debut">Du</Label>
            <Input
              id="debut"
              name="debut"
              type="date"
              required
              defaultValue={`${jour.slice(0, 7)}-01`}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="fin">Au</Label>
            <Input id="fin" name="fin" type="date" required defaultValue={jour} />
          </div>
          <div>
            <Button type="submit">Exporter</Button>
          </div>
        </form>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Fichier des écritures comptables</h2>
        <Alert>
          <AlertTitle>À faire valider par l’expert-comptable</AlertTitle>
          <AlertDescription>
            Ce fichier couvre les ventes et les encaissements de l’exercice : il ne remplace pas la
            comptabilité.
          </AlertDescription>
        </Alert>
        <form action="/caisse/export/fec" className="grid max-w-md gap-3">
          <div className="grid gap-1">
            <Label htmlFor="date">Une date de l’exercice</Label>
            <Input id="date" name="date" type="date" required defaultValue={jour} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="document" value="fec">
              Télécharger le FEC
            </Button>
            <Button type="submit" name="document" value="description" variant="outline">
              Télécharger sa description
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
