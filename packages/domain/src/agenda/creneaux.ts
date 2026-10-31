import type { HorairesOuverture } from '../centre/horaires';
import { ajouterJours, joursEntre } from '../commun/date';
import { bornesJourMs } from '../commun/fuseau';
import { plagesCabine, plagesPraticien, type ExceptionAgenda } from './disponibilites';
import { contient, soustraire, type Intervalle } from './intervalles';

/** Grille des créneaux proposés. Les décalages de Paris sont en heures pleines : un pas de 15 minutes
 * en temps réel depuis minuit reste aligné sur l'heure locale, changement d'heure compris. */
export const PAS_CRENEAU_MINUTES = 15;

const MS_PAR_MINUTE = 60_000;

/** Intervalle déjà pris : un rendez-vous, avec ses ressources. */
export interface Occupation extends Intervalle {
  readonly praticienId: string | null;
  readonly cabineId: string | null;
}

export interface PraticienCandidat {
  readonly id: string;
  /** Horaires sur le centre recherché. */
  readonly horaires: HorairesOuverture;
}

export interface RechercheCreneaux {
  readonly centreId: string;
  readonly du: string;
  readonly au: string;
  readonly dureeMinutes: number;
  readonly requierePraticien: boolean;
  readonly requiereCabine: boolean;
  /** Candidats retenus : tous ceux du centre, ou le seul praticien demandé. */
  readonly praticiens: readonly PraticienCandidat[];
  readonly cabines: readonly string[];
  readonly horairesCentre: HorairesOuverture;
  readonly exceptions: readonly ExceptionAgenda[];
  /** Occupations de ces praticiens, tous centres confondus, et de ces cabines. */
  readonly occupations: readonly Occupation[];
  /** Aucun créneau avant cet instant : maintenant, plus le délai minimal pour une réservation en ligne. */
  readonly pasAvant: number;
  readonly limite: number;
}

export interface Creneau extends Intervalle {
  readonly praticienId: string | null;
  readonly cabineId: string | null;
}

function libresDuPraticien(
  recherche: RechercheCreneaux,
  praticien: PraticienCandidat,
  date: string,
): Intervalle[] {
  const { centreId, exceptions, occupations } = recherche;
  return soustraire(
    plagesPraticien({
      date,
      centreId,
      praticienId: praticien.id,
      horaires: praticien.horaires,
      exceptions,
    }),
    occupations.filter((o) => o.praticienId === praticien.id),
  );
}

function libresDesCabines(
  recherche: RechercheCreneaux,
  date: string,
): { readonly cabineId: string; readonly libres: Intervalle[] }[] {
  const { centreId, cabines, horairesCentre, exceptions, occupations } = recherche;
  return cabines.map((cabineId) => ({
    cabineId,
    libres: soustraire(
      plagesCabine({ date, centreId, cabineId, horairesCentre, exceptions }),
      occupations.filter((o) => o.cabineId === cabineId),
    ),
  }));
}

function instantsDeLaGrille(date: string, pasAvant: number): number[] {
  const { debut, fin } = bornesJourMs(date);
  const pas = PAS_CRENEAU_MINUTES * MS_PAR_MINUTE;
  const instants: number[] = [];
  for (let instant = debut; instant < fin; instant += pas) {
    if (instant >= pasAvant) {
      instants.push(instant);
    }
  }
  return instants;
}

function creneauxDuJour(recherche: RechercheCreneaux, date: string): Creneau[] {
  const { dureeMinutes, requierePraticien, requiereCabine, praticiens, pasAvant } = recherche;
  const candidats = requierePraticien
    ? praticiens.map((praticien) => ({
        praticienId: praticien.id,
        libres: libresDuPraticien(recherche, praticien, date),
      }))
    : [{ praticienId: null, libres: [bornesJourMs(date)] }];
  const cabines = requiereCabine ? libresDesCabines(recherche, date) : [];
  const creneaux: Creneau[] = [];
  for (const debut of instantsDeLaGrille(date, pasAvant)) {
    const creneau = { debut, fin: debut + dureeMinutes * MS_PAR_MINUTE };
    const cabine = cabines.find(({ libres }) => contient(libres, creneau));
    if (requiereCabine && cabine === undefined) {
      continue;
    }
    for (const { praticienId, libres } of candidats) {
      if (contient(libres, creneau)) {
        creneaux.push({ ...creneau, praticienId, cabineId: cabine?.cabineId ?? null });
      }
    }
  }
  return creneaux;
}

/** Créneaux libres, du plus tôt au plus tard, sur la période et dans la limite demandées. */
export function calculerCreneauxLibres(recherche: RechercheCreneaux): Creneau[] {
  const { du, au, limite } = recherche;
  const creneaux: Creneau[] = [];
  for (let i = 0; i <= joursEntre(du, au) && creneaux.length < limite; i += 1) {
    creneaux.push(...creneauxDuJour(recherche, ajouterJours(du, i)));
  }
  return creneaux.slice(0, limite);
}

/** Premier créneau libre de la période, ou `null`. */
export function prochainCreneauLibre(recherche: Omit<RechercheCreneaux, 'limite'>): Creneau | null {
  return calculerCreneauxLibres({ ...recherche, limite: 1 })[0] ?? null;
}
