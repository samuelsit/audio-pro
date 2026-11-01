import { createHash, randomUUID } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import {
  calculerPagination,
  champsManquants,
  estUnPdf,
  factureFournisseurSaisieSchema,
  filtreFacturesFournisseurSchema,
  motifCommandeSchema,
  PARAMETRES_COMMANDE_DEFAUT,
  peutGererAchats,
  proposerLigneCommande,
  rapprocher,
  reperer,
  TAILLE_MAX_FACTURE_OCTETS,
  type Clock,
  type EcartRapproche,
  type FactureExtraite,
  type FiltreFacturesFournisseur,
  type LigneCommandeARapprocher,
  type LigneFactureARapprocher,
  type OrigineFactureFournisseur,
  type Pagination,
  type Perimetre,
  type StatutFactureFournisseur,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { extracteurFacture } from '../extracteur-facture';
import { centresDuPerimetre } from '../perimetre';
import { appliquerStatut, verrouillerCommande } from './commandes';

const horloge: Clock = new SystemClock();
const LIGNES_PAR_PAGE = 50;
const STATUTS_RAPPROCHABLES = ['ENVOYEE', 'PARTIELLEMENT_RECUE', 'RECUE', 'FACTUREE'] as const;

const DOUBLON_FACTURE = {
  facture_fournisseur_numero_unique: ['numero', 'Cette facture est déjà validée.'],
  facture_fournisseur_document_unique: ['fichier', 'Ce fichier a déjà été reçu.'],
} as const;

export interface FactureListee {
  id: string;
  statut: StatutFactureFournisseur;
  origine: OrigineFactureFournisseur;
  fournisseur: string | null;
  centre: string | null;
  numero: string | null;
  dateFacture: Date | null;
  montantTtcCentimes: number | null;
  expediteurInconnu: boolean;
  createdAt: Date;
}

export interface ListeFactures {
  lignes: FactureListee[];
  pagination: Pagination;
  filtre: FiltreFacturesFournisseur;
}

export interface LigneFactureVue {
  id: string;
  commandeLigneId: string | null;
  /** Lien suggéré tant qu'aucun n'est retenu. */
  commandeLigneProposee: string | null;
  reference: string | null;
  designation: string;
  quantite: number;
  prixUnitaireCentimes: number;
  tauxTvaPointsBase: number | null;
  numerosSerie: string[];
}

export interface CandidatRapprochement {
  id: string;
  libelle: string;
}

export interface FactureDetail extends FactureListee {
  fournisseurId: string | null;
  centreId: string | null;
  expediteur: string | null;
  montantHtCentimes: number | null;
  montantTvaCentimes: number | null;
  motifRejet: string | null;
  lignes: LigneFactureVue[];
  candidats: CandidatRapprochement[];
  /** Ce que la validation signalerait, ou ce qu'elle a signalé. */
  ecarts: EcartRapproche[];
  manquants: Record<string, string>;
}

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererAchats(acteur.role)) {
    throw new AccesRefuseError();
  }
}

/** Une facture dont le centre reste à trouver n'appartient à aucun périmètre : elle revient à l'administrateur. */
function exigerAcces(acteur: UtilisateurConnecte, centreId: string | null): void {
  if (centreId !== null) {
    verifierAccesCentre(acteur, centreId);
  } else if (acteur.role !== 'ADMIN_CLIENT') {
    throw new AccesRefuseError();
  }
}

function empreinte(contenu: Uint8Array): string {
  return createHash('sha256').update(contenu).digest('hex');
}

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Dépôt d'un PDF à l'écran. Le même chemin que la boîte mail : extraction, puis validation humaine. */
export async function deposerFacture(
  acteur: UtilisateurConnecte,
  contenu: Uint8Array,
): Promise<string> {
  exigerGestion(acteur);
  if (contenu.length > TAILLE_MAX_FACTURE_OCTETS) {
    throw ErreurSaisie.surChamp('fichier', 'Fichier trop volumineux (10 Mo au maximum).');
  }
  if (!estUnPdf(contenu)) {
    throw ErreurSaisie.surChamp('fichier', 'Ce fichier n’est pas un PDF.');
  }
  const documentEmpreinte = empreinte(contenu);
  const client = base(acteur);
  const existante = await client.factureFournisseur.findFirst({
    where: { documentEmpreinte, statut: { not: 'REJETEE' } },
    select: { id: true },
  });
  if (existante) {
    throw ErreurSaisie.surChamp('fichier', 'Ce fichier a déjà été reçu.');
  }
  const extraite = await extracteurFacture().extraire(contenu);
  const [fournisseurs, centres, comptes] = await Promise.all([
    client.fournisseur.findMany({
      where: { organisationId: acteur.organisationId },
      select: { id: true, siret: true, emailFacturation: true },
    }),
    client.centre.findMany({
      where: { organisationId: acteur.organisationId },
      select: { id: true, siret: true },
    }),
    client.fournisseurCompteCentre.findMany({
      select: { fournisseurId: true, centreId: true, numeroClient: true },
    }),
  ]);
  const { fournisseurId, centreId } = reperer(extraite, null, fournisseurs, centres, comptes);
  const documentCle = `factures-fournisseurs/${randomUUID()}`;
  await documents().put(documentCle, contenu, 'application/pdf');
  try {
    const { id } = await withAudit(
      acteur,
      async (tx) => {
        const facture = await tx.factureFournisseur.create({
          data: {
            ...champsExtraits(extraite),
            organisationId: acteur.organisationId,
            origine: 'DEPOT',
            documentCle,
            documentEmpreinte,
            fournisseurId,
            centreId,
          },
          select: { id: true },
        });
        for (const [rang, ligne] of extraite.lignes.entries()) {
          await tx.factureFournisseurLigne.create({
            data: {
              organisationId: acteur.organisationId,
              factureId: facture.id,
              rang,
              reference: ligne.reference,
              designation: ligne.designation,
              quantite: ligne.quantite,
              prixUnitaireCentimes: ligne.prixUnitaireCentimes,
              numerosSerie: [...ligne.numerosSerie],
            },
          });
        }
        return facture;
      },
      ({ id: creee }) => ({
        action: 'CREATE',
        entiteType: 'FACTURE_FOURNISSEUR',
        entiteId: creee,
        centreId,
        details: { origine: 'DEPOT', lignesExtraites: extraite.lignes.length },
      }),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FACTURE, 'Cette facture existe déjà.');
  }
}

function champsExtraits(extraite: FactureExtraite) {
  return {
    numero: extraite.numero,
    dateFacture: extraite.dateFacture === null ? null : versDate(extraite.dateFacture),
    montantHtCentimes: extraite.montantHtCentimes,
    montantTvaCentimes: extraite.montantTvaCentimes,
    montantTtcCentimes: extraite.montantTtcCentimes,
  };
}

function clausePerimetre(acteur: UtilisateurConnecte, perimetre: Perimetre) {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  if (centres === null) {
    return { organisationId: acteur.organisationId };
  }
  return { organisationId: acteur.organisationId, centreId: { in: [...centres] } };
}

const selectionListe = {
  id: true,
  statut: true,
  origine: true,
  numero: true,
  dateFacture: true,
  montantTtcCentimes: true,
  expediteurInconnu: true,
  createdAt: true,
  fournisseur: { select: { nom: true } },
  centre: { select: { nom: true } },
} as const;

export async function listerFacturesFournisseur(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeFactures> {
  exigerGestion(acteur);
  const filtre = valider(filtreFacturesFournisseurSchema, saisie);
  const where = {
    ...clausePerimetre(acteur, perimetre),
    ...(filtre.statut ? { statut: filtre.statut } : {}),
  };
  const client = base(acteur);
  const total = await client.factureFournisseur.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE, total);
  const lignes = await client.factureFournisseur.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE,
    select: selectionListe,
  });
  return {
    lignes: lignes.map((l) => ({
      ...l,
      fournisseur: l.fournisseur?.nom ?? null,
      centre: l.centre?.nom ?? null,
    })),
    pagination,
    filtre,
  };
}

type Lecteur = Pick<ClientTransaction, 'commandeLigne'>;

/** Lignes de commande ouvertes de ce fournisseur et de ce centre, avec ce qui a été reçu et déjà facturé. */
async function lignesRapprochables(
  client: Lecteur,
  fournisseurId: string | null,
  centreId: string | null,
): Promise<(LigneCommandeARapprocher & { libelle: string })[]> {
  if (fournisseurId === null || centreId === null) {
    return [];
  }
  const lignes = await client.commandeLigne.findMany({
    where: { commande: { fournisseurId, centreId, statut: { in: [...STATUTS_RAPPROCHABLES] } } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      commandeId: true,
      modeleId: true,
      quantiteRecue: true,
      quantiteFacturee: true,
      prixAchatCentimes: true,
      commande: { select: { numero: true } },
      modele: { select: { gamme: true, nom: true, referenceCommerciale: true } },
      accessoire: { select: { nom: true, referenceCommerciale: true } },
      lignesReception: {
        select: { appareils: { select: { appareil: { select: { numeroSerie: true } } } } },
      },
      lignesFacture: {
        where: { facture: { statut: 'VALIDEE' } },
        select: { numerosSerie: true },
      },
    },
  });
  return lignes.map((l) => ({
    id: l.id,
    commandeId: l.commandeId,
    reference: l.modele?.referenceCommerciale ?? l.accessoire?.referenceCommerciale ?? null,
    suiviAuNumero: l.modeleId !== null,
    quantiteRecue: l.quantiteRecue,
    quantiteFacturee: l.quantiteFacturee,
    prixAchatCentimes: l.prixAchatCentimes,
    numerosRecus: l.lignesReception.flatMap((r) => r.appareils.map((a) => a.appareil.numeroSerie)),
    numerosDejaFactures: l.lignesFacture.flatMap((f) => f.numerosSerie),
    libelle: `${l.commande.numero} · ${l.modele ? `${l.modele.gamme} ${l.modele.nom}` : (l.accessoire?.nom ?? '')}`,
  }));
}

function versLigneARapprocher(ligne: {
  id: string;
  commandeLigneId: string | null;
  quantite: number;
  prixUnitaireCentimes: number;
  numerosSerie: string[];
}): LigneFactureARapprocher {
  return ligne;
}

/** Seules les lignes de commande citées par la facture sont comparées : le passé des autres ne la regarde pas. */
function citees<T extends { id: string }>(
  lignes: readonly { commandeLigneId: string | null }[],
  candidats: readonly T[],
): T[] {
  const ids = new Set(lignes.map((l) => l.commandeLigneId));
  return candidats.filter((c) => ids.has(c.id));
}

async function tolerancePrix(client: Pick<ClientTransaction, 'parametresCommande'>, id: string) {
  const parametres = await client.parametresCommande.findUnique({
    where: { organisationId: id },
    select: { tolerancePrixCentimes: true },
  });
  return (parametres ?? PARAMETRES_COMMANDE_DEFAUT).tolerancePrixCentimes;
}

export async function obtenirFactureFournisseur(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<FactureDetail> {
  exigerGestion(acteur);
  const client = base(acteur);
  const facture = await client.factureFournisseur.findFirst({
    where: { id: factureId, organisationId: acteur.organisationId },
    select: {
      ...selectionListe,
      fournisseurId: true,
      centreId: true,
      expediteur: true,
      montantHtCentimes: true,
      montantTvaCentimes: true,
      motifRejet: true,
    },
  });
  if (!facture) {
    throw new AccesRefuseError();
  }
  exigerAcces(acteur, facture.centreId);
  // Lues à part : l'extension de chiffrement ne descend pas dans une relation.
  const lignes = await client.factureFournisseurLigne.findMany({
    where: { factureId },
    orderBy: { rang: 'asc' },
    select: {
      id: true,
      commandeLigneId: true,
      reference: true,
      designation: true,
      quantite: true,
      prixUnitaireCentimes: true,
      tauxTvaPointsBase: true,
      numerosSerie: true,
    },
  });
  const candidats = await lignesRapprochables(client, facture.fournisseurId, facture.centreId);
  const { montantHtCentimes, montantTvaCentimes, montantTtcCentimes } = facture;
  const manquants = champsManquants({ ...facture, nombreLignes: lignes.length });
  const ecarts =
    facture.statut === 'A_VALIDER' && Object.keys(manquants).length === 0
      ? rapprocher(
          lignes.map(versLigneARapprocher),
          citees(lignes, candidats),
          {
            montantHtCentimes: montantHtCentimes ?? 0,
            montantTvaCentimes: montantTvaCentimes ?? 0,
            montantTtcCentimes: montantTtcCentimes ?? 0,
          },
          await tolerancePrix(client, acteur.organisationId),
        )
      : [];
  return {
    ...facture,
    fournisseur: facture.fournisseur?.nom ?? null,
    centre: facture.centre?.nom ?? null,
    lignes: lignes.map((l) => ({
      ...l,
      commandeLigneProposee: l.commandeLigneId ?? proposerLigneCommande(l, candidats),
    })),
    candidats: candidats.map(({ id, libelle }) => ({ id, libelle })),
    ecarts,
    manquants,
  };
}

async function verrouillerFacture(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  factureId: string,
) {
  await tx.$queryRaw`SELECT id FROM facture_fournisseur WHERE id = ${factureId} FOR UPDATE`;
  const facture = await tx.factureFournisseur.findFirst({
    where: { id: factureId, organisationId: acteur.organisationId },
  });
  if (!facture) {
    throw new AccesRefuseError();
  }
  exigerAcces(acteur, facture.centreId);
  if (facture.statut !== 'A_VALIDER') {
    throw ErreurSaisie.surChamp('statut', 'Cette facture est déjà traitée.');
  }
  return facture;
}

/** Enregistre ce que la personne a vérifié. Remplace les lignes : la saisie fait foi, pas l'extraction. */
export async function modifierFactureFournisseur(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const { lignes, montantHt, montantTva, montantTtc, dateFacture, ...entete } = valider(
    factureFournisseurSaisieSchema,
    saisie,
  );
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await verrouillerFacture(tx, acteur, factureId);
      exigerAcces(acteur, entete.centreId);
      const { organisationId } = acteur;
      if (
        entete.fournisseurId !== null &&
        !(await tx.fournisseur.findFirst({
          where: { id: entete.fournisseurId, organisationId },
          select: { id: true },
        }))
      ) {
        throw ErreurSaisie.surChamp('fournisseurId', 'Fournisseur inconnu.');
      }
      const candidats = await lignesRapprochables(tx, entete.fournisseurId, entete.centreId);
      if (
        lignes.some(
          (l) => l.commandeLigneId !== null && !candidats.some((c) => c.id === l.commandeLigneId),
        )
      ) {
        throw ErreurSaisie.surChamp(
          'lignes',
          'Une ligne vise une commande d’un autre fournisseur.',
        );
      }
      await tx.factureFournisseur.update({
        where: { id: factureId },
        data: {
          ...entete,
          dateFacture: dateFacture === null ? null : versDate(dateFacture),
          montantHtCentimes: montantHt,
          montantTvaCentimes: montantTva,
          montantTtcCentimes: montantTtc,
        },
      });
      await tx.factureFournisseurLigne.deleteMany({ where: { factureId } });
      for (const [rang, { tauxTva, ...ligne }] of lignes.entries()) {
        await tx.factureFournisseurLigne.create({
          data: {
            ...ligne,
            organisationId,
            factureId,
            rang,
            tauxTvaPointsBase: tauxTva,
          },
        });
      }
      return facture;
    },
    (facture) => ({
      action: 'UPDATE',
      entiteType: 'FACTURE_FOURNISSEUR',
      entiteId: factureId,
      centreId: entete.centreId ?? facture.centreId,
      details: { lignes: lignes.length },
    }),
  );
}

/**
 * Valide la facture : le rapprochement écrit ses écarts, les quantités facturées et le statut des commandes
 * suivent, et les appareils reçoivent leur facture fabricant. Hors caisse (ADR-031).
 * Source : convention-audioprothesistes.pdf art. 21 (conservation de la facture du fabricant).
 */
export async function validerFactureFournisseur(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<number> {
  exigerGestion(acteur);
  try {
    const { ecarts } = await withAudit(
      acteur,
      async (tx) => {
        const facture = await verrouillerFacture(tx, acteur, factureId);
        const lignes = await tx.factureFournisseurLigne.findMany({
          where: { factureId },
          orderBy: { rang: 'asc' },
          select: {
            id: true,
            commandeLigneId: true,
            quantite: true,
            prixUnitaireCentimes: true,
            numerosSerie: true,
          },
        });
        const manquants = champsManquants({ ...facture, nombreLignes: lignes.length });
        if (Object.keys(manquants).length > 0) {
          throw new ErreurSaisie(
            Object.fromEntries(Object.entries(manquants).map(([c, m]) => [c, [m]])),
            'La facture est incomplète.',
          );
        }
        const { fournisseurId, centreId, numero } = facture;
        const doublon = await tx.factureFournisseur.findFirst({
          where: { fournisseurId, numero, statut: 'VALIDEE' },
          select: { id: true },
        });
        if (doublon) {
          throw ErreurSaisie.surChamp('numero', 'Cette facture est déjà validée.');
        }
        const commandeIds = new Map<string, Awaited<ReturnType<typeof verrouillerCommande>>>();
        const candidatsAvant = await lignesRapprochables(tx, fournisseurId, centreId);
        const cites = citees(lignes, candidatsAvant);
        // Ordre fixe : deux validations concurrentes ne s'attendent pas l'une l'autre.
        for (const id of [...new Set(cites.map((c) => c.commandeId))].sort()) {
          commandeIds.set(id, await verrouillerCommande(tx, acteur, id));
        }
        const ecarts = rapprocher(
          lignes,
          citees(lignes, await lignesRapprochables(tx, fournisseurId, centreId)),
          {
            montantHtCentimes: facture.montantHtCentimes ?? 0,
            montantTvaCentimes: facture.montantTvaCentimes ?? 0,
            montantTtcCentimes: facture.montantTtcCentimes ?? 0,
          },
          await tolerancePrix(tx, acteur.organisationId),
        );
        for (const ecart of ecarts) {
          await tx.ecartAchat.create({
            data: {
              type: ecart.type,
              commandeId: ecart.commandeId,
              commandeLigneId: ecart.commandeLigneId,
              quantiteAttendue: ecart.quantiteAttendue,
              quantiteConstatee: ecart.quantiteConstatee,
              montantAttenduCentimes: ecart.montantAttenduCentimes,
              montantConstateCentimes: ecart.montantConstateCentimes,
              numeroSerie: ecart.numeroSerie,
              organisationId: acteur.organisationId,
              centreId: centreId ?? '',
              factureFournisseurId: factureId,
            },
          });
        }
        const instant = new Date(horloge.now());
        await tx.factureFournisseur.update({
          where: { id: factureId },
          data: { statut: 'VALIDEE', validateurId: acteur.id, valideeLe: instant },
        });
        for (const ligne of lignes) {
          if (ligne.commandeLigneId !== null) {
            await tx.commandeLigne.update({
              where: { id: ligne.commandeLigneId },
              data: { quantiteFacturee: { increment: ligne.quantite } },
            });
            await tx.appareil.updateMany({
              where: {
                numeroSerie: { in: ligne.numerosSerie },
                receptionLigne: {
                  receptionLigne: { commandeLigneId: ligne.commandeLigneId },
                },
              },
              data: { referenceFactureFabricant: numero },
            });
          }
        }
        for (const [id, commande] of commandeIds) {
          const lignesCommande = await tx.commandeLigne.findMany({ where: { commandeId: id } });
          await appliquerStatut(tx, id, commande.statut, lignesCommande);
        }
        return { ecarts: ecarts.length, centreId };
      },
      ({ ecarts, centreId }) => ({
        action: 'UPDATE',
        entiteType: 'FACTURE_FOURNISSEUR',
        entiteId: factureId,
        centreId,
        details: { validee: true, ecarts },
      }),
    );
    return ecarts;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FACTURE, 'Cette facture existe déjà.');
  }
}

export async function rejeterFactureFournisseur(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const { motif } = valider(motifCommandeSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const facture = await verrouillerFacture(tx, acteur, factureId);
      await tx.factureFournisseur.update({
        where: { id: factureId },
        data: { statut: 'REJETEE', motifRejet: motif },
      });
      return facture;
    },
    (facture) => ({
      action: 'UPDATE',
      entiteType: 'FACTURE_FOURNISSEUR',
      entiteId: factureId,
      centreId: facture.centreId,
      details: { rejetee: true },
    }),
  );
}

/** Le PDF reçu n'est pas de confiance : il se télécharge, il ne s'affiche pas dans l'application. */
export async function telechargerFactureFournisseur(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<Uint8Array> {
  exigerGestion(acteur);
  const facture = await base(acteur).factureFournisseur.findFirst({
    where: { id: factureId, organisationId: acteur.organisationId },
    select: { documentCle: true, centreId: true },
  });
  if (!facture) {
    throw new AccesRefuseError();
  }
  exigerAcces(acteur, facture.centreId);
  const contenu = await documents().get(facture.documentCle);
  await withAudit(acteur, () => Promise.resolve(), {
    action: 'READ',
    entiteType: 'FACTURE_FOURNISSEUR',
    entiteId: factureId,
    centreId: facture.centreId,
  });
  return contenu;
}
