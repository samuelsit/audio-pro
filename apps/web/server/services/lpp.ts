import { SystemClock } from '@ha/adapters';
import { prisma } from '@ha/db';
import {
  CODES_LPP_TARIFS_AUDIO,
  tarifEnVigueur,
  tarifsAudioDepuisLpp,
  type Clock,
  type TarifsAudio,
} from '@ha/domain';

const horloge: Clock = new SystemClock();

export interface TarifLppApplicable {
  naturePrestation: string;
  baseRemboursementCentimes: number;
  prixLimiteVenteCentimes: number | null;
  debutValidite: string;
  finValidite: string | null;
}

export interface CodeLppDecrit {
  code: string;
  libelle: string | null;
  codeGenerique: string | null;
  /** Tarif applicable à la date demandée ; `null` si le code n'y est pas valide. */
  tarif: TarifLppApplicable | null;
}

function dateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dernière version importée, ou `null` si la base LPP n'a jamais été importée. */
export async function derniereVersionLpp(): Promise<number | null> {
  const version = await prisma().lppVersion.findFirst({
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  return version?.numero ?? null;
}

/**
 * Décrit des codes dans une version de la base (par défaut la dernière), à une date donnée
 * (par défaut aujourd'hui). Un code amorcé par le seed, sans import, n'a ni libellé ni tarif.
 */
export async function decrireCodesLpp(
  codes: readonly string[],
  options: { date?: string; version?: number } = {},
): Promise<CodeLppDecrit[]> {
  const date = options.date ?? horloge.now().slice(0, 10);
  const version = options.version ?? (await derniereVersionLpp());
  const [fiches, tarifs] =
    version === null
      ? [[], []]
      : await Promise.all([
          prisma().lppFiche.findMany({
            where: { versionNumero: version, code: { in: [...codes] } },
            select: { code: true, libelle: true, dateFin: true, codeGenerique: true },
          }),
          prisma().lppTarif.findMany({
            where: { versionNumero: version, code: { in: [...codes] } },
            select: {
              code: true,
              debutValidite: true,
              finValidite: true,
              naturePrestation: true,
              baseRemboursementCentimes: true,
              prixLimiteVenteCentimes: true,
            },
          }),
        ]);
  return codes.map((code) => {
    const fiche = fiches.find((f) => f.code === code);
    const lignes = tarifs
      .filter((t) => t.code === code)
      .map((t) => ({
        naturePrestation: t.naturePrestation,
        baseRemboursementCentimes: t.baseRemboursementCentimes,
        prixLimiteVenteCentimes: t.prixLimiteVenteCentimes,
        debutValidite: dateIso(t.debutValidite),
        finValidite: t.finValidite && dateIso(t.finValidite),
      }));
    return {
      code,
      libelle: fiche?.libelle ?? null,
      codeGenerique: fiche?.codeGenerique ?? null,
      tarif: tarifEnVigueur(lignes, fiche?.dateFin ? dateIso(fiche.dateFin) : null, date),
    };
  });
}

/**
 * Prix limites et bases de remboursement en vigueur à une date (date de délivrance) ; `null` si la
 * base importée ne les couvre pas à cette date.
 */
export async function tarifsAudioEnVigueur(date: string): Promise<TarifsAudio | null> {
  const decrits = await decrireCodesLpp(Object.values(CODES_LPP_TARIFS_AUDIO), { date });
  return tarifsAudioDepuisLpp(new Map(decrits.map((d) => [d.code, d.tarif])));
}

/** Codes de la liste absents du référentiel. */
export async function codesLppInconnus(codes: readonly string[]): Promise<string[]> {
  const connus = await prisma().lppCode.findMany({
    where: { code: { in: [...codes] } },
    select: { code: true },
  });
  const trouves = new Set(connus.map((c) => c.code));
  return codes.filter((code) => !trouves.has(code));
}
