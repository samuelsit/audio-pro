'use client';

import {
  LIBELLES_OREILLES,
  LIBELLES_RUBRIQUES_OFFRE,
  type Oreille,
  type RubriqueOffre,
  type StatutDossier,
} from '@ha/domain';
import { startTransition, useActionState, useState, type FormEvent } from 'react';

import { CaseACocher, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { DevisDetail, DonneesFormulaireDevis } from '@/server/services/devis';

type Aide = { modeleId: string; prixAvantRemise: string; prix: string };
type Consommable = {
  accessoireId: string;
  quantite: string;
  prixAvantRemise: string;
  prix: string;
};

interface OffreEditee {
  aideDroite: Aide;
  aideGauche: Aide;
  consommables: Consommable[];
  amcDroite: string;
  amcGauche: string;
  amcConsommables: string;
}

const AIDE_VIDE: Aide = { modeleId: '', prixAvantRemise: '', prix: '' };

function euros(centimes: number | null | undefined): string {
  return centimes === null || centimes === undefined
    ? ''
    : (centimes / 100).toFixed(2).replace('.', ',');
}

function offreVide(): OffreEditee {
  return {
    aideDroite: AIDE_VIDE,
    aideGauche: AIDE_VIDE,
    consommables: [],
    amcDroite: '',
    amcGauche: '',
    amcConsommables: '',
  };
}

function offreInitiale(
  rubrique: RubriqueOffre,
  devis: DevisDetail | undefined,
  lignes: readonly { rubrique: RubriqueOffre; modeles: Readonly<Record<Oreille, string>> }[],
  articles: DevisArticles,
): OffreEditee {
  const offre = devis?.offres.find((o) => o.rubrique === rubrique);
  if (!offre) {
    return offreVide();
  }
  const aide = (oreille: Oreille): Aide => {
    const ligne = offre.aides.find((a) => a.oreille === oreille);
    const modeles = lignes.find((l) => l.rubrique === rubrique)?.modeles;
    return ligne
      ? {
          modeleId: modeles?.[oreille] ?? '',
          prixAvantRemise: euros(ligne.prixUnitaireAvantRemise),
          prix: euros(ligne.prixUnitaire),
        }
      : AIDE_VIDE;
  };
  return {
    aideDroite: aide('DROITE'),
    aideGauche: aide('GAUCHE'),
    consommables: offre.consommables.map((c, rang) => ({
      accessoireId: articles[rubrique]?.[rang] ?? '',
      quantite: String(c.quantite),
      prixAvantRemise: euros(c.prixUnitaireAvantRemise),
      prix: euros(c.prixUnitaire),
    })),
    amcDroite: euros(offre.amcDroite),
    amcGauche: euros(offre.amcGauche),
    amcConsommables: euros(offre.amcConsommables),
  };
}

type DevisArticles = Partial<Record<RubriqueOffre, readonly string[]>>;

function versSaisie(
  rubrique: RubriqueOffre,
  offre: OffreEditee,
  oreilles: readonly Oreille[],
): Record<string, unknown> {
  const aide = (oreille: Oreille, valeur: Aide) =>
    oreilles.includes(oreille) && valeur.modeleId !== '' ? valeur : null;
  return {
    ...offre,
    rubrique,
    aideDroite: aide('DROITE', offre.aideDroite),
    aideGauche: aide('GAUCHE', offre.aideGauche),
  };
}

function Prix({
  id,
  libelle,
  valeur,
  surChangement,
  lectureSeule = false,
}: {
  id: string;
  libelle: string;
  valeur: string;
  surChangement: (valeur: string) => void;
  lectureSeule?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{libelle}</Label>
      <Input
        id={id}
        value={valeur}
        readOnly={lectureSeule}
        onChange={(e) => surChangement(e.target.value)}
      />
    </div>
  );
}

function Selection({
  id,
  libelle,
  valeur,
  options,
  surChangement,
}: {
  id: string;
  libelle: string;
  valeur: string;
  options: readonly { id: string; libelle: string }[];
  surChangement: (valeur: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{libelle}</Label>
      <select
        id={id}
        value={valeur}
        onChange={(e) => surChangement(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Choisir…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

function BlocOffre({
  rubrique,
  offre,
  oreilles,
  donnees,
  surChangement,
}: {
  rubrique: RubriqueOffre;
  offre: OffreEditee;
  oreilles: readonly Oreille[];
  donnees: DonneesFormulaireDevis;
  surChangement: (offre: OffreEditee) => void;
}) {
  const remise = rubrique === 'AUTRE_OFFRE';
  const titre = LIBELLES_RUBRIQUES_OFFRE[rubrique];
  const modeles = donnees.modeles.filter((m) => remise || m.classe === 'CLASSE_I');

  function choisirModele(oreille: Oreille, modeleId: string) {
    const prix = euros(modeles.find((m) => m.id === modeleId)?.prixConseilleCentimes);
    const aide = { modeleId, prixAvantRemise: prix, prix };
    surChangement(
      oreille === 'DROITE' ? { ...offre, aideDroite: aide } : { ...offre, aideGauche: aide },
    );
  }

  function modifierAide(oreille: Oreille, modif: Partial<Aide>) {
    const champ = oreille === 'DROITE' ? 'aideDroite' : 'aideGauche';
    surChangement({ ...offre, [champ]: { ...offre[champ], ...modif } });
  }

  function modifierConsommable(rang: number, modif: Partial<Consommable>) {
    surChangement({
      ...offre,
      consommables: offre.consommables.map((c, i) => (i === rang ? { ...c, ...modif } : c)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {oreilles.map((oreille) => {
          const aide = oreille === 'DROITE' ? offre.aideDroite : offre.aideGauche;
          const cote = LIBELLES_OREILLES[oreille].toLowerCase();
          const prefixe = `${rubrique}-${oreille}`;
          return (
            <fieldset key={oreille} className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">{LIBELLES_OREILLES[oreille]}</legend>
              <div className="sm:col-span-2">
                <Selection
                  id={`${prefixe}-modele`}
                  libelle={`Aide auditive, ${titre}, ${cote}`}
                  valeur={aide.modeleId}
                  options={modeles.map((m) => ({ id: m.id, libelle: m.libelle }))}
                  surChangement={(valeur) => choisirModele(oreille, valeur)}
                />
              </div>
              {remise ? (
                <Prix
                  id={`${prefixe}-avant-remise`}
                  libelle={`Prix TTC avant remise (€), ${cote}`}
                  valeur={aide.prixAvantRemise}
                  surChangement={(valeur) => modifierAide(oreille, { prixAvantRemise: valeur })}
                />
              ) : null}
              <Prix
                id={`${prefixe}-prix`}
                libelle={`Prix TTC (€), ${titre}, ${cote}`}
                valeur={aide.prix}
                surChangement={(valeur) =>
                  modifierAide(
                    oreille,
                    remise ? { prix: valeur } : { prix: valeur, prixAvantRemise: valeur },
                  )
                }
              />
              <Prix
                id={`${prefixe}-amc`}
                libelle={`Part AMC estimée (€), ${titre}, ${cote}`}
                valeur={oreille === 'DROITE' ? offre.amcDroite : offre.amcGauche}
                lectureSeule={donnees.pecAccordeeCentimes !== null}
                surChangement={(valeur) =>
                  surChangement(
                    oreille === 'DROITE'
                      ? { ...offre, amcDroite: valeur }
                      : { ...offre, amcGauche: valeur },
                  )
                }
              />
            </fieldset>
          );
        })}

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">Consommables, piles et accessoires</legend>
          {offre.consommables.map((ligne, rang) => {
            const prefixe = `${rubrique}-consommable-${String(rang)}`;
            return (
              <div key={prefixe} className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto]">
                <Selection
                  id={`${prefixe}-article`}
                  libelle={`Article ${String(rang + 1)}, ${titre}`}
                  valeur={ligne.accessoireId}
                  options={donnees.articles}
                  surChangement={(accessoireId) => {
                    const prix = euros(
                      donnees.articles.find((a) => a.id === accessoireId)?.prixCentimes,
                    );
                    modifierConsommable(rang, { accessoireId, prix, prixAvantRemise: prix });
                  }}
                />
                <Prix
                  id={`${prefixe}-quantite`}
                  libelle="Quantité"
                  valeur={ligne.quantite}
                  surChangement={(quantite) => modifierConsommable(rang, { quantite })}
                />
                <Prix
                  id={`${prefixe}-prix`}
                  libelle="Prix unitaire (€)"
                  valeur={ligne.prix}
                  surChangement={(prix) =>
                    modifierConsommable(rang, remise ? { prix } : { prix, prixAvantRemise: prix })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="self-end"
                  onClick={() =>
                    surChangement({
                      ...offre,
                      consommables: offre.consommables.filter((_, i) => i !== rang),
                    })
                  }
                >
                  Retirer
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                surChangement({
                  ...offre,
                  consommables: [
                    ...offre.consommables,
                    { accessoireId: '', quantite: '1', prixAvantRemise: '', prix: '' },
                  ],
                })
              }
            >
              Ajouter un article ({titre})
            </Button>
          </div>
          {offre.consommables.length > 0 ? (
            <div className="max-w-xs">
              <Prix
                id={`${rubrique}-amc-consommables`}
                libelle={`Part AMC estimée (€), consommables, ${titre}`}
                valeur={offre.amcConsommables}
                lectureSeule={donnees.pecAccordeeCentimes !== null}
                surChangement={(amcConsommables) => surChangement({ ...offre, amcConsommables })}
              />
            </div>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/** Lien entre un devis relu et le catalogue : identifiants des lignes, conservés à la modification. */
export interface LignesCatalogue {
  readonly modeles: readonly {
    rubrique: RubriqueOffre;
    modeles: Readonly<Record<Oreille, string>>;
  }[];
  readonly articles: DevisArticles;
}

/** Envoi par `onSubmit` : les lignes vivent dans l'état du composant et survivent à une erreur. */
export function FormulaireDevis({
  action,
  donnees,
  devis,
  lignes,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  donnees: DonneesFormulaireDevis;
  devis?: DevisDetail;
  lignes?: LignesCatalogue;
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT_INITIAL);
  const initiale = (rubrique: RubriqueOffre) =>
    offreInitiale(rubrique, devis, lignes?.modeles ?? [], lignes?.articles ?? {});
  const [offre100, setOffre100] = useState(() => initiale('OFFRE_100_SANTE'));
  const [autre, setAutre] = useState(() => initiale('AUTRE_OFFRE'));
  const [avecAutre, setAvecAutre] = useState(
    devis?.offres.some((o) => o.rubrique === 'AUTRE_OFFRE') ?? false,
  );
  const statut: StatutDossier = donnees.statutDossier;
  const offres = [
    versSaisie('OFFRE_100_SANTE', offre100, donnees.oreilles),
    ...(avecAutre ? [versSaisie('AUTRE_OFFRE', autre, donnees.oreilles)] : []),
  ];

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = new FormData(evenement.currentTarget);
    formulaire.set('offres', JSON.stringify(offres));
    startTransition(() => envoyer(formulaire));
  }

  return (
    <form onSubmit={soumettre} className="grid max-w-3xl gap-6">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <Card>
        <CardHeader>
          <CardTitle>Devis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="lieuEmission"
            libelle="Lieu d’émission"
            defaut={devis?.lieuEmission ?? donnees.lieuParDefaut}
            requis
          />
          <ChampTexte
            etat={etat}
            nom="validiteMois"
            libelle="Durée de validité (mois)"
            defaut={String(devis?.validiteMois ?? 2)}
            inputMode="numeric"
            requis
            aide="Au moins 2 mois."
          />
          <ChampTexte
            etat={etat}
            nom="tauxAmo"
            libelle="Taux AMO (%)"
            defaut={String(devis?.tauxAmo ?? 60)}
            inputMode="numeric"
            requis
          />
          <ChampTexte
            etat={etat}
            nom="depotGarantie"
            libelle="Dépôt de garantie (€)"
            defaut={euros(devis?.depotGarantieCentimes)}
          />
          {donnees.oreilles.includes('DROITE') ? (
            <ChampTexte
              etat={etat}
              nom="datePrecedentDroite"
              libelle="Précédent appareillage, oreille droite"
              type="date"
              defaut={devis?.datePrecedentDroite ?? donnees.datePrecedentDroite}
            />
          ) : null}
          {donnees.oreilles.includes('GAUCHE') ? (
            <ChampTexte
              etat={etat}
              nom="datePrecedentGauche"
              libelle="Précédent appareillage, oreille gauche"
              type="date"
              defaut={devis?.datePrecedentGauche ?? donnees.datePrecedentGauche}
            />
          ) : null}
          <div className="grid gap-2 sm:col-span-2">
            <CaseACocher
              etat={etat}
              nom="bobineTPresentee"
              libelle="Présentation de la bobine T réalisée"
              defaut={devis?.bobineTPresentee ?? false}
            />
            <CaseACocher
              etat={etat}
              nom="ficheTechniqueJointe"
              libelle="Fiche technique jointe"
              defaut={devis?.ficheTechniqueJointe ?? false}
            />
            <CaseACocher
              etat={etat}
              nom="contratResponsable"
              libelle="Contrat complémentaire responsable"
              defaut={devis?.contratResponsable ?? false}
            />
            {donnees.c2s ? (
              <CaseACocher
                etat={etat}
                nom="refusOffreC2S"
                libelle="Le bénéficiaire de la C2S refuse l’offre à prix maximal"
                defaut={devis?.refusOffreC2S ?? false}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {donnees.pecAccordeeCentimes !== null ? (
        <p className="text-sm text-muted-foreground">
          Réponse de la complémentaire reçue : la part AMC vient de son montant et ne se saisit pas.
        </p>
      ) : null}

      <BlocOffre
        rubrique="OFFRE_100_SANTE"
        offre={offre100}
        oreilles={donnees.oreilles}
        donnees={donnees}
        surChangement={setOffre100}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={avecAutre}
          onChange={(e) => setAvecAutre(e.target.checked)}
        />
        Proposer une autre offre
      </label>
      {avecAutre ? (
        <BlocOffre
          rubrique="AUTRE_OFFRE"
          offre={autre}
          oreilles={donnees.oreilles}
          donnees={donnees}
          surChangement={setAutre}
        />
      ) : null}

      <div>
        <Button type="submit" disabled={enCours}>
          Enregistrer le brouillon
        </Button>
      </div>
    </form>
  );
}
