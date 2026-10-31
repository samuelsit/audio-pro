import { SystemClock } from '@ha/adapters';
import {
  appliquerCarte,
  CHAMPS_CARTE,
  comparerAvecCarte,
  differencesAuditees,
  ErreurLectureVitale,
  ficheCorrespondAuBeneficiaire,
  nirSchema,
  origineApresLecture,
  peutAccederAuCentre,
  type BeneficiaireVitale,
  type ChampCarte,
  type Clock,
  type CodeErreurVitale,
  type Perimetre,
  type VitaleReader,
  vitaleReadResultSchema,
} from '@ha/domain';
import { z } from 'zod';

import { verifierPerimetre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, empreinteNir } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import {
  expirationLecture,
  ouvrirLecture,
  scellerLecture,
  type LectureEnCours,
} from '../vitale/jeton';
import {
  creerPatient,
  donneesPatient,
  ecrireCouvertures,
  evenementLecture,
  lireFiche,
  versSaisie,
  type PatientDetail,
} from './patients';

const horloge: Clock = new SystemClock();

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export type ResultatLectureCarte =
  { ok: true; jeton: string; lecture: LectureEnCours } | { ok: false; code: CodeErreurVitale };

/**
 * Lit la carte et historise la lecture (`lecture_vitale` : qui, quand, où, résultat), sans rien garder du
 * contenu de la carte. En cas de succès, le résultat est rendu dans un jeton chiffré de 15 minutes.
 */
export async function lireCarte(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  lecteur: VitaleReader,
): Promise<ResultatLectureCarte> {
  verifierPerimetre(acteur, perimetre);
  let resultat: LectureEnCours['resultat'] | null = null;
  let code: CodeErreurVitale | null = null;
  try {
    // Frontière : le résultat d'un lecteur est revalidé, quel que soit l'adaptateur.
    resultat = vitaleReadResultSchema.parse(await lecteur.readCard());
  } catch (erreur) {
    // Message et contenu jamais journalisés : ils pourraient porter des données de la carte.
    code =
      erreur instanceof ErreurLectureVitale
        ? erreur.code
        : erreur instanceof z.ZodError
          ? 'CARTE_INVALIDE'
          : 'ERREUR_TECHNIQUE';
  }
  const ligne = await base(acteur).lectureVitale.create({
    data: {
      organisationId: acteur.organisationId,
      utilisateurId: acteur.id,
      centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
      resultat: code ?? 'SUCCES',
      source: resultat?.source ?? null,
      nombreBeneficiaires: resultat?.beneficiaires.length ?? null,
    },
    select: { id: true },
  });
  if (resultat === null) {
    return { ok: false, code: code ?? 'ERREUR_TECHNIQUE' };
  }
  const lecture: LectureEnCours = {
    lectureId: ligne.id,
    resultat,
    expireLe: expirationLecture(resultat.dateLecture),
  };
  return { ok: true, jeton: scellerLecture(acteur.id, lecture), lecture };
}

/** Lecture en cours de l'acteur, ou `null` si le jeton est absent, altéré ou expiré (pages). */
export function lectureEnCours(
  acteur: UtilisateurConnecte,
  jeton: string | undefined,
): LectureEnCours | null {
  try {
    return ouvrirLecture(acteur.id, jeton, horloge.now());
  } catch {
    return null;
  }
}

function ouvrir(acteur: UtilisateurConnecte, jeton: string | undefined): LectureEnCours {
  return ouvrirLecture(acteur.id, jeton, horloge.now());
}

function beneficiaire(lecture: LectureEnCours, index: unknown): BeneficiaireVitale {
  const i = valider(z.coerce.number({ error: 'Bénéficiaire inconnu.' }).int().min(0), index);
  const b = lecture.resultat.beneficiaires[i];
  if (!b) {
    throw new ErreurSaisie({}, 'Ce bénéficiaire ne figure pas sur la carte lue.');
  }
  return b;
}

// ---------------------------------------------------------------------------
// Bénéficiaire → fiche
// ---------------------------------------------------------------------------

export interface FicheCorrespondante {
  id: string;
  nomNaissance: string;
  nomUsage: string | null;
  prenoms: string;
  dateNaissance: string;
  centreNom: string;
}

export interface RechercheBeneficiaire {
  beneficiaire: BeneficiaireVitale;
  /** Fiches du bénéficiaire dans les centres de l'acteur. */
  visibles: FicheCorrespondante[];
  /** Fiches du bénéficiaire hors des droits de l'acteur : seul le centre est révélé (comme les doublons). */
  horsPerimetre: { centreNom: string }[];
}

/**
 * Fiches de toute l'organisation (non fusionnées) qui désignent ce bénéficiaire : même empreinte de NIR,
 * puis règle « même bénéficiaire » du domaine. Aucune fiche n'est ouverte : pas de ligne READ.
 */
export async function rechercherBeneficiaire(
  acteur: UtilisateurConnecte,
  jeton: string | undefined,
  index: unknown,
): Promise<RechercheBeneficiaire> {
  const b = beneficiaire(ouvrir(acteur, jeton), index);
  const empreinte = empreinteNir(b.nir);
  const lignes = await base(acteur).patient.findMany({
    where: {
      organisationId: acteur.organisationId,
      fusionneDansId: null,
      couvertureAmo: { nirEmpreinte: empreinte },
    },
    select: {
      id: true,
      centreId: true,
      nomNaissance: true,
      nomUsage: true,
      prenoms: true,
      dateNaissance: true,
      centre: { select: { nom: true } },
      // Lecture imbriquée sans champ chiffré : empreinte, qualité et rang seulement.
      couvertureAmo: { select: { nirEmpreinte: true, qualite: true, rangNaissance: true } },
    },
    orderBy: [{ nomNaissanceRecherche: 'asc' }, { id: 'asc' }],
    take: 50,
  });
  const visibles: FicheCorrespondante[] = [];
  const horsPerimetre: { centreNom: string }[] = [];
  for (const l of lignes) {
    const dateNaissance = l.dateNaissance.toISOString().slice(0, 10);
    const correspond = ficheCorrespondAuBeneficiaire(b, empreinte, {
      nomNaissance: l.nomNaissance,
      nomUsage: l.nomUsage,
      dateNaissance,
      nirEmpreinte: l.couvertureAmo?.nirEmpreinte ?? null,
      qualite: l.couvertureAmo?.qualite ?? null,
      rangNaissance: l.couvertureAmo?.rangNaissance ?? null,
    });
    if (!correspond) {
      continue;
    }
    if (peutAccederAuCentre(acteur, l.centreId)) {
      visibles.push({
        id: l.id,
        nomNaissance: l.nomNaissance,
        nomUsage: l.nomUsage,
        prenoms: l.prenoms,
        dateNaissance,
        centreNom: l.centre.nom,
      });
    } else {
      horsPerimetre.push({ centreNom: l.centre.nom });
    }
  }
  return { beneficiaire: b, visibles, horsPerimetre };
}

/** La fiche désigne-t-elle le bénéficiaire (même NIR pour le même bénéficiaire) ? */
function ficheDuBeneficiaire(fiche: PatientDetail, b: BeneficiaireVitale): boolean {
  return (
    fiche.amo !== null &&
    ficheCorrespondAuBeneficiaire(b, empreinteNir(b.nir), {
      nomNaissance: fiche.nomNaissance,
      nomUsage: fiche.nomUsage,
      dateNaissance: fiche.dateNaissance,
      nirEmpreinte: empreinteNir(nirSchema.parse(fiche.amo.nir)),
      qualite: fiche.amo.qualite,
      rangNaissance: fiche.amo.rangNaissance,
    })
  );
}

// ---------------------------------------------------------------------------
// Comparaison et mise à jour d'une fiche
// ---------------------------------------------------------------------------

export interface Comparaison {
  lectureId: string;
  fiche: PatientDetail;
  beneficiaire: BeneficiaireVitale;
  /** Champs où la carte diffère de la fiche. */
  champs: ChampCarte[];
  /** Faux si la fiche ne porte pas le NIR de ce bénéficiaire : l'écran demande de vérifier l'identité. */
  correspond: boolean;
}

function verifierNonFusionnee(fiche: PatientDetail): void {
  if (fiche.fusionneDansId !== null) {
    throw new ErreurSaisie({}, 'Cette fiche a été fusionnée : utilisez la fiche conservée.');
  }
}

/**
 * Compare une fiche à un bénéficiaire de la carte : ouvre la fiche (ligne READ, avec l'identifiant de la
 * lecture). Toute fiche accessible peut être comparée (ex. fiche créée sans NIR) ; `correspond` signale
 * une fiche d'un autre NIR.
 */
export async function preparerComparaison(
  acteur: UtilisateurConnecte,
  jeton: string | undefined,
  index: unknown,
  patientId: string,
): Promise<Comparaison> {
  const lecture = ouvrir(acteur, jeton);
  const b = beneficiaire(lecture, index);
  return withAudit(
    acteur,
    async (tx) => {
      const fiche = await lireFiche(tx, acteur, patientId);
      verifierNonFusionnee(fiche);
      return {
        lectureId: lecture.lectureId,
        fiche,
        beneficiaire: b,
        champs: comparerAvecCarte(versSaisie(fiche), b),
        correspond: ficheDuBeneficiaire(fiche, b),
      };
    },
    (r) => ({ ...evenementLecture(r.fiche), details: { lectureVitale: lecture.lectureId } }),
  );
}

const champsAcceptesSchema = z.array(z.enum(CHAMPS_CARTE, { error: 'Champ inconnu.' }));

/**
 * Applique à la fiche les champs acceptés ; les autres gardent la valeur de la base. L'origine de la
 * couverture AMO devient « carte Vitale » si elle est identique à la carte, « saisie manuelle » sinon,
 * et la date de dernière lecture est mise à jour. Une ligne UPDATE, avec les noms des champs acceptés
 * et refusés (jamais leurs valeurs).
 */
export async function appliquerCarteAuPatient(
  acteur: UtilisateurConnecte,
  jeton: string | undefined,
  index: unknown,
  patientId: string,
  acceptesSaisis: unknown,
): Promise<void> {
  const lecture = ouvrir(acteur, jeton);
  const b = beneficiaire(lecture, index);
  const acceptes = valider(champsAcceptesSchema, acceptesSaisis);
  await withAudit(
    acteur,
    async (tx) => {
      const fiche = await lireFiche(tx, acteur, patientId);
      verifierNonFusionnee(fiche);
      const avant = versSaisie(fiche);
      const proposes = comparerAvecCarte(avant, b);
      const apres = appliquerCarte(avant, b, acceptes);
      await tx.patient.update({ where: { id: patientId }, data: donneesPatient(apres) });
      await ecrireCouvertures(
        tx,
        patientId,
        apres.amo,
        {
          origine: origineApresLecture(apres.amo, b),
          derniereLectureVitale: lecture.resultat.dateLecture,
        },
        apres.amc,
      );
      return {
        avant,
        apres,
        champsAcceptes: proposes.filter((c) => acceptes.includes(c)),
        champsRefuses: proposes.filter((c) => !acceptes.includes(c)),
      };
    },
    ({ avant, apres, champsAcceptes, champsRefuses }) => ({
      action: 'UPDATE',
      entiteType: 'PATIENT',
      entiteId: patientId,
      patientId,
      centreId: apres.centreId,
      champs: differencesAuditees('PATIENT', avant, apres),
      details: { lectureVitale: lecture.lectureId, champsAcceptes, champsRefuses },
    }),
  );
}

// ---------------------------------------------------------------------------
// Création depuis la carte
// ---------------------------------------------------------------------------

/**
 * Crée une fiche depuis le formulaire pré-rempli par la carte. La détection des doublons s'applique comme
 * pour une création manuelle. Couverture AMO d'origine « carte Vitale » si elle n'a pas été retouchée.
 */
export async function creerPatientDepuisCarte(
  acteur: UtilisateurConnecte,
  jeton: string | undefined,
  index: unknown,
  saisie: unknown,
  { confirmerDoublon = false }: { confirmerDoublon?: boolean } = {},
): Promise<string> {
  const lecture = ouvrir(acteur, jeton);
  const b = beneficiaire(lecture, index);
  return creerPatient(acteur, saisie, {
    confirmerDoublon,
    provenanceAmo: (donnees) => ({
      origine: origineApresLecture(donnees.amo, b),
      derniereLectureVitale: lecture.resultat.dateLecture,
    }),
    details: { lectureVitale: lecture.lectureId },
  });
}
