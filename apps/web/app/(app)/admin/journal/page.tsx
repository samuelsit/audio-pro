import {
  calculerPagination,
  LIBELLES_ACTIONS_AUDIT,
  type ActionAudit,
  type Pagination,
} from '@ha/domain';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ChampTexte, ListeDeroulante, MessageFormulaire } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formaterDateHeure } from '@/lib/format';
import type { EtatFormulaire } from '@/lib/formulaire';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import {
  LIGNES_PAR_PAGE,
  listerJournal,
  utilisateursPourFiltre,
  type LigneJournal,
} from '@/server/services/journal';

export const metadata: Metadata = { title: 'Journal d’audit – HA-Gestion' };

const CHEMIN = '/admin/journal';
const FILTRES = ['utilisateurId', 'patientId', 'du', 'au'] as const;

const VARIANTES_ACTION: Partial<Record<ActionAudit, 'secondary' | 'destructive' | 'outline'>> = {
  READ: 'outline',
  EXPORT: 'secondary',
  PRINT: 'secondary',
  DELETE: 'destructive',
  ECHEC_CONNEXION: 'destructive',
};

const COLONNES: readonly Colonne<LigneJournal>[] = [
  {
    libelle: 'Date et heure',
    rendu: (l) => formaterDateHeure(l.horodatage),
    className: 'whitespace-nowrap',
  },
  { libelle: 'Utilisateur', rendu: (l) => l.utilisateurLibelle },
  { libelle: 'Centre', rendu: (l) => l.centreNom ?? '—' },
  {
    libelle: 'Action',
    rendu: (l) => (
      <Badge variant={VARIANTES_ACTION[l.action] ?? 'default'}>
        {LIBELLES_ACTIONS_AUDIT[l.action]}
      </Badge>
    ),
  },
  {
    libelle: 'Entité',
    rendu: (l) => (
      <span title={l.entiteId ?? undefined}>
        {l.entite}
        {l.entiteId ? (
          <span className="block font-mono text-xs text-muted-foreground">
            {l.entiteId.slice(-12)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    libelle: 'Détail',
    rendu: (l) => (
      <span className="block max-w-md text-sm break-words whitespace-normal">
        {[l.champs, l.details].filter(Boolean).join(' — ') || '—'}
      </span>
    ),
  },
];

export default async function PageJournal({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const utilisateurs = await utilisateursPourFiltre(acteur);

  let lignes: LigneJournal[] = [];
  let pagination: Pagination = calculerPagination(1, LIGNES_PAR_PAGE, 0);
  const etat: EtatFormulaire = { valeurs: parametres };
  try {
    ({ lignes, pagination } = await listerJournal(acteur, perimetre, parametres));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) {
      throw erreur;
    }
    etat.message = 'Filtres invalides : corrigez-les pour afficher le journal.';
    etat.erreurs = erreur.erreurs;
  }
  const filtres = Object.fromEntries(
    FILTRES.flatMap((cle) => (parametres[cle] ? [[cle, parametres[cle]]] : [])),
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre="Journal d’audit">
          {perimetre.type === 'tous'
            ? 'Toutes les actions tracées du réseau, les plus récentes d’abord.'
            : 'Actions rattachées au centre courant (les comptes et les connexions apparaissent avec « Tous mes centres »).'}
        </EntetePage>
        {etat.erreurs ? null : (
          <Button asChild variant="outline">
            {/* Lien de téléchargement (route GET), pas une navigation : <a> et non <Link>. */}
            <a href={urlAvecParametres(`${CHEMIN}/export`, filtres)} download>
              <Download aria-hidden />
              Exporter en CSV
            </a>
          </Button>
        )}
      </div>

      <FormulaireFiltres chemin={CHEMIN}>
        <ListeDeroulante
          etat={etat}
          nom="utilisateurId"
          libelle="Utilisateur"
          vide="Tous"
          requis={false}
          options={utilisateurs.map((u) => ({ valeur: u.id, libelle: u.libelle }))}
        />
        <ChampTexte
          etat={etat}
          nom="patientId"
          libelle="Patient (identifiant)"
          aide="Identifiant visible dans l’adresse de la fiche patient (recherche par nom à venir)."
          mentionFacultatif={false}
        />
        <ChampTexte etat={etat} nom="du" libelle="Du" type="date" mentionFacultatif={false} />
        <ChampTexte etat={etat} nom="au" libelle="Au" type="date" mentionFacultatif={false} />
      </FormulaireFiltres>

      <MessageFormulaire etat={etat} />

      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(l) => l.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={filtres}
        vide="Aucune action ne correspond à ces filtres."
      />
    </div>
  );
}
