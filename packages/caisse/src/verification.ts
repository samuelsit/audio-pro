import type { Prisma } from '@ha/db';
import {
  chargeArchive,
  chargeCloture,
  chargeComptage,
  chargeMouvement,
  chargeOuverture,
  chargeReglement,
  chargeRegularisation,
  DEBUT_CHAINE,
  EMPREINTE_INITIALE,
  maillonSuivantValide,
  serialiserCanonique,
  totauxClotureSchema,
  totauxDepuisMaillons,
  type Hacheur,
  type PositionChaine,
  type RaisonRupture,
  type ResultatChaine,
  type SignatureCaisse,
  type TypeEvenementCaisse,
} from '@ha/domain';

import {
  ajouterMaillon,
  chargeDepuisBase,
  maillonDepuisBase,
  type ContexteChaine,
  type TxCaisse,
} from './chaine';
import { depuisDate } from './dates';

const TAILLE_LOT = 500;

export interface DepsVerification {
  readonly hacheur: Hacheur;
  readonly signature: SignatureCaisse;
}

type ClientLecture = Pick<
  Prisma.TransactionClient,
  | 'evenementCaisse'
  | 'chaineCaisse'
  | 'serieFacture'
  | 'facture'
  | 'encaissement'
  | 'reglementOrganisme'
  | 'regularisationCreance'
  | 'sessionCaisse'
  | 'comptageCaisse'
  | 'clotureCaisse'
  | 'archiveCaisse'
>;

function identiques(a: unknown, b: unknown): boolean {
  return serialiserCanonique(a) === serialiserCanonique(b);
}

async function lireDetails(
  client: ClientLecture,
  centreId: string,
  premier: number,
  dernier: number,
  factureIds: readonly string[],
) {
  const plage = { centreId, rang: { gte: premier, lte: dernier } };
  const [pieces, mouvements, reglements, regularisations, sessions, comptages, clotures, archives] =
    await Promise.all([
      client.facture.findMany({
        where: { id: { in: [...factureIds] }, statut: 'VALIDEE' },
        include: { lignes: { orderBy: { rang: 'asc' } } },
      }),
      client.encaissement.findMany({ where: plage }),
      client.reglementOrganisme.findMany({ where: plage }),
      client.regularisationCreance.findMany({ where: plage }),
      client.sessionCaisse.findMany({ where: plage }),
      client.comptageCaisse.findMany({ where: plage, include: { session: true } }),
      client.clotureCaisse.findMany({ where: plage }),
      client.archiveCaisse.findMany({ where: plage }),
    ]);
  return {
    pieces: new Map(pieces.map((p) => [p.id, p])),
    mouvements: new Map(mouvements.map((m) => [m.rang, m])),
    reglements: new Map(reglements.map((r) => [r.rang, r])),
    regularisations: new Map(regularisations.map((r) => [r.rang, r])),
    sessions: new Map(sessions.map((s) => [s.rang, s])),
    comptages: new Map(comptages.map((c) => [c.rang, c])),
    clotures: new Map(clotures.map((c) => [c.rang, c])),
    archives: new Map(archives.map((a) => [a.rang, a])),
  };
}

type Details = Awaited<ReturnType<typeof lireDetails>>;

interface EvenementControle {
  readonly rang: number;
  readonly type: TypeEvenementCaisse;
  readonly factureId: string | null;
  readonly charge: unknown;
  readonly empreinte: string;
}

function pieceFidele(evenement: EvenementControle, details: Details): boolean {
  const piece = details.pieces.get(evenement.factureId ?? '');
  if (!piece?.numero || !piece.numeroSequence || !piece.dateFacture) {
    return false;
  }
  const recalculee = chargeDepuisBase(
    {
      ...piece,
      numero: piece.numero,
      numeroSequence: piece.numeroSequence,
      dateFacture: depuisDate(piece.dateFacture),
    },
    piece.lignes,
  );
  return piece.empreinte === evenement.empreinte && identiques(recalculee, evenement.charge);
}

function mouvementFidele(
  evenement: EvenementControle,
  details: Details,
  hacheur: Hacheur,
): boolean {
  const ligne = details.mouvements.get(evenement.rang);
  return (
    ligne?.empreinte === evenement.empreinte &&
    identiques(chargeMouvement(ligne, hacheur), evenement.charge)
  );
}

function reglementFidele(
  evenement: EvenementControle,
  details: Details,
  hacheur: Hacheur,
): boolean {
  const ligne = details.reglements.get(evenement.rang);
  return (
    ligne?.empreinte === evenement.empreinte &&
    identiques(
      chargeReglement({ ...ligne, dateReglement: depuisDate(ligne.dateReglement) }, hacheur),
      evenement.charge,
    )
  );
}

function regularisationFidele(
  evenement: EvenementControle,
  details: Details,
  hacheur: Hacheur,
): boolean {
  const ligne = details.regularisations.get(evenement.rang);
  return (
    ligne?.empreinte === evenement.empreinte &&
    identiques(chargeRegularisation(ligne, hacheur), evenement.charge)
  );
}

function sessionFidele(evenement: EvenementControle, details: Details, hacheur: Hacheur): boolean {
  if (evenement.type === 'CAISSE_OUVERTE') {
    const session = details.sessions.get(evenement.rang);
    return (
      session?.empreinte === evenement.empreinte &&
      identiques(
        chargeOuverture({ ...session, journee: depuisDate(session.journee) }, hacheur),
        evenement.charge,
      )
    );
  }
  const comptage = details.comptages.get(evenement.rang);
  return (
    comptage?.empreinte === evenement.empreinte &&
    identiques(
      chargeComptage({ ...comptage, journee: depuisDate(comptage.session.journee) }, hacheur),
      evenement.charge,
    )
  );
}

/** Signature et ligne d'une clôture, puis ses totaux d'une journée recalculés depuis ses maillons. */
async function controlerCloture(
  client: ClientLecture,
  centreId: string,
  evenement: EvenementControle,
  details: Details,
  { signature }: DepsVerification,
): Promise<RaisonRupture | null> {
  const ligne = details.clotures.get(evenement.rang);
  if (!ligne) {
    return 'CLOTURE';
  }
  if (!signature.verifier(evenement.empreinte, ligne.signature, ligne.cleId)) {
    return 'SIGNATURE';
  }
  const recalculee = chargeCloture({
    id: ligne.id,
    portee: ligne.portee,
    debut: depuisDate(ligne.debut),
    fin: depuisDate(ligne.fin),
    rangDebut: ligne.rangDebut,
    rangFin: ligne.rangFin,
    totaux: totauxClotureSchema.parse(ligne.totaux),
    grandTotalCentimes: Number(ligne.grandTotalCentimes),
    perpetuelCentimes: Number(ligne.perpetuelCentimes),
    encaissePerpetuelCentimes: Number(ligne.encaissePerpetuelCentimes),
    versionCaisse: ligne.versionCaisse,
  });
  if (ligne.empreinte !== evenement.empreinte || !identiques(recalculee, evenement.charge)) {
    return 'CLOTURE';
  }
  if (ligne.portee !== 'JOUR') {
    return null;
  }
  const maillons = await client.evenementCaisse.findMany({
    where: { centreId, rang: { gte: ligne.rangDebut, lte: ligne.rangFin } },
    orderBy: { rang: 'asc' },
    select: { type: true, charge: true },
  });
  return identiques(totauxDepuisMaillons(maillons), ligne.totaux) ? null : 'CLOTURE';
}

function controlerArchive(
  evenement: EvenementControle,
  details: Details,
  { signature }: DepsVerification,
): RaisonRupture | null {
  const ligne = details.archives.get(evenement.rang);
  if (!ligne) {
    return 'ARCHIVE';
  }
  if (!signature.verifier(evenement.empreinte, ligne.signature, ligne.cleId)) {
    return 'SIGNATURE';
  }
  const recalculee = chargeArchive({
    id: ligne.id,
    debut: depuisDate(ligne.debut),
    fin: depuisDate(ligne.fin),
    rangDebut: ligne.rangDebut,
    rangFin: ligne.rangFin,
    empreinteContenu: ligne.empreinteContenu,
    tailleOctets: ligne.tailleOctets,
    versionCaisse: ligne.versionCaisse,
  });
  return ligne.empreinte === evenement.empreinte && identiques(recalculee, evenement.charge)
    ? null
    : 'ARCHIVE';
}

async function controlerEvenement(
  client: ClientLecture,
  centreId: string,
  evenement: EvenementControle,
  details: Details,
  deps: DepsVerification,
): Promise<RaisonRupture | null> {
  switch (evenement.type) {
    case 'FACTURE_VALIDEE':
    case 'AVOIR_VALIDE':
      return pieceFidele(evenement, details) ? null : 'PIECE';
    case 'ENCAISSEMENT':
    case 'REMBOURSEMENT':
    case 'ANNULATION_ENCAISSEMENT':
      return mouvementFidele(evenement, details, deps.hacheur) ? null : 'ENCAISSEMENT';
    case 'REGLEMENT_ORGANISME':
    case 'ANNULATION_REGLEMENT_ORGANISME':
      return reglementFidele(evenement, details, deps.hacheur) ? null : 'TIERS_PAYANT';
    case 'REGULARISATION_ORGANISME':
      return regularisationFidele(evenement, details, deps.hacheur) ? null : 'TIERS_PAYANT';
    case 'CAISSE_OUVERTE':
    case 'CAISSE_COMPTEE':
      return sessionFidele(evenement, details, deps.hacheur) ? null : 'SESSION';
    case 'CLOTURE':
      return controlerCloture(client, centreId, evenement, details, deps);
    case 'ARCHIVAGE':
      return controlerArchive(evenement, details, deps);
    default:
      return null;
  }
}

const TYPES_PIECE: readonly TypeEvenementCaisse[] = ['FACTURE_VALIDEE', 'AVOIR_VALIDE'];
const TYPES_MOUVEMENT: readonly TypeEvenementCaisse[] = [
  'ENCAISSEMENT',
  'REMBOURSEMENT',
  'ANNULATION_ENCAISSEMENT',
];
const TYPES_REGLEMENT: readonly TypeEvenementCaisse[] = [
  'REGLEMENT_ORGANISME',
  'ANNULATION_REGLEMENT_ORGANISME',
];

/** Une ligne sans maillon échappe au parcours des maillons : on compare les nombres, et la série. */
async function controlerLignesOrphelines(
  client: ClientLecture,
  centreId: string,
  rang: number,
): Promise<ResultatChaine | null> {
  const compter = (types: readonly TypeEvenementCaisse[]) =>
    client.evenementCaisse.count({ where: { centreId, type: { in: [...types] } } });
  const [
    maillonsPieces,
    maillonsMouvements,
    maillonsReglements,
    maillonsRegularisations,
    maillonsOuvertures,
    maillonsComptages,
    maillonsClotures,
    maillonsArchives,
  ] = await Promise.all([
    compter(TYPES_PIECE),
    compter(TYPES_MOUVEMENT),
    compter(TYPES_REGLEMENT),
    compter(['REGULARISATION_ORGANISME']),
    compter(['CAISSE_OUVERTE']),
    compter(['CAISSE_COMPTEE']),
    compter(['CLOTURE']),
    compter(['ARCHIVAGE']),
  ]);
  const where = { centreId };
  const [
    pieces,
    plusHaut,
    serie,
    mouvements,
    reglements,
    regularisations,
    sessions,
    comptages,
    clotures,
    archives,
  ] = await Promise.all([
    client.facture.count({ where: { centreId, statut: 'VALIDEE' } }),
    client.facture.aggregate({ where, _max: { numeroSequence: true } }),
    client.serieFacture.findUnique({ where, select: { dernierNumero: true } }),
    client.encaissement.count({ where }),
    client.reglementOrganisme.count({ where }),
    client.regularisationCreance.count({ where }),
    client.sessionCaisse.count({ where }),
    client.comptageCaisse.count({ where }),
    client.clotureCaisse.count({ where }),
    client.archiveCaisse.count({ where }),
  ]);
  if (pieces !== maillonsPieces) {
    return { valide: false, rang, raison: 'PIECE' };
  }
  if (mouvements !== maillonsMouvements) {
    return { valide: false, rang, raison: 'ENCAISSEMENT' };
  }
  if (reglements !== maillonsReglements || regularisations !== maillonsRegularisations) {
    return { valide: false, rang, raison: 'TIERS_PAYANT' };
  }
  if (sessions !== maillonsOuvertures || comptages !== maillonsComptages) {
    return { valide: false, rang, raison: 'SESSION' };
  }
  if (clotures !== maillonsClotures) {
    return { valide: false, rang, raison: 'CLOTURE' };
  }
  if (archives !== maillonsArchives) {
    return { valide: false, rang, raison: 'ARCHIVE' };
  }
  // Numéros uniques par centre : autant de pièces que le plus haut numéro, donc aucun trou.
  const dernier = plusHaut._max.numeroSequence ?? 0;
  return dernier === pieces && (serie?.dernierNumero ?? 0) === pieces
    ? null
    : { valide: false, rang, raison: 'NUMEROTATION' };
}

/**
 * Vérifie un centre sans rien écrire : suite des empreintes, puis chaque ligne recalculée depuis la base, signatures
 * comprises, tête de chaîne, lignes sans maillon et numérotation. `client` doit déchiffrer : les textes libres sont
 * chaînés par leur empreinte.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 100 (« détecter et démontrer »), § 120 et § 140.
 */
export async function verifierCentre(
  client: ClientLecture,
  centreId: string,
  deps: DepsVerification,
): Promise<ResultatChaine> {
  let position: PositionChaine = DEBUT_CHAINE;
  for (;;) {
    const lot = await client.evenementCaisse.findMany({
      where: { centreId, rang: { gt: position.rang } },
      orderBy: { rang: 'asc' },
      take: TAILLE_LOT,
    });
    const [premier] = lot;
    const dernier = lot.at(-1);
    if (!premier || !dernier) {
      break;
    }
    const factureIds = lot.flatMap((e) => (e.factureId ? [e.factureId] : []));
    const details = await lireDetails(client, centreId, premier.rang, dernier.rang, factureIds);
    for (const evenement of lot) {
      if (!maillonSuivantValide(position, maillonDepuisBase(evenement), deps.hacheur)) {
        return { valide: false, rang: position.rang + 1, raison: 'MAILLON' };
      }
      const raison = await controlerEvenement(client, centreId, evenement, details, deps);
      if (raison) {
        return { valide: false, rang: evenement.rang, raison };
      }
      position = { rang: evenement.rang, empreinte: evenement.empreinte };
    }
  }
  const tete = await client.chaineCaisse.findUnique({ where: { centreId } });
  if (
    (tete?.dernierRang ?? 0) !== position.rang ||
    (tete?.derniereEmpreinte ?? EMPREINTE_INITIALE) !== position.empreinte
  ) {
    return { valide: false, rang: position.rang, raison: 'TETE' };
  }
  return (
    (await controlerLignesOrphelines(client, centreId, position.rang)) ?? {
      valide: true,
      maillons: position.rang,
    }
  );
}

/** Journalise un échec une seule fois : une chaîne rompue n'ajoute pas un maillon par contrôle. */
export async function journaliserEchec(
  tx: TxCaisse,
  contexte: ContexteChaine,
  centreId: string,
  { rang, raison }: Extract<ResultatChaine, { valide: false }>,
): Promise<void> {
  const dernier = await tx.evenementCaisse.findFirst({
    where: { centreId, type: 'VERIFICATION_ECHEC' },
    orderBy: { rang: 'desc' },
    select: { charge: true },
  });
  const charge = { rangRompu: rang, raison };
  if (!identiques(dernier?.charge ?? null, charge)) {
    await ajouterMaillon(tx, contexte, { centreId, type: 'VERIFICATION_ECHEC', charge });
  }
}

/** Dernier échec journalisé, pour le bandeau de la caisse. */
export function dernierEchec(client: Pick<ClientLecture, 'evenementCaisse'>, centreId: string) {
  return client.evenementCaisse.findFirst({
    where: { centreId, type: 'VERIFICATION_ECHEC' },
    orderBy: { rang: 'desc' },
    select: { rang: true, charge: true, createdAt: true },
  });
}
