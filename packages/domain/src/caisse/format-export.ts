import { z } from 'zod';

import type { Ecriture } from './ecritures';

/**
 * Les 18 champs du FEC, dans l'ordre.
 * Source : fiscal/boi-cf-ior-60-40-20.html § 80 à § 270.
 */
export const COLONNES_FEC = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
] as const;
export type ColonneExport = (typeof COLONNES_FEC)[number];

const FORMATS_DATE = ['AAAAMMJJ', 'JJ/MM/AAAA', 'AAAA-MM-JJ'] as const;

export const profilExportSchema = z.object({
  nom: z.string().min(1).max(100),
  separateur: z.enum([';', ',', '|', '\t'], { error: 'Séparateur non pris en charge.' }),
  decimale: z.enum([',', '.'], { error: 'Décimale non prise en charge.' }),
  formatDate: z.enum(FORMATS_DATE, { error: 'Format de date non pris en charge.' }),
  entete: z.boolean(),
  colonnes: z.array(z.enum(COLONNES_FEC)).min(1, 'Choisir au moins une colonne.'),
});
export type ProfilExport = z.output<typeof profilExportSchema>;

/**
 * Source : fiscal/boi-cf-ior-60-40-20.html § 10 (première ligne : noms des champs).
 * À VÉRIFIER : tabulation, UTF-8, dates AAAAMMJJ et virgule décimale viennent de l'art. A47 A-1 du LPF (VI et XII),
 * que le BOI cite sans les reprendre. Lu en ligne le 01/11/2026, absent de docs/ref (R40).
 */
export const PROFIL_FEC: ProfilExport = {
  nom: 'FEC',
  separateur: '\t',
  decimale: ',',
  formatDate: 'AAAAMMJJ',
  entete: true,
  colonnes: [...COLONNES_FEC],
};

export const PROFIL_ECRITURES_DEFAUT: ProfilExport = {
  nom: 'Écritures CSV',
  separateur: ';',
  decimale: ',',
  formatDate: 'JJ/MM/AAAA',
  entete: true,
  colonnes: [
    'JournalCode',
    'EcritureDate',
    'CompteNum',
    'PieceRef',
    'EcritureLib',
    'Debit',
    'Credit',
  ],
};

function formaterDateExport(date: string, format: ProfilExport['formatDate']): string {
  const [annee = '', mois = '', jour = ''] = date.split('-');
  if (format === 'AAAAMMJJ') {
    return `${annee}${mois}${jour}`;
  }
  return format === 'JJ/MM/AAAA' ? `${jour}/${mois}/${annee}` : date;
}

/** À VÉRIFIER : virgule sans séparateur de milliers, voir `PROFIL_FEC`. Un côté vide vaut zéro (BOI § 210). */
function formaterMontant(centimes: number, decimale: ProfilExport['decimale']): string {
  const euros = String(Math.trunc(centimes / 100));
  const fraction = String(centimes % 100).padStart(2, '0');
  return `${euros}${decimale}${fraction}`;
}

/** Le séparateur doit rester sans ambiguïté dans le fichier : il disparaît des libellés. */
function nettoyer(texte: string, separateur: string): string {
  return texte.replaceAll(separateur, ' ').replace(/[\r\n\t]+/g, ' ');
}

export interface EcritureNumerotee extends Ecriture {
  readonly numero: number;
}

/**
 * Numérotation continue par journal, dans l'ordre de la chaîne.
 * Source : fiscal/boi-cf-ior-60-40-20.html § 100 (numérotation propre à chaque journal, à décrire dans la notice).
 */
export function numeroterEcritures(ecritures: readonly Ecriture[]): readonly EcritureNumerotee[] {
  const compteurs = new Map<string, number>();
  return ecritures.map((ecriture) => {
    const numero = (compteurs.get(ecriture.journal) ?? 0) + 1;
    compteurs.set(ecriture.journal, numero);
    return { ...ecriture, numero };
  });
}

/** Lignes de l'export. `libellesComptes` donne l'intitulé de chaque compte, le numéro à défaut. */
export function formaterEcritures(
  ecritures: readonly EcritureNumerotee[],
  profil: ProfilExport,
  libellesComptes: Readonly<Record<string, string>> = {},
): readonly string[] {
  const { separateur, decimale, formatDate, entete, colonnes } = profil;
  const date = (valeur: string) => formaterDateExport(valeur, formatDate);
  const lignes = ecritures.flatMap((e) =>
    e.lignes.map((l) => {
      const valeurs: Readonly<Record<ColonneExport, string>> = {
        JournalCode: e.journal,
        JournalLib: e.journalLibelle,
        EcritureNum: String(e.numero),
        EcritureDate: date(e.date),
        CompteNum: l.compte,
        CompteLib: libellesComptes[l.compte] ?? l.compte,
        CompAuxNum: '',
        CompAuxLib: '',
        PieceRef: e.pieceRef,
        PieceDate: date(e.date),
        EcritureLib: e.libelle,
        Debit: formaterMontant(l.debit, decimale),
        Credit: formaterMontant(l.credit, decimale),
        EcritureLet: '',
        DateLet: '',
        ValidDate: date(e.date),
        Montantdevise: '',
        Idevise: '',
      };
      return colonnes.map((c) => nettoyer(valeurs[c], separateur)).join(separateur);
    }),
  );
  return entete ? [colonnes.join(separateur), ...lignes] : lignes;
}

/** Source : fiscal/boi-cf-ior-60-40-20.html § 370 (exemples). À VÉRIFIER : art. A47 A-1 du LPF, IX (R40). */
export function nomFichierFec(siren: string, dateCloture: string): string {
  return `${siren}FEC${dateCloture.replaceAll('-', '')}`;
}

/** SIREN : les neuf premiers chiffres du SIRET, `null` si le SIRET est absent ou mal formé. */
export function sirenDepuisSiret(siret: string | null): string | null {
  const chiffres = siret?.replace(/\s/g, '') ?? '';
  return /^\d{14}$/.test(chiffres) ? chiffres.slice(0, 9) : null;
}

/**
 * Description qui accompagne obligatoirement le fichier.
 * Source : fiscal/boi-cf-ior-60-40-20.html § 10 et § 100. À VÉRIFIER : contenu exact, art. A47 A-1 du LPF, XI (R40).
 */
export function descriptionFec(siren: string, debut: string, fin: string): string {
  return `Description du fichier des écritures comptables
SIREN ${siren}, exercice du ${debut} au ${fin}.

Périmètre : écritures de ventes et d'encaissements produites par le logiciel de gestion du centre. Ce fichier ne
remplace pas la comptabilité : il ne contient ni à-nouveaux, ni banque, ni achats. À intégrer et à valider par
l'expert-comptable.

Fichier texte encodé en UTF-8. Première ligne : noms des champs. Enregistrements séparés par un saut de ligne,
longueur variable, zones séparées par une tabulation.
Dates au format AAAAMMJJ. Montants avec une virgule décimale, sans séparateur de milliers.
EcritureNum : numérotation continue propre à chaque journal, repéré par JournalCode.
CompAuxNum et CompAuxLib : non utilisés, les comptes de tiers sont collectifs.
EcritureLet, DateLet, Montantdevise et Idevise : non utilisés.
PieceRef : numéro de facture ou d'avoir, « E-n » pour un mouvement de caisse et « C-n » pour un comptage, n étant le
rang du maillon dans la chaîne de caisse du centre.
`;
}
