import type { Oreille } from '../audio-rules/code-prestation';
import { etatEssai, type ProlongationEssai } from '../audio-rules/essai';
import { eligibiliteRenouvellement, type Delivrance } from '../audio-rules/renouvellement';
import { ajouterMois, joursEntre } from '../commun/date';
import type { ControleAPlanifier } from '../sav/suivi';

/**
 * Tolérance après une date fixe : un dimanche ou un jour férié ne fait pas perdre le message, et activer un
 * scénario n'envoie pas l'arriéré. À VÉRIFIER : choix applicatif, aucun texte de docs/ref.
 */
export const RATTRAPAGE_JOURS = 3;

function dansFenetre(echeance: string, jour: string, avanceJours: number): boolean {
  const restants = joursEntre(jour, echeance);
  return restants >= 0 && restants <= avanceJours;
}

/**
 * Rappel à `ecartJours` du rendez-vous, ce jour-là seulement : passé son jour, il ferait double emploi avec le
 * suivant. À VÉRIFIER : choix applicatif, aucun texte de docs/ref sur les rappels.
 */
export function rappelRdvDu(dateRdv: string, jour: string, ecartJours: number): boolean {
  return joursEntre(jour, dateRdv) === ecartJours;
}

export interface EntreeRelanceDevis {
  readonly dateEmission: string;
  readonly dateFinValidite: string;
  readonly delaiJours: number;
  readonly relancesMax: number;
  readonly jour: string;
}

/**
 * Rang de la relance due ce jour, `null` sinon. Le devis expiré ne se relance plus.
 * Source : modele-devis-audio.pdf p. 1 (validité). À VÉRIFIER : aucun texte sur la relance d'un devis (R58).
 */
export function rangRelanceDevis(entree: EntreeRelanceDevis): number | null {
  const { dateEmission, dateFinValidite, delaiJours, relancesMax, jour } = entree;
  const ecoules = joursEntre(dateEmission, jour);
  const rang = Math.floor(ecoules / delaiJours);
  const dansLesTemps = ecoules - rang * delaiJours <= RATTRAPAGE_JOURS;
  return rang >= 1 && rang <= relancesMax && dansLesTemps && jour <= dateFinValidite ? rang : null;
}

export interface EntreeFinEssai {
  readonly debut: string;
  readonly prolongation: ProlongationEssai | null;
  readonly jour: string;
  readonly avanceJours: number;
}

/**
 * Échéance de l'essai quand elle approche, `null` sinon. L'essai dure 30 jours au moins : l'échéance n'est pas
 * un terme imposé. Source : convention-audioprothesistes.pdf, art. 18 3°, p. 20.
 * À VÉRIFIER : prévenir le patient est un choix applicatif, comme l'alerte à 7 jours (R9).
 */
export function echeanceEssaiProche(entree: EntreeFinEssai): string | null {
  const { debut, prolongation, jour, avanceJours } = entree;
  const { echeance } = etatEssai({ debut, prolongation, rdvs: [], aujourdhui: jour });
  return dansFenetre(echeance, jour, avanceJours) ? echeance : null;
}

/**
 * Contrôles à annoncer : ceux qui approchent, jamais un retard, pour ne pas envoyer l'arriéré.
 * Source : modele-devis-audio.pdf p. 2 § 4 ; convention-audioprothesistes.pdf, art. 19, p. 20-21.
 * À VÉRIFIER : aucun texte sur le rappel d'un contrôle au patient (R57).
 */
export function controlesAAnnoncer(
  controles: readonly ControleAPlanifier[],
  jour: string,
  avanceJours: number,
): ControleAPlanifier[] {
  return controles.filter((c) => dansFenetre(c.datePrevue, jour, avanceJours));
}

/**
 * Dates d'éligibilité atteintes depuis peu, une par date même si les deux oreilles y arrivent ensemble. Une
 * oreille jamais appareillée ne compte pas. Le téléservice fait foi : c'est une invitation, pas un droit.
 * Source : convention-audioprothesistes.pdf, art. 22 § 1, p. 22.
 * À VÉRIFIER : droit de relancer le patient, éligibilité le jour anniversaire (R8).
 */
export function renouvellementsPossibles(
  historiqueDelivrances: readonly Delivrance[],
  jour: string,
  fenetreJours: number,
): string[] {
  const oreilles = [...new Set(historiqueDelivrances.map((d) => d.oreille))] as Oreille[];
  const dates = oreilles.flatMap((oreille) => {
    const { motif, dateEligibilite } = eligibiliteRenouvellement({
      historiqueDelivrances,
      oreille,
      date: jour,
    });
    return motif === 'DELAI_ECOULE' && joursEntre(dateEligibilite as string, jour) <= fenetreJours
      ? [dateEligibilite as string]
      : [];
  });
  return [...new Set(dates)];
}

/**
 * Fin de garantie à annoncer. `GarantieAppareil.dateFin` fait foi : un échange la reporte.
 * Source : modele-devis-audio.pdf p. 2 § 4. À VÉRIFIER : point de départ (R19).
 */
export function finGarantieProche(dateFin: string, jour: string, avanceJours: number): boolean {
  return dansFenetre(dateFin, jour, avanceJours);
}

/**
 * Nombre d'années fêtées autour de ce jour, `null` sinon. Un appareillage du 29 février se fête le 28.
 * À VÉRIFIER : message commercial, aucun texte de docs/ref (ADR-033).
 */
export function anniversaireAppareillage(dateDelivrance: string, jour: string): number | null {
  const annees = Number(jour.slice(0, 4)) - Number(dateDelivrance.slice(0, 4));
  const candidates = [annees, annees - 1].filter((n) => n >= 1);
  return (
    candidates.find((n) => {
      const ecart = joursEntre(ajouterMois(dateDelivrance, n * 12), jour);
      return ecart >= 0 && ecart <= RATTRAPAGE_JOURS;
    }) ?? null
  );
}
