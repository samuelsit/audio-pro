import { LIBELLES_SPECIALITES_PRESCRIPTEUR } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { ChampTexte } from '@/components/formulaire';
import { FormulaireFiltres } from '@/components/formulaire-filtres';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import type { EtatFormulaire } from '@/lib/formulaire';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { requireSession } from '@/server/auth/gardes';
import { listerPrescripteurs, type PrescripteurResume } from '@/server/services/prescripteurs';

import { SelecteurPrescripteur } from './selecteur-prescripteur';

export const metadata: Metadata = { title: 'Prescripteurs – HA-Gestion' };

const CHEMIN = '/prescripteurs';

function colonnes(admin: boolean): readonly Colonne<PrescripteurResume>[] {
  return [
    {
      libelle: 'Nom',
      rendu: (p) =>
        admin ? (
          <Link
            href={`${CHEMIN}/${p.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {p.nom} {p.prenom}
          </Link>
        ) : (
          <span className="font-medium">
            {p.nom} {p.prenom}
          </span>
        ),
    },
    { libelle: 'Spécialité', rendu: (p) => LIBELLES_SPECIALITES_PRESCRIPTEUR[p.specialite] },
    {
      libelle: 'Otologie médicale',
      rendu: (p) => (p.formationOtologie === null ? '—' : p.formationOtologie ? 'Oui' : 'Non'),
    },
    { libelle: 'RPPS', rendu: (p) => p.rpps ?? '—', className: 'font-mono' },
    { libelle: 'Cabinet', rendu: (p) => p.cabinet ?? '—' },
    { libelle: 'Contact', rendu: (p) => p.contact ?? '—' },
    {
      libelle: 'Statut',
      rendu: (p) => (p.actif ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>),
    },
  ];
}

export default async function PagePrescripteurs({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const parametres = premieresValeurs(await searchParams);
  const { prescripteurs, pagination } = await listerPrescripteurs(acteur, parametres);
  const etat: EtatFormulaire = { valeurs: parametres };
  return (
    <div className="grid gap-6">
      <EntetePage
        titre="Prescripteurs"
        action={{ href: `${CHEMIN}/nouveau`, libelle: 'Nouveau prescripteur' }}
      >
        Médecins prescripteurs, communs à tout le réseau.
      </EntetePage>

      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="font-medium">Recherche rapide</h2>
        <SelecteurPrescripteur />
      </section>

      <FormulaireFiltres chemin={CHEMIN}>
        <ChampTexte etat={etat} nom="q" libelle="Filtrer la liste" mentionFacultatif={false} />
      </FormulaireFiltres>

      <TableauPagine
        colonnes={colonnes(acteur.role === 'ADMIN')}
        lignes={prescripteurs}
        cleLigne={(p) => p.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={parametres['q'] ? { q: parametres['q'] } : {}}
        vide="Aucun prescripteur ne correspond à cette recherche."
      />
    </div>
  );
}
