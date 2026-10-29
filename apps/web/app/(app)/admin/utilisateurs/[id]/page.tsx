import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { listerCentres } from '@/server/services/centres';
import { obtenirUtilisateur } from '@/server/services/utilisateurs';

import { modifierUtilisateurAction, reinitialiserMotDePasseAction } from '../actions';
import { FormulaireReinitialisation } from '../formulaire-reinitialisation';
import { FormulaireUtilisateur } from '../formulaire-utilisateur';

export const metadata: Metadata = { title: 'Utilisateur – HA-Gestion' };

export default async function PageUtilisateur({ params }: PageProps<'/admin/utilisateurs/[id]'>) {
  const { id } = await params;
  const acteur = await requireRole('ADMIN');
  const [utilisateur, centres] = await Promise.all([
    ouIntrouvable(obtenirUtilisateur(acteur, id)),
    listerCentres(acteur, { type: 'tous' }),
  ]);
  return (
    <div className="grid gap-8">
      <EntetePage titre={`${utilisateur.prenom} ${utilisateur.nom}`}>
        Vérification en deux étapes : {utilisateur.deuxFacteursActif ? 'activée' : 'non activée'}.
        {utilisateur.estPraticien ? (
          <>
            {' '}
            <Link href="/admin/praticiens" className="underline underline-offset-4">
              Fiche praticien
            </Link>
          </>
        ) : null}
      </EntetePage>
      <FormulaireUtilisateur
        action={modifierUtilisateurAction.bind(null, id)}
        centres={centres}
        utilisateur={utilisateur}
      />
      <section className="grid gap-3 border-t pt-6">
        <h2 className="text-lg font-medium">Mot de passe</h2>
        <FormulaireReinitialisation action={reinitialiserMotDePasseAction.bind(null, id)} />
      </section>
    </div>
  );
}
