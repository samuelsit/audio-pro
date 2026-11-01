import { randomUUID } from 'node:crypto';

import { formaterInstantParis } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  calculerPagination,
  centimes,
  controlerFacture,
  designationAideSchema,
  designationConsommableSchema,
  devisCalculeSchema,
  dossierAcceptePec,
  etatFacture,
  extensionDocument,
  filtreAFacturerSchema,
  oreillesConcernees,
  oreillesDuDossier,
  pecSaisieSchema,
  preparerFacture,
  TYPES_DOCUMENT,
  verifierDocument,
  type Centimes,
  type ClientFacture,
  type ConsommableAPreparer,
  type Constat,
  type ContenuFacture,
  type EtatFacture,
  type FaitsFacture,
  type Pagination,
  type Perimetre,
  type ResultatControleFacture,
  type RubriqueOffre,
  type StatutPec,
  type TypeDocument,
  type VendeurFacture,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, verifierPerimetre, type UtilisateurConnecte } from '../auth/acces';
import type { EvenementAudit } from '../audit/journal';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { constatSchema, depuisDate, lireDossier, versDate, type DossierLu } from './dossiers';
import { decrireCodesLpp, tarifsAudioEnVigueur, versClientLpp, type CodeLppDecrit } from './lpp';
import { aujourdhui, type Client } from './patients';
import { tauxTvaDates } from './taux-tva';

export const LIGNES_PAR_PAGE_A_FACTURER = 50;

const MESSAGE_HORS_FILE = 'Ce dossier n’est plus à facturer.';

export function evenementFacture(
  action: EvenementAudit['action'],
  factureId: string,
  dossier: Pick<DossierLu, 'id' | 'patientId' | 'centreId'>,
  details: Readonly<Record<string, unknown>> = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'FACTURE',
    entiteId: factureId,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { dossierId: dossier.id, ...details },
  };
}

/**
 * Ouvre le brouillon à l'achat, ou après un avoir total. Rien n'est calculé ici : les lignes du devis se
 * recalculent à la lecture, au jour courant, et se figent à la validation (ADR-014, ADR-028).
 */
export async function creerBrouillonDossier(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: Pick<DossierLu, 'id' | 'patientId' | 'centreId'>,
): Promise<EvenementAudit> {
  const { id } = await tx.facture.create({
    data: {
      organisationId: acteur.organisationId,
      centreId: dossier.centreId,
      patientId: dossier.patientId,
      dossierId: dossier.id,
      createdById: acteur.id,
    },
    select: { id: true },
  });
  return evenementFacture('CREATE', id, dossier);
}

/** Brouillon en cours d'un dossier, à la place de l'ancienne ligne unique par dossier. */
const BROUILLON_DOSSIER = { statut: 'BROUILLON', nature: 'FACTURE' } as const;

// --- Instantanés ----------------------------------------------------------------------------------

export const selectionVendeur = {
  nom: true,
  raisonSociale: true,
  adresseLigne1: true,
  adresseLigne2: true,
  codePostal: true,
  ville: true,
  telephone: true,
  email: true,
  siret: true,
  rcs: true,
  finess: true,
  tvaIntracommunautaire: true,
} as const;

type CentreVendeur = Prisma.CentreGetPayload<{ select: typeof selectionVendeur }>;

export function versVendeur(centre: CentreVendeur): VendeurFacture {
  return {
    raisonSociale: centre.raisonSociale,
    nomCentre: centre.nom,
    adresse: [
      centre.adresseLigne1,
      ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
      `${centre.codePostal} ${centre.ville}`,
    ],
    telephone: centre.telephone,
    email: centre.email,
    siret: centre.siret,
    rcs: centre.rcs,
    finess: centre.finess,
    tvaIntracommunautaire: centre.tvaIntracommunautaire,
  };
}

export const selectionClient = {
  id: true,
  dateNaissance: true,
  nomNaissance: true,
  nomUsage: true,
  prenoms: true,
  adresseLigne1: true,
  adresseLigne2: true,
  codePostal: true,
  ville: true,
} as const;

type PatientClient = Prisma.PatientGetPayload<{ select: typeof selectionClient }>;

export function versClient(patient: PatientClient): ClientFacture {
  const { adresseLigne1, adresseLigne2, codePostal, ville } = patient;
  return {
    prenomNom: `${patient.prenoms} ${patient.nomUsage ?? patient.nomNaissance}`,
    adresse: [
      ...(adresseLigne1 === null ? [] : [adresseLigne1]),
      ...(adresseLigne2 === null ? [] : [adresseLigne2]),
      ...(codePostal === null && ville === null
        ? []
        : [[codePostal, ville].filter((v) => v !== null).join(' ')]),
    ],
  };
}

// --- Lecture groupée : la fiche et la file suivent le même chemin ----------------------------------

const selectionDevisSigne = {
  dossierId: true,
  dateEmission: true,
  refusOffreC2S: true,
  contratResponsable: true,
  tauxAmo: true,
  offreRetenue: true,
  totaux: true,
  offres: {
    select: {
      rubrique: true,
      amcDroiteCentimes: true,
      amcGaucheCentimes: true,
      amcConsommablesCentimes: true,
      lignes: {
        orderBy: { ordre: 'asc' },
        select: {
          nature: true,
          oreille: true,
          classe: true,
          modeleId: true,
          accessoireId: true,
          quantite: true,
          prixUnitaireCentimes: true,
          tauxTva: true,
          codeLpp: true,
          designation: true,
        },
      },
    },
  },
} as const;

type Lu<T> = T extends readonly (infer L)[] ? L : never;

async function lireDevisSignes(client: Client, ids: readonly string[]) {
  return client.devis.findMany({
    where: { dossierId: { in: [...ids] }, statut: 'SIGNE' },
    select: selectionDevisSigne,
  });
}
type DevisSigne = Lu<Awaited<ReturnType<typeof lireDevisSignes>>>;
type OffreLue = DevisSigne['offres'][number];
type LigneLue = OffreLue['lignes'][number];

function offreRetenue(devis: DevisSigne | undefined): OffreLue | undefined {
  return devis?.offres.find((o) => o.rubrique === devis.offreRetenue);
}

function amoSignee(totaux: unknown, rubrique: RubriqueOffre): Centimes | null {
  const lecture = devisCalculeSchema.safeParse(totaux);
  const offre = lecture.data?.offres.find((o) => o.rubrique === rubrique);
  return offre?.total.amo ?? null;
}

function versDevisFacture(
  devis: DevisSigne | undefined,
  offre: OffreLue | undefined,
): FaitsFacture['devis'] {
  if (!devis?.dateEmission || !offre) {
    return null;
  }
  return {
    dateEmission: depuisDate(devis.dateEmission),
    refusOffreC2S: devis.refusOffreC2S,
    contratResponsable: devis.contratResponsable,
    amoPrevue: amoSignee(devis.totaux, offre.rubrique),
    amcPrevue: [
      offre.amcDroiteCentimes,
      offre.amcGaucheCentimes,
      offre.amcConsommablesCentimes,
    ].some((montant) => montant !== null && montant > 0),
    tauxTva: offre.lignes.map(({ nature, tauxTva }) => ({ nature, taux: tauxTva })),
  };
}

function libelleAide(ligne: LigneLue): string {
  const { fabricant, gamme, modele } = designationAideSchema.parse(ligne.designation);
  return `${fabricant} ${gamme} ${modele}`;
}

export interface FactureEvaluee {
  /** Jour d'évaluation : la validation d'aujourd'hui en ferait la date de délivrance. */
  dateDelivrance: string;
  /** `null` si la base LPP ne couvre pas la date de délivrance. */
  facture: ContenuFacture | null;
  /** Identifiant du brouillon. */
  factureId: string;
  controle: ResultatControleFacture;
  etat: EtatFacture;
}

const SANS_TARIF: ResultatControleFacture = {
  erreurs: [{ code: 'TARIF_LPP_INDISPONIBLE', oreille: null }],
  avertissements: [],
};

/**
 * Évalue les brouillons de dossiers au jour courant, en quelques requêtes groupées, sans rien écrire. Un
 * client de transaction relit tout sous la validation : ses contrôles portent sur ce qu'elle fige.
 */
export async function evaluerFactures(
  acteur: UtilisateurConnecte,
  dossiers: readonly DossierLu[],
  client: Client = base(acteur),
): Promise<Map<string, FactureEvaluee>> {
  const ids = dossiers.map((d) => d.id);
  const patientIds = dossiers.map((d) => d.patientId);
  const centreIds = dossiers.map((d) => d.centreId);
  const dateDelivrance = aujourdhui();
  const [
    factures,
    chiffres,
    patients,
    amo,
    amc,
    prescriptions,
    devis,
    liens,
    delivrances,
    pecs,
    centres,
    tauxTva,
  ] = await Promise.all([
    client.facture.findMany({ where: { dossierId: { in: ids }, ...BROUILLON_DOSSIER } }),
    client.dossier.findMany({
      where: { id: { in: ids } },
      select: { id: true, surdicecite: true },
    }),
    client.patient.findMany({
      where: { id: { in: patientIds } },
      select: selectionClient,
    }),
    client.couvertureAmo.findMany({
      where: { patientId: { in: patientIds } },
      select: {
        patientId: true,
        c2s: true,
        origine: true,
        derniereLectureVitale: true,
        updatedAt: true,
        finDroits: true,
      },
    }),
    client.couvertureAmc.findMany({
      where: { patientId: { in: patientIds } },
      select: { patientId: true },
    }),
    client.prescription.findMany({
      where: { dossierId: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        dossierId: true,
        datePrescription: true,
        oreilles: true,
        controles: true,
        prescripteur: { select: { specialite: true, formationOtologie: true, rpps: true } },
      },
    }),
    lireDevisSignes(client, ids),
    client.essaiAppareil.findMany({
      where: { retireLe: null, essai: { dossierId: { in: ids } } },
      select: {
        oreille: true,
        essai: { select: { dossierId: true } },
        appareil: { select: { id: true, numeroSerie: true } },
      },
    }),
    client.delivrance.findMany({
      where: { patientId: { in: patientIds }, annuleeLe: null },
      select: { patientId: true, oreille: true, dateDelivrance: true },
    }),
    client.priseEnCharge.findMany({
      where: { dossierId: { in: ids } },
      select: {
        dossierId: true,
        statut: true,
        montantAccordeCentimes: true,
        justificatifCle: true,
      },
    }),
    client.centre.findMany({
      where: { id: { in: centreIds } },
      select: { id: true, ...selectionVendeur },
    }),
    tauxTvaDates(client),
  ]);
  const saisies = await client.ligneFacture.findMany({
    where: { factureId: { in: factures.map((f) => f.id) } },
    orderBy: { rang: 'asc' },
  });

  const offres = new Map(devis.map((d) => [d.dossierId, offreRetenue(d)]));
  const lignes = [...offres.values()].flatMap((o) => o?.lignes ?? []);
  const modeleIds = lignes.flatMap((l) => (l.modeleId ? [l.modeleId] : []));
  const codesModeles = await client.modeleCodeLpp.findMany({
    where: { modeleId: { in: modeleIds } },
    select: { modeleId: true, code: true },
  });
  const codes = [
    ...new Set([
      ...codesModeles.map((c) => c.code),
      ...lignes.flatMap((l) => (l.codeLpp ? [l.codeLpp] : [])),
      ...saisies.flatMap((l) => (l.codeLpp ? [l.codeLpp] : [])),
    ]),
  ];
  const [audio, decrits] = await Promise.all([
    tarifsAudioEnVigueur(dateDelivrance, versClientLpp(client)),
    decrireCodesLpp(codes, { date: dateDelivrance, client: versClientLpp(client) }),
  ]);
  const tarifsCodes = new Map(decrits.map((d) => [d.code, d]));
  const tarifLpp = (code: string | null) => (code ? tarifsCodes.get(code)?.tarif : null) ?? null;

  const resultat = new Map<string, FactureEvaluee>();
  for (const dossier of dossiers) {
    const ligneFacture = factures.find((f) => f.dossierId === dossier.id);
    const patient = patients.find((p) => p.id === dossier.patientId);
    const chiffre = chiffres.find((c) => c.id === dossier.id);
    const centre = centres.find((c) => c.id === dossier.centreId);
    if (!ligneFacture || !patient || !chiffre || !centre) {
      continue;
    }
    const factureId = ligneFacture.id;
    if (!audio) {
      resultat.set(dossier.id, {
        dateDelivrance,
        factureId,
        facture: null,
        controle: SANS_TARIF,
        etat: etatFacture(SANS_TARIF),
      });
      continue;
    }
    const couverture = amo.find((a) => a.patientId === dossier.patientId);
    const c2s = couverture?.c2s ?? false;
    const surdicecite = chiffre.surdicecite === 'OUI';
    const dateNaissance = depuisDate(patient.dateNaissance);
    const offre = offres.get(dossier.id);
    const pec = pecs.find((p) => p.dossierId === dossier.id);
    const prescription = prescriptions.find((p) => p.dossierId === dossier.id);
    const lignesOffre = offre?.lignes ?? [];

    const facture = preparerFacture({
      dateNaissance,
      dateDelivrance,
      c2s,
      surdicecite,
      tauxAMO: devis.find((d) => d.dossierId === dossier.id)?.tauxAmo ?? 0,
      tarifs: audio,
      tauxTva,
      montantAccorde:
        pec?.statut === 'ACCORDEE' && pec.montantAccordeCentimes !== null
          ? centimes(pec.montantAccordeCentimes)
          : null,
      aides: lignesOffre.flatMap((ligne) => {
        const { oreille, classe, modeleId } = ligne;
        if (ligne.nature !== 'AIDE_AUDITIVE' || !oreille || !classe) {
          return [];
        }
        const lien = liens.find((l) => l.essai.dossierId === dossier.id && l.oreille === oreille);
        return [
          {
            oreille,
            classe,
            libelle: libelleAide(ligne),
            prixTTC: centimes(ligne.prixUnitaireCentimes),
            numeroSerie: lien?.appareil.numeroSerie ?? null,
            appareilId: lien?.appareil.id ?? null,
            candidatsLpp: codesModeles
              .filter((c) => c.modeleId === modeleId)
              .flatMap(({ code }) => {
                const tarif = tarifLpp(code);
                return tarif
                  ? [
                      {
                        code,
                        naturePrestation: tarif.naturePrestation,
                        baseRemboursement: centimes(tarif.baseRemboursementCentimes),
                      },
                    ]
                  : [];
              }),
          },
        ];
      }),
      consommables: [
        ...lignesOffre.flatMap((ligne) => {
          if (ligne.nature === 'AIDE_AUDITIVE') {
            return [];
          }
          return [
            versConsommable(
              {
                nature: ligne.nature,
                libelle: designationConsommableSchema.parse(ligne.designation).nom,
                quantite: ligne.quantite,
                prixUnitaireCentimes: ligne.prixUnitaireCentimes,
                codeLpp: ligne.codeLpp,
                accessoireId: ligne.accessoireId,
              },
              tarifLpp,
            ),
          ];
        }),
        ...saisies
          .filter((ligne) => ligne.factureId === factureId)
          .map((ligne) => versConsommable(ligne, tarifLpp)),
      ],
    });

    const controle = controlerFacture(facture, {
      dateNaissance,
      c2s,
      surdicecite,
      oreilles: oreillesDuDossier(dossier),
      couvertureAmo: couverture
        ? {
            origine: couverture.origine,
            derniereLectureVitale:
              couverture.derniereLectureVitale && jourParis(couverture.derniereLectureVitale),
            modifieeLe: couverture.updatedAt.toISOString(),
            finDroits: couverture.finDroits && depuisDate(couverture.finDroits),
          }
        : null,
      amoConfirmeeLe: ligneFacture.amoConfirmeeLe?.toISOString() ?? null,
      couvertureAmc: amc.some((a) => a.patientId === dossier.patientId),
      prescription: prescription
        ? {
            datePrescription: depuisDate(prescription.datePrescription),
            oreilles: oreillesConcernees(prescription.oreilles),
            prescripteur: prescription.prescripteur,
            erreursForcees: erreursForcees(prescription.controles),
          }
        : null,
      historiqueDelivrances: delivrances
        .filter((d) => d.patientId === dossier.patientId)
        .map((d) => ({ oreille: d.oreille, dateDelivrance: depuisDate(d.dateDelivrance) })),
      devis: versDevisFacture(
        devis.find((d) => d.dossierId === dossier.id),
        offre,
      ),
      pec: pec ? { statut: pec.statut, justificatif: pec.justificatifCle !== null } : null,
      tarifs: audio,
      vendeur: versVendeur(centre),
      client: versClient(patient),
    });
    resultat.set(dossier.id, {
      dateDelivrance,
      factureId,
      facture,
      controle,
      etat: etatFacture(controle),
    });
  }
  return resultat;
}

/** Article du devis ou ligne saisie, au tarif LPP du jour ; un tarif nul ou absent ne rembourse rien. */
export function versConsommable(
  ligne: {
    nature: ConsommableAPreparer['nature'] | 'AIDE_AUDITIVE';
    libelle: string;
    quantite: number;
    prixUnitaireCentimes: number;
    codeLpp: string | null;
    accessoireId: string | null;
  },
  tarifLpp: (code: string | null) => TarifLu | null,
): ConsommableAPreparer {
  const { nature, libelle, quantite, prixUnitaireCentimes, codeLpp, accessoireId } = ligne;
  if (nature === 'AIDE_AUDITIVE') {
    throw new ErreurSaisie({}, 'Une aide auditive ne se saisit pas au brouillon.');
  }
  const tarif = tarifLpp(codeLpp);
  return {
    nature,
    libelle,
    quantite,
    prixUnitaire: centimes(prixUnitaireCentimes),
    codeLpp,
    accessoireId,
    tarif: tarif && {
      baseRemboursement: centimes(tarif.baseRemboursementCentimes),
      naturePrestation: tarif.naturePrestation,
    },
  };
}

function jourParis(instant: Date): string {
  return formaterInstantParis(instant).slice(0, 10);
}

const controlesForcesSchema = z.object({ erreursForcees: z.array(constatSchema) });

function erreursForcees(controles: unknown): readonly Constat[] {
  return controlesForcesSchema.parse(controles).erreursForcees;
}

// --- Écritures ------------------------------------------------------------------------------------

type TarifLu = NonNullable<CodeLppDecrit['tarif']>;

async function exigerAFacturer(
  client: Client,
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<{ dossier: DossierLu; factureId: string }> {
  const dossier = await lireDossier(client, acteur, dossierId);
  const facture = await client.facture.findFirst({
    where: { dossierId, ...BROUILLON_DOSSIER },
    select: { id: true },
  });
  if (dossier.statut !== 'A_FACTURER' || !facture) {
    throw new ErreurSaisie({}, MESSAGE_HORS_FILE);
  }
  return { dossier, factureId: facture.id };
}

/** L'utilisateur atteste la couverture saisie ; toute modification ultérieure annule ce constat (R22). */
export async function confirmerCouvertureAmo(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const { dossier, factureId } = await exigerAFacturer(tx, acteur, dossierId);
      const couverture = await tx.couvertureAmo.count({ where: { patientId: dossier.patientId } });
      if (couverture === 0) {
        throw new ErreurSaisie({}, 'Renseigner d’abord la couverture AMO du patient.');
      }
      await tx.facture.update({
        where: { id: factureId },
        data: { amoConfirmeeLe: new Date(), amoConfirmeeParId: acteur.id },
      });
      return { dossier, factureId };
    },
    ({ dossier, factureId }) =>
      evenementFacture('UPDATE', factureId, dossier, { couvertureAmoConfirmee: true }),
  );
}

const MESSAGE_PEC_HORS_DELAI = 'La prise en charge se saisit de la prescription à la facturation.';

/** Le brouillon n'existe qu'une fois le dossier à facturer : la PEC peut le précéder. */
async function exigerPecPossible(
  client: Client,
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<{ dossier: DossierLu; factureId: string | null }> {
  const dossier = await lireDossier(client, acteur, dossierId);
  if (!dossierAcceptePec(dossier.statut)) {
    throw new ErreurSaisie({}, MESSAGE_PEC_HORS_DELAI);
  }
  const facture = await client.facture.findFirst({
    where: { dossierId, ...BROUILLON_DOSSIER },
    select: { id: true },
  });
  return { dossier, factureId: facture?.id ?? null };
}

function evenementPec(
  dossier: DossierLu,
  factureId: string | null,
  statut: string,
): EvenementAudit {
  if (factureId !== null) {
    return evenementFacture('UPDATE', factureId, dossier, { pec: statut });
  }
  return {
    action: 'UPDATE',
    entiteType: 'DOSSIER',
    entiteId: dossier.id,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { pec: statut },
  };
}

/**
 * Saisie de la prise en charge complémentaire, remplacée à chaque enregistrement. Sans nouveau fichier, le
 * justificatif reste. Il est déposé hors transaction ; si elle échoue, l'objet déposé est retiré, et
 * l'ancien ne l'est qu'une fois le remplacement validé.
 */
export async function enregistrerPec(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
  justificatif: Uint8Array,
): Promise<void> {
  const donnees = valider(pecSaisieSchema, saisie);
  const verification = justificatif.length > 0 ? verifierDocument(justificatif, '') : null;
  if (verification && !verification.valide) {
    throw ErreurSaisie.surChamp('justificatif', verification.message);
  }
  await exigerPecPossible(base(acteur), acteur, dossierId);
  const nouveau = verification?.valide
    ? { cle: `prises-en-charge/${randomUUID()}`, type: verification.type }
    : null;
  if (nouveau) {
    await documents().put(nouveau.cle, justificatif, nouveau.type);
  }
  const champs = {
    ...donnees,
    datePec: donnees.datePec === null ? null : versDate(donnees.datePec),
    saisieParId: acteur.id,
    ...(nouveau
      ? {
          justificatifCle: nouveau.cle,
          justificatifType: nouveau.type,
          justificatifTaille: justificatif.length,
        }
      : {}),
  };
  try {
    const { ancienneCle } = await withAudit(
      acteur,
      async (tx) => {
        const { dossier, factureId } = await exigerPecPossible(tx, acteur, dossierId);
        const existante = await tx.priseEnCharge.findUnique({
          where: { dossierId },
          select: { justificatifCle: true },
        });
        await tx.priseEnCharge.upsert({
          where: { dossierId },
          create: { dossierId, ...champs },
          update: champs,
        });
        return { dossier, factureId, ancienneCle: nouveau ? existante?.justificatifCle : null };
      },
      ({ dossier, factureId }) => evenementPec(dossier, factureId, donnees.statut),
    );
    if (ancienneCle) {
      await documents()
        .delete(ancienneCle)
        .catch(() => undefined);
    }
  } catch (erreur) {
    if (nouveau) {
      await documents()
        .delete(nouveau.cle)
        .catch(() => undefined);
    }
    throw erreur;
  }
}

export interface JustificatifPec {
  contenu: Uint8Array;
  type: TypeDocument;
  nomFichier: string;
}

/** Ouvre le justificatif : une ligne READ, le nom d'origine n'étant pas conservé. */
export async function lireJustificatifPec(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<JustificatifPec> {
  const { cle, type } = await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      const pec = await tx.priseEnCharge.findUnique({
        where: { dossierId },
        select: { justificatifCle: true, justificatifType: true },
      });
      if (!pec?.justificatifCle || !pec.justificatifType) {
        throw new AccesRefuseError();
      }
      const facture = await tx.facture.findFirst({
        where: { dossierId, nature: 'FACTURE' },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return {
        cle: pec.justificatifCle,
        type: pec.justificatifType,
        dossier,
        factureId: facture?.id ?? null,
      };
    },
    ({ dossier, factureId }) =>
      factureId === null
        ? {
            action: 'READ',
            entiteType: 'DOSSIER',
            entiteId: dossier.id,
            patientId: dossier.patientId,
            centreId: dossier.centreId,
            details: { document: 'JUSTIFICATIF_PEC' },
          }
        : evenementFacture('READ', factureId, dossier, { document: 'JUSTIFICATIF_PEC' }),
  );
  const typeDocument = z.enum(TYPES_DOCUMENT).parse(type);
  return {
    contenu: await documents().get(cle),
    type: typeDocument,
    nomFichier: `justificatif-pec.${extensionDocument(typeDocument)}`,
  };
}

// --- Écrans ---------------------------------------------------------------------------------------

export interface PecAffichee {
  statut: StatutPec;
  organisme: string | null;
  plateforme: string | null;
  numeroAccord: string | null;
  montantAccordeCentimes: number | null;
  datePec: string | null;
  justificatif: boolean;
}

function versPecAffichee(pec: Prisma.PriseEnChargeGetPayload<object>): PecAffichee {
  return {
    statut: pec.statut,
    organisme: pec.organisme,
    plateforme: pec.plateforme,
    numeroAccord: pec.numeroAccord,
    montantAccordeCentimes: pec.montantAccordeCentimes,
    datePec: pec.datePec && depuisDate(pec.datePec),
    justificatif: pec.justificatifCle !== null,
  };
}

/** PEC du dossier avant la facturation ; `saisissable` dit si la section s'affiche sur le dossier. */
export async function lirePecDossier(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<{ pec: PecAffichee | null; saisissable: boolean }> {
  const client = base(acteur);
  const dossier = await lireDossier(client, acteur, dossierId);
  const [pec, couverture] = await Promise.all([
    client.priseEnCharge.findUnique({ where: { dossierId } }),
    client.couvertureAmo.findUnique({
      where: { patientId: dossier.patientId },
      select: { c2s: true },
    }),
  ]);
  return {
    pec: pec && versPecAffichee(pec),
    saisissable:
      dossierAcceptePec(dossier.statut) &&
      dossier.statut !== 'A_FACTURER' &&
      couverture?.c2s !== true,
  };
}

export interface FactureDetail extends FactureEvaluee {
  pec: PecAffichee | null;
  /** La couverture est prise en charge d'office : pas de PEC à saisir. */
  c2s: boolean;
  amoConfirmeeLe: string | null;
}

/** Facture du dossier, `null` hors de la file. Le dossier est déjà ouvert et journalisé par l'appelant. */
export async function obtenirFacture(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<FactureDetail | null> {
  const client = base(acteur);
  const dossier = await lireDossier(client, acteur, dossierId);
  if (dossier.statut !== 'A_FACTURER') {
    return null;
  }
  const evaluee = (await evaluerFactures(acteur, [dossier])).get(dossierId);
  if (!evaluee) {
    return null;
  }
  const [pec, facture, couverture] = await Promise.all([
    client.priseEnCharge.findUnique({ where: { dossierId } }),
    client.facture.findFirstOrThrow({
      where: { dossierId, ...BROUILLON_DOSSIER },
      select: { amoConfirmeeLe: true },
    }),
    client.couvertureAmo.findUnique({
      where: { patientId: dossier.patientId },
      select: { c2s: true },
    }),
  ]);
  return {
    ...evaluee,
    c2s: couverture?.c2s ?? false,
    amoConfirmeeLe: facture.amoConfirmeeLe?.toISOString() ?? null,
    pec: pec && versPecAffichee(pec),
  };
}

export interface LigneAFacturer {
  dossierId: string;
  patient: string;
  centre: string;
  dateDelivrance: string;
  prixTTC: Centimes | null;
  resteACharge: Centimes | null;
  erreurs: readonly Constat[];
  avertissements: readonly Constat[];
}

export interface FileAFacturer {
  lignes: LigneAFacturer[];
  pagination: Pagination;
  compteurs: Readonly<Record<EtatFacture, number>>;
}

/**
 * File « À facturer » du périmètre, les achats les plus anciens d'abord. L'état se recalcule à
 * chaque affichage : la file est courte, et un état stocké vieillirait avec les droits et les lectures.
 * Une liste n'ouvre aucun dossier : pas de READ (ADR-006).
 */
export async function listerAFacturer(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<FileAFacturer> {
  verifierPerimetre(acteur, perimetre);
  const { page, etat } = valider(filtreAFacturerSchema, saisie);
  const centres = centresDuPerimetre(acteur, perimetre);
  const lignes = await base(acteur).facture.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...BROUILLON_DOSSIER,
      dossier: {
        statut: 'A_FACTURER',
        ...(centres === null ? {} : { centreId: { in: [...centres] } }),
      },
    },
    select: {
      dossier: {
        select: {
          id: true,
          organisationId: true,
          patientId: true,
          centreId: true,
          praticienId: true,
          statut: true,
          typeDroite: true,
          typeGauche: true,
          centre: { select: { nom: true } },
          patient: { select: { nomNaissance: true, nomUsage: true, prenoms: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const dossiers = lignes.flatMap((l) => (l.dossier ? [l.dossier] : []));
  const evaluees = await evaluerFactures(acteur, dossiers);
  const toutes = dossiers.flatMap((dossier) => {
    const evaluee = evaluees.get(dossier.id);
    return evaluee ? [{ dossier, evaluee }] : [];
  });
  const retenues = toutes.filter(({ evaluee }) => evaluee.etat === etat);
  const pagination = calculerPagination(page, LIGNES_PAR_PAGE_A_FACTURER, retenues.length);
  return {
    compteurs: {
      PRET: toutes.filter((l) => l.evaluee.etat === 'PRET').length,
      BLOQUE: toutes.filter((l) => l.evaluee.etat === 'BLOQUE').length,
    },
    pagination,
    lignes: retenues
      .slice(pagination.decalage, pagination.decalage + LIGNES_PAR_PAGE_A_FACTURER)
      .map(({ dossier, evaluee }) => ({
        dossierId: dossier.id,
        patient: `${dossier.patient.nomUsage ?? dossier.patient.nomNaissance} ${dossier.patient.prenoms}`,
        centre: dossier.centre.nom,
        dateDelivrance: evaluee.dateDelivrance,
        prixTTC: evaluee.facture?.totaux.prixTTC ?? null,
        resteACharge: evaluee.facture?.totaux.resteACharge ?? null,
        erreurs: evaluee.controle.erreurs,
        avertissements: evaluee.controle.avertissements,
      })),
  };
}
