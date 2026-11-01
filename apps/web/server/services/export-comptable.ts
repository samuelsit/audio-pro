import { jourParis } from '@ha/caisse';
import {
  bornesJourMs,
  dateCalendaireSchema,
  descriptionFec,
  ecrituresDepuisMaillon,
  exerciceDe,
  formaterEcritures,
  nomFichierFec,
  numeroterEcritures,
  peutGererCaisse,
  PROFIL_FEC,
  sirenDepuisSiret,
  type Ecriture,
  type MaillonComptable,
  type ProfilExport,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { lireParametresComptables } from './caisse';

const TAILLE_LOT = 1000;

const periodeSchema = z
  .object({ debut: dateCalendaireSchema, fin: dateCalendaireSchema })
  .refine(({ debut, fin }) => debut <= fin, 'La fin précède le début.');

const exerciceSchema = z.object({ date: dateCalendaireSchema });

type ClientBase = ReturnType<typeof base>;

/** Écritures d'une plage de jours, dans l'ordre de la chaîne : le calcul lit ce qui a été chaîné. */
async function ecrituresDuCentre(
  client: ClientBase,
  centreId: string,
  debut: string,
  fin: string,
): Promise<readonly (Ecriture & { readonly instant: number })[]> {
  const { comptes } = await lireParametresComptables(client, centreId);
  const ecritures: (Ecriture & { readonly instant: number })[] = [];
  let apres = 0;
  for (;;) {
    const lot = await client.evenementCaisse.findMany({
      where: {
        centreId,
        rang: { gt: apres },
        createdAt: {
          gte: new Date(bornesJourMs(debut).debut),
          lt: new Date(bornesJourMs(fin).fin),
        },
      },
      orderBy: { rang: 'asc' },
      take: TAILLE_LOT,
      select: { rang: true, type: true, charge: true, createdAt: true },
    });
    const dernier = lot.at(-1);
    if (!dernier) {
      return ecritures;
    }
    for (const { rang, type, charge, createdAt } of lot) {
      const maillon: MaillonComptable = { rang, type, charge, date: jourParis(createdAt) };
      for (const ecriture of ecrituresDepuisMaillon(maillon, comptes)) {
        ecritures.push({ ...ecriture, instant: createdAt.getTime() });
      }
    }
    apres = dernier.rang;
  }
}

function exigerGestion(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutGererCaisse(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

/** Écritures de ventes et d'encaissements d'une période, au format du profil du centre. */
export async function exporterEcritures(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<AsyncGenerator<string>> {
  exigerGestion(acteur, centreId);
  const { debut, fin } = valider(periodeSchema, saisie);
  const client = base(acteur);
  const [ecritures, { profil }] = await Promise.all([
    ecrituresDuCentre(client, centreId, debut, fin),
    lireParametresComptables(client, centreId),
  ]);
  await journaliserExport(acteur, centreId, { format: profil.nom, debut, fin });
  return enFlux(formaterEcritures(numeroterEcritures(ecritures), profil));
}

async function journaliserExport(
  acteur: UtilisateurConnecte,
  centreId: string,
  details: Readonly<Record<string, unknown>>,
): Promise<void> {
  await withAudit(acteur, () => Promise.resolve(), {
    action: 'EXPORT',
    entiteType: 'CAISSE',
    entiteId: centreId,
    centreId,
    details,
  });
}

async function* enFlux(lignes: readonly string[]): AsyncGenerator<string> {
  for (const ligne of lignes) {
    yield `${ligne}\n`;
  }
}

export interface FecProduit {
  readonly nom: string;
  readonly contenu: string;
  readonly description: string;
}

/**
 * FEC d'un exercice : tous les centres de même SIREN, à droits complets seulement. Un fichier partiel tromperait.
 * À faire valider par l'expert-comptable : il couvre les ventes et les encaissements, pas la comptabilité.
 * Source : fiscal/boi-cf-ior-60-40-20.html § 10, § 20 et § 100.
 */
export async function produireFec(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<FecProduit> {
  exigerGestion(acteur, centreId);
  const { date } = valider(exerciceSchema, saisie);
  const client = base(acteur);
  const centre = await client.centre.findUniqueOrThrow({
    where: { id: centreId },
    select: { siret: true },
  });
  const siren = sirenDepuisSiret(centre.siret);
  if (siren === null) {
    throw new ErreurSaisie({}, 'Renseignez le SIRET du centre pour produire un FEC.');
  }
  const centres = await client.centre.findMany({ select: { id: true, siret: true } });
  const memeSiren = centres.filter((c) => sirenDepuisSiret(c.siret) === siren);
  memeSiren.forEach((c) => {
    exigerGestion(acteur, c.id);
  });
  const { moisClotureExercice, comptes } = await lireParametresComptables(client, centreId);
  const { debut, fin } = exerciceDe(date, moisClotureExercice);
  const parCentre = await Promise.all(
    memeSiren.map((c) => ecrituresDuCentre(client, c.id, debut, fin)),
  );
  const ecritures = parCentre.flat().sort((a, b) => a.instant - b.instant);
  const libelles = {
    [comptes.compteClients]: 'Clients',
    [comptes.compteAmo]: 'Assurance maladie',
    [comptes.compteAmc]: 'Organismes complémentaires',
    [comptes.compteAcomptes]: 'Clients, avances et acomptes reçus',
    [comptes.compteTva]: 'TVA collectée',
  };
  const lignes = formaterEcritures(
    numeroterEcritures(ecritures),
    PROFIL_FEC satisfies ProfilExport,
    libelles,
  );
  await journaliserExport(acteur, centreId, { format: 'FEC', siren, debut, fin });
  return {
    nom: nomFichierFec(siren, fin),
    contenu: `${lignes.join('\n')}\n`,
    description: descriptionFec(siren, debut, fin),
  };
}
