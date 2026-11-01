import { randomUUID } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import { clientPlateforme, type Prisma } from '@ha/db';
import {
  adresseDuCanal,
  clientPeutSeConnecter,
  DUREE_LIEN_DOCUMENT_JOURS,
  envoiDocumentSaisieSchema,
  lienOuvert,
  ouvertureLienSaisieSchema,
  parametresDocumentSchema,
  TENTATIVES_MAX_LIEN_DOCUMENT,
  type CanalNotification,
  type CibleLienDocument,
  type Clock,
  type DestinataireLien,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { enregistrerTentative, type RegleLimitation } from '../auth/limitation';
import { journaliser, withAudit, type AuteurAudit } from '../audit/journal';
import { base, enTransaction, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import { notifierDisponible } from '../notifier';
import { signatureLienDocument } from '../reservation-empreintes';
import { lireDevis, type DocumentDevis } from './devis';
import { depuisDate, lireDossier, type DossierLu } from './dossiers';
import { rendreCompteRendu } from './essais';

const LIMITE_LIEN_DOCUMENT_IP: RegleLimitation = { max: 30, fenetreSecondes: 15 * 60 };
const MS_PAR_JOUR = 86_400_000;

const horloge: Clock = new SystemClock();

/** Lien inconnu, expiré, révoqué ou bloqué : le message ne distingue pas, pour ne rien apprendre à un tiers. */
export const MESSAGE_LIEN_FERME = 'Ce lien n’est plus valide. Contactez votre centre.';
const MESSAGE_DATE_ERRONEE = 'Cette date de naissance ne convient pas.';

function exigerEnvoiPossible(): void {
  if (!notifierDisponible()) {
    throw new ErreurSaisie({}, 'Aucun fournisseur d’envoi n’est configuré.');
  }
}

interface LienACreer {
  readonly dossier: DossierLu;
  readonly cible: CibleLienDocument;
  readonly destinataire: DestinataireLien;
  readonly pdfCle: string;
  readonly canal: CanalNotification;
  readonly adresse: string;
}

/**
 * Le lien et son message naissent dans la même transaction : aucun lien sans message, aucun message sans lien.
 * La clé d'idempotence porte l'identifiant du lien, pour qu'un renvoi crée un nouveau lien, pas un doublon.
 */
async function creerLien(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  { dossier, cible, destinataire, pdfCle, canal, adresse }: LienACreer,
): Promise<string> {
  const instant = new Date(horloge.now());
  const lien = await tx.lienDocument.create({
    data: {
      dossierId: dossier.id,
      cible,
      destinataire,
      pdfCle,
      expireLe: new Date(instant.getTime() + DUREE_LIEN_DOCUMENT_JOURS * MS_PAR_JOUR),
      createdById: acteur.id,
    },
    select: { id: true },
  });
  const centre = await tx.centre.findUniqueOrThrow({
    where: { id: dossier.centreId },
    select: { nom: true },
  });
  await tx.notification.create({
    data: {
      lienDocumentId: lien.id,
      canal,
      destinataire: adresse,
      gabarit: 'DOCUMENT_A_CONSULTER',
      parametres: parametresDocumentSchema.parse({
        centre: centre.nom,
      }) as Prisma.InputJsonValue,
      cleIdempotence: `lien:${lien.id}:${canal}`,
    },
  });
  return lien.id;
}

function evenementEnvoi(
  entiteType: 'DEVIS' | 'ESSAI',
  entiteId: string,
  dossier: DossierLu,
  lienId: string,
  canal: CanalNotification,
  destinataire: DestinataireLien,
) {
  return {
    action: 'SEND',
    entiteType,
    entiteId,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { lienId, canal, destinataire },
  } as const;
}

/** Envoie au patient le devis en vigueur, signé s'il l'est. Le PDF porte le NIR : jamais de pièce jointe. */
export async function envoyerDevisAuPatient(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<void> {
  exigerEnvoiPossible();
  const { canal } = valider(envoiDocumentSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      const pdfCle = devis.statut === 'SIGNE' ? (devis.scanSigneCle ?? devis.pdfCle) : devis.pdfCle;
      if (pdfCle === null || (devis.statut !== 'EMIS' && devis.statut !== 'SIGNE')) {
        throw new ErreurSaisie({}, 'Seul un devis émis ou signé s’envoie au patient.');
      }
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: dossier.patientId },
        select: { telephone: true, email: true, consentementSms: true, consentementEmail: true },
      });
      const adresse = adresseDuCanal(patient, canal);
      if (adresse === null) {
        throw ErreurSaisie.surChamp(
          'canal',
          'Le patient n’a pas cette coordonnée, ou n’y a pas consenti.',
        );
      }
      const lienId = await creerLien(tx, acteur, {
        dossier,
        cible: 'DEVIS',
        destinataire: 'PATIENT',
        pdfCle,
        canal,
        adresse,
      });
      return { dossier, lienId };
    },
    ({ dossier, lienId }) => evenementEnvoi('DEVIS', devisId, dossier, lienId, canal, 'PATIENT'),
  );
}

/**
 * Envoie le compte rendu au prescripteur de la dernière ordonnance, par e-mail : MSSanté attend la documentation
 * d'un fournisseur. Le courrier se fige à l'envoi, hors transaction ; si elle échoue, l'objet déposé est retiré.
 */
export async function envoyerCompteRenduAuPrescripteur(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<void> {
  exigerEnvoiPossible();
  const dossierLu = await lireDossier(base(acteur), acteur, dossierId);
  const { essaiId, contenu } = await rendreCompteRendu(acteur, dossierLu);
  const pdfCle = `liens-documents/${randomUUID()}`;
  await documents().put(pdfCle, contenu, 'application/pdf');
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const dossier = await lireDossier(tx, acteur, dossierId);
        const prescription = await tx.prescription.findFirstOrThrow({
          where: { dossierId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { prescripteur: { select: { contact: true } } },
        });
        const adresse = prescription.prescripteur.contact;
        if (adresse === null) {
          throw new ErreurSaisie({}, 'Renseigner l’adresse du prescripteur avant l’envoi.');
        }
        const lienId = await creerLien(tx, acteur, {
          dossier,
          cible: 'COMPTE_RENDU_ESSAI',
          destinataire: 'PRESCRIPTEUR',
          pdfCle,
          canal: 'EMAIL',
          adresse,
        });
        return { dossier, lienId };
      },
      ({ dossier, lienId }) =>
        evenementEnvoi('ESSAI', essaiId, dossier, lienId, 'EMAIL', 'PRESCRIPTEUR'),
    );
  } catch (erreur) {
    await documents()
      .delete(pdfCle)
      .catch(() => undefined);
    throw erreur;
  }
}

export interface LienAffiche {
  id: string;
  cible: CibleLienDocument;
  destinataire: DestinataireLien;
  creeLe: Date;
  expireLe: Date;
  ouvert: boolean;
  revoque: boolean;
  ouvertures: number;
}

/** Liens du dossier, du plus récent au plus ancien. Le jeton n'est jamais affiché. */
export async function listerLiensDocument(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<LienAffiche[]> {
  const client = base(acteur);
  await lireDossier(client, acteur, dossierId);
  const liens = await client.lienDocument.findMany({
    where: { dossierId },
    orderBy: { createdAt: 'desc' },
  });
  const instant = Date.parse(horloge.now());
  return liens.map((l) => ({
    id: l.id,
    cible: l.cible,
    destinataire: l.destinataire,
    creeLe: l.createdAt,
    expireLe: l.expireLe,
    ouvert: lienOuvert(versEtat(l), instant),
    revoque: l.revoqueLe !== null,
    ouvertures: l.ouvertures,
  }));
}

function versEtat(l: { expireLe: Date; revoqueLe: Date | null; bloqueLe: Date | null }) {
  return {
    expireLe: l.expireLe.getTime(),
    revoqueLe: l.revoqueLe?.getTime() ?? null,
    bloqueLe: l.bloqueLe?.getTime() ?? null,
  };
}

export async function revoquerLien(acteur: UtilisateurConnecte, lienId: string): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const lien = await tx.lienDocument.findFirst({
        where: { id: lienId, organisationId: acteur.organisationId },
        select: { dossierId: true },
      });
      if (!lien) {
        throw new AccesRefuseError();
      }
      const dossier = await lireDossier(tx, acteur, lien.dossierId);
      await tx.lienDocument.updateMany({
        where: { id: lienId, revoqueLe: null },
        data: { revoqueLe: new Date(horloge.now()) },
      });
      return dossier;
    },
    (dossier) => ({
      action: 'UPDATE',
      entiteType: 'DOSSIER',
      entiteId: dossier.id,
      patientId: dossier.patientId,
      centreId: dossier.centreId,
      details: { lienRevoque: lienId },
    }),
  );
}

// --- Accès public ---------------------------------------------------------------------------------

/** Un visiteur n'a pas de compte : le journal note l'origine, pas une personne. */
function auteurLien(organisationId: string): AuteurAudit {
  return { utilisateurId: null, libelle: 'Lien sécurisé', role: null, organisationId };
}

async function cibleDuJeton(jeton: string) {
  const cible = signatureLienDocument().lire(jeton);
  if (cible === null) {
    throw new AccesRefuseError();
  }
  const organisation = await clientPlateforme().organisation.findUnique({
    where: { id: cible.organisationId },
    select: { statut: true },
  });
  if (!organisation || !clientPeutSeConnecter(organisation.statut)) {
    throw new AccesRefuseError();
  }
  return cible;
}

async function limiter(ip: string): Promise<void> {
  const accepte = await enregistrerTentative(
    `document:lien:${ip}`,
    LIMITE_LIEN_DOCUMENT_IP,
    Date.parse(horloge.now()),
  );
  if (!accepte) {
    throw new ErreurSaisie({}, 'Trop de tentatives. Réessayez dans quelques minutes.');
  }
}

/** Le lien est-il ouvrable ? La page n'en dit pas plus : un lien transféré ne dévoile rien. */
export async function lienDocumentOuvrable(jeton: string, ip: string): Promise<boolean> {
  try {
    await limiter(ip);
    const cible = await cibleDuJeton(jeton);
    return await enTransaction(cible, async (tx) => {
      const lien = await tx.lienDocument.findUnique({ where: { id: cible.lienId } });
      return lien !== null && lienOuvert(versEtat(lien), Date.parse(horloge.now()));
    });
  } catch (erreur) {
    if (erreur instanceof AccesRefuseError || erreur instanceof ErreurSaisie) {
      return false;
    }
    throw erreur;
  }
}

type ResultatOuverture =
  | { readonly type: 'FERME' }
  | { readonly type: 'ERRONEE' }
  | { readonly type: 'OUVERT'; readonly pdfCle: string; readonly cible: CibleLienDocument };

/**
 * Ouvre le document contre la date de naissance du patient. Le refus se décide après la transaction : une
 * erreur levée à l'intérieur annulerait le décompte des tentatives. Cinq erreurs ferment le lien.
 */
export async function ouvrirDocument(
  jeton: string,
  ip: string,
  saisie: unknown,
): Promise<DocumentDevis> {
  await limiter(ip);
  const { dateNaissance } = valider(ouvertureLienSaisieSchema, saisie);
  const cible = await cibleDuJeton(jeton);
  const instant = new Date(horloge.now());
  const resultat = await enTransaction(cible, async (tx): Promise<ResultatOuverture> => {
    const lien = await tx.lienDocument.findUnique({
      where: { id: cible.lienId },
      include: { dossier: { select: { id: true, patientId: true, centreId: true } } },
    });
    if (!lien || !lienOuvert(versEtat(lien), instant.getTime())) {
      return { type: 'FERME' };
    }
    const patient = await tx.patient.findUniqueOrThrow({
      where: { id: lien.dossier.patientId },
      select: { dateNaissance: true },
    });
    if (depuisDate(patient.dateNaissance) !== dateNaissance) {
      const tentatives = lien.tentatives + 1;
      await tx.lienDocument.updateMany({
        where: { id: lien.id, tentatives: lien.tentatives },
        data: {
          tentatives,
          ...(tentatives >= TENTATIVES_MAX_LIEN_DOCUMENT ? { bloqueLe: instant } : {}),
        },
      });
      return { type: 'ERRONEE' };
    }
    await tx.lienDocument.update({
      where: { id: lien.id },
      data: { ouvertures: { increment: 1 }, derniereOuvertureLe: instant },
    });
    await journaliser(tx, auteurLien(cible.organisationId), {
      action: 'READ',
      entiteType: lien.cible === 'DEVIS' ? 'DEVIS' : 'ESSAI',
      entiteId: lien.dossier.id,
      patientId: lien.dossier.patientId,
      centreId: lien.dossier.centreId,
      details: { lienId: lien.id, destinataire: lien.destinataire },
    });
    return { type: 'OUVERT', pdfCle: lien.pdfCle, cible: lien.cible };
  });
  if (resultat.type === 'FERME') {
    throw new AccesRefuseError();
  }
  if (resultat.type === 'ERRONEE') {
    throw new ErreurSaisie({}, MESSAGE_DATE_ERRONEE);
  }
  return {
    contenu: await documents().get(resultat.pdfCle),
    type: 'application/pdf',
    nomFichier: resultat.cible === 'DEVIS' ? 'devis.pdf' : 'compte-rendu.pdf',
  };
}
