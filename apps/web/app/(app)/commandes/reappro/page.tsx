import { peutGererAchats } from '@ha/domain';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerAccessoires, listerModeles } from '@/server/services/catalogue';
import { proposerReappro } from '@/server/services/reappro';

import { creerBrouillonsAction, enregistrerSeuilAction, retirerSeuilAction } from './actions';
import { FormulaireSeuil, TableauReappro } from './formulaires';

export const metadata: Metadata = { title: 'Réapprovisionnement – HA-Gestion' };

export default async function PageReappro() {
  const { acteur, perimetre } = await perimetreCourant();
  if (!peutGererAchats(acteur.role)) {
    redirect('/commandes');
  }
  if (perimetre.type !== 'centre') {
    return (
      <div className="grid gap-6">
        <EntetePage titre="Réapprovisionnement" />
        <EtatVide titre="Choisissez un centre">
          Les seuils se règlent centre par centre : sélectionnez-en un en haut de page.
        </EtatVide>
      </div>
    );
  }
  const { centreId } = perimetre;
  const [lignes, modeles, accessoires] = await Promise.all([
    proposerReappro(acteur, centreId),
    listerModeles(acteur),
    listerAccessoires(acteur),
  ]);
  const produits = [
    ...modeles.map((m) => ({
      valeur: `modele:${m.id}`,
      libelle: `${m.fabricant} ${m.gamme} ${m.nom}`,
    })),
    ...accessoires.map((a) => ({ valeur: `accessoire:${a.id}`, libelle: a.nom })),
  ];
  return (
    <div className="grid gap-6">
      <EntetePage titre="Réapprovisionnement">
        Sous le minimum, compte tenu des commandes en cours, une quantité est proposée.
      </EntetePage>
      {lignes.length > 0 ? (
        <TableauReappro
          action={creerBrouillonsAction.bind(null, centreId)}
          lignes={lignes}
          retraits={Object.fromEntries(
            lignes.map((l) => [l.seuilId, retirerSeuilAction.bind(null, centreId, l.seuilId)]),
          )}
        />
      ) : null}
      <section className="grid gap-3">
        <h2 className="font-medium">Seuil d’un produit</h2>
        <FormulaireSeuil action={enregistrerSeuilAction.bind(null, centreId)} produits={produits} />
      </section>
    </div>
  );
}
