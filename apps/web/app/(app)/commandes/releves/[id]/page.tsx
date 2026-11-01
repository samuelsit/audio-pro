import { centimes, formatEuros } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BoutonConfirmation } from '@/components/confirmation';
import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { obtenirReleve } from '@/server/services/releves-centrale';

import { repointerReleveAction } from '../actions';
import { LignesReleve } from '../lignes-releve';

export const metadata: Metadata = { title: 'Relevé de centrale – HA-Gestion' };

export default async function PageReleve({ params }: PageProps<'/commandes/releves/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN_CLIENT');
  const releve = await ouIntrouvable(obtenirReleve(acteur, id));
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Relevé ${releve.mois}`}>
        {releve.centrale} · {releve.lignes} ligne(s), {releve.ecarts} à regarder
      </EntetePage>
      <div>
        <BoutonConfirmation
          libelle="Refaire le pointage"
          titre="Refaire le pointage ?"
          description="Les factures validées depuis l’import seront prises en compte."
          variant="outline"
          action={repointerReleveAction.bind(null, id)}
        />
      </div>
      <LignesReleve lignes={releve.detail} />
      {releve.horsReleve.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-medium">Factures du mois absentes du relevé</h2>
          <ul className="list-inside list-disc text-sm">
            {releve.horsReleve.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/commandes/factures/${f.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {f.fournisseur} {f.numero}
                </Link>{' '}
                · {formatEuros(centimes(f.montantTtcCentimes))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
