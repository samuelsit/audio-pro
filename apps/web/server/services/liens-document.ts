import { randomUUID } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import { historiserMessage } from '@ha/communication';
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
import { empreinteAdresse, signatureLienDocument } from '../reservation-empreintes';
import { exigerSansOpposition } from './consentements';
import { lireDevis, type DocumentDevis } from './devis';
import { depuisDate, lireDossier, type DossierLu } from './dossiers';
import { rendreCompteRendu } from './essais';
import {
  adresseEnvoi,
  deposerOriginal,
  enregistrerSortie,
  lireFacture,
  numeroFacture,
  rendreDuplicata,
} from './facturation';

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

/** Rattachement d'un lien : un document de dossier, ou une facture, avec ou sans dossier. */
interface RattachementLien {
  readonly dossierId: string | null;
  readonly patientId: string;
  readonly centreId: string;
  readonly factureId?: string;
}

interface LienACreer {
  readonly rattachement: RattachementLien;
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
  { rattachement, cible, destinataire, pdfCle, canal, adresse }: LienACreer,
): Promise<string> {
  const { dossierId, patientId, centreId, factureId } = rattachement;
  const instant = new Date(horloge.now());
  const lien = await tx.lienDocument.create({
    data: {
      organisationId: acteur.organisationId,
      dossierId,
      patientId,
      factureId: factureId ?? null,
      cible,
      destinataire,
      pdfCle,
      expireLe: new Date(instant.getTime() + DUREE_LIEN_DOCUMENT_JOURS * MS_PAR_JOUR),
      createdById: acteur.id,
    },
    select: { id: true },
  });
  const centre = await tx.centre.findUniqueOrThrow({
    where: { id: centreId },
    select: { nom: true, organisationId: true },
  });
  const cleIdempotence = `lien:${lien.id}:${canal}`;
  await tx.notification.create({
    data: {
      lienDocumentId: lien.id,
      messagePatientId:
        destinataire === 'PATIENT'
          ? await historiserMessage(
              tx as unknown as Prisma.TransactionClient,
              {
                organisationId: centre.organisationId,
                centreId,
                patientId,
                canal,
                adresse,
                finalite: 'SUIVI',
                sujet: 'Un document est à votre disposition',
                cleIdempotence,
              },
              empreinteAdresse(),
            )
          : null,
      canal,
      destinataire: adresse,
      gabarit: 'DOCUMENT_A_CONSULTER',
      parametres: parametresDocumentSchema.parse({
        centre: centre.nom,
      }) as Prisma.InputJsonValue,
      cleIdempotence,
    },
  });
  return lien.id;
}

function rattachementDossier(dossier: DossierLu): RattachementLien {
  return { dossierId: dossier.id, patientId: dossier.patientId, centreId: dossier.centreId };
}

function evenementEnvoi(
  entiteType: 'DEVIS' | 'ESSAI' | 'FACTURE',
  entiteId: string,
  dossier: Pick<DossierLu, 'patientId' | 'centreId'>,
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
      await exigerSansOpposition(tx, canal, adresse);
      const lienId = await creerLien(tx, acteur, {
        rattachement: rattachementDossier(dossier),
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
          rattachement: rattachementDossier(dossier),
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

/**
 * Envoie une facture ou un avoir au patient par lien sécurisé. L'original s'envoie s'il n'est jamais sorti ;
 * sinon un duplicata, déposé pour ce lien et retiré à son expiration. Aucun message ne porte de montant.
 */
export async function envoyerFactureAuPatient(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<void> {
  exigerEnvoiPossible();
  const client = base(acteur);
  const facture = await lireFacture(client, acteur, factureId);
  const { canal, adresse } = await adresseEnvoi(client, facture.patientId, saisie);
  const original = await deposerOriginal(acteur, facture);
  const duplicataCle = `liens-documents/${randomUUID()}`;
  await documents().put(duplicataCle, await rendreDuplicata(client, factureId), 'application/pdf');
  let duplicataUtilise = false;
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const numero = await numeroFacture(tx, factureId);
        const { duplicata } = await enregistrerSortie(tx, acteur, facture, numero, [
          'FACTURE_ENVOYEE',
        ]);
        duplicataUtilise = duplicata;
        const lienId = await creerLien(tx, acteur, {
          rattachement: {
            dossierId: facture.dossierId,
            patientId: facture.patientId,
            centreId: facture.centreId,
            factureId,
          },
          cible: 'FACTURE',
          destinataire: 'PATIENT',
          pdfCle: duplicata ? duplicataCle : original,
          canal,
          adresse,
        });
        return { lienId };
      },
      ({ lienId }) => evenementEnvoi('FACTURE', factureId, facture, lienId, canal, 'PATIENT'),
    );
  } finally {
    if (!duplicataUtilise) {
      await documents()
        .delete(duplicataCle)
        .catch(() => undefined);
    }
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
      if (!lien?.dossierId) {
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

const ENTITES_CIBLE: Readonly<Record<CibleLienDocument, 'DEVIS' | 'ESSAI' | 'FACTURE'>> = {
  DEVIS: 'DEVIS',
  COMPTE_RENDU_ESSAI: 'ESSAI',
  FACTURE: 'FACTURE',
};

const NOMS_FICHIER: Readonly<Record<CibleLienDocument, string>> = {
  DEVIS: 'devis.pdf',
  COMPTE_RENDU_ESSAI: 'compte-rendu.pdf',
  FACTURE: 'facture.pdf',
};

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
      include: {
        dossier: { select: { centreId: true } },
        facture: { select: { centreId: true } },
      },
    });
    if (!lien || !lienOuvert(versEtat(lien), instant.getTime())) {
      return { type: 'FERME' };
    }
    const patient = await tx.patient.findUniqueOrThrow({
      where: { id: lien.patientId },
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
      entiteType: ENTITES_CIBLE[lien.cible],
      entiteId: lien.factureId ?? lien.dossierId,
      patientId: lien.patientId,
      centreId: lien.facture?.centreId ?? lien.dossier?.centreId ?? null,
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
    nomFichier: NOMS_FICHIER[resultat.cible],
  };
}
