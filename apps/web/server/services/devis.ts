import { createHash, randomUUID } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  actionDevisSaisieSchema,
  ajouterMois,
  amcDepuisPec,
  blocagesSignature,
  calculerDevis,
  canauxDisponibles,
  centimes,
  controlerDevis,
  debutEssaiSaisieSchema,
  designationAideSchema,
  designationConsommableSchema,
  devisCalculeSchema,
  devisEchu,
  devisModifiable,
  devisSaisieSchema,
  dossierAccepteDevis,
  extensionDocument,
  LIBELLES_RUBRIQUES_OFFRE,
  MESSAGES_BLOCAGE_SIGNATURE,
  nouvelleVersionPossible,
  oreillesDuDossier,
  pecDiffereDuDevis,
  peutEmettreDevis,
  peutEnregistrerSignature,
  premiereDelivrancePossible,
  rendreDevisHtml,
  rendreFeuilleSignatureHtml,
  signatureDevisSaisieSchema,
  signatureEcranSaisieSchema,
  statutDossierApresEmission,
  tauxTvaEnVigueur,
  type NatureLigneDevis,
  TYPES_DOCUMENT,
  verifierDocument,
  type CanalNotification,
  type Centimes,
  type ClasseLpp,
  type Clock,
  type Constat,
  type ContexteDevis,
  type DevisCalcule,
  type DevisDonnees,
  type DevisSaisie,
  type LigneAide,
  type LigneConsommable,
  type NatureAccessoire,
  type OffreCalculee,
  type OffreDonnees,
  type Oreille,
  type ResultatControleDevis,
  type RubriqueOffre,
  type StatutDevis,
  type StatutDossier,
  type TarifsAudio,
  type PreuveSignature,
  type TypeDocument,
  type VueDevis,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { eSignature, signatureEcranDisponible } from '../e-signature';
import { ErreurSaisie, valider } from '../erreurs';
import { notifierDisponible } from '../notifier';
import { rendeurPdf } from '../pdf';
import {
  appliquerTransition,
  constatSchema,
  depuisDate,
  ErreurConflitDossier,
  evenementTransition,
  lireDossier,
  versDate,
  type DossierLu,
} from './dossiers';
import {
  appareilsActifs,
  etatDeLEssai,
  evenementEssai,
  lireEssaiOuvert,
  poserAppareil,
} from './essais-socle';
import { tarifsAudioEnVigueur, tarifsConsommablesEnVigueur } from './lpp';
import { aujourdhui, lireFiche, type Client, type PatientDetail } from './patients';
import { tauxTvaDates } from './taux-tva';

/** Le devis reste en l'état : `controle` dit quoi corriger, oreille par oreille. */
export class ErreurDevisBloque extends ErreurSaisie {
  constructor(readonly controle: ResultatControleDevis) {
    super({}, 'Le devis ne peut pas être émis : corriger les points bloquants.');
    this.name = 'ErreurDevisBloque';
  }
}

const horloge: Clock = new SystemClock();

const MESSAGE_TARIFS_ABSENTS =
  'Tarifs LPP absents à la date de délivrance prévue : importer la base LPP avant d’établir un devis.';

// --- Lecture du contenu ---------------------------------------------------------------------------

const inclusionOffres = {
  offres: {
    orderBy: { rubrique: 'asc' },
    include: { lignes: { orderBy: { ordre: 'asc' } } },
  },
} as const;

type DevisLu = Prisma.DevisGetPayload<{ include: typeof inclusionOffres }>;
type OffreLue = DevisLu['offres'][number];
type LigneLue = OffreLue['lignes'][number];

function prixLigne(ligne: LigneLue) {
  return {
    prixUnitaireAvantRemise: centimes(ligne.prixUnitaireAvantRemiseCentimes),
    prixUnitaire: centimes(ligne.prixUnitaireCentimes),
    tauxTVA: ligne.tauxTva,
  };
}

function montantOuNull(montant: number | null): Centimes | null {
  return montant === null ? null : centimes(montant);
}

function versOffre({
  rubrique,
  lignes,
  amcDroiteCentimes,
  amcGaucheCentimes,
  amcConsommablesCentimes,
}: OffreLue): OffreDonnees {
  const aides: LigneAide[] = [];
  const consommables: LigneConsommable[] = [];
  for (const ligne of lignes) {
    if (ligne.nature === 'AIDE_AUDITIVE') {
      aides.push({
        ...prixLigne(ligne),
        // La contrainte CHECK garantit oreille et classe sur une aide.
        oreille: ligne.oreille as Oreille,
        classe: ligne.classe as ClasseLpp,
        designation: designationAideSchema.parse(ligne.designation),
      });
    } else {
      consommables.push({
        ...prixLigne(ligne),
        nature: ligne.nature,
        quantite: ligne.quantite,
        codeLpp: ligne.codeLpp,
        designation: designationConsommableSchema.parse(ligne.designation),
      });
    }
  }
  return {
    rubrique,
    aides,
    consommables,
    amcDroite: montantOuNull(amcDroiteCentimes),
    amcGauche: montantOuNull(amcGaucheCentimes),
    amcConsommables: montantOuNull(amcConsommablesCentimes),
  };
}

/** Lit un devis et vérifie le droit par le centre de son dossier. */
export async function lireDevis(
  client: Client,
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<{ devis: DevisLu; dossier: DossierLu }> {
  const devis = await client.devis.findFirst({
    where: { id: devisId, organisationId: acteur.organisationId },
    include: inclusionOffres,
  });
  if (!devis) {
    throw new AccesRefuseError();
  }
  return { devis, dossier: await lireDossier(client, acteur, devis.dossierId) };
}

function exigerStatut(devis: DevisLu, statutAttendu: StatutDevis): void {
  if (devis.statut !== statutAttendu) {
    throw new ErreurConflitDossier();
  }
}

// --- Résolution du catalogue ----------------------------------------------------------------------

const selectionModele = {
  id: true,
  gamme: true,
  nom: true,
  type: true,
  classe: true,
  marque: true,
  referenceCommerciale: true,
  lieuFabrication: true,
  nombreCanaux: true,
  connectivite: true,
  antiLarsen: true,
  reducteurAcouphenes: true,
  bobineT: true,
  options: true,
  fabricant: { select: { nom: true, adresse: true, mandataire: true } },
} as const;

const selectionAccessoire = {
  id: true,
  nom: true,
  nature: true,
  codeLpp: true,
  marque: true,
  referenceCommerciale: true,
} as const;

interface LigneAEcrire {
  readonly nature: 'AIDE_AUDITIVE' | NatureAccessoire;
  readonly oreille: Oreille | null;
  readonly classe: ClasseLpp | null;
  readonly modeleId: string | null;
  readonly accessoireId: string | null;
  readonly quantite: number;
  readonly prixAvantRemise: Centimes;
  readonly prix: Centimes;
  readonly tauxTva: number;
  readonly codeLpp: string | null;
  readonly designation: Prisma.InputJsonValue;
}

interface OffreAEcrire {
  readonly rubrique: RubriqueOffre;
  readonly amcDroite: Centimes | null;
  readonly amcGauche: Centimes | null;
  readonly amcConsommables: Centimes | null;
  readonly lignes: readonly LigneAEcrire[];
}

/** Transforme la saisie en lignes : instantané du catalogue et taux de TVA en vigueur. */
async function resoudreOffres(
  client: Client,
  acteur: UtilisateurConnecte,
  dossier: DossierLu,
  donnees: DevisSaisie,
): Promise<OffreAEcrire[]> {
  const oreilles = oreillesDuDossier(dossier).map((o) => o.oreille);
  const aidesSaisies = donnees.offres.flatMap((offre) => [offre.aideDroite, offre.aideGauche]);
  const modeleIds = aidesSaisies.flatMap((aide) => (aide ? [aide.modeleId] : []));
  const accessoireIds = donnees.offres.flatMap((o) => o.consommables.map((c) => c.accessoireId));
  const [modeles, accessoires, taux] = await Promise.all([
    client.modeleAideAuditive.findMany({
      where: { id: { in: modeleIds }, organisationId: acteur.organisationId },
      select: selectionModele,
    }),
    client.accessoire.findMany({
      where: { id: { in: accessoireIds }, organisationId: acteur.organisationId },
      select: selectionAccessoire,
    }),
    tauxTvaDates(client),
  ]);
  const tauxDuJour = (nature: NatureLigneDevis): number => {
    const valeur = tauxTvaEnVigueur(taux, nature, aujourdhui());
    if (valeur === null) {
      throw ErreurSaisie.surChamp('offres', 'Aucun taux de TVA n’est paramétré pour cet article.');
    }
    return valeur;
  };

  const ligneAide = (
    oreille: Oreille,
    aide: DevisSaisie['offres'][number]['aideDroite'],
  ): LigneAEcrire[] => {
    if (aide === null) {
      return [];
    }
    const modele = modeles.find((m) => m.id === aide.modeleId);
    if (!modele) {
      throw ErreurSaisie.surChamp('offres', 'Modèle inconnu.');
    }
    if (!oreilles.includes(oreille)) {
      throw ErreurSaisie.surChamp('offres', 'Cette oreille n’est pas à appareiller.');
    }
    return [
      {
        nature: 'AIDE_AUDITIVE',
        oreille,
        classe: modele.classe,
        modeleId: modele.id,
        accessoireId: null,
        quantite: 1,
        prixAvantRemise: aide.prixAvantRemise,
        prix: aide.prix,
        tauxTva: tauxDuJour('AIDE_AUDITIVE'),
        codeLpp: null,
        designation: designationAideSchema.parse({
          fabricant: modele.fabricant.nom,
          adresseFabricant: modele.fabricant.adresse,
          mandataire: modele.fabricant.mandataire,
          marque: modele.marque,
          gamme: modele.gamme,
          modele: modele.nom,
          referenceCommerciale: modele.referenceCommerciale,
          lieuFabrication: modele.lieuFabrication,
          type: modele.type,
          classe: modele.classe,
          nombreCanaux: modele.nombreCanaux,
          connectivite: modele.connectivite,
          antiLarsen: modele.antiLarsen,
          reducteurAcouphenes: modele.reducteurAcouphenes,
          bobineT: modele.bobineT,
          options: modele.options,
        }),
      },
    ];
  };

  return donnees.offres.map((offre) => ({
    rubrique: offre.rubrique,
    amcDroite: offre.amcDroite,
    amcGauche: offre.amcGauche,
    amcConsommables: offre.amcConsommables,
    lignes: [
      ...ligneAide('DROITE', offre.aideDroite),
      ...ligneAide('GAUCHE', offre.aideGauche),
      ...offre.consommables.map((ligne): LigneAEcrire => {
        const accessoire = accessoires.find((a) => a.id === ligne.accessoireId);
        if (!accessoire) {
          throw ErreurSaisie.surChamp('offres', 'Article inconnu.');
        }
        return {
          nature: accessoire.nature,
          oreille: null,
          classe: null,
          modeleId: null,
          accessoireId: accessoire.id,
          quantite: ligne.quantite,
          prixAvantRemise: ligne.prixAvantRemise,
          prix: ligne.prix,
          tauxTva: tauxDuJour(accessoire.nature),
          codeLpp: accessoire.codeLpp,
          designation: designationConsommableSchema.parse({
            nom: accessoire.nom,
            marque: accessoire.marque,
            referenceCommerciale: accessoire.referenceCommerciale,
          }),
        };
      }),
    ],
  }));
}

function champsDevis(donnees: DevisSaisie) {
  return {
    lieuEmission: donnees.lieuEmission,
    validiteMois: donnees.validiteMois,
    tauxAmo: donnees.tauxAmo,
    refusOffreC2S: donnees.refusOffreC2S,
    contratResponsable: donnees.contratResponsable,
    bobineTPresentee: donnees.bobineTPresentee,
    ficheTechniqueJointe: donnees.ficheTechniqueJointe,
    depotGarantieCentimes: donnees.depotGarantie,
    datePrecedentDroite: donnees.datePrecedentDroite && versDate(donnees.datePrecedentDroite),
    datePrecedentGauche: donnees.datePrecedentGauche && versDate(donnees.datePrecedentGauche),
  };
}

async function ecrireOffres(
  tx: ClientTransaction,
  devisId: string,
  offres: readonly OffreAEcrire[],
): Promise<void> {
  for (const offre of offres) {
    const { id: offreId } = await tx.devisOffre.create({
      data: {
        devisId,
        rubrique: offre.rubrique,
        amcDroiteCentimes: offre.amcDroite,
        amcGaucheCentimes: offre.amcGauche,
        amcConsommablesCentimes: offre.amcConsommables,
      },
      select: { id: true },
    });
    await tx.devisLigne.createMany({
      data: offre.lignes.map(({ prix, prixAvantRemise, ...ligne }, ordre) => ({
        ...ligne,
        offreId,
        ordre,
        prixUnitaireAvantRemiseCentimes: prixAvantRemise,
        prixUnitaireCentimes: prix,
      })),
    });
  }
}

function evenementDevis(
  action: EvenementAudit['action'],
  devisId: string,
  dossier: DossierLu,
  details: Readonly<Record<string, unknown>> = {},
): EvenementAudit {
  return {
    action,
    entiteType: 'DEVIS',
    entiteId: devisId,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { dossierId: dossier.id, ...details },
  };
}

// --- Rédaction ------------------------------------------------------------------------------------

/** Le numéro reste le même d'une version à l'autre : un seul appel par dossier. */
async function prochainNumero(tx: ClientTransaction, organisationId: string): Promise<string> {
  const annee = Number(aujourdhui().slice(0, 4));
  const { dernier } = await tx.compteurDevis.upsert({
    where: { organisationId_annee: { organisationId, annee } },
    create: { organisationId, annee, dernier: 1 },
    update: { dernier: { increment: 1 } },
    select: { dernier: true },
  });
  return `${String(annee)}-${String(dernier).padStart(6, '0')}`;
}

function exigerDossierOuvert(dossier: DossierLu, statutAttendu: StatutDossier): void {
  if (dossier.statut !== statutAttendu) {
    throw new ErreurConflitDossier();
  }
  if (!dossierAccepteDevis(dossier.statut)) {
    throw new ErreurSaisie({}, 'Ce dossier n’accepte pas de devis à ce stade.');
  }
}

/** Première version du devis d'un dossier. Renvoie son identifiant. */
export async function creerDevis(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
): Promise<string> {
  const donnees = valider(devisSaisieSchema, saisie);
  const dossierLu = await lireDossier(base(acteur), acteur, dossierId);
  const offres = await resoudreOffres(base(acteur), acteur, dossierLu, donnees);
  const { devisId } = await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      exigerDossierOuvert(dossier, donnees.statutAttendu);
      if ((await tx.devis.count({ where: { dossierId } })) > 0) {
        throw new ErreurSaisie({}, 'Ce dossier a déjà un devis : en créer une nouvelle version.');
      }
      const { id } = await tx.devis.create({
        data: {
          ...champsDevis(donnees),
          organisationId: acteur.organisationId,
          dossierId,
          numero: await prochainNumero(tx, acteur.organisationId),
          version: 1,
          createdById: acteur.id,
        },
        select: { id: true },
      });
      await ecrireOffres(tx, id, offres);
      return { devisId: id, dossier };
    },
    (r) => evenementDevis('CREATE', r.devisId, r.dossier, { version: 1 }),
  );
  return devisId;
}

/** Remplace le contenu d'un brouillon, instantané du catalogue compris. */
export async function modifierDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(devisSaisieSchema, saisie);
  const lu = await lireDevis(base(acteur), acteur, devisId);
  const offres = await resoudreOffres(base(acteur), acteur, lu.dossier, donnees);
  await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      exigerDossierOuvert(dossier, donnees.statutAttendu);
      if (!devisModifiable(devis.statut)) {
        throw new ErreurSaisie({}, 'Un devis émis se corrige par une nouvelle version.');
      }
      const { count } = await tx.devis.updateMany({
        where: { id: devisId, statut: 'BROUILLON', updatedAt: devis.updatedAt },
        data: champsDevis(donnees),
      });
      if (count !== 1) {
        throw new ErreurConflitDossier();
      }
      await tx.devisOffre.deleteMany({ where: { devisId } });
      await ecrireOffres(tx, devisId, offres);
      return dossier;
    },
    (dossier) => evenementDevis('UPDATE', devisId, dossier),
  );
}

/** Abandonne une rédaction. Renvoie le dossier, vers lequel l'écran revient. */
export async function supprimerBrouillon(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<string> {
  const { statutAttendu } = valider(actionDevisSaisieSchema, saisie);
  const dossier = await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      exigerStatut(devis, statutAttendu);
      if (!devisModifiable(devis.statut)) {
        throw new ErreurSaisie({}, 'Un devis émis ne se supprime pas.');
      }
      await tx.devis.delete({ where: { id: devisId } });
      return dossier;
    },
    (dossier) => evenementDevis('DELETE', devisId, dossier),
  );
  return dossier.id;
}

/** Copie un devis émis ou signé en brouillon v+1, seul moyen de le modifier. */
export async function creerNouvelleVersion(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<string> {
  const { statutAttendu } = valider(actionDevisSaisieSchema, saisie);
  const resultat = await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      exigerStatut(devis, statutAttendu);
      if (!nouvelleVersionPossible(devis.statut) || !dossierAccepteDevis(dossier.statut)) {
        throw new ErreurSaisie({}, 'Ce devis ne peut plus changer de version.');
      }
      if ((await tx.devis.count({ where: { dossierId: dossier.id, statut: 'BROUILLON' } })) > 0) {
        throw new ErreurSaisie({}, 'Une nouvelle version est déjà en cours de rédaction.');
      }
      const version = devis.version + 1;
      const { id } = await tx.devis.create({
        data: {
          organisationId: devis.organisationId,
          dossierId: devis.dossierId,
          numero: devis.numero,
          version,
          lieuEmission: devis.lieuEmission,
          validiteMois: devis.validiteMois,
          tauxAmo: devis.tauxAmo,
          refusOffreC2S: devis.refusOffreC2S,
          contratResponsable: devis.contratResponsable,
          bobineTPresentee: devis.bobineTPresentee,
          ficheTechniqueJointe: devis.ficheTechniqueJointe,
          depotGarantieCentimes: devis.depotGarantieCentimes,
          datePrecedentDroite: devis.datePrecedentDroite,
          datePrecedentGauche: devis.datePrecedentGauche,
          offreEssai: devis.offreEssai,
          createdById: acteur.id,
        },
        select: { id: true },
      });
      await ecrireOffres(
        tx,
        id,
        devis.offres.map((offre) => ({
          rubrique: offre.rubrique,
          amcDroite: montantOuNull(offre.amcDroiteCentimes),
          amcGauche: montantOuNull(offre.amcGaucheCentimes),
          amcConsommables: montantOuNull(offre.amcConsommablesCentimes),
          lignes: offre.lignes.map((ligne) => ({
            nature: ligne.nature,
            oreille: ligne.oreille,
            classe: ligne.classe,
            modeleId: ligne.modeleId,
            accessoireId: ligne.accessoireId,
            quantite: ligne.quantite,
            prixAvantRemise: centimes(ligne.prixUnitaireAvantRemiseCentimes),
            prix: centimes(ligne.prixUnitaireCentimes),
            tauxTva: ligne.tauxTva,
            codeLpp: ligne.codeLpp,
            designation: ligne.designation as Prisma.InputJsonValue,
          })),
        })),
      );
      return { id, version, dossier };
    },
    ({ id, version, dossier }) => evenementDevis('CREATE', id, dossier, { version }),
  );
  return resultat.id;
}

// --- Contrôle et calcul ---------------------------------------------------------------------------

interface FaitsDevis {
  readonly fiche: PatientDetail;
  readonly contexte: ContexteDevis;
  readonly centre: Prisma.CentreGetPayload<{ select: typeof selectionCentre }>;
  /** Montant de la PEC accordée : il remplace la part AMC saisie. */
  readonly pecAccordee: Centimes | null;
  readonly praticien: {
    readonly prenomNom: string;
    readonly identifiant: string;
  };
}

const selectionCentre = {
  nom: true,
  adresseLigne1: true,
  adresseLigne2: true,
  codePostal: true,
  ville: true,
  telephone: true,
  email: true,
  finess: true,
  raisonSociale: true,
  siret: true,
  rcs: true,
  tvaIntracommunautaire: true,
} as const;

async function lirePecAccordee(client: Client, dossierId: string): Promise<Centimes | null> {
  const pec = await client.priseEnCharge.findUnique({
    where: { dossierId },
    select: { statut: true, montantAccordeCentimes: true },
  });
  return pec?.statut === 'ACCORDEE' && pec.montantAccordeCentimes !== null
    ? centimes(pec.montantAccordeCentimes)
    : null;
}

/** Lit ce que le devis ne porte pas. Hors transaction : Prisma charge les relations en parallèle. */
async function lireFaits(acteur: UtilisateurConnecte, dossier: DossierLu): Promise<FaitsDevis> {
  const client = base(acteur);
  const [fiche, chiffre, centre, praticien, prescription, delivrances, pec] = await Promise.all([
    lireFiche(client, acteur, dossier.patientId, { accesVerifie: true }),
    client.dossier.findUniqueOrThrow({
      where: { id: dossier.id },
      select: { surdicecite: true },
    }),
    client.centre.findUniqueOrThrow({ where: { id: dossier.centreId }, select: selectionCentre }),
    client.praticien.findUniqueOrThrow({
      where: { id: dossier.praticienId },
      select: { rpps: true, utilisateur: { select: { prenom: true, nom: true } } },
    }),
    client.prescription.findFirst({
      where: { dossierId: dossier.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        datePrescription: true,
        prescripteur: { select: { specialite: true, formationOtologie: true } },
      },
    }),
    client.delivrance.findMany({
      where: {
        patientId: dossier.patientId,
        organisationId: acteur.organisationId,
        annuleeLe: null,
      },
      select: { oreille: true, dateDelivrance: true },
    }),
    lirePecAccordee(client, dossier.id),
  ]);
  return {
    fiche,
    centre,
    // La C2S a sa propre part AMC : la facture ignore aussi la PEC (R13).
    pecAccordee: fiche.c2s ? null : pec,
    praticien: {
      prenomNom: `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
      identifiant: praticien.rpps,
    },
    contexte: {
      dateNaissance: fiche.dateNaissance,
      c2s: fiche.c2s,
      surdicecite: chiffre.surdicecite === 'OUI',
      prescription: prescription && {
        prescripteur: prescription.prescripteur,
        datePrescription: depuisDate(prescription.datePrescription),
      },
      oreilles: oreillesDuDossier(dossier),
      historiqueDelivrances: delivrances.map((d) => ({
        oreille: d.oreille,
        dateDelivrance: depuisDate(d.dateDelivrance),
      })),
      entreprise: {
        raisonSociale: centre.raisonSociale,
        siret: centre.siret,
        rcs: centre.rcs,
        finess: centre.finess,
        tvaIntracommunautaire: centre.tvaIntracommunautaire,
      },
    },
  };
}

function versDonnees(devis: DevisLu, offres: readonly OffreDonnees[], jour: string): DevisDonnees {
  return {
    dateDevis: jour,
    dateFinValidite: ajouterMois(jour, devis.validiteMois),
    refusOffreC2S: devis.refusOffreC2S,
    contratResponsable: devis.contratResponsable,
    tauxAMO: devis.tauxAmo,
    bobineTPresentee: devis.bobineTPresentee,
    ficheTechniqueJointe: devis.ficheTechniqueJointe,
    datePrecedentDroite: devis.datePrecedentDroite && depuisDate(devis.datePrecedentDroite),
    datePrecedentGauche: devis.datePrecedentGauche && depuisDate(devis.datePrecedentGauche),
    offres,
  };
}

interface Evaluation {
  readonly donnees: DevisDonnees;
  readonly tarifs: TarifsAudio;
  readonly calcul: DevisCalcule;
  readonly controle: ResultatControleDevis;
}

/** Contrôle et calcule un devis à une date d'émission ; `null` si la base LPP ne couvre pas la date. */
async function evaluer(
  devis: DevisLu,
  faits: FaitsDevis,
  jour: string,
): Promise<Evaluation | null> {
  const offresSaisies = devis.offres.map(versOffre);
  const dateDelivrancePrevue = premiereDelivrancePossible(jour);
  const tarifs = await tarifsAudioEnVigueur(dateDelivrancePrevue);
  if (tarifs === null) {
    return null;
  }
  const codes = offresSaisies.flatMap((o) =>
    o.consommables.flatMap((c) => (c.codeLpp ? [c.codeLpp] : [])),
  );
  const tarifsConsommables = await tarifsConsommablesEnVigueur(codes, dateDelivrancePrevue);
  const { dateNaissance, c2s, surdicecite } = faits.contexte;
  const calculer = (offres: readonly OffreDonnees[]) =>
    calculerDevis(
      offres,
      {
        dateNaissance,
        dateDelivrancePrevue,
        c2s,
        refusOffreC2S: devis.refusOffreC2S,
        surdicecite,
        tauxAMO: devis.tauxAmo,
      },
      tarifs,
      tarifsConsommables,
    );
  const { pecAccordee } = faits;
  const premierCalcul = calculer(offresSaisies);
  const offres =
    pecAccordee === null
      ? offresSaisies
      : offresSaisies.map((offre, rang) => ({
          ...offre,
          ...amcDepuisPec(pecAccordee, premierCalcul.offres[rang] as OffreCalculee),
        }));
  const donnees = versDonnees(devis, offres, jour);
  return {
    donnees,
    tarifs,
    calcul: pecAccordee === null ? premierCalcul : calculer(offres),
    controle: controlerDevis(donnees, faits.contexte, tarifs),
  };
}

function numeroAffiche({ numero, version }: Pick<DevisLu, 'numero' | 'version'>): string {
  return `${numero} v${String(version)}`;
}

function versVue(
  devis: DevisLu,
  faits: FaitsDevis,
  evaluation: Evaluation,
  jour: string,
): VueDevis {
  const { fiche, centre, praticien, contexte } = faits;
  if (fiche.amo === null) {
    throw new ErreurSaisie({}, 'Renseigner la couverture AMO du patient : le devis exige son NIR.');
  }
  const { donnees, calcul } = evaluation;
  const oreille = (cible: Oreille, datePrecedent: string | null) => ({
    type: contexte.oreilles.find((o) => o.oreille === cible)?.type ?? null,
    datePrecedent,
  });
  return {
    entreprise: {
      nom: [centre.raisonSociale, centre.nom].filter(Boolean).join(' – '),
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
    },
    audioprothesiste: praticien,
    patient: {
      prenomNom: `${fiche.prenoms} ${fiche.nomUsage ?? fiche.nomNaissance}`,
      nir: fiche.amo.nir,
      organismeComplementaire: fiche.amc?.organismeNom ?? null,
    },
    datePrescription: contexte.prescription?.datePrescription ?? null,
    numero: numeroAffiche(devis),
    dateEmission: jour,
    lieuEmission: devis.lieuEmission,
    dateFinValidite: donnees.dateFinValidite,
    oreilles: {
      DROITE: oreille('DROITE', donnees.datePrecedentDroite),
      GAUCHE: oreille('GAUCHE', donnees.datePrecedentGauche),
    },
    c2s: contexte.c2s,
    bobineTPresentee: devis.bobineTPresentee,
    depotGarantie: montantOuNull(devis.depotGarantieCentimes),
    offres: donnees.offres,
    calcul,
  };
}

// --- Émission -------------------------------------------------------------------------------------

/**
 * Contrôle puis fige le devis. Le PDF est rendu et déposé hors transaction ; si elle échoue ensuite,
 * l'objet déposé est retiré. La version en vigueur passe à REMPLACE dans la même transaction.
 */
export async function emettreDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutEmettreDevis(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { statutAttendu } = valider(actionDevisSaisieSchema, saisie);
  const { devis, dossier: dossierLu } = await lireDevis(base(acteur), acteur, devisId);
  exigerStatut(devis, statutAttendu);
  if (!devisModifiable(devis.statut)) {
    throw new ErreurSaisie({}, 'Ce devis est déjà émis.');
  }
  if (!dossierAccepteDevis(dossierLu.statut)) {
    throw new ErreurSaisie({}, 'Ce dossier n’accepte pas de devis à ce stade.');
  }
  const jour = aujourdhui();
  const faits = await lireFaits(acteur, dossierLu);
  const evaluation = await evaluer(devis, faits, jour);
  if (evaluation === null) {
    throw new ErreurSaisie({}, MESSAGE_TARIFS_ABSENTS);
  }
  if (evaluation.controle.erreurs.length > 0) {
    throw new ErreurDevisBloque(evaluation.controle);
  }
  const vue = versVue(devis, faits, evaluation, jour);
  const pdf = await rendeurPdf().rendre(rendreDevisHtml(vue));
  const pdfCle = `devis/${randomUUID()}`;
  await documents().put(pdfCle, pdf, 'application/pdf');
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const dossier = await lireDossier(tx, acteur, dossierLu.id);
        if (dossier.statut !== dossierLu.statut) {
          throw new ErreurConflitDossier();
        }
        await tx.devis.updateMany({
          where: { dossierId: dossier.id, statut: { in: ['EMIS', 'SIGNE'] } },
          data: { statut: 'REMPLACE' },
        });
        // Verrou de la ligne : le perdant d'une concurrence échoue ici, avant le trigger de gel des offres.
        const verrou = await tx.devis.updateMany({
          where: { id: devisId, statut: 'BROUILLON', updatedAt: devis.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (verrou.count !== 1) {
          throw new ErreurConflitDossier();
        }
        for (const offre of evaluation.donnees.offres) {
          await tx.devisOffre.updateMany({
            where: { devisId, rubrique: offre.rubrique },
            data: {
              amcDroiteCentimes: offre.amcDroite,
              amcGaucheCentimes: offre.amcGauche,
              amcConsommablesCentimes: offre.amcConsommables,
            },
          });
        }
        const { count } = await tx.devis.updateMany({
          where: { id: devisId, statut: 'BROUILLON' },
          data: {
            statut: 'EMIS',
            dateEmission: versDate(jour),
            dateFinValidite: versDate(evaluation.donnees.dateFinValidite),
            pdfCle,
            pdfTaille: pdf.length,
            totaux: devisCalculeSchema.parse(evaluation.calcul),
            controles: {
              avertissements: z.array(constatSchema).parse(evaluation.controle.avertissements),
            },
            emisParId: acteur.id,
          },
        });
        if (count !== 1) {
          throw new ErreurConflitDossier();
        }
        const vers = statutDossierApresEmission(dossier.statut);
        if (vers !== null) {
          await appliquerTransition(tx, acteur, dossier, vers);
        } else {
          // Prend le verrou de la ligne : une signature ou un abandon concurrent ne croise pas l'émission.
          const verrou = await tx.dossier.updateMany({
            where: { id: dossier.id, statut: dossier.statut },
            data: { updatedAt: new Date() },
          });
          if (verrou.count !== 1) {
            throw new ErreurConflitDossier();
          }
        }
        return { dossier, vers };
      },
      ({ dossier, vers }): EvenementAudit[] => [
        evenementDevis('UPDATE', devisId, dossier, {
          statutApres: 'EMIS',
          version: devis.version,
          avertissements: evaluation.controle.avertissements.map((a) => a.code),
        }),
        ...(vers === null ? [] : [evenementTransition(dossier, vers)]),
      ],
    );
  } catch (erreur) {
    await documents()
      .delete(pdfCle)
      .catch(() => undefined);
    throw erreur;
  }
}

export interface DocumentDevis {
  contenu: Uint8Array;
  type: TypeDocument;
  nomFichier: string;
}

/** Ouvre le PDF remis au patient : une ligne PRINT à chaque ouverture, il porte le NIR. */
export async function imprimerDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<DocumentDevis> {
  const { pdfCle, numero } = await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      if (devis.pdfCle === null) {
        throw new ErreurSaisie({}, 'Émettre le devis avant de l’imprimer.');
      }
      return {
        pdfCle: devis.pdfCle,
        numero: numeroAffiche(devis),
        dossier,
      };
    },
    ({ dossier, numero }) => evenementDevis('PRINT', devisId, dossier, { numero }),
  );
  return {
    contenu: await documents().get(pdfCle),
    type: 'application/pdf',
    nomFichier: `devis-${numero.replace(/\s+/g, '-')}.pdf`,
  };
}

// --- Essai et signature ---------------------------------------------------------------------------

function exigerOffre(devis: DevisLu, rubrique: RubriqueOffre, champ: string): void {
  if (!devis.offres.some((offre) => offre.rubrique === rubrique)) {
    throw ErreurSaisie.surChamp(champ, 'Cette offre ne figure pas au devis.');
  }
}

function offreDe(devis: DevisLu, rubrique: RubriqueOffre): OffreLue | undefined {
  return devis.offres.find((offre) => offre.rubrique === rubrique);
}

/** Modèle prévu par l'offre pour chaque oreille appareillée. */
function modelesDeLOffre(offre: OffreLue | undefined): Partial<Record<Oreille, string>> {
  const modeles: Partial<Record<Oreille, string>> = {};
  for (const { oreille, modeleId } of offre?.lignes ?? []) {
    if (oreille !== null && modeleId !== null) {
      modeles[oreille] = modeleId;
    }
  }
  return modeles;
}

/**
 * Passe le dossier en essai avec l'offre retenue (modèle p. 2 § 3) et confie un appareil par oreille :
 * le modèle est celui de la ligne de l'offre, pris dans le stock du centre du dossier.
 */
export async function demarrerEssai(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<void> {
  const { statutAttendu, offreEssai, numeroSerieDroite, numeroSerieGauche } = valider(
    debutEssaiSaisieSchema,
    saisie,
  );
  const numeros = { DROITE: numeroSerieDroite, GAUCHE: numeroSerieGauche };
  const champs = { DROITE: 'numeroSerieDroite', GAUCHE: 'numeroSerieGauche' } as const;
  const jour = aujourdhui();
  await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      exigerStatut(devis, statutAttendu);
      exigerOffre(devis, offreEssai, 'offreEssai');
      if (devis.statut !== 'EMIS' || dossier.statut !== 'DEVIS_EMIS') {
        throw new ErreurSaisie({}, 'L’essai démarre sur un devis émis.');
      }
      const { count } = await tx.devis.updateMany({
        where: { id: devisId, statut: 'EMIS' },
        data: { offreEssai },
      });
      if (count !== 1) {
        throw new ErreurConflitDossier();
      }
      await appliquerTransition(tx, acteur, dossier, 'EN_ESSAI');
      const essai = await tx.essai.create({
        data: {
          organisationId: acteur.organisationId,
          dossierId: dossier.id,
          dateDebut: versDate(jour),
          createdById: acteur.id,
        },
        select: { id: true },
      });
      const modeles = modelesDeLOffre(offreDe(devis, offreEssai));
      const evenements: EvenementAudit[] = [];
      for (const { oreille } of oreillesDuDossier(dossier)) {
        const numeroSerie = numeros[oreille];
        const modeleAttendu = modeles[oreille];
        if (numeroSerie === null) {
          throw ErreurSaisie.surChamp(champs[oreille], 'Saisir le numéro de série.');
        }
        if (modeleAttendu === undefined) {
          throw ErreurSaisie.surChamp('offreEssai', 'Cette offre ne couvre pas cette oreille.');
        }
        evenements.push(
          await poserAppareil(tx, acteur, dossier, {
            essaiId: essai.id,
            oreille,
            numeroSerie,
            modeleAttendu,
            champ: champs[oreille],
            jour,
            motif: 'Mise en essai',
          }),
        );
      }
      return { dossier, essaiId: essai.id, evenements };
    },
    ({ dossier, essaiId, evenements }): EvenementAudit[] => [
      evenementDevis('UPDATE', devisId, dossier, { offreEssai }),
      evenementTransition(dossier, 'EN_ESSAI'),
      evenementEssai('CREATE', essaiId, dossier),
      ...evenements,
    ],
  );
}

function exigerSignaturePossible(devis: DevisLu, dossier: DossierLu): void {
  if (devis.statut !== 'EMIS' || dossier.statut !== 'EN_ESSAI') {
    throw new ErreurSaisie(
      {},
      'La signature se recueille à l’issue de l’essai, sur un devis émis.',
    );
  }
}

/** Dépose le devis signé scanné, ouvert aux assistantes. Un nouveau dépôt remplace le précédent. */
export async function deposerScanDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
  scan: Uint8Array,
): Promise<void> {
  const { statutAttendu } = valider(actionDevisSaisieSchema, saisie);
  const document = verifierDocument(scan, 'Joindre le devis signé scanné.');
  if (!document.valide) {
    throw ErreurSaisie.surChamp('scan', document.message);
  }
  const lu = await lireDevis(base(acteur), acteur, devisId);
  exigerStatut(lu.devis, statutAttendu);
  exigerSignaturePossible(lu.devis, lu.dossier);
  const scanCle = `devis-signes/${randomUUID()}`;
  await documents().put(scanCle, scan, document.type);
  try {
    const { ancienneCle } = await withAudit(
      acteur,
      async (tx) => {
        const { devis, dossier } = await lireDevis(tx, acteur, devisId);
        exigerStatut(devis, statutAttendu);
        exigerSignaturePossible(devis, dossier);
        const { count } = await tx.devis.updateMany({
          where: { id: devisId, statut: 'EMIS', scanSigneCle: devis.scanSigneCle },
          data: {
            scanSigneCle: scanCle,
            scanSigneType: document.type,
            scanSigneTaille: scan.length,
          },
        });
        if (count !== 1) {
          throw new ErreurConflitDossier();
        }
        return { ancienneCle: devis.scanSigneCle, dossier };
      },
      ({ dossier }) => evenementDevis('UPDATE', devisId, dossier, { document: 'SCAN_SIGNE' }),
    );
    if (ancienneCle !== null) {
      await documents()
        .delete(ancienneCle)
        .catch(() => undefined);
    }
  } catch (erreur) {
    await documents()
      .delete(scanCle)
      .catch(() => undefined);
    throw erreur;
  }
}

interface SignatureDemandee {
  readonly statutAttendu: StatutDevis;
  readonly offreRetenue: RubriqueOffre;
  readonly dateSignature: string;
}

/** Contrôles communs au scan et à l'écran. Rejoués dans la transaction : ils portent sur l'état du moment. */
async function verifierSignable(
  client: Client,
  acteur: UtilisateurConnecte,
  devisId: string,
  { statutAttendu, offreRetenue, dateSignature }: SignatureDemandee,
  jour: string,
  scanExige: boolean,
): Promise<{ devis: DevisLu; dossier: DossierLu }> {
  const { devis, dossier } = await lireDevis(client, acteur, devisId);
  exigerStatut(devis, statutAttendu);
  exigerSignaturePossible(devis, dossier);
  exigerOffre(devis, offreRetenue, 'offreRetenue');
  const essai = await lireEssaiOuvert(client, dossier.id);
  const { dateEmission, dateFinValidite } = devis;
  if (scanExige && devis.scanSigneCle === null) {
    throw ErreurSaisie.surChamp('scan', 'Déposer d’abord le devis signé scanné.');
  }
  if (dateFinValidite === null || devisEchu(depuisDate(dateFinValidite), jour)) {
    throw new ErreurSaisie({}, 'Ce devis est échu : en émettre une nouvelle version.');
  }
  if (dateSignature > jour || (dateEmission !== null && dateSignature < depuisDate(dateEmission))) {
    throw ErreurSaisie.surChamp(
      'dateSignature',
      'La date de signature doit se situer entre l’émission et aujourd’hui.',
    );
  }
  const blocages = blocagesSignature({
    etat: essai && (await etatDeLEssai(client, essai, dateSignature)),
    appareils: essai ? await appareilsActifs(client, essai.id) : [],
    modelesOffre: modelesDeLOffre(offreDe(devis, offreRetenue)),
  });
  if (blocages.length > 0) {
    throw new ErreurSaisie({}, blocages.map((c) => MESSAGES_BLOCAGE_SIGNATURE[c]).join(' '));
  }
  return { devis, dossier };
}

interface DocumentSigne {
  readonly mode: 'SCAN' | 'ELECTRONIQUE';
  readonly scanCle: string | null;
  readonly scanType: string | null;
  readonly scanTaille: number | null;
  readonly preuve?: Prisma.InputJsonValue;
}

async function figerSignature(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  devisId: string,
  dossier: DossierLu,
  { offreRetenue, dateSignature }: SignatureDemandee,
  { mode, scanCle, scanType, scanTaille, preuve }: DocumentSigne,
): Promise<void> {
  const { count } = await tx.devis.updateMany({
    where: { id: devisId, statut: 'EMIS' },
    data: {
      statut: 'SIGNE',
      offreRetenue,
      scanSigneCle: scanCle,
      scanSigneType: scanType,
      scanSigneTaille: scanTaille,
    },
  });
  if (count !== 1) {
    throw new ErreurConflitDossier();
  }
  await tx.signatureDevis.create({
    data: {
      devisId,
      mode,
      dateSignature: versDate(dateSignature),
      saisieParId: acteur.id,
      scanCle,
      scanType,
      scanTaille,
      ...(preuve === undefined ? {} : { preuve }),
    },
  });
  await appliquerTransition(tx, acteur, dossier, 'DEVIS_SIGNE');
}

function evenementsSignature(
  devisId: string,
  dossier: DossierLu,
  offreRetenue: RubriqueOffre,
  mode: DocumentSigne['mode'],
): EvenementAudit[] {
  return [
    evenementDevis('UPDATE', devisId, dossier, { statutApres: 'SIGNE', offreRetenue, mode }),
    evenementTransition(dossier, 'DEVIS_SIGNE'),
  ];
}

/** Fige le devis signé : case « signé », offre retenue (§ 5) et scan déjà déposé. */
export async function enregistrerSignature(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutEnregistrerSignature(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(signatureDevisSaisieSchema, saisie);
  const jour = aujourdhui();
  await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await verifierSignable(tx, acteur, devisId, donnees, jour, true);
      await figerSignature(tx, acteur, devisId, dossier, donnees, {
        mode: 'SCAN',
        scanCle: devis.scanSigneCle,
        scanType: devis.scanSigneType,
        scanTaille: devis.scanSigneTaille,
      });
      return dossier;
    },
    (dossier) => evenementsSignature(devisId, dossier, donnees.offreRetenue, 'SCAN'),
  );
}

function empreinte(contenu: Uint8Array): string {
  return createHash('sha256').update(contenu).digest('hex');
}

const preuveArchiveeSchema = z.object({ preuveCle: z.string() });

/**
 * Signature recueillie à l'écran, le jour même. Le PDF remis au patient reste intact : son empreinte entre dans
 * la preuve, et la feuille de signature s'ajoute à sa suite. Les deux documents sont déposés hors transaction ;
 * si elle échoue, ils sont retirés. Un scan déposé auparavant est remplacé.
 */
export async function signerDevisSurEcran(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
  trace: Uint8Array,
): Promise<void> {
  if (!peutEnregistrerSignature(acteur.role)) {
    throw new AccesRefuseError();
  }
  if (!signatureEcranDisponible()) {
    throw new ErreurSaisie({}, 'La signature à l’écran n’est pas disponible : déposer le scan.');
  }
  const donnees = valider(signatureEcranSaisieSchema, saisie);
  const document = verifierDocument(trace, 'Le patient doit signer dans le cadre.');
  if (!document.valide || document.type !== 'image/png') {
    throw ErreurSaisie.surChamp('trace', document.valide ? 'Tracé illisible.' : document.message);
  }
  const jour = aujourdhui();
  const demande = { ...donnees, dateSignature: jour };
  const { devis, dossier: dossierLu } = await verifierSignable(
    base(acteur),
    acteur,
    devisId,
    demande,
    jour,
    false,
  );
  const pdfCle = devis.pdfCle as string;
  const pdfEmis = await documents().get(pdfCle);
  const preuve: PreuveSignature = await eSignature().signer({
    empreinteDocument: empreinte(pdfEmis),
    trace,
    horodatage: horloge.now(),
  });
  const { fiche, praticien } = await lireFaits(acteur, dossierLu);
  const feuille = await rendeurPdf().rendre(
    rendreFeuilleSignatureHtml({
      numero: numeroAffiche(devis),
      audioprothesiste: praticien.prenomNom,
      patient: `${fiche.prenoms} ${fiche.nomUsage ?? fiche.nomNaissance}`,
      offreRetenue: LIBELLES_RUBRIQUES_OFFRE[donnees.offreRetenue],
      dateSignature: jour,
      traceBase64: Buffer.from(trace).toString('base64'),
      empreinteDocument: preuve.empreinteDocument,
      referencePreuve: preuve.reference,
    }),
  );
  const signe = await rendeurPdf().assembler([pdfEmis, feuille]);
  const scanCle = `devis-signes/${randomUUID()}`;
  const preuveCle = `devis-preuves/${randomUUID()}`;
  const preuveEnregistree = { ...preuve, empreinteDocumentSigne: empreinte(signe), preuveCle };
  await documents().put(scanCle, signe, 'application/pdf');
  await documents().put(
    preuveCle,
    new TextEncoder().encode(JSON.stringify(preuveEnregistree)),
    'application/json',
  );
  try {
    const { ancienneCle } = await withAudit(
      acteur,
      async (tx) => {
        const lu = await verifierSignable(tx, acteur, devisId, demande, jour, false);
        await figerSignature(tx, acteur, devisId, lu.dossier, demande, {
          mode: 'ELECTRONIQUE',
          scanCle,
          scanType: 'application/pdf',
          scanTaille: signe.length,
          preuve: preuveEnregistree,
        });
        return { dossier: lu.dossier, ancienneCle: lu.devis.scanSigneCle };
      },
      ({ dossier }) => evenementsSignature(devisId, dossier, donnees.offreRetenue, 'ELECTRONIQUE'),
    );
    if (ancienneCle !== null) {
      await documents()
        .delete(ancienneCle)
        .catch(() => undefined);
    }
  } catch (erreur) {
    await Promise.all(
      [scanCle, preuveCle].map((cle) =>
        documents()
          .delete(cle)
          .catch(() => undefined),
      ),
    );
    throw erreur;
  }
}

/** Ouvre la preuve d'une signature à l'écran : une ligne READ. */
export async function lirePreuveSignature(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<DocumentPreuve> {
  const { preuveCle } = await withAudit(
    acteur,
    async (tx) => {
      const { dossier } = await lireDevis(tx, acteur, devisId);
      const signature = await tx.signatureDevis.findUnique({
        where: { devisId },
        select: { preuve: true },
      });
      if (!signature?.preuve) {
        throw new AccesRefuseError();
      }
      return { ...preuveArchiveeSchema.parse(signature.preuve), dossier };
    },
    ({ dossier }) => evenementDevis('READ', devisId, dossier, { document: 'PREUVE_SIGNATURE' }),
  );
  return { contenu: await documents().get(preuveCle), nomFichier: 'preuve-signature.json' };
}

export interface DocumentPreuve {
  contenu: Uint8Array;
  nomFichier: string;
}

/** Ouvre le devis signé scanné : une ligne READ, le nom d'origine n'étant pas conservé. */
export async function lireScanDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<DocumentDevis> {
  const { scanSigneCle, scanSigneType } = await withAudit(
    acteur,
    async (tx) => {
      const { devis, dossier } = await lireDevis(tx, acteur, devisId);
      if (devis.scanSigneCle === null) {
        throw new AccesRefuseError();
      }
      return { scanSigneCle: devis.scanSigneCle, scanSigneType: devis.scanSigneType, dossier };
    },
    ({ dossier }) => evenementDevis('READ', devisId, dossier, { document: 'SCAN_SIGNE' }),
  );
  const type = z.enum(TYPES_DOCUMENT).parse(scanSigneType);
  return {
    contenu: await documents().get(scanSigneCle),
    type,
    nomFichier: `devis-signe.${extensionDocument(type)}`,
  };
}

// --- Écrans ---------------------------------------------------------------------------------------

export interface DevisResume {
  id: string;
  numero: string;
  version: number;
  statut: StatutDevis;
  dateEmission: string | null;
  dateFinValidite: string | null;
}

/** Versions du devis, la plus récente d'abord. Le dossier est déjà ouvert et journalisé par l'appelant. */
export async function listerDevisDuDossier(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<DevisResume[]> {
  const client = base(acteur);
  await lireDossier(client, acteur, dossierId);
  const lignes = await client.devis.findMany({
    where: { dossierId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      numero: true,
      version: true,
      statut: true,
      dateEmission: true,
      dateFinValidite: true,
    },
  });
  return lignes.map(({ dateEmission, dateFinValidite, ...reste }) => ({
    ...reste,
    dateEmission: dateEmission && depuisDate(dateEmission),
    dateFinValidite: dateFinValidite && depuisDate(dateFinValidite),
  }));
}

const controlesEmisSchema = z.object({ avertissements: z.array(constatSchema) });

export interface DevisDetail extends DevisResume {
  dossierId: string;
  patientId: string;
  statutDossier: StatutDossier;
  oreilles: readonly Oreille[];
  numeroAffiche: string;
  lieuEmission: string;
  validiteMois: number;
  tauxAmo: number;
  refusOffreC2S: boolean;
  contratResponsable: boolean;
  bobineTPresentee: boolean;
  ficheTechniqueJointe: boolean;
  depotGarantieCentimes: number | null;
  datePrecedentDroite: string | null;
  datePrecedentGauche: string | null;
  offreEssai: RubriqueOffre | null;
  offreRetenue: RubriqueOffre | null;
  scanDepose: boolean;
  signature: { dateSignature: string; saisiePar: string; electronique: boolean } | null;
  /** Canaux où le patient peut recevoir un lien. */
  canauxPatient: readonly CanalNotification[];
  /** Montant de la PEC accordée sur ce dossier. */
  pecAccordeeCentimes: number | null;
  /** Devis émis dont la part AMC ne reflète pas la PEC : une nouvelle version la reprendrait. */
  pecDifferente: boolean;
  offres: readonly OffreDonnees[];
  /** `null` si le brouillon ne peut pas être calculé (base LPP absente à la date). */
  calcul: DevisCalcule | null;
  erreurs: readonly Constat[];
  avertissements: readonly Constat[];
  tarifsAbsents: boolean;
  /** Actions offertes à cet utilisateur. */
  actions: {
    modifier: boolean;
    emettre: boolean;
    imprimer: boolean;
    demarrerEssai: boolean;
    deposerScan: boolean;
    envoyer: boolean;
    signer: boolean;
    signerEcran: boolean;
    nouvelleVersion: boolean;
  };
}

/** Ouvre un devis : une ligne READ. Un brouillon est évalué à la date du jour, un devis émis garde ses montants. */
export async function obtenirDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<DevisDetail> {
  const client = base(acteur);
  const { devis, dossier } = await lireDevis(client, acteur, devisId);
  const signature = await client.signatureDevis.findUnique({
    where: { devisId },
    select: {
      dateSignature: true,
      mode: true,
      saisiePar: { select: { prenom: true, nom: true } },
    },
  });
  const brouillon = devisModifiable(devis.statut);
  const evaluation = brouillon
    ? await evaluer(devis, await lireFaits(acteur, dossier), aujourdhui())
    : null;
  const pecAccordee = await lirePecAccordee(client, dossier.id);
  const coordonnees = await client.patient.findUniqueOrThrow({
    where: { id: dossier.patientId },
    select: { telephone: true, email: true, consentementSms: true, consentementEmail: true },
  });
  const canauxPatient = canauxDisponibles(coordonnees);
  const envoiPossible =
    notifierDisponible() && (devis.statut === 'EMIS' || devis.statut === 'SIGNE');
  const calcul = brouillon ? (evaluation?.calcul ?? null) : devisCalculeSchema.parse(devis.totaux);
  const enVigueur = devis.statut === 'EMIS' && dossierAccepteDevis(dossier.statut);
  const emissible = peutEmettreDevis(acteur.role);
  const scanPossible = enVigueur && dossier.statut === 'EN_ESSAI';
  const detail: DevisDetail = {
    id: devis.id,
    numero: devis.numero,
    version: devis.version,
    statut: devis.statut,
    dateEmission: devis.dateEmission && depuisDate(devis.dateEmission),
    dateFinValidite: devis.dateFinValidite && depuisDate(devis.dateFinValidite),
    dossierId: dossier.id,
    patientId: dossier.patientId,
    statutDossier: dossier.statut,
    oreilles: oreillesDuDossier(dossier).map((o) => o.oreille),
    numeroAffiche: numeroAffiche(devis),
    lieuEmission: devis.lieuEmission,
    validiteMois: devis.validiteMois,
    tauxAmo: devis.tauxAmo,
    refusOffreC2S: devis.refusOffreC2S,
    contratResponsable: devis.contratResponsable,
    bobineTPresentee: devis.bobineTPresentee,
    ficheTechniqueJointe: devis.ficheTechniqueJointe,
    depotGarantieCentimes: devis.depotGarantieCentimes,
    datePrecedentDroite: devis.datePrecedentDroite && depuisDate(devis.datePrecedentDroite),
    datePrecedentGauche: devis.datePrecedentGauche && depuisDate(devis.datePrecedentGauche),
    offreEssai: devis.offreEssai,
    offreRetenue: devis.offreRetenue,
    scanDepose: devis.scanSigneCle !== null,
    signature: signature && {
      dateSignature: depuisDate(signature.dateSignature),
      saisiePar: `${signature.saisiePar.prenom} ${signature.saisiePar.nom}`,
      electronique: signature.mode === 'ELECTRONIQUE',
    },
    canauxPatient,
    pecAccordeeCentimes: pecAccordee,
    pecDifferente:
      devis.statut === 'EMIS' &&
      pecAccordee !== null &&
      calcul !== null &&
      pecDiffereDuDevis(pecAccordee, calcul.offres),
    offres: evaluation?.donnees.offres ?? devis.offres.map(versOffre),
    calcul,
    erreurs: evaluation?.controle.erreurs ?? [],
    avertissements: brouillon
      ? (evaluation?.controle.avertissements ?? [])
      : controlesEmisSchema.parse(devis.controles).avertissements,
    tarifsAbsents: brouillon && evaluation === null,
    actions: {
      modifier: brouillon && dossierAccepteDevis(dossier.statut),
      emettre: brouillon && emissible && dossierAccepteDevis(dossier.statut),
      imprimer: devis.pdfCle !== null,
      demarrerEssai: enVigueur && dossier.statut === 'DEVIS_EMIS',
      deposerScan: scanPossible,
      envoyer: envoiPossible && canauxPatient.length > 0,
      signer: scanPossible && peutEnregistrerSignature(acteur.role) && devis.scanSigneCle !== null,
      signerEcran:
        scanPossible && peutEnregistrerSignature(acteur.role) && signatureEcranDisponible(),
      nouvelleVersion: nouvelleVersionPossible(devis.statut) && dossierAccepteDevis(dossier.statut),
    },
  };
  await withAudit(acteur, async () => undefined, evenementDevis('READ', devisId, dossier));
  return detail;
}

export interface LignesCatalogueDevis {
  modeles: { rubrique: RubriqueOffre; modeles: Record<Oreille, string> }[];
  articles: Partial<Record<RubriqueOffre, string[]>>;
}

/** Identifiants catalogue des lignes d'un brouillon, pour rouvrir le formulaire. */
export async function lignesCatalogueDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<LignesCatalogueDevis> {
  const { devis } = await lireDevis(base(acteur), acteur, devisId);
  const idModele = (offre: OffreLue, oreille: Oreille) =>
    offre.lignes.find((l) => l.oreille === oreille)?.modeleId ?? '';
  return {
    modeles: devis.offres.map((offre) => ({
      rubrique: offre.rubrique,
      modeles: { DROITE: idModele(offre, 'DROITE'), GAUCHE: idModele(offre, 'GAUCHE') },
    })),
    articles: Object.fromEntries(
      devis.offres.map((offre) => [
        offre.rubrique,
        offre.lignes.flatMap((l) => (l.accessoireId === null ? [] : [l.accessoireId])),
      ]),
    ),
  };
}

export interface ModeleProposable {
  id: string;
  libelle: string;
  classe: ClasseLpp;
  prixConseilleCentimes: number;
}

export interface ArticleProposable {
  id: string;
  libelle: string;
  prixCentimes: number;
}

export interface DonneesFormulaireDevis {
  statutDossier: StatutDossier;
  oreilles: readonly Oreille[];
  c2s: boolean;
  lieuParDefaut: string;
  datePrecedentDroite: string | null;
  datePrecedentGauche: string | null;
  /** PEC accordée : les parts AMC ne se saisissent plus. */
  pecAccordeeCentimes: number | null;
  modeles: ModeleProposable[];
  articles: ArticleProposable[];
}

function dernierAppareillage(
  delivrances: readonly { oreille: Oreille; dateDelivrance: Date }[],
  oreille: Oreille,
): string | null {
  const dates = delivrances
    .filter((d) => d.oreille === oreille)
    .map((d) => depuisDate(d.dateDelivrance))
    .sort();
  return dates.at(-1) ?? null;
}

/** Catalogue actif et préremplissage du formulaire ; la date du précédent appareillage vient de `Delivrance`. */
export async function donneesFormulaireDevis(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<DonneesFormulaireDevis> {
  const client = base(acteur);
  const dossier = await lireDossier(client, acteur, dossierId);
  const [modeles, articles, centre, couverture, delivrances] = await Promise.all([
    client.modeleAideAuditive.findMany({
      where: { organisationId: acteur.organisationId, actif: true },
      select: {
        id: true,
        gamme: true,
        nom: true,
        classe: true,
        prixConseilleCentimes: true,
        fabricant: { select: { nom: true } },
      },
      orderBy: [{ classe: 'asc' }, { gamme: 'asc' }, { nom: 'asc' }],
    }),
    client.accessoire.findMany({
      where: { organisationId: acteur.organisationId, actif: true },
      select: { id: true, nom: true, prixCentimes: true },
      orderBy: [{ nature: 'asc' }, { nom: 'asc' }],
    }),
    client.centre.findUniqueOrThrow({ where: { id: dossier.centreId }, select: { ville: true } }),
    client.couvertureAmo.findUnique({
      where: { patientId: dossier.patientId },
      select: { c2s: true },
    }),
    client.delivrance.findMany({
      where: {
        patientId: dossier.patientId,
        organisationId: acteur.organisationId,
        annuleeLe: null,
      },
      select: { oreille: true, dateDelivrance: true },
    }),
  ]);
  return {
    statutDossier: dossier.statut,
    oreilles: oreillesDuDossier(dossier).map((o) => o.oreille),
    c2s: couverture?.c2s ?? false,
    lieuParDefaut: centre.ville,
    pecAccordeeCentimes: await lirePecAccordee(client, dossierId),
    datePrecedentDroite: dernierAppareillage(delivrances, 'DROITE'),
    datePrecedentGauche: dernierAppareillage(delivrances, 'GAUCHE'),
    modeles: modeles.map((m) => ({
      id: m.id,
      libelle: `${m.fabricant.nom} ${m.gamme} ${m.nom}`,
      classe: m.classe,
      prixConseilleCentimes: m.prixConseilleCentimes,
    })),
    articles: articles.map((a) => ({ id: a.id, libelle: a.nom, prixCentimes: a.prixCentimes })),
  };
}
