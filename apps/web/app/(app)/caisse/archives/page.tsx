import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { ouIntrouvable } from '@/server/auth/gardes';
import { listerArchives } from '@/server/services/caisse';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';
import { BoutonArchivage, BoutonVerifierArchive } from '../formulaires';

export const metadata: Metadata = { title: 'Archives – HA-Gestion' };

const jour = (date: Date) => formaterDate(date.toISOString().slice(0, 10));

export default async function PageArchives() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  const archives = await ouIntrouvable(listerArchives(acteur, centreId));
  return (
    <div className="grid gap-6">
      <EntetePage titre="Archives">
        Une archive par mois clôturé, en JSON avec sa notice, horodatée et signée.
      </EntetePage>
      <BoutonArchivage centreId={centreId} />
      {archives.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune archive pour ce centre.</p>
      ) : null}
      <div className="grid gap-4">
        {archives.map((a) => (
          <section key={a.id} className="grid gap-2 rounded-lg border p-4 text-sm">
            <p className="font-medium">
              Du {jour(a.debut)} au {jour(a.fin)}
            </p>
            <p className="text-muted-foreground">
              Créée le {formaterDateHeure(a.createdAt)}, version {a.versionCaisse}, {a.tailleOctets}{' '}
              octets, rangs {a.rangDebut} à {a.rangFin}
            </p>
            <p className="font-mono break-all">{a.empreinteContenu}</p>
            <div className="flex flex-wrap items-start gap-2">
              <Button asChild variant="outline">
                <a href={`/caisse/archives/${a.id}/fichier`}>Télécharger</a>
              </Button>
              <BoutonVerifierArchive archiveId={a.id} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
