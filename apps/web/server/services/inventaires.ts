import { SystemClock } from '@ha/adapters';
import {
  appareilValorise,
  comptageAccessoireSaisieSchema,
  ecartAccessoire,
  ecartsAppareils,
  justificationEcartSaisieSchema,
  ouvertureInventaireSaisieSchema,
  peutGererInventaire,
  peutVoirPrixAchat,
  pointageAppareilSaisieSchema,
  STATUTS_ATTENDUS_INVENTAIRE,
  valeurStock,
  type ArticleValorise,
  type Clock,
  type Perimetre,
  type StatutInventaire,
  type ValeurStock,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { crediter, debiter, ecrireMouvementAccessoire, verifierCentreActif } from './stock';

const horloge: Clock = new SystemClock();

const DOUBLON_INVENTAIRE = {
  inventaire_un_ouvert_par_centre: ['centreId', 'Un inventaire est déjà ouvert dans ce centre.'],
} as const;

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererInventaire(acteur.role)) {
    throw new AccesRefuseError();
  }
}

// --- Valeur du stock ------------------------------------------------------------------------------

type ClientValeur = Pick<ClientTransaction, 'appareil' | 'stockAccessoire'>;

async function calculerValeur(
  client: ClientValeur,
  organisationId: string,
  centres: readonly string[] | null,
): Promise<ValeurStock> {
  const filtreCentre = centres === null ? {} : { centreId: { in: [...centres] } };
  const groupes = await client.appareil.groupBy({
    by: ['statut', 'enConsignation', 'prixAchatCentimes'],
    // Vendu puis passé au SAV : l'appareil reste celui du patient, il ne revient pas dans le stock.
    where: { organisationId, ...filtreCentre, NOT: { statut: 'SAV', patientId: { not: null } } },
    _count: { _all: true },
  });
  const accessoires = await client.stockAccessoire.findMany({
    where: { organisationId, ...filtreCentre },
    select: { quantite: true, accessoire: { select: { prixAchatCentimes: true } } },
  });
  const articles: ArticleValorise[] = [
    ...groupes
      .filter((g) => appareilValorise(g.statut, g.enConsignation))
      .map((g) => ({ quantite: g._count._all, prixAchatCentimes: g.prixAchatCentimes })),
    ...accessoires.map((a) => ({
      quantite: a.quantite,
      prixAchatCentimes: a.accessoire.prixAchatCentimes,
    })),
  ];
  return valeurStock(articles);
}

/** Valeur au prix d'achat des centres du périmètre : donnée commerciale, réservée aux rôles de gestion. */
export async function valeurDuStock(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<ValeurStock> {
  verifierPerimetre(acteur, perimetre);
  if (!peutVoirPrixAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  const centres = centresDuPerimetre(acteur, perimetre);
  return calculerValeur(base(acteur), acteur.organisationId, centres && [...centres]);
}

// --- Ouverture et liste ---------------------------------------------------------------------------

export async function ouvrirInventaire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  exigerGestion(acteur);
  const { centreId } = valider(ouvertureInventaireSaisieSchema, saisie);
  verifierAccesCentre(acteur, centreId);
  await verifierCentreActif(base(acteur), acteur, centreId, 'centreId');
  try {
    const cree = await withAudit(
      acteur,
      (tx) =>
        tx.inventaire.create({
          data: { centreId, ouvertParId: acteur.id },
          select: { id: true },
        }),
      ({ id }) => ({ action: 'CREATE', entiteType: 'INVENTAIRE', entiteId: id, centreId }),
    );
    return cree.id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_INVENTAIRE, 'Un inventaire est déjà ouvert dans ce centre.');
  }
}

export interface LigneInventaire {
  id: string;
  centre: string;
  statut: StatutInventaire;
  ouvertLe: Date;
  clotureLe: Date | null;
}

export async function listerInventaires(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
): Promise<LigneInventaire[]> {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  const lignes = await base(acteur).inventaire.findMany({
    where: {
      organisationId: acteur.organisationId,
      ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    },
    select: {
      id: true,
      statut: true,
      createdAt: true,
      clotureLe: true,
      centre: { select: { nom: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return lignes.map((l) => ({
    id: l.id,
    centre: l.centre.nom,
    statut: l.statut,
    ouvertLe: l.createdAt,
    clotureLe: l.clotureLe,
  }));
}

// --- Lecture --------------------------------------------------------------------------------------

async function lireEntete(
  client: Pick<ClientTransaction, 'inventaire'>,
  acteur: UtilisateurConnecte,
  inventaireId: string,
) {
  const inventaire = await client.inventaire.findFirst({
    where: { id: inventaireId, organisationId: acteur.organisationId },
    select: {
      id: true,
      centreId: true,
      statut: true,
      createdAt: true,
      clotureLe: true,
      valeurCentimes: true,
      articlesSansPrix: true,
      centre: { select: { nom: true } },
    },
  });
  if (!inventaire) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, inventaire.centreId);
  return inventaire;
}

const selectionLigne = {
  numeroSerie: true,
  appareilId: true,
  pointe: true,
  ecart: true,
  accessoireId: true,
  quantiteTheorique: true,
  quantiteComptee: true,
  justification: true,
} as const;

type LigneLue = Awaited<ReturnType<typeof lireLignes>>[number];

function lireLignes(client: Pick<ClientTransaction, 'inventaireLigne'>, inventaireId: string) {
  return client.inventaireLigne.findMany({ where: { inventaireId }, select: selectionLigne });
}

function appareilsAttendus(client: Pick<ClientTransaction, 'appareil'>, centreId: string) {
  return client.appareil.findMany({
    where: { centreId, statut: { in: [...STATUTS_ATTENDUS_INVENTAIRE] } },
    select: { id: true, numeroSerie: true },
  });
}

export interface EcartAppareil {
  numeroSerie: string;
  justification: string | null;
}

export interface LigneAccessoireInventaire {
  accessoireId: string;
  accessoire: string;
  quantiteTheorique: number;
  quantiteComptee: number | null;
  ecart: number | null;
  justification: string | null;
}

export interface DetailInventaire {
  id: string;
  centreId: string;
  centre: string;
  statut: StatutInventaire;
  ouvertLe: Date;
  clotureLe: Date | null;
  appareilsAttendus: number;
  appareilsPointes: number;
  manquants: EcartAppareil[];
  excedents: EcartAppareil[];
  accessoires: LigneAccessoireInventaire[];
  gestion: boolean;
  /** Null pour un rôle qui n'y a pas droit, ou tant que l'inventaire est ouvert. */
  valeur: ValeurStock | null;
}

function ligneNumero(lignes: readonly LigneLue[], numeroSerie: string): LigneLue | undefined {
  return lignes.find((l) => l.numeroSerie === numeroSerie);
}

export async function obtenirInventaire(
  acteur: UtilisateurConnecte,
  inventaireId: string,
): Promise<DetailInventaire> {
  const client = base(acteur);
  const entete = await lireEntete(client, acteur, inventaireId);
  const lignes = await lireLignes(client, inventaireId);
  const cloture = entete.statut === 'CLOTURE';
  const pointes = lignes.flatMap((l) => (l.pointe && l.numeroSerie ? [l.numeroSerie] : []));

  // Une fois clôturé, seuls les écarts relevés comptent : le stock a pu bouger depuis.
  const attendus = cloture ? [] : await appareilsAttendus(client, entete.centreId);
  const ecarts = cloture
    ? {
        manquants: lignes.flatMap((l) =>
          l.numeroSerie && l.ecart && !l.pointe ? [l.numeroSerie] : [],
        ),
        excedents: lignes.flatMap((l) =>
          l.numeroSerie && l.ecart && l.pointe ? [l.numeroSerie] : [],
        ),
      }
    : ecartsAppareils(
        attendus.map((a) => a.numeroSerie),
        pointes,
      );
  const versEcart = (numeroSerie: string): EcartAppareil => ({
    numeroSerie,
    justification: ligneNumero(lignes, numeroSerie)?.justification ?? null,
  });

  const stock = await client.stockAccessoire.findMany({
    where: { centreId: entete.centreId },
    select: { accessoireId: true, quantite: true, accessoire: { select: { nom: true } } },
    orderBy: { accessoire: { nom: 'asc' } },
  });
  const accessoires = stock.flatMap((s): LigneAccessoireInventaire[] => {
    const ligne = lignes.find((l) => l.accessoireId === s.accessoireId);
    if (!ligne && (cloture || s.quantite === 0)) {
      return [];
    }
    const theorique = ligne?.quantiteTheorique ?? s.quantite;
    const compte = ligne?.quantiteComptee ?? null;
    return [
      {
        accessoireId: s.accessoireId,
        accessoire: s.accessoire.nom,
        quantiteTheorique: theorique,
        quantiteComptee: compte,
        ecart: compte === null ? null : ecartAccessoire(theorique, compte),
        justification: ligne?.justification ?? null,
      },
    ];
  });

  const voitValeur = cloture && peutVoirPrixAchat(acteur.role);
  return {
    id: entete.id,
    centreId: entete.centreId,
    centre: entete.centre.nom,
    statut: entete.statut,
    ouvertLe: entete.createdAt,
    clotureLe: entete.clotureLe,
    appareilsAttendus: attendus.length,
    appareilsPointes: pointes.length,
    manquants: ecarts.manquants.map(versEcart),
    excedents: ecarts.excedents.map(versEcart),
    accessoires,
    gestion: peutGererInventaire(acteur.role),
    valeur:
      voitValeur && entete.valeurCentimes !== null
        ? {
            valeurCentimes: entete.valeurCentimes as ValeurStock['valeurCentimes'],
            articlesSansPrix: entete.articlesSansPrix ?? 0,
          }
        : null,
  };
}

// --- Pointage -------------------------------------------------------------------------------------

/**
 * Prend le verrou de la ligne : un pointage ne croise pas une clôture, dont le trigger de gel ne verrait pas
 * une écriture encore en cours.
 */
async function verrouillerOuvert(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  inventaireId: string,
) {
  const entete = await lireEntete(tx, acteur, inventaireId);
  const { count } = await tx.inventaire.updateMany({
    where: { id: inventaireId, statut: 'EN_COURS' },
    data: { updatedAt: new Date(horloge.now()) },
  });
  if (count !== 1) {
    throw new ErreurSaisie({}, 'Cet inventaire est clôturé.');
  }
  return entete;
}

export type ResultatPointage = 'ATTENDU' | 'NON_ATTENDU';

/** Idempotent : la douchette peut lire deux fois le même appareil. */
export async function pointerAppareil(
  acteur: UtilisateurConnecte,
  inventaireId: string,
  saisie: unknown,
): Promise<ResultatPointage> {
  const { numeroSerie } = valider(pointageAppareilSaisieSchema, saisie);
  return withAudit(
    acteur,
    async (tx) => {
      const { centreId } = await verrouillerOuvert(tx, acteur, inventaireId);
      // Le centre filtre d'abord : un appareil d'un autre centre ne révèle pas son existence (ADR-010).
      const appareil = await tx.appareil.findFirst({
        where: { centreId, numeroSerie },
        select: { id: true, statut: true },
      });
      await tx.inventaireLigne.upsert({
        where: { inventaireId_numeroSerie: { inventaireId, numeroSerie } },
        create: { inventaireId, numeroSerie, appareilId: appareil?.id ?? null, pointe: true },
        update: { pointe: true },
      });
      const attendu = appareil && STATUTS_ATTENDUS_INVENTAIRE.includes(appareil.statut);
      return { centreId, resultat: attendu ? ('ATTENDU' as const) : ('NON_ATTENDU' as const) };
    },
    ({ centreId }) => ({
      action: 'UPDATE',
      entiteType: 'INVENTAIRE',
      entiteId: inventaireId,
      centreId,
      details: { numeroSerie },
    }),
  ).then(({ resultat }) => resultat);
}

/** La quantité théorique est relevée à cet instant : l'écart ignore les mouvements postérieurs au comptage. */
export async function compterAccessoire(
  acteur: UtilisateurConnecte,
  inventaireId: string,
  saisie: unknown,
): Promise<void> {
  const { accessoireId, quantiteComptee } = valider(comptageAccessoireSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const { centreId } = await verrouillerOuvert(tx, acteur, inventaireId);
      const accessoire = await tx.accessoire.findFirst({
        where: { id: accessoireId, organisationId: acteur.organisationId },
        select: { id: true },
      });
      if (!accessoire) {
        throw ErreurSaisie.surChamp('accessoireId', 'Accessoire inconnu.');
      }
      const stock = await tx.stockAccessoire.findUnique({
        where: { centreId_accessoireId: { centreId, accessoireId } },
        select: { quantite: true },
      });
      const quantiteTheorique = stock?.quantite ?? 0;
      await tx.inventaireLigne.upsert({
        where: { inventaireId_accessoireId: { inventaireId, accessoireId } },
        create: { inventaireId, accessoireId, quantiteTheorique, quantiteComptee },
        update: { quantiteTheorique, quantiteComptee },
      });
      return centreId;
    },
    (centreId) => ({
      action: 'UPDATE',
      entiteType: 'INVENTAIRE',
      entiteId: inventaireId,
      centreId,
      details: { accessoireId, quantiteComptee },
    }),
  );
}

/** Le texte n'entre pas dans le journal : il est libre, chiffré dans la ligne. */
export async function justifierEcart(
  acteur: UtilisateurConnecte,
  inventaireId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(justificationEcartSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const { centreId } = await verrouillerOuvert(tx, acteur, inventaireId);
      if ('numeroSerie' in donnees) {
        const { numeroSerie, justification } = donnees;
        const appareil = await tx.appareil.findFirst({
          where: { centreId, numeroSerie },
          select: { id: true },
        });
        await tx.inventaireLigne.upsert({
          where: { inventaireId_numeroSerie: { inventaireId, numeroSerie } },
          create: { inventaireId, numeroSerie, appareilId: appareil?.id ?? null, justification },
          update: { justification },
        });
        return centreId;
      }
      const { accessoireId, justification } = donnees;
      const { count } = await tx.inventaireLigne.updateMany({
        where: { inventaireId, accessoireId },
        data: { justification },
      });
      if (count !== 1) {
        throw ErreurSaisie.surChamp('accessoireId', 'Compter cet accessoire d’abord.');
      }
      return centreId;
    },
    (centreId) => ({
      action: 'UPDATE',
      entiteType: 'INVENTAIRE',
      entiteId: inventaireId,
      centreId,
      details: { justification: true },
    }),
  );
}

// --- Clôture --------------------------------------------------------------------------------------

/**
 * Tout écart doit être justifié et tout accessoire en stock compté. Les quantités d'accessoires sont corrigées
 * de l'écart relevé au comptage. Un appareil manquant ne change pas de statut : aucun ne dit « perdu », et
 * l'écart reste consigné (ADR-023).
 */
export async function cloturerInventaire(
  acteur: UtilisateurConnecte,
  inventaireId: string,
): Promise<void> {
  exigerGestion(acteur);
  await withAudit(
    acteur,
    async (tx) => {
      const { centreId } = await verrouillerOuvert(tx, acteur, inventaireId);
      const lignes = await lireLignes(tx, inventaireId);
      const attendus = await appareilsAttendus(tx, centreId);
      const pointes = lignes.flatMap((l) => (l.pointe && l.numeroSerie ? [l.numeroSerie] : []));
      const { manquants, excedents } = ecartsAppareils(
        attendus.map((a) => a.numeroSerie),
        pointes,
      );
      const numerosEnEcart = [...manquants, ...excedents];

      const nonComptes = await tx.stockAccessoire.count({
        where: {
          centreId,
          quantite: { gt: 0 },
          accessoireId: { notIn: lignes.flatMap((l) => l.accessoireId ?? []) },
        },
      });
      if (nonComptes > 0) {
        throw new ErreurSaisie({}, `Il reste ${nonComptes} accessoire(s) à compter.`);
      }
      const accessoiresEnEcart = lignes.flatMap((l) => {
        const { accessoireId, justification } = l;
        if (accessoireId === null || l.quantiteTheorique === null || l.quantiteComptee === null) {
          return [];
        }
        const ecart = ecartAccessoire(l.quantiteTheorique, l.quantiteComptee);
        return ecart === 0 ? [] : [{ accessoireId, ecart, justification }];
      });
      const nonJustifies =
        numerosEnEcart.filter((n) => !ligneNumero(lignes, n)?.justification).length +
        accessoiresEnEcart.filter((a) => !a.justification).length;
      if (nonJustifies > 0) {
        throw new ErreurSaisie({}, `Il reste ${nonJustifies} écart(s) à justifier.`);
      }

      await tx.inventaireLigne.updateMany({
        where: {
          inventaireId,
          OR: [
            { numeroSerie: { in: numerosEnEcart } },
            { accessoireId: { in: accessoiresEnEcart.map((a) => a.accessoireId) } },
          ],
        },
        data: { ecart: true },
      });

      const evenements: EvenementAudit[] = [];
      for (const { accessoireId, ecart, justification } of accessoiresEnEcart) {
        const operation = {
          centreId,
          accessoireId,
          quantite: Math.abs(ecart),
          motif: justification ?? '',
        };
        const entree = ecart > 0;
        const quantiteApres = await (entree ? crediter : debiter)(tx, operation);
        const type = entree ? 'INVENTAIRE_ENTREE' : 'INVENTAIRE_SORTIE';
        evenements.push(
          await ecrireMouvementAccessoire(tx, acteur, type, operation, quantiteApres),
        );
      }

      const valeur = await calculerValeur(tx, acteur.organisationId, [centreId]);
      await tx.inventaire.update({
        where: { id: inventaireId },
        data: {
          statut: 'CLOTURE',
          clotureParId: acteur.id,
          clotureLe: new Date(horloge.now()),
          valeurCentimes: valeur.valeurCentimes,
          articlesSansPrix: valeur.articlesSansPrix,
        },
      });
      evenements.push({
        action: 'UPDATE',
        entiteType: 'INVENTAIRE',
        entiteId: inventaireId,
        centreId,
        details: {
          statutApres: 'CLOTURE',
          ecartsAppareils: numerosEnEcart.length,
          ecartsAccessoires: accessoiresEnEcart.length,
        },
      });
      return evenements;
    },
    (evenements) => evenements,
  );
}
