import { z } from 'zod';

import { emailSchema } from '../acces/utilisateur';
import { codePostalSchema, telephoneSchema } from '../centre/centre';
import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { nirSchema, type Nir } from './nir';
import { dateSaisieSchema } from './recherche';

export const CIVILITES = ['M', 'MME'] as const;
export const civiliteSchema = z.enum(CIVILITES, { error: 'Civilité invalide.' });
export type Civilite = z.infer<typeof civiliteSchema>;
export const LIBELLES_CIVILITE: Readonly<Record<Civilite, string>> = { M: 'M.', MME: 'Mme' };

export const SEXES = ['MASCULIN', 'FEMININ'] as const;
export const sexeSchema = z.enum(SEXES, { error: 'Sexe invalide.' });
export type Sexe = z.infer<typeof sexeSchema>;
export const LIBELLES_SEXE: Readonly<Record<Sexe, string>> = {
  MASCULIN: 'Masculin',
  FEMININ: 'Féminin',
};

/** Qualité du bénéficiaire vis-à-vis de l'assuré ouvrant droit. */
export const QUALITES = ['ASSURE', 'AYANT_DROIT'] as const;
export const qualiteSchema = z.enum(QUALITES, { error: 'Qualité invalide.' });
export type Qualite = z.infer<typeof qualiteSchema>;
export const LIBELLES_QUALITE: Readonly<Record<Qualite, string>> = {
  ASSURE: 'Assuré',
  AYANT_DROIT: 'Ayant droit',
};

/** Origine des données AMO : saisie manuelle ou lecture de la carte Vitale. */
export const ORIGINES_DONNEE = ['SAISIE', 'VITALE'] as const;
export type OrigineDonnee = (typeof ORIGINES_DONNEE)[number];
export const LIBELLES_ORIGINE: Readonly<Record<OrigineDonnee, string>> = {
  SAISIE: 'Saisie manuelle',
  VITALE: 'Carte Vitale',
};

function texteFacultatif(longueurMax: number) {
  return texteOptionnelSchema.pipe(
    z.string().max(longueurMax, `${longueurMax} caractères au maximum.`).nullable(),
  );
}

function facultatif<S extends z.ZodType<unknown, string>>(schema: S) {
  return texteOptionnelSchema.pipe(schema.nullable());
}

// Codes de l'organisme d'affiliation, tels que lus sur la carte Vitale.
// À VÉRIFIER : longueurs du régime, de la caisse et du centre gestionnaire absentes de docs/ref ;
// on n'impose que des chiffres.
function codeOrganisme(libelle: string) {
  return facultatif(z.string().regex(/^\d{1,10}$/, `${libelle} : chiffres uniquement.`));
}

// Rang de naissance : distingue les ayants droit nés le même jour (jumeaux).
// À VÉRIFIER : bornes 1 à 9 absentes de docs/ref.
const RANG_NAISSANCE = /^[1-9]$/;

export interface AmoSaisie {
  readonly nir: Nir;
  readonly rangNaissance: number;
  readonly qualite: Qualite;
  readonly regime: string | null;
  readonly caisse: string | null;
  readonly centreGestionnaire: string | null;
  readonly finDroits: string | null;
  readonly c2s: boolean;
  readonly ald: boolean;
}

export interface AmcSaisie {
  readonly organismeNom: string;
  readonly organismeIdentifiant: string | null;
  readonly numeroAdherent: string | null;
  readonly typeContrat: string | null;
  readonly debutValidite: string | null;
  readonly finValidite: string | null;
}

const CHAMPS_AMO = [
  'amoNir',
  'amoRegime',
  'amoCaisse',
  'amoCentreGestionnaire',
  'amoFinDroits',
] as const;
const CHAMPS_AMC = [
  'amcOrganismeNom',
  'amcOrganismeIdentifiant',
  'amcNumeroAdherent',
  'amcTypeContrat',
  'amcDebutValidite',
  'amcFinValidite',
] as const;

/**
 * Saisie d'une fiche patient (formulaire à plat). Les couvertures sont facultatives : la couverture AMO
 * existe dès qu'un NIR est saisi, la couverture AMC dès que l'organisme est nommé. Un champ de
 * couverture rempli sans NIR (ou sans organisme) est une erreur, pour ne rien perdre en silence.
 */
export const patientSaisieSchema = z
  .object({
    centreId: z
      .string({ error: 'Le centre de rattachement est obligatoire.' })
      .min(1, 'Le centre de rattachement est obligatoire.'),
    civilite: civiliteSchema,
    nomNaissance: texteObligatoire('Le nom de naissance est obligatoire.', 100),
    nomUsage: texteFacultatif(100),
    prenoms: texteObligatoire('Le prénom est obligatoire.', 200),
    dateNaissance: z
      .string({ error: 'La date de naissance est obligatoire.' })
      .trim()
      .min(1, { error: 'La date de naissance est obligatoire.', abort: true })
      .pipe(dateSaisieSchema),
    sexe: sexeSchema,
    adresseLigne1: texteFacultatif(200),
    adresseLigne2: texteFacultatif(200),
    codePostal: facultatif(codePostalSchema),
    ville: texteFacultatif(100),
    telephone: facultatif(telephoneSchema),
    email: facultatif(emailSchema),
    medecinTraitant: texteFacultatif(200),
    consentementSms: z.boolean(),
    consentementEmail: z.boolean(),
    consentementCourrier: z.boolean(),
    notes: texteFacultatif(5000),

    amoNir: facultatif(nirSchema),
    amoRangNaissance: z.string().trim().default(''),
    amoQualite: z.string().default(''),
    amoRegime: codeOrganisme('Régime'),
    amoCaisse: codeOrganisme('Caisse'),
    amoCentreGestionnaire: codeOrganisme('Centre gestionnaire'),
    amoFinDroits: facultatif(dateSaisieSchema),
    amoC2s: z.boolean(),
    amoAld: z.boolean(),

    amcOrganismeNom: texteFacultatif(200),
    amcOrganismeIdentifiant: texteFacultatif(50),
    amcNumeroAdherent: texteFacultatif(50),
    amcTypeContrat: texteFacultatif(100),
    amcDebutValidite: facultatif(dateSaisieSchema),
    amcFinValidite: facultatif(dateSaisieSchema),
  })
  .superRefine((s, ctx) => {
    if (s.amoNir === null) {
      if (CHAMPS_AMO.some((champ) => s[champ] !== null) || s.amoC2s || s.amoAld) {
        ctx.addIssue({
          code: 'custom',
          path: ['amoNir'],
          message: 'Le NIR est obligatoire pour enregistrer la couverture AMO.',
        });
      }
    } else {
      if (!RANG_NAISSANCE.test(s.amoRangNaissance)) {
        ctx.addIssue({
          code: 'custom',
          path: ['amoRangNaissance'],
          message: 'Le rang de naissance est un chiffre de 1 à 9.',
        });
      }
      if (!qualiteSchema.safeParse(s.amoQualite).success) {
        ctx.addIssue({ code: 'custom', path: ['amoQualite'], message: 'Qualité invalide.' });
      }
    }
    if (s.amcOrganismeNom === null && CHAMPS_AMC.some((champ) => s[champ] !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amcOrganismeNom'],
        message: 'L’organisme complémentaire est obligatoire pour enregistrer la couverture AMC.',
      });
    }
    if (
      s.amcDebutValidite !== null &&
      s.amcFinValidite !== null &&
      s.amcDebutValidite > s.amcFinValidite
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['amcFinValidite'],
        message: 'La fin de validité doit être postérieure ou égale au début.',
      });
    }
  })
  .transform((s) => {
    const amo: AmoSaisie | null =
      s.amoNir === null
        ? null
        : {
            nir: s.amoNir,
            rangNaissance: Number(s.amoRangNaissance),
            qualite: qualiteSchema.parse(s.amoQualite),
            regime: s.amoRegime,
            caisse: s.amoCaisse,
            centreGestionnaire: s.amoCentreGestionnaire,
            finDroits: s.amoFinDroits,
            c2s: s.amoC2s,
            ald: s.amoAld,
          };
    const amc: AmcSaisie | null =
      s.amcOrganismeNom === null
        ? null
        : {
            organismeNom: s.amcOrganismeNom,
            organismeIdentifiant: s.amcOrganismeIdentifiant,
            numeroAdherent: s.amcNumeroAdherent,
            typeContrat: s.amcTypeContrat,
            debutValidite: s.amcDebutValidite,
            finValidite: s.amcFinValidite,
          };
    return {
      centreId: s.centreId,
      civilite: s.civilite,
      nomNaissance: s.nomNaissance,
      nomUsage: s.nomUsage,
      prenoms: s.prenoms,
      dateNaissance: s.dateNaissance,
      sexe: s.sexe,
      adresseLigne1: s.adresseLigne1,
      adresseLigne2: s.adresseLigne2,
      codePostal: s.codePostal,
      ville: s.ville,
      telephone: s.telephone,
      email: s.email,
      medecinTraitant: s.medecinTraitant,
      consentementSms: s.consentementSms,
      consentementEmail: s.consentementEmail,
      consentementCourrier: s.consentementCourrier,
      notes: s.notes,
      amo,
      amc,
    };
  });
export type PatientSaisie = z.output<typeof patientSaisieSchema>;

/** Date de naissance plausible : ni future, ni avant 1900 (contrôle de saisie, pas une règle réglementaire). */
export function erreurDateNaissance(dateNaissance: string, aujourdhui: string): string | null {
  if (dateNaissance > aujourdhui) {
    return 'La date de naissance ne peut pas être dans le futur.';
  }
  if (dateNaissance < '1900-01-01') {
    return 'La date de naissance doit être postérieure au 1er janvier 1900.';
  }
  return null;
}
