import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accuserParLien, lireCommandeAccusable } from '@/server/services/envoi-commandes';

export const metadata: Metadata = {
  title: 'Accusé de réception',
  robots: { index: false, follow: false },
};

/**
 * La confirmation passe par un bouton : les passerelles de messagerie ouvrent les liens reçus, un GET ne doit
 * donc rien changer.
 */
export default async function PageAccuseCommande({
  params,
}: PageProps<'/commande-accuse/[jeton]'>) {
  const { jeton } = await params;
  const commande = await lireCommandeAccusable(jeton);

  async function confirmer(formData: FormData): Promise<void> {
    'use server';
    await accuserParLien(jeton, { referenceFournisseur: formData.get('referenceFournisseur') });
    revalidatePath(`/commande-accuse/${jeton}`);
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <h1 className="text-xl font-medium">Accusé de réception</h1>
      {commande === null ? <p>Ce lien n’est plus valide.</p> : null}
      {commande?.dejaAccusee ? (
        <p>
          La réception de la commande {commande.numero} de {commande.centre} est confirmée. Merci.
        </p>
      ) : null}
      {commande && !commande.dejaAccusee ? (
        <form action={confirmer} className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Commande {commande.numero} de {commande.centre}.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="referenceFournisseur">Votre référence (facultatif)</Label>
            <Input
              id="referenceFournisseur"
              name="referenceFournisseur"
              autoComplete="off"
              maxLength={100}
            />
          </div>
          <div>
            <Button type="submit">Confirmer la réception</Button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
