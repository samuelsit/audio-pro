import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { lireDbf } from '@ha/adapters';
import { prisma } from '@ha/db';
import { preparerImportLpp, resoudreFichiersLpp, type TypeFichierLpp } from '@ha/domain';

const LIENS_PAR_PAQUET = 5_000;

export interface ResumeImportLpp {
  readonly version: number;
  readonly dateFichiers: string;
  readonly codes: number;
  readonly tarifs: number;
  readonly compatibilites: number;
  readonly incompatibilites: number;
  /** Codes spécifiques reliés à un code générique. */
  readonly codesLies: number;
  /** Vrai si la version était déjà en base : elle a été remplacée à l'identique de ses fichiers. */
  readonly remplacee: boolean;
}

function dateBase(iso: string): Date;
function dateBase(iso: string | null): Date | null;
function dateBase(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso);
}

/**
 * Importe une version de la LPP depuis son dossier. Tout est validé avant la première écriture, puis
 * la version est écrite d'un bloc : un réimport remplace ses lignes, il n'en ajoute jamais.
 */
export async function importerLpp(dossier: string): Promise<ResumeImportLpp> {
  const { version, fichiers } = resoudreFichiersLpp(
    path.basename(path.resolve(dossier)),
    await readdir(dossier),
  );
  const lire = async (type: TypeFichierLpp) =>
    lireDbf(await readFile(path.join(dossier, fichiers[type])));
  const [fiche, histo, comp, incomp] = await Promise.all([
    lire('fiche'),
    lire('histo'),
    lire('comp'),
    lire('incomp'),
  ]);
  const { fiches, tarifs, liens } = preparerImportLpp({
    fiche: fiche.lignes,
    histo: histo.lignes,
    comp: comp.lignes,
    incomp: incomp.lignes,
  });
  const compatibilites = liens.filter((l) => l.type === 'COMPATIBLE').length;

  const remplacee = await prisma().$transaction(
    async (tx) => {
      const { count } = await tx.lppVersion.deleteMany({ where: { numero: version } });
      await tx.lppVersion.create({
        data: {
          numero: version,
          dateFichiers: dateBase(fiche.dateMiseAJour),
          nbCodes: fiches.length,
          nbTarifs: tarifs.length,
          nbCompatibilites: compatibilites,
          nbIncompatibilites: liens.length - compatibilites,
        },
      });

      const codes = fiches.map((f) => f.code);
      await tx.lppCode.createMany({
        data: codes.map((code) => ({ code })),
        skipDuplicates: true,
      });
      await tx.lppCode.updateMany({
        where: {
          code: { in: codes },
          OR: [{ derniereVersion: null }, { derniereVersion: { lt: version } }],
        },
        data: { derniereVersion: version },
      });

      await tx.lppFiche.createMany({
        data: fiches.map((f) => ({
          versionNumero: version,
          code: f.code,
          libelle: f.libelle,
          dateFin: dateBase(f.dateFin),
          ageMax: f.ageMax,
          typePrestation: f.typePrestation,
          indication: f.indication,
          prothese: f.prothese,
          oldCode: f.oldCode,
          codeGenerique: f.codeGenerique,
          rmo: f.rmo,
          arbo: f.arbo,
          brut: f.brut,
        })),
      });
      await tx.lppTarif.createMany({
        data: tarifs.map((t) => ({
          versionNumero: version,
          code: t.code,
          debutValidite: dateBase(t.debutValidite),
          finValidite: dateBase(t.finValidite),
          naturePrestation: t.naturePrestation,
          entente: t.entente,
          dateArrete: dateBase(t.dateArrete),
          dateJo: dateBase(t.dateJo),
          puDevis: t.puDevis,
          baseRemboursementCentimes: t.baseRemboursementCentimes,
          prixLimiteVenteCentimes: t.prixLimiteVenteCentimes,
          montantMaxCentimes: t.montantMaxCentimes,
          quantiteMax: t.quantiteMax,
          prisesEnCharge: t.prisesEnCharge,
          majorationsDom: t.majorationsDom,
          brut: t.brut,
        })),
      });
      for (let i = 0; i < liens.length; i += LIENS_PAR_PAQUET) {
        await tx.lppLien.createMany({
          data: liens.slice(i, i + LIENS_PAR_PAQUET).map((l) => ({ versionNumero: version, ...l })),
        });
      }
      return count > 0;
    },
    { timeout: 120_000 },
  );

  return {
    version,
    dateFichiers: fiche.dateMiseAJour,
    codes: fiches.length,
    tarifs: tarifs.length,
    compatibilites,
    incompatibilites: liens.length - compatibilites,
    codesLies: fiches.filter((f) => f.codeGenerique !== null).length,
    remplacee,
  };
}

/** Pour une commande : libère les connexions, sinon le processus ne se termine pas. */
export async function fermerConnexionsLpp(): Promise<void> {
  await prisma().$disconnect();
}
