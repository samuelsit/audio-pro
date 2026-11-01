import type { StatutDossier } from '../dossier/etats';
import { repartirAmc } from '../facture/preparation';
import { centimes, type Centimes } from '../money';
import type { LigneDemandePec } from '../ports/pec-gateway';
import type { OffreCalculee } from './calcul';

const STATUTS_PEC_POSSIBLE: readonly StatutDossier[] = [
  'PRESCRIPTION_OK',
  'DEVIS_EMIS',
  'EN_ESSAI',
  'DEVIS_SIGNE',
  'A_FACTURER',
];

/** Une PEC précède le devis ou lui succède ; une fois le dossier facturé, la facture l'a déjà lue. */
export function dossierAcceptePec(statut: StatutDossier): boolean {
  return STATUTS_PEC_POSSIBLE.includes(statut);
}

export interface AmcPoste {
  readonly amcDroite: Centimes | null;
  readonly amcGauche: Centimes | null;
  readonly amcConsommables: Centimes | null;
}

/**
 * Part AMC d'une offre quand une PEC accordée existe : son montant remplace la saisie, réparti entre les
 * postes au prorata du reste après AMO, comme à la facture.
 * À VÉRIFIER : aucun document de docs/ref ne décrit une PEC (R23).
 */
export function amcDepuisPec(montant: Centimes, offre: OffreCalculee): AmcPoste {
  const { droite, gauche, consommables } = offre;
  const postes = [droite, gauche, consommables];
  const parts = repartirAmc(
    montant,
    postes.map((poste) => poste?.resteApresAMO ?? centimes(0)),
  );
  const partDu = (rang: number): Centimes | null =>
    postes[rang] ? (parts[rang] as Centimes) : null;
  return { amcDroite: partDu(0), amcGauche: partDu(1), amcConsommables: partDu(2) };
}

/**
 * Lignes d'une demande de PEC, préremplies depuis les postes d'une offre : on demande la part estimée, sinon tout ce
 * qui reste après l'AMO.
 * À VÉRIFIER : la demande ne suit pas un format fournisseur, docs/vendor/pec n'existe pas (R23).
 */
export function lignesDemandeDepuisOffre(offre: OffreCalculee): LigneDemandePec[] {
  const postes = [
    { libelle: 'Oreille droite', poste: offre.droite },
    { libelle: 'Oreille gauche', poste: offre.gauche },
    { libelle: 'Consommables, piles et accessoires', poste: offre.consommables },
  ];
  return postes.flatMap(({ libelle, poste }) =>
    poste
      ? [
          {
            libelle,
            codeLpp: null,
            prixTtcCentimes: poste.ttc,
            amoCentimes: poste.amo,
            montantDemandeCentimes: poste.amc ?? poste.resteApresAMO,
          },
        ]
      : [],
  );
}

/** Le devis figé ne porte plus la PEC : plafonnée au reste, elle diffère de sa part AMC. Un refus vaut 0. */
export function pecDiffereDuDevis(montant: Centimes, offres: readonly OffreCalculee[]): boolean {
  return offres.some(({ total }) => (total.amc ?? 0) !== Math.min(montant, total.resteApresAMO));
}
