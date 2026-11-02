import { LIBELLES_CANAUX_MESSAGE } from '@ha/domain';
import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';

import { Button } from '@/components/ui/button';
import { desinscrire, lireDesinscription } from '@/server/services/liens-patient';

export const metadata: Metadata = {
  title: 'Désinscription',
  robots: { index: false, follow: false },
};

/**
 * La confirmation passe par un bouton : les passerelles de messagerie ouvrent les liens reçus, un GET ne doit donc
 * rien changer. Le désabonnement en un clic d'un client de messagerie passe par `un-clic`, en POST.
 */
export default async function PageDesinscription({ params }: PageProps<'/desinscription/[jeton]'>) {
  const { jeton } = await params;
  const lecture = await lireDesinscription(jeton);

  async function confirmer(): Promise<void> {
    'use server';
    await desinscrire(jeton);
    revalidatePath(`/desinscription/${jeton}`);
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <h1 className="text-xl font-medium">Ne plus recevoir nos messages</h1>
      {lecture === null ? <p>Ce lien n’est plus valide.</p> : null}
      {lecture?.dejaFaite ? (
        <p>C’est fait : {lecture.centre} ne vous écrira plus sur ce canal.</p>
      ) : null}
      {lecture && !lecture.dejaFaite ? (
        <form action={confirmer} className="grid gap-4">
          <p>
            Vous ne recevrez plus aucun message de {lecture.centre} par{' '}
            {LIBELLES_CANAUX_MESSAGE[lecture.canal].toLowerCase()}, rappels de rendez-vous compris.
          </p>
          <div>
            <Button type="submit">Confirmer</Button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
