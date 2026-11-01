import { randomUUID } from 'node:crypto';

import {
  bornesDuMois,
  ENTETES_CSV_RELEVE,
  estUnPdf,
  interpreterCsv,
  ligneCsvReleveSchema,
  peutGererFournisseurs,
  pointerLigneReleve,
  releveSaisieSchema,
  TAILLE_MAX_FACTURE_OCTETS,
  type ErreurLigneCsv,
  type EtatPointageReleve,
  type FactureAPointer,
  type LigneReleve,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';

const DOUBLON_RELEVE = {
  releve_centrale_centrale_achat_id_mois_key: ['mois', 'Ce relevé est déjà importé.'],
} as const;

export interface LigneReleveVue {
  rang: number;
  numeroFacture: string;
  fournisseur: string;
  dateFacture: string;
  montantTtcCentimes: number;
  etat: EtatPointageReleve;
  factureFournisseurId: string | null;
}

export interface ApercuReleve {
  lignes: LigneReleveVue[];
  erreurs: readonly ErreurLigneCsv[];
}

export interface ReleveResume {
  id: string;
  mois: string;
  centrale: string;
  lignes: number;
  ecarts: number;
}

export interface FactureHorsReleve {
  id: string;
  numero: string;
  fournisseur: string;
  montantTtcCentimes: number;
}

export interface ReleveDetail extends ReleveResume {
  aDocument: boolean;
  detail: LigneReleveVue[];
  /** Factures validées du mois, de fournisseurs de la centrale, que le relevé ne cite pas. */
  horsReleve: FactureHorsReleve[];
}

/** Un relevé couvre tous les centres : il revient à l'administrateur du client. */
function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererFournisseurs(acteur.role)) {
    throw new AccesRefuseError();
  }
}

type Lecteur = Pick<ClientTransaction, 'factureFournisseur' | 'centraleAchat'>;

async function exigerCentrale(
  client: Pick<ClientTransaction, 'centraleAchat'>,
  acteur: UtilisateurConnecte,
  centraleAchatId: string,
): Promise<void> {
  const centrale = await client.centraleAchat.findFirst({
    where: { id: centraleAchatId, organisationId: acteur.organisationId },
    select: { id: true },
  });
  if (!centrale) {
    throw ErreurSaisie.surChamp('centraleAchatId', 'Centrale inconnue.');
  }
}

/** Factures validées des fournisseurs de la centrale, quel que soit leur mois : un relevé peut en rattraper une. */
async function facturesDeLaCentrale(
  client: Lecteur,
  centraleAchatId: string,
): Promise<(FactureAPointer & { date: Date })[]> {
  const factures = await client.factureFournisseur.findMany({
    where: { statut: 'VALIDEE', fournisseur: { centraleAchatId } },
    select: {
      id: true,
      numero: true,
      montantTtcCentimes: true,
      dateFacture: true,
      fournisseur: { select: { nom: true } },
    },
  });
  return factures.map((f) => ({
    id: f.id,
    numero: f.numero ?? '',
    montantTtcCentimes: f.montantTtcCentimes ?? 0,
    fournisseur: f.fournisseur?.nom ?? '',
    date: f.dateFacture ?? new Date(0),
  }));
}

function versVue(rang: number, ligne: LigneReleve, factures: readonly FactureAPointer[]) {
  return { rang, ...ligne, ...pointerLigneReleve(ligne, factures) };
}

function interpreter(csv: string) {
  return interpreterCsv(csv, ENTETES_CSV_RELEVE, ligneCsvReleveSchema);
}

/** Lit le fichier sans rien écrire : la personne voit le pointage avant d'importer. */
export async function previsualiserReleve(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<ApercuReleve> {
  exigerGestion(acteur);
  const { centraleAchatId, csv } = valider(releveSaisieSchema, saisie);
  const client = base(acteur);
  await exigerCentrale(client, acteur, centraleAchatId);
  const { lignes, erreurs } = interpreter(csv);
  const factures = await facturesDeLaCentrale(client, centraleAchatId);
  return { lignes: lignes.map(({ valeur }, rang) => versVue(rang, valeur, factures)), erreurs };
}

/** Importe tout ou rien. Le PDF source, s'il est joint, est conservé tel quel. */
export async function importerReleve(
  acteur: UtilisateurConnecte,
  saisie: unknown,
  pdf: Uint8Array | null,
): Promise<string> {
  exigerGestion(acteur);
  const { centraleAchatId, mois, csv } = valider(releveSaisieSchema, saisie);
  const { lignes, erreurs } = interpreter(csv);
  if (erreurs.length > 0 || lignes.length === 0) {
    throw ErreurSaisie.surChamp('csv', 'Le fichier contient des erreurs : rien n’est importé.');
  }
  if (pdf !== null && (!estUnPdf(pdf) || pdf.length > TAILLE_MAX_FACTURE_OCTETS)) {
    throw ErreurSaisie.surChamp('pdf', 'Ce fichier n’est pas un PDF acceptable.');
  }
  let documentCle: string | null = null;
  if (pdf !== null) {
    documentCle = `releves-centrale/${randomUUID()}`;
    await documents().put(documentCle, pdf, 'application/pdf');
  }
  try {
    const { id } = await withAudit(
      acteur,
      async (tx) => {
        await exigerCentrale(tx, acteur, centraleAchatId);
        const factures = await facturesDeLaCentrale(tx, centraleAchatId);
        const releve = await tx.releveCentrale.create({
          data: {
            organisationId: acteur.organisationId,
            centraleAchatId,
            mois,
            documentCle,
            importeParId: acteur.id,
          },
          select: { id: true },
        });
        await tx.releveCentraleLigne.createMany({
          data: lignes.map(({ valeur }, rang) => ({
            ...versVue(rang, valeur, factures),
            organisationId: acteur.organisationId,
            releveId: releve.id,
            dateFacture: new Date(`${valeur.dateFacture}T00:00:00.000Z`),
          })),
        });
        return releve;
      },
      ({ id: cree }) => ({
        action: 'CREATE',
        entiteType: 'RELEVE_CENTRALE',
        entiteId: cree,
        details: { mois, lignes: lignes.length },
      }),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_RELEVE, 'Ce relevé est déjà importé.');
  }
}

export async function listerReleves(acteur: UtilisateurConnecte): Promise<ReleveResume[]> {
  exigerGestion(acteur);
  const releves = await base(acteur).releveCentrale.findMany({
    where: { organisationId: acteur.organisationId },
    orderBy: { mois: 'desc' },
    select: {
      id: true,
      mois: true,
      centraleAchat: { select: { nom: true } },
      lignes: { select: { etat: true } },
    },
  });
  return releves.map((r) => ({
    id: r.id,
    mois: r.mois,
    centrale: r.centraleAchat.nom,
    lignes: r.lignes.length,
    ecarts: r.lignes.filter((l) => l.etat !== 'POINTEE').length,
  }));
}

export async function obtenirReleve(
  acteur: UtilisateurConnecte,
  releveId: string,
): Promise<ReleveDetail> {
  exigerGestion(acteur);
  const client = base(acteur);
  const releve = await client.releveCentrale.findFirst({
    where: { id: releveId, organisationId: acteur.organisationId },
    select: {
      id: true,
      mois: true,
      centraleAchatId: true,
      documentCle: true,
      centraleAchat: { select: { nom: true } },
      lignes: { orderBy: { rang: 'asc' } },
    },
  });
  if (!releve) {
    throw new AccesRefuseError();
  }
  const detail = releve.lignes.map((l) => ({
    rang: l.rang,
    numeroFacture: l.numeroFacture,
    fournisseur: l.fournisseur,
    dateFacture: l.dateFacture.toISOString().slice(0, 10),
    montantTtcCentimes: l.montantTtcCentimes,
    etat: l.etat,
    factureFournisseurId: l.factureFournisseurId,
  }));
  const citees = new Set(detail.map((l) => l.factureFournisseurId));
  const { debut, fin } = bornesDuMois(releve.mois);
  const factures = await facturesDeLaCentrale(client, releve.centraleAchatId);
  return {
    id: releve.id,
    mois: releve.mois,
    centrale: releve.centraleAchat.nom,
    aDocument: releve.documentCle !== null,
    lignes: detail.length,
    ecarts: detail.filter((l) => l.etat !== 'POINTEE').length,
    detail,
    horsReleve: factures
      .filter((f) => {
        const date = f.date.toISOString().slice(0, 10);
        return date >= debut && date < fin && !citees.has(f.id);
      })
      .map(({ id, numero, fournisseur, montantTtcCentimes }) => ({
        id,
        numero,
        fournisseur,
        montantTtcCentimes,
      })),
  };
}

/** Refait le pointage : une facture validée après l'import trouve ainsi sa ligne. */
export async function repointerReleve(
  acteur: UtilisateurConnecte,
  releveId: string,
): Promise<number> {
  exigerGestion(acteur);
  return withAudit(
    acteur,
    async (tx) => {
      const releve = await tx.releveCentrale.findFirst({
        where: { id: releveId, organisationId: acteur.organisationId },
        select: { centraleAchatId: true, lignes: true },
      });
      if (!releve) {
        throw new AccesRefuseError();
      }
      const factures = await facturesDeLaCentrale(tx, releve.centraleAchatId);
      let modifiees = 0;
      for (const ligne of releve.lignes) {
        const { etat, factureFournisseurId } = pointerLigneReleve(ligne, factures);
        if (etat !== ligne.etat || factureFournisseurId !== ligne.factureFournisseurId) {
          modifiees += 1;
          await tx.releveCentraleLigne.update({
            where: { id: ligne.id },
            data: { etat, factureFournisseurId },
          });
        }
      }
      return modifiees;
    },
    (modifiees) => ({
      action: 'UPDATE',
      entiteType: 'RELEVE_CENTRALE',
      entiteId: releveId,
      details: { repointage: true, modifiees },
    }),
  );
}
