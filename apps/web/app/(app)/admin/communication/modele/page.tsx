import {
  LIBELLES_SCENARIOS,
  MODELES_DEFAUT,
  SCENARIOS_COMMUNICATION,
  type TextesModele,
} from '@ha/domain';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { listerScenarios, obtenirModele } from '@/server/services/communication';

import { enregistrerModeleAction } from '../actions';
import { FormulaireModele } from '../formulaires';

export const metadata: Metadata = { title: 'Modèle de message – HA-Gestion' };

const VIDE: TextesModele = { sujet: '', corpsEmail: '', corpsSms: '', corpsCourrier: null };

export default async function PageModele({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireRole('ADMIN_CLIENT');
  const { id, scenario: choisi } = premieresValeurs(await searchParams);
  const scenario = SCENARIOS_COMMUNICATION.find((s) => s === choisi) ?? null;
  const modele = id ? await ouIntrouvable(obtenirModele(acteur, id)) : null;
  const dejaEnregistre = scenario
    ? (await listerScenarios(acteur)).find((s) => s.scenario === scenario)
    : undefined;
  const textes = modele ?? dejaEnregistre?.textes ?? (scenario ? MODELES_DEFAUT[scenario] : VIDE);
  const nom = modele?.nom ?? (scenario ? LIBELLES_SCENARIOS[scenario] : '');
  return (
    <div className="grid gap-6">
      <EntetePage titre={nom || 'Nouveau modèle de campagne'} />
      <FormulaireModele
        action={enregistrerModeleAction.bind(null, modele?.id ?? null)}
        nom={nom}
        scenario={modele?.scenario ?? scenario}
        textes={textes}
      />
    </div>
  );
}
