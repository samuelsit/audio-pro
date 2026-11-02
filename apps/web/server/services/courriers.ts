import { SystemClock } from '@ha/adapters';
import {
  comptesRendusSaisieSchema,
  ErreurDocumentIntrouvable,
  peutGererCourriers,
  type Perimetre,
  type StatutLotCourrier,
  type TypeLotCourrier,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import { rendeurPdf } from '../pdf';
import { centresDuPerimetre } from '../perimetre';
import { lireDossier, versDate } from './dossiers';
import { rendreCompteRendu } from './essais';

const horloge = new SystemClock();
/** Chromium se lance à chaque lettre : au-delà, le lot passe par l'ouvrier, pas par une requête. */
const COMPTES_RENDUS_MAX = 50;

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererCourriers(acteur.role)) {
    throw new AccesRefuseError();
  }
}

export interface LotResume {
  readonly id: string;
  readonly centre: string;
  readonly type: TypeLotCourrier;
  readonly statut: StatutLotCourrier;
  readonly lettres: number;
  readonly genereLe: string | null;
  readonly imprimeLe: string | null;
}

export async function listerLots(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<LotResume[]> {
  exigerGestion(acteur);
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const lots = await base(acteur).lotCourrier.findMany({
    where: centres === null ? {} : { centreId: { in: [...centres] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { centre: { select: { nom: true } } },
  });
  return lots.map((l) => ({
    id: l.id,
    centre: l.centre.nom,
    type: l.type,
    statut: l.statut,
    lettres: l.lettres,
    genereLe: l.genereLe?.toISOString() ?? null,
    imprimeLe: l.imprimeLe?.toISOString() ?? null,
  }));
}

async function lotAccessible(acteur: UtilisateurConnecte, id: string) {
  exigerGestion(acteur);
  const lot = await base(acteur).lotCourrier.findFirst({
    where: { id, organisationId: acteur.organisationId },
  });
  if (lot === null) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, lot.centreId);
  return lot;
}

export async function telechargerLot(
  acteur: UtilisateurConnecte,
  id: string,
): Promise<{ contenu: Uint8Array; nomFichier: string }> {
  const lot = await lotAccessible(acteur, id);
  if (lot.documentCle === null) {
    throw new ErreurDocumentIntrouvable();
  }
  return {
    contenu: await documents().get(lot.documentCle),
    nomFichier: `courriers-${id}.pdf`,
  };
}

/** Le centre dit avoir imprimé : les lettres du lot sont parties. */
export async function marquerLotImprime(acteur: UtilisateurConnecte, id: string): Promise<void> {
  const lot = await lotAccessible(acteur, id);
  const instant = new Date(horloge.now());
  await withAudit(
    acteur,
    async (tx) => {
      const { count } = await tx.lotCourrier.updateMany({
        where: { id, statut: 'PRET' },
        data: { statut: 'IMPRIME', imprimeLe: instant },
      });
      if (count === 0) {
        throw new ErreurSaisie({}, 'Ce lot n’est pas prêt, ou il est déjà imprimé.');
      }
      await tx.messagePatient.updateMany({
        where: { lotCourrierId: id, statut: 'A_IMPRIMER' },
        data: { statut: 'IMPRIME', envoyeLe: instant },
      });
    },
    {
      action: 'UPDATE',
      entiteType: 'LOT_COURRIER',
      entiteId: id,
      centreId: lot.centreId,
      details: { statut: 'IMPRIME' },
    },
  );
}

/**
 * Publipostage des comptes rendus d'une période, adressés aux prescripteurs. Source :
 * convention-audioprothesistes.pdf, art. 18 6°, p. 20. Destiné au médecin : ni consentement du patient, ni mention
 * commerciale (art. 15 § 1, p. 16).
 */
export async function genererComptesRendus(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  exigerGestion(acteur);
  const { centreId, du, au } = valider(comptesRendusSaisieSchema, saisie);
  verifierAccesCentre(acteur, centreId);
  const essais = await base(acteur).essai.findMany({
    where: {
      issue: { not: null },
      dateFin: { gte: versDate(du), lte: versDate(au) },
      dossier: { centreId },
    },
    select: { dossierId: true },
    orderBy: { dateFin: 'asc' },
    take: COMPTES_RENDUS_MAX + 1,
  });
  if (essais.length === 0) {
    throw new ErreurSaisie({}, 'Aucun essai conclu sur cette période.');
  }
  if (essais.length > COMPTES_RENDUS_MAX) {
    throw new ErreurSaisie(
      {},
      `Plus de ${String(COMPTES_RENDUS_MAX)} comptes rendus : réduire la période.`,
    );
  }
  const pages: Uint8Array[] = [];
  for (const { dossierId } of essais) {
    const dossier = await lireDossier(base(acteur), acteur, dossierId);
    pages.push((await rendreCompteRendu(acteur, dossier)).contenu);
  }
  const cle = `courriers/${crypto.randomUUID()}`;
  await documents().put(cle, await rendeurPdf().assembler(pages), 'application/pdf');
  return withAudit(
    acteur,
    async (tx) => {
      const { id } = await tx.lotCourrier.create({
        data: {
          organisationId: acteur.organisationId,
          centreId,
          type: 'COMPTES_RENDUS',
          statut: 'PRET',
          documentCle: cle,
          lettres: pages.length,
          genereLe: new Date(horloge.now()),
        },
        select: { id: true },
      });
      return id;
    },
    (id) => ({
      action: 'CREATE',
      entiteType: 'LOT_COURRIER',
      entiteId: id,
      centreId,
      details: { type: 'COMPTES_RENDUS', lettres: pages.length },
    }),
  );
}
