import type { EmpreinteAdresse } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  adresseMessage,
  bornesNaissance,
  decisionEnvoi,
  type CanalMessage,
  type Segment,
} from '@ha/domain';

import type { TxCommunication } from './journal';

/** L'appareil porté : ni le parc de prêt, ni le stock, ni un appareil remplacé. */
const STATUTS_APPAREIL_PORTE = ['VENDU', 'SAV', 'RETOUR_FABRICANT'] as const;

/** Conditions du segment, sans le consentement : le compteur annonce aussi qui reste hors d'atteinte. */
export function conditionsSegment(segment: Segment, jour: string): Prisma.PatientWhereInput {
  const { neAuPlusTot, neAuPlusTard } = bornesNaissance(segment, jour);
  const { appareilleDepuis, appareilleJusquAu, classes, statutsDossier } = segment;
  const avecPeriode = appareilleDepuis !== null || appareilleJusquAu !== null;
  return {
    fusionneDansId: null,
    centreId: { in: [...segment.centreIds] },
    ...(neAuPlusTot === null && neAuPlusTard === null
      ? {}
      : {
          dateNaissance: {
            ...(neAuPlusTot === null ? {} : { gte: new Date(neAuPlusTot) }),
            ...(neAuPlusTard === null ? {} : { lte: new Date(neAuPlusTard) }),
          },
        }),
    ...(avecPeriode
      ? {
          delivrances: {
            some: {
              annuleeLe: null,
              dateDelivrance: {
                ...(appareilleDepuis === null ? {} : { gte: new Date(appareilleDepuis) }),
                ...(appareilleJusquAu === null ? {} : { lte: new Date(appareilleJusquAu) }),
              },
            },
          },
        }
      : {}),
    ...(classes.length === 0
      ? {}
      : {
          appareils: {
            some: {
              statut: { in: [...STATUTS_APPAREIL_PORTE] },
              parcPret: false,
              modele: { classe: { in: [...classes] } },
            },
          },
        }),
    ...(statutsDossier.length === 0
      ? {}
      : { dossiers: { some: { statut: { in: [...statutsDossier] } } } }),
  };
}

const SELECTION_PATIENT = {
  id: true,
  centreId: true,
  prenoms: true,
  telephone: true,
  email: true,
  adresseLigne1: true,
  codePostal: true,
  ville: true,
  consentementSms: true,
  consentementEmail: true,
  consentementCourrier: true,
  consentementSmsCommercial: true,
  consentementEmailCommercial: true,
  consentementCourrierCommercial: true,
} as const;

export type PatientSegment = Prisma.PatientGetPayload<{ select: typeof SELECTION_PATIENT }>;

export interface ResolutionSegment {
  /** Patients du segment, joignables ou non. */
  readonly total: number;
  readonly destinataires: readonly PatientSegment[];
}

/**
 * Destinataires d'une campagne : le segment, sous consentement commercial et sans opposition. Le compteur de
 * l'écran et le lancement passent ici, pour annoncer le même nombre que celui qui partira.
 */
export async function resoudreSegment(
  tx: TxCommunication,
  segment: Segment,
  canal: CanalMessage,
  jour: string,
  empreinte: EmpreinteAdresse,
): Promise<ResolutionSegment> {
  const patients = await tx.patient.findMany({
    where: conditionsSegment(segment, jour),
    select: SELECTION_PATIENT,
    orderBy: { id: 'asc' },
  });
  const oppositions = await tx.oppositionAdresse.findMany({
    where: { canal },
    select: { empreinte: true },
  });
  const opposees = new Set(oppositions.map((o) => o.empreinte));
  const destinataires = patients.filter((patient) => {
    const adresse = adresseMessage(patient, canal);
    const opposition = adresse !== null && opposees.has(empreinte.calculer(canal, adresse));
    return decisionEnvoi(patient, canal, 'COMMERCIAL', opposition).autorise;
  });
  return { total: patients.length, destinataires };
}
