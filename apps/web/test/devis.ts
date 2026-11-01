import { prisma } from '@ha/db/admin';

import type { UtilisateurConnecte } from '@/server/auth/acces';
import { base } from '@/server/chiffrement';
import {
  creerDevis,
  demarrerEssai,
  deposerScanDevis,
  emettreDevis,
  enregistrerSignature,
} from '@/server/services/devis';
import { creerDossier, enregistrerPrescription } from '@/server/services/dossiers';
import { confirmerAchat, enregistrerCompteRendu } from '@/server/services/essais';
import { aujourdhui } from '@/server/services/patients';

import type { JeuDeDonnees } from './donnees';

// Jeu de données fictif du parcours devis et essai.

export const SCAN = Buffer.from('%PDF-1.7 document fictif', 'utf8');
export const NIR = '150037500000042';
const CODE_PILES = '2332976';

export interface CatalogueDevis {
  classeI: string;
  classeII: string;
  piles: string;
  kit: string;
}

export async function creerCatalogueDevis(d: JeuDeDonnees): Promise<CatalogueDevis> {
  const fabricant = await prisma().fabricant.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Acoustia Démo',
      adresse: '1 rue de l’Exemple, 75000 Paris',
    },
  });
  const fiche = {
    organisationId: d.organisation.id,
    fabricantId: fabricant.id,
    gamme: 'Aurore',
    type: 'CONTOUR',
    prixConseilleCentimes: 95_000,
    marque: 'Acoustia',
    referenceCommerciale: 'AU-1',
    nombreCanaux: 12,
    connectivite: 'Bluetooth',
    antiLarsen: true,
    reducteurAcouphenes: true,
    bobineT: true,
  } as const;
  const [i, ii, p, k] = await Promise.all([
    prisma().modeleAideAuditive.create({
      data: {
        ...fiche,
        nom: 'Essentiel',
        classe: 'CLASSE_I',
        options: ['REDUCTEUR_ACOUPHENE', 'CONNECTIVITE_SANS_FIL', 'REDUCTEUR_BRUIT_VENT'],
      },
    }),
    prisma().modeleAideAuditive.create({ data: { ...fiche, nom: 'Premium', classe: 'CLASSE_II' } }),
    prisma().accessoire.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Piles 13',
        nature: 'PILE',
        codeLpp: CODE_PILES,
        prixCentimes: 150,
        marque: 'Rayonac',
        referenceCommerciale: 'RAY-13',
      },
    }),
    prisma().accessoire.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Kit d’entretien',
        nature: 'ACCESSOIRE',
        prixCentimes: 1_500,
        marque: 'Acoustia',
        referenceCommerciale: 'KIT-1',
      },
    }),
  ]);
  return { classeI: i.id, classeII: ii.id, piles: p.id, kit: k.id };
}

export async function creerPatientDevis(
  d: JeuDeDonnees,
  surcharge: { dateNaissance?: string; c2s?: boolean } = {},
): Promise<string> {
  const { dateNaissance = '1950-03-15', c2s = false } = surcharge;
  const patient = await prisma().patient.create({
    data: {
      organisationId: d.organisation.id,
      centreId: d.centres.a.id,
      civilite: 'MME',
      nomNaissance: 'Essai',
      prenoms: 'Camille',
      dateNaissance: new Date(`${dateNaissance}T00:00:00.000Z`),
      sexe: 'FEMININ',
      nomNaissanceRecherche: 'ESSAI',
      prenomsRecherche: 'CAMILLE',
    },
  });
  await base({ organisationId: d.organisation.id }).couvertureAmo.create({
    data: {
      patientId: patient.id,
      nir: NIR,
      nirEmpreinte: patient.id.replace(/-/g, '').padEnd(64, '0').slice(0, 64),
      rangNaissance: 1,
      qualite: 'ASSURE',
      c2s,
      ald: 'NON',
      origine: 'SAISIE',
    },
  });
  return patient.id;
}

export async function creerDossierPret(
  d: JeuDeDonnees,
  audio: UtilisateurConnecte,
  patientId: string,
  oreilles: 'DROITE' | 'LES_DEUX' = 'DROITE',
): Promise<string> {
  const dossier = await creerDossier(audio, patientId, {
    centreId: d.centres.a.id,
    praticienId: d.praticiens.praticienAB.id,
    oreilles,
    typeDroite: 'PRIMO',
    typeGauche: oreilles === 'LES_DEUX' ? 'PRIMO' : '',
    surdicecite: false,
  });
  const prescripteur = await prisma().prescripteur.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Démo',
      prenom: 'Agathe',
      specialite: 'ORL',
      nomRecherche: 'DEMO',
      prenomRecherche: 'AGATHE',
    },
  });
  await enregistrerPrescription(
    audio,
    dossier,
    {
      prescripteurId: prescripteur.id,
      datePrescription: aujourdhui(),
      oreilles,
      mentionRenouvellement: false,
      statutAttendu: 'BROUILLON',
      forcer: false,
      motifForcage: '',
    },
    SCAN,
  );
  return dossier;
}

export function offre100(catalogue: CatalogueDevis, surcharge: Record<string, unknown> = {}) {
  return {
    rubrique: 'OFFRE_100_SANTE',
    aideDroite: { modeleId: catalogue.classeI, prixAvantRemise: '950,00', prix: '950,00' },
    aideGauche: null,
    consommables: [
      { accessoireId: catalogue.piles, quantite: 4, prixAvantRemise: '1,50', prix: '1,50' },
    ],
    amcDroite: '710,00',
    amcGauche: null,
    amcConsommables: '2,40',
    ...surcharge,
  };
}

export function autreOffre(catalogue: CatalogueDevis) {
  return {
    rubrique: 'AUTRE_OFFRE',
    aideDroite: { modeleId: catalogue.classeII, prixAvantRemise: '1 900,00', prix: '1 800,00' },
    aideGauche: null,
    consommables: [
      { accessoireId: catalogue.kit, quantite: 1, prixAvantRemise: '15,00', prix: '15,00' },
    ],
    amcDroite: null,
    amcGauche: null,
    amcConsommables: null,
  };
}

export function saisieDevis(catalogue: CatalogueDevis, surcharge: Record<string, unknown> = {}) {
  return {
    lieuEmission: 'Paris',
    validiteMois: 2,
    tauxAmo: 60,
    refusOffreC2S: false,
    contratResponsable: true,
    bobineTPresentee: true,
    ficheTechniqueJointe: true,
    depotGarantie: '',
    datePrecedentDroite: '',
    datePrecedentGauche: '',
    offres: [offre100(catalogue), autreOffre(catalogue)],
    statutAttendu: 'PRESCRIPTION_OK',
    ...surcharge,
  };
}

/** Appareil fictif déjà en stock, avec sa ligne de réception. */
export async function creerAppareil(
  d: JeuDeDonnees,
  modeleId: string,
  numeroSerie: string,
  centreId: string = d.centres.a.id,
): Promise<string> {
  const { fabricantId } = await prisma().modeleAideAuditive.findUniqueOrThrow({
    where: { id: modeleId },
    select: { fabricantId: true },
  });
  const { id } = await prisma().appareil.create({
    data: {
      organisationId: d.organisation.id,
      modeleId,
      fabricantId,
      centreId,
      numeroSerie,
      dateReception: new Date('2026-01-05T00:00:00.000Z'),
      referenceBonLivraison: 'BL-TEST',
    },
  });
  await prisma().mouvementAppareil.create({
    data: {
      organisationId: d.organisation.id,
      appareilId: id,
      type: 'RECEPTION',
      utilisateurId: d.acteurs.admin.id,
      statutApres: 'EN_STOCK',
      centreApresId: centreId,
    },
  });
  return id;
}

let rangSerie = 0;

/** Démarre l'essai avec un appareil du bon modèle, créé pour l'occasion, sur l'oreille droite. */
export async function demarrerAvecAppareil(
  d: JeuDeDonnees,
  acteur: UtilisateurConnecte,
  devisId: string,
  modeleId: string,
  offreEssai: string = 'OFFRE_100_SANTE',
): Promise<string> {
  rangSerie += 1;
  const numeroSerie = `TEST${String(rangSerie).padStart(6, '0')}`;
  await creerAppareil(d, modeleId, numeroSerie);
  await demarrerEssai(acteur, devisId, {
    statutAttendu: 'EMIS',
    offreEssai,
    numeroSerieDroite: numeroSerie,
    numeroSerieGauche: '',
  });
  return numeroSerie;
}

/** Recule le début de l'essai : la durée ne s'obtient pas autrement dans un test. */
export async function vieillirEssai(dossierId: string, jours: number): Promise<void> {
  const debut = new Date(`${aujourdhui()}T00:00:00.000Z`);
  debut.setUTCDate(debut.getUTCDate() - jours);
  await prisma().essai.update({ where: { dossierId }, data: { dateDebut: debut } });
}

/** Rend la signature possible : 30 jours écoulés et 2 rendez-vous tenus. */
export async function terminerPeriodeEssai(
  audio: UtilisateurConnecte,
  dossierId: string,
): Promise<void> {
  await vieillirEssai(dossierId, 30);
  await tenirRdvEssai(audio, dossierId, 'POSE');
  await tenirRdvEssai(audio, dossierId, 'FIN_ESSAI');
}

let rangRdv = 0;

/** Rendez-vous d'essai du jour, déjà vu : créé directement, le statut se joue à l'agenda. */
export async function creerRdvVu(
  dossierId: string,
  nature: 'POSE' | 'CONTROLE' | 'FIN_ESSAI',
  statut: 'VU' | 'PLANIFIE' = 'VU',
  jour = aujourdhui(),
): Promise<string> {
  const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId } });
  const { organisationId } = dossier;
  const type =
    (await prisma().typeRdv.findFirst({ where: { organisationId, natureEssai: nature } })) ??
    (await prisma().typeRdv.create({
      data: {
        organisationId,
        nom: `Essai ${nature}`,
        dureeMinutes: 15,
        couleur: '#64748b',
        requierePraticien: true,
        requiereCabine: false,
        natureEssai: nature,
      },
    }));
  rangRdv += 1;
  const debut = new Date(`${jour}T08:00:00.000Z`).getTime() + (rangRdv % 40) * 15 * 60_000;
  const utilisateur = await prisma().praticien.findUniqueOrThrow({
    where: { id: dossier.praticienId },
    select: { utilisateurId: true },
  });
  const { id } = await prisma().rendezVous.create({
    data: {
      organisationId,
      centreId: dossier.centreId,
      typeRdvId: type.id,
      patientId: dossier.patientId,
      dossierId,
      praticienId: dossier.praticienId,
      debut: new Date(debut),
      fin: new Date(debut + 15 * 60_000),
      statut,
      origine: 'INTERNE',
      createdById: utilisateur.utilisateurId,
    },
  });
  return id;
}

/** Un rendez-vous d'essai tenu et son compte rendu. */
export async function tenirRdvEssai(
  acteur: UtilisateurConnecte,
  dossierId: string,
  nature: 'POSE' | 'CONTROLE' | 'FIN_ESSAI',
  compteRendu = 'Réglages fictifs',
): Promise<string> {
  const id = await creerRdvVu(dossierId, nature);
  await enregistrerCompteRendu(acteur, id, { compteRendu });
  return id;
}

/** Identification du centre A, exigée à l'émission du devis. */
export async function identifierCentreA(d: JeuDeDonnees): Promise<void> {
  await prisma().centre.update({
    where: { id: d.centres.a.id },
    data: {
      raisonSociale: 'Audition Démo SAS',
      siret: '00000000000000',
      rcs: 'RCS Démo 000 000 000',
      finess: '000000000',
      tvaIntracommunautaire: 'FR00000000000',
    },
  });
}

export interface Parcours {
  patient?: { dateNaissance?: string; c2s?: boolean };
  devis?: Record<string, unknown>;
}

/** Fait passer un dossier fictif de la prescription à l'achat. */
export async function dossierJusquAchat(
  d: JeuDeDonnees,
  audio: UtilisateurConnecte,
  catalogue: CatalogueDevis,
  { patient = {}, devis = {} }: Parcours = {},
) {
  const patientId = await creerPatientDevis(d, patient);
  const dossierId = await creerDossierPret(d, audio, patientId);
  const devisId = await creerDevis(audio, dossierId, saisieDevis(catalogue, devis));
  await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
  const numeroSerie = await demarrerAvecAppareil(d, audio, devisId, catalogue.classeI);
  await terminerPeriodeEssai(audio, dossierId);
  await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
  await enregistrerSignature(audio, devisId, {
    statutAttendu: 'EMIS',
    offreRetenue: 'OFFRE_100_SANTE',
    dateSignature: aujourdhui(),
    signe: true,
  });
  await confirmerAchat(audio, dossierId, { statutAttendu: 'DEVIS_SIGNE' });
  return { dossierId, devisId, patientId, numeroSerie };
}
