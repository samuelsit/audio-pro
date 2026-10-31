import { LIBELLES_TYPES_EXCEPTION, peutGererTypesRdv } from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import { formaterDateHeure } from '@/lib/format';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import {
  listerCabines,
  listerExceptions,
  listerHorairesPraticiens,
  listerTypesRdv,
} from '@/server/services/agenda-parametres';
import { aujourdhui } from '@/server/services/patients';

import { centreDeLAgenda } from '../centre';
import {
  changerActivationCabineAction,
  changerActivationTypeRdvAction,
  creerCabineAction,
  creerExceptionAction,
  enregistrerTypeRdvAction,
  modifierHorairesAction,
  supprimerExceptionAction,
} from './actions';
import {
  FormulaireCabine,
  FormulaireException,
  FormulaireHoraires,
  FormulaireType,
} from './formulaires';

export const metadata: Metadata = { title: 'Paramètres de l’agenda – HA-Gestion' };

export default async function PageParametresAgenda({
  searchParams,
}: PageProps<'/agenda/parametres'>) {
  const acteur = await requireRole('ADMIN_CLIENT', 'RESPONSABLE_CENTRE');
  const { centre } = await searchParams;
  const { centreId } = await centreDeLAgenda(typeof centre === 'string' ? centre : undefined);
  if (centreId === null) {
    return <EtatVide titre="Aucun centre">Aucun centre n’est accessible.</EtatVide>;
  }
  const [cabines, praticiens, exceptions, types] = await Promise.all([
    ouIntrouvable(listerCabines(acteur, centreId)),
    ouIntrouvable(listerHorairesPraticiens(acteur, centreId)),
    ouIntrouvable(listerExceptions(acteur, centreId, aujourdhui())),
    listerTypesRdv(acteur),
  ]);
  const listePraticiens = praticiens.map((p) => ({ id: p.praticienId, nom: p.nom }));

  return (
    <div className="grid gap-8">
      <EntetePage titre="Paramètres de l’agenda">
        Cabines, horaires et exceptions du centre courant.
      </EntetePage>

      <section className="grid gap-3">
        <h2 className="font-medium">Cabines</h2>
        <ul className="grid max-w-md gap-1 text-sm">
          {cabines.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>
                {c.nom}
                {c.actif ? null : <span className="text-muted-foreground"> (inactive)</span>}
              </span>
              <form action={changerActivationCabineAction.bind(null, c.id, !c.actif)}>
                <Button type="submit" size="sm" variant="outline">
                  {c.actif ? 'Désactiver' : 'Réactiver'}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <FormulaireCabine action={creerCabineAction.bind(null, centreId)} />
      </section>

      <section className="grid gap-4">
        <h2 className="font-medium">Horaires des praticiens</h2>
        {praticiens.map((p) => (
          <div key={p.praticienId} className="grid gap-2">
            <h3 className="text-sm font-medium">{p.nom}</h3>
            <FormulaireHoraires
              action={modifierHorairesAction.bind(null, p.praticienId, centreId)}
              horaires={p.horaires}
            />
          </div>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Exceptions</h2>
        <ul className="grid max-w-2xl gap-1 text-sm">
          {exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span>
                {LIBELLES_TYPES_EXCEPTION[e.type]}
                {e.praticien ? ` – ${e.praticien}` : ''}
                {e.cabine ? ` – ${e.cabine}` : ''} : {formaterDateHeure(new Date(e.debut))} →{' '}
                {formaterDateHeure(new Date(e.fin))}
              </span>
              <form action={supprimerExceptionAction.bind(null, centreId, e.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Supprimer
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <FormulaireException
          action={creerExceptionAction.bind(null, centreId)}
          centreId={centreId}
          praticiens={listePraticiens}
          cabines={cabines.filter((c) => c.actif)}
        />
      </section>

      {peutGererTypesRdv(acteur.role) ? (
        <section className="grid gap-4">
          <h2 className="font-medium">Types de rendez-vous</h2>
          {types.map((t) => (
            <details key={t.id} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t.nom} ({t.dureeMinutes} min){t.actif ? '' : ' – inactif'}
              </summary>
              <div className="grid gap-3 pt-3">
                <FormulaireType action={enregistrerTypeRdvAction.bind(null, t.id)} type={t} />
                <form action={changerActivationTypeRdvAction.bind(null, t.id, !t.actif)}>
                  <Button type="submit" size="sm" variant="outline">
                    {t.actif ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </form>
              </div>
            </details>
          ))}
          <h3 className="text-sm font-medium">Nouveau type</h3>
          <FormulaireType action={enregistrerTypeRdvAction.bind(null, null)} />
        </section>
      ) : null}
    </div>
  );
}
