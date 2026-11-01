import { randomUUID } from 'node:crypto';

import type { Prisma } from '@ha/db';
import {
  additionnerTotaux,
  bornesJourMs,
  chargeCloture,
  CUMULS_INITIAUX,
  cumulsSuivants,
  exerciceDe,
  exercicesACloturer,
  maillonDActivite,
  moisACloturer,
  totauxClotureSchema,
  totauxDepuisMaillons,
  TYPES_EVENEMENT_CAISSE,
  VERSION_CAISSE,
  type ClotureAChainer,
  type Cumuls,
  type Hacheur,
  type Periode,
  type PorteeCloture,
  type SignatureCaisse,
  type TotauxCloture,
  type Clock,
} from '@ha/domain';

import { ajouterMaillon, verrouillerTete, type TxCaisse } from './chaine';
import { aujourdhuiParis, depuisDate, jourParis, versDate } from './dates';

/** Dépendances d'une opération de caisse hors d'une requête : le web et les travaux ouvrent leur transaction. */
export interface DepsCaisse {
  readonly organisationId: string;
  readonly acteurId: string | null;
  readonly horloge: Clock;
  readonly hacheur: Hacheur;
  readonly signature: SignatureCaisse;
  transaction<T>(operation: (tx: TxCaisse) => Promise<T>): Promise<T>;
}

const TYPES_ACTIVITE = TYPES_EVENEMENT_CAISSE.filter(maillonDActivite);

export interface LigneClotureLue {
  readonly debut: Date;
  readonly rangFin: number;
  readonly grandTotalCentimes: bigint;
  readonly perpetuelCentimes: bigint;
  readonly encaissePerpetuelCentimes: bigint;
}

function cumulsLus(ligne: LigneClotureLue | null): Cumuls {
  return ligne
    ? {
        grandTotalCentimes: Number(ligne.grandTotalCentimes),
        perpetuelCentimes: Number(ligne.perpetuelCentimes),
        encaissePerpetuelCentimes: Number(ligne.encaissePerpetuelCentimes),
      }
    : CUMULS_INITIAUX;
}

async function moisClotureExercice(tx: TxCaisse, centreId: string): Promise<number> {
  const parametres = await tx.parametresComptables.findUnique({
    where: { centreId },
    select: { moisClotureExercice: true },
  });
  return parametres?.moisClotureExercice ?? 12;
}

/** Fige une clôture : le maillon, puis sa signature, puis la ligne. */
async function ecrireCloture(
  tx: TxCaisse,
  deps: DepsCaisse,
  centreId: string,
  cloture: Omit<ClotureAChainer, 'id' | 'versionCaisse'>,
): Promise<void> {
  const { organisationId, acteurId, horloge, hacheur, signature } = deps;
  const complete: ClotureAChainer = {
    ...cloture,
    id: randomUUID(),
    versionCaisse: VERSION_CAISSE,
  };
  const { rang, empreinte, horodatage } = await ajouterMaillon(
    tx,
    { organisationId, acteurId, horloge, hacheur },
    { centreId, type: 'CLOTURE', charge: chargeCloture(complete) },
  );
  await tx.clotureCaisse.create({
    data: {
      id: complete.id,
      organisationId,
      centreId,
      portee: complete.portee,
      debut: versDate(complete.debut),
      fin: versDate(complete.fin),
      rangDebut: complete.rangDebut,
      rangFin: complete.rangFin,
      totaux: complete.totaux as unknown as Prisma.InputJsonValue,
      grandTotalCentimes: BigInt(complete.grandTotalCentimes),
      perpetuelCentimes: BigInt(complete.perpetuelCentimes),
      encaissePerpetuelCentimes: BigInt(complete.encaissePerpetuelCentimes),
      versionCaisse: complete.versionCaisse,
      rang,
      empreinte,
      signature: signature.signer(empreinte),
      cleId: signature.cleId,
      acteurId,
      createdAt: horodatage,
    },
  });
}

async function derniereJournee(tx: TxCaisse, centreId: string): Promise<LigneClotureLue | null> {
  return tx.clotureCaisse.findFirst({
    where: { centreId, portee: 'JOUR' },
    orderBy: { debut: 'desc' },
    select: {
      debut: true,
      rangFin: true,
      grandTotalCentimes: true,
      perpetuelCentimes: true,
      encaissePerpetuelCentimes: true,
    },
  });
}

/**
 * Clôture la plus ancienne journée écoulée qui ne l'est pas. Une transaction par journée : un long rattrapage
 * ne tient pas le verrou de tête. `false` quand il n'y a plus rien à clôturer.
 */
async function cloturerProchaineJournee(
  deps: DepsCaisse,
  centreId: string,
  aujourdhui: string,
): Promise<boolean> {
  return deps.transaction(async (tx) => {
    await verrouillerTete(tx, deps.organisationId, centreId);
    const precedente = await derniereJournee(tx, centreId);
    const rangDebut = (precedente?.rangFin ?? 0) + 1;
    const premier = await tx.evenementCaisse.findFirst({
      where: { centreId, rang: { gte: rangDebut }, type: { in: [...TYPES_ACTIVITE] } },
      orderBy: { rang: 'asc' },
      select: { createdAt: true },
    });
    const journee = premier ? jourParis(premier.createdAt) : null;
    if (journee === null || journee >= aujourdhui) {
      return false;
    }
    const maillons = await tx.evenementCaisse.findMany({
      where: {
        centreId,
        rang: { gte: rangDebut },
        createdAt: { lt: new Date(bornesJourMs(journee).fin) },
      },
      orderBy: { rang: 'asc' },
      select: { rang: true, type: true, charge: true },
    });
    const totaux = totauxDepuisMaillons(maillons);
    const mois = await moisClotureExercice(tx, centreId);
    const memeExercice =
      precedente !== null &&
      exerciceDe(depuisDate(precedente.debut), mois).debut === exerciceDe(journee, mois).debut;
    await ecrireCloture(tx, deps, centreId, {
      portee: 'JOUR',
      debut: journee,
      fin: journee,
      rangDebut,
      rangFin: maillons.at(-1)?.rang ?? rangDebut,
      totaux,
      ...cumulsSuivants(cumulsLus(precedente), totaux, memeExercice),
    });
    return true;
  });
}

/** Le mois additionne ses journées, l'exercice ses mois : la plus longue période reprend les cumuls de sa fin. */
async function cloturerAgregat(
  deps: DepsCaisse,
  centreId: string,
  portee: PorteeCloture,
  source: PorteeCloture,
  { debut, fin }: Periode,
): Promise<void> {
  await deps.transaction(async (tx) => {
    await verrouillerTete(tx, deps.organisationId, centreId);
    const deja = await tx.clotureCaisse.findUnique({
      where: { centreId_portee_debut: { centreId, portee, debut: versDate(debut) } },
      select: { id: true },
    });
    if (deja) {
      return;
    }
    const periodes = await tx.clotureCaisse.findMany({
      where: { centreId, portee: source, debut: { gte: versDate(debut), lte: versDate(fin) } },
      orderBy: { debut: 'asc' },
    });
    const [premiere] = periodes;
    const derniere = periodes.at(-1);
    if (!premiere || !derniere) {
      return;
    }
    const totaux: TotauxCloture = additionnerTotaux(
      periodes.map((p) => totauxClotureSchema.parse(p.totaux)),
    );
    await ecrireCloture(tx, deps, centreId, {
      portee,
      debut,
      fin,
      rangDebut: premiere.rangDebut,
      rangFin: derniere.rangFin,
      totaux,
      ...cumulsLus(derniere),
    });
  });
}

export interface ResultatClotures {
  readonly jours: number;
  readonly mois: number;
  readonly exercices: number;
}

async function debutsClotures(
  deps: DepsCaisse,
  centreId: string,
  portee: PorteeCloture,
): Promise<readonly string[]> {
  const lignes = await deps.transaction((tx) =>
    tx.clotureCaisse.findMany({ where: { centreId, portee }, select: { debut: true } }),
  );
  return lignes.map((l) => depuisDate(l.debut));
}

/**
 * Clôture tout ce qui est dû pour un centre : journées écoulées, puis mois, puis exercices. Idempotent : relancé,
 * il ne trouve plus rien. Une journée en cours ne se clôture jamais : elle peut encore recevoir des opérations.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 170.
 * À VÉRIFIER : un jour sans opération ne produit pas de clôture (R37).
 */
export async function cloturerCentre(
  deps: DepsCaisse,
  centreId: string,
): Promise<ResultatClotures> {
  const aujourdhui = aujourdhuiParis(deps.horloge);
  let jours = 0;
  while (await cloturerProchaineJournee(deps, centreId, aujourdhui)) {
    jours += 1;
  }
  const moisDus = moisACloturer(
    await debutsClotures(deps, centreId, 'JOUR'),
    await debutsClotures(deps, centreId, 'MOIS'),
    aujourdhui,
  );
  for (const periode of moisDus) {
    await cloturerAgregat(deps, centreId, 'MOIS', 'JOUR', periode);
  }
  const moisCloture = await deps.transaction((tx) => moisClotureExercice(tx, centreId));
  const exercicesDus = exercicesACloturer(
    await debutsClotures(deps, centreId, 'MOIS'),
    await debutsClotures(deps, centreId, 'EXERCICE'),
    moisCloture,
    aujourdhui,
  );
  for (const periode of exercicesDus) {
    await cloturerAgregat(deps, centreId, 'EXERCICE', 'MOIS', periode);
  }
  return { jours, mois: moisDus.length, exercices: exercicesDus.length };
}
