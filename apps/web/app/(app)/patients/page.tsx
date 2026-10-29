import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ChampTexte } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EtatFormulaire } from '@/lib/formulaire';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerPatients, type PatientResume } from '@/server/services/patients';

import { dateEtAge, nomAffiche } from './affichage';
import { RechercheNir } from './recherche-nir';

export const metadata: Metadata = { title: 'Patients – HA-Gestion' };

const CHEMIN = '/patients';
const FILTRES = ['nom', 'prenom', 'dateNaissance', 'empreinte'] as const;

const COLONNES: readonly Colonne<PatientResume>[] = [
  {
    libelle: 'Nom',
    rendu: (p) => (
      <Link href={`/patients/${p.id}`} className="font-medium underline-offset-4 hover:underline">
        {nomAffiche(p)}
      </Link>
    ),
  },
  { libelle: 'Prénoms', rendu: (p) => p.prenoms },
  { libelle: 'Date de naissance', rendu: dateEtAge, className: 'whitespace-nowrap' },
  { libelle: 'Centre', rendu: (p) => p.centre.nom },
  { libelle: 'Téléphone', rendu: (p) => p.telephone ?? '—', className: 'font-mono' },
];

export default async function PagePatients({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { patients, pagination, criteres } = await listerPatients(acteur, perimetre, parametres);
  const filtres = Object.fromEntries(
    FILTRES.flatMap((cle) => (parametres[cle] ? [[cle, parametres[cle]]] : [])),
  );
  const etat: EtatFormulaire = { valeurs: parametres };

  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Patients"
        action={{ href: '/patients/nouveau', libelle: 'Nouveau patient' }}
      >
        {perimetre.type === 'tous'
          ? 'Patients de tous les centres du réseau.'
          : 'Patients rattachés au centre courant.'}
      </EntetePage>

      <FormulaireFiltres chemin={CHEMIN}>
        <ChampTexte etat={etat} nom="nom" libelle="Nom" mentionFacultatif={false} />
        <ChampTexte etat={etat} nom="prenom" libelle="Prénom" mentionFacultatif={false} />
        <ChampTexte
          etat={etat}
          nom="dateNaissance"
          libelle="Date de naissance"
          type="date"
          mentionFacultatif={false}
        />
      </FormulaireFiltres>

      <RechercheNir />

      {criteres.empreinte ? (
        <Alert role="status">
          <AlertDescription>
            Résultats de la recherche par NIR.{' '}
            <Link href={CHEMIN} className="underline underline-offset-4">
              Revenir à la liste complète
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <TableauPagine
        colonnes={COLONNES}
        lignes={patients}
        cleLigne={(p) => p.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={filtres}
        vide="Aucun patient ne correspond à cette recherche."
      />
    </div>
  );
}
