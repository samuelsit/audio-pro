import { createHash, randomUUID } from 'node:crypto';

import { clientPlateforme } from '@ha/db';
import {
  estUnPdf,
  reperer,
  TAILLE_MAX_FACTURE_OCTETS,
  type BoiteFactures,
  type DocumentStore,
  type ExtracteurFacture,
  type MessageFacture,
} from '@ha/domain';
import { z } from 'zod';

import type { FileTravaux } from '../file';
import { definirTravail, type ContexteTravail, type Travail } from '../travail';

const chargeReleve = z.object({});
type ChargeReleve = typeof chargeReleve;

export interface DependancesReleve {
  readonly boite: BoiteFactures;
  readonly extracteur: ExtracteurFacture;
  readonly documents: DocumentStore;
}

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Relève la boîte unique d'un client. Chaque PDF entre dans la file de validation : aucune facture ne se valide
 * seule. Identifiant de message et empreinte du fichier rendent le travail rejouable. Un message sans PDF acceptable
 * reste dans la boîte, aucun fichier n'est perdu.
 */
export function travailReleveFactures({
  boite,
  extracteur,
  documents,
}: DependancesReleve): Travail<ChargeReleve> {
  async function importerPiece(
    { client, organisationId }: ContexteTravail,
    message: MessageFacture,
    identifiantExterne: string,
    contenu: Uint8Array,
  ): Promise<void> {
    const documentEmpreinte = createHash('sha256').update(contenu).digest('hex');
    const existante = await client.factureFournisseur.findFirst({
      where: {
        statut: { not: 'REJETEE' },
        OR: [{ identifiantExterne }, { documentEmpreinte }],
      },
      select: { id: true },
    });
    if (existante) {
      return;
    }
    const extraite = await extracteur.extraire(contenu);
    const [fournisseurs, centres, comptes] = await Promise.all([
      client.fournisseur.findMany({
        select: { id: true, siret: true, emailFacturation: true },
      }),
      client.centre.findMany({ select: { id: true, siret: true } }),
      client.fournisseurCompteCentre.findMany({
        select: { fournisseurId: true, centreId: true, numeroClient: true },
      }),
    ]);
    const repere = reperer(extraite, message.expediteur, fournisseurs, centres, comptes);
    const documentCle = `factures-fournisseurs/${randomUUID()}`;
    await documents.put(documentCle, contenu, 'application/pdf');
    const { id: factureId } = await client.factureFournisseur.create({
      data: {
        organisationId,
        origine: 'EMAIL',
        documentCle,
        documentEmpreinte,
        identifiantExterne,
        expediteur: message.expediteur,
        expediteurInconnu: repere.expediteurInconnu,
        fournisseurId: repere.fournisseurId,
        centreId: repere.centreId,
        numero: extraite.numero,
        dateFacture: extraite.dateFacture === null ? null : versDate(extraite.dateFacture),
        montantHtCentimes: extraite.montantHtCentimes,
        montantTvaCentimes: extraite.montantTvaCentimes,
        montantTtcCentimes: extraite.montantTtcCentimes,
      },
      select: { id: true },
    });
    for (const [rang, ligne] of extraite.lignes.entries()) {
      await client.factureFournisseurLigne.create({
        data: {
          organisationId,
          factureId,
          rang,
          reference: ligne.reference,
          designation: ligne.designation,
          quantite: ligne.quantite,
          prixUnitaireCentimes: ligne.prixUnitaireCentimes,
          numerosSerie: [...ligne.numerosSerie],
        },
      });
    }
  }

  return definirTravail({
    nom: 'relever-factures',
    charge: chargeReleve,
    async executer(contexte) {
      const parametres = await contexte.client.parametresCommande.findUnique({
        where: { organisationId: contexte.organisationId },
        select: { adresseBoiteFactures: true },
      });
      const adresse = parametres?.adresseBoiteFactures ?? null;
      if (adresse === null) {
        return;
      }
      for (const message of await boite.relever(adresse)) {
        const pieces = message.pieces.filter(
          ({ contenu }) => estUnPdf(contenu) && contenu.length <= TAILLE_MAX_FACTURE_OCTETS,
        );
        if (pieces.length === 0) {
          console.warn(`Boîte de factures : message ${message.identifiant} sans PDF acceptable.`);
          continue;
        }
        for (const [rang, { contenu }] of pieces.entries()) {
          await importerPiece(contexte, message, `${message.identifiant}:${String(rang)}`, contenu);
        }
        await boite.acquitter(adresse, message.identifiant);
      }
    },
  });
}

/** Met en file les organisations qui ont une adresse de réception. */
export async function repartirReleve(
  file: FileTravaux,
  travail: Travail<ChargeReleve>,
): Promise<void> {
  const organisations = await clientPlateforme().$queryRaw<{ organisationId: string }[]>`
    SELECT organisation_id AS "organisationId" FROM parametres_commande
    WHERE adresse_boite_factures IS NOT NULL`;
  for (const { organisationId } of organisations) {
    await file.envoyer(travail, { organisationId, cleIdempotence: 'releve', charge: {} });
  }
}
