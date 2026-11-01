import { chargerTrousseau, ChiffreurAesGcm, HacheurSha256 } from '@ha/adapters';
import {
  calculerAvoir,
  centimes,
  chargePiece,
  EMPREINTE_INITIALE,
  enchainer,
  formaterNumero,
  MONTANTS_NULS,
  PREFIXE_SERIE_DEFAUT,
  preparerFacture,
  type ClientFacture,
  type ContenuFacture,
  type PieceAChainer,
  type TauxTvaDate,
  type TypeEvenementCaisse,
  type VendeurFacture,
} from '@ha/domain';

import type { PrismaClient } from '../src/generated/prisma/client';

// Une vente directe de piles validée et un avoir partiel fictifs, chaînés par les règles du domaine : la
// chaîne du centre Nord se vérifie comme une chaîne réelle. Aucun PDF : le seed ne touche pas au stockage.

const CONTEXTE_MOTIF = 'facture.motif';

/** Patient du seed, centre Nord, sans dossier à facturer. */
const PATIENT_VENTE = '019a3000-0000-7000-8000-000000000507';

const FACTURE_VENTE = '019a7000-0000-7000-8000-000000000020';
const AVOIR_VENTE = '019a7000-0000-7000-8000-000000000021';
const LIGNE_VENTE = '019a7000-0000-7000-8000-000000000022';
const LIGNE_AVOIR = '019a7000-0000-7000-8000-000000000023';

const PRIX_UNITAIRE = 450;
const QUANTITE = 2;
const REPRISE = 300;

interface Maillon {
  readonly rang: number;
  readonly empreinte: string;
}

function lignesEnBase(contenu: ContenuFacture, factureId: string, id: string) {
  return contenu.lignes.map((l, index) => ({
    id,
    factureId,
    rang: index + 1,
    nature: l.nature,
    libelle: l.libelle,
    codeLpp: l.codeLpp,
    codePrestation: l.codePrestation,
    accessoireId: l.accessoireId,
    quantite: l.quantite,
    prixUnitaireCentimes: l.prixUnitaire,
    prixTtcCentimes: l.prixTTC,
    tauxTva: l.tauxTva,
    montantHtCentimes: l.montantHT,
    montantTvaCentimes: l.montantTva,
    baseRemboursementCentimes: l.baseRemboursement,
    amoCentimes: l.amo,
    amcCentimes: l.amc,
    resteAChargeCentimes: l.resteACharge,
  }));
}

export async function seedFacturation(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
  utilisateurId: string,
): Promise<void> {
  const [existante, accessoire, centre, patient, taux] = await Promise.all([
    db.facture.findUnique({ where: { id: FACTURE_VENTE }, select: { id: true } }),
    db.accessoire.findFirst({ where: { organisationId, nature: 'PILE' } }),
    db.centre.findUniqueOrThrow({ where: { id: centreId } }),
    db.patient.findUniqueOrThrow({ where: { id: PATIENT_VENTE } }),
    db.tauxTva.findMany(),
  ]);
  if (existante || !accessoire) {
    return;
  }
  const jour = new Date().toISOString().slice(0, 10);
  const date = new Date(`${jour}T00:00:00.000Z`);
  const hacheur = new HacheurSha256();
  const vendeur: VendeurFacture = {
    raisonSociale: centre.raisonSociale,
    nomCentre: centre.nom,
    adresse: [centre.adresseLigne1, `${centre.codePostal} ${centre.ville}`],
    telephone: centre.telephone,
    email: centre.email,
    siret: centre.siret,
    rcs: centre.rcs,
    finess: centre.finess,
    tvaIntracommunautaire: centre.tvaIntracommunautaire,
  };
  const client: ClientFacture = {
    prenomNom: `${patient.prenoms} ${patient.nomUsage ?? patient.nomNaissance}`,
    adresse: [],
  };
  const contenu = preparerFacture({
    dateNaissance: patient.dateNaissance.toISOString().slice(0, 10),
    dateDelivrance: jour,
    c2s: false,
    surdicecite: false,
    tauxAMO: 0,
    aides: [],
    consommables: [
      {
        nature: 'PILE',
        libelle: accessoire.nom,
        quantite: QUANTITE,
        prixUnitaire: centimes(PRIX_UNITAIRE),
        codeLpp: null,
        accessoireId: accessoire.id,
        tarif: null,
      },
    ],
    montantAccorde: null,
    // Sans aide auditive, les tarifs ne servent pas.
    tarifs: {
      VINGT_ET_PLUS: { baseRemboursement: centimes(0), prixLimiteClasseI: centimes(0) },
      MOINS_DE_20: { baseRemboursement: centimes(0), prixLimiteClasseI: centimes(0) },
    },
    tauxTva: taux.map((t): TauxTvaDate => ({
      type: t.type,
      taux: t.taux,
      debut: t.debut.toISOString().slice(0, 10),
    })),
  });
  const [ligne] = contenu.lignes;
  if (!ligne || ligne.tauxTva === null) {
    return;
  }
  const avoir = calculerAvoir(
    [
      {
        ...ligne,
        id: LIGNE_VENTE,
        tauxTva: ligne.tauxTva,
        dejaAvoir: MONTANTS_NULS,
      },
    ],
    [{ ligneId: LIGNE_VENTE, montant: centimes(REPRISE) }],
  );
  if (!avoir.accepte) {
    return;
  }
  const [ligneAvoir] = avoir.lignes;
  if (!ligneAvoir) {
    return;
  }

  const piece = (
    id: string,
    nature: 'FACTURE' | 'AVOIR',
    numeroSequence: number,
    factureOrigineId: string | null,
  ): PieceAChainer => {
    const l = nature === 'FACTURE' ? ligne : ligneAvoir;
    return {
      id,
      nature,
      numero: formaterNumero(PREFIXE_SERIE_DEFAUT, numeroSequence),
      numeroSequence,
      dateFacture: jour,
      patientId: PATIENT_VENTE,
      dossierId: null,
      factureOrigineId,
      totaux: {
        prixTTC: l.prixTTC,
        ht: l.montantHT,
        tva: l.montantTva,
        amo: l.amo,
        amc: l.amc,
        resteACharge: l.resteACharge,
      },
      lignes: [l],
    };
  };
  const ecrireMaillon = async (
    precedent: Maillon | null,
    type: TypeEvenementCaisse,
    factureId: string,
    entree: PieceAChainer,
  ): Promise<Maillon> => {
    const rang = (precedent?.rang ?? 0) + 1;
    const empreintePrecedente = precedent?.empreinte ?? EMPREINTE_INITIALE;
    const charge = JSON.parse(JSON.stringify(chargePiece(entree))) as object;
    const empreinte = enchainer({ rang, type, charge, empreintePrecedente }, hacheur);
    await db.evenementCaisse.create({
      data: {
        organisationId,
        centreId,
        rang,
        type,
        factureId,
        charge,
        empreintePrecedente,
        empreinte,
        acteurId: utilisateurId,
      },
    });
    return { rang, empreinte };
  };

  const champsPiece = (entree: PieceAChainer) => ({
    organisationId,
    centreId,
    patientId: PATIENT_VENTE,
    nature: entree.nature,
    createdById: utilisateurId,
    totalTtcCentimes: entree.totaux.prixTTC,
    totalHtCentimes: entree.totaux.ht,
    totalTvaCentimes: entree.totaux.tva,
    totalAmoCentimes: entree.totaux.amo,
    totalAmcCentimes: entree.totaux.amc,
    totalResteCentimes: entree.totaux.resteACharge,
  });
  const validation = (entree: PieceAChainer, empreinte: string) => ({
    statut: 'VALIDEE' as const,
    numero: entree.numero,
    numeroSequence: entree.numeroSequence,
    dateFacture: date,
    vendeur,
    client,
    valideeLe: new Date(),
    valideeParId: utilisateurId,
    empreinte,
  });

  const pieceVente = piece(FACTURE_VENTE, 'FACTURE', 1, null);
  await db.facture.create({ data: { id: FACTURE_VENTE, ...champsPiece(pieceVente) } });
  await db.ligneFacture.createMany({
    data: lignesEnBase(contenu, FACTURE_VENTE, LIGNE_VENTE).map((l) => ({ ...l, organisationId })),
  });
  const premier = await ecrireMaillon(null, 'FACTURE_VALIDEE', FACTURE_VENTE, pieceVente);
  await db.facture.update({
    where: { id: FACTURE_VENTE },
    data: validation(pieceVente, premier.empreinte),
  });

  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  const pieceAvoir = piece(AVOIR_VENTE, 'AVOIR', 2, FACTURE_VENTE);
  await db.facture.create({
    data: {
      id: AVOIR_VENTE,
      ...champsPiece(pieceAvoir),
      factureOrigineId: FACTURE_VENTE,
      motif: chiffreur.chiffrer('Geste commercial (donnée fictive)', CONTEXTE_MOTIF),
    },
  });
  await db.ligneFacture.create({
    data: {
      id: LIGNE_AVOIR,
      organisationId,
      factureId: AVOIR_VENTE,
      rang: 1,
      nature: ligneAvoir.nature,
      libelle: ligneAvoir.libelle,
      quantite: ligneAvoir.quantite,
      prixUnitaireCentimes: ligneAvoir.prixUnitaire,
      prixTtcCentimes: ligneAvoir.prixTTC,
      tauxTva: ligneAvoir.tauxTva,
      montantHtCentimes: ligneAvoir.montantHT,
      montantTvaCentimes: ligneAvoir.montantTva,
      baseRemboursementCentimes: ligneAvoir.baseRemboursement,
      amoCentimes: ligneAvoir.amo,
      amcCentimes: ligneAvoir.amc,
      resteAChargeCentimes: ligneAvoir.resteACharge,
      ligneOrigineId: LIGNE_VENTE,
    },
  });
  const second = await ecrireMaillon(premier, 'AVOIR_VALIDE', AVOIR_VENTE, pieceAvoir);
  await db.facture.update({
    where: { id: AVOIR_VENTE },
    data: validation(pieceAvoir, second.empreinte),
  });

  await db.serieFacture.create({
    data: {
      centreId,
      organisationId,
      prefixe: PREFIXE_SERIE_DEFAUT,
      dernierNumero: 2,
    },
  });
  await db.chaineCaisse.create({
    data: {
      centreId,
      organisationId,
      dernierRang: second.rang,
      derniereEmpreinte: second.empreinte,
    },
  });
}
