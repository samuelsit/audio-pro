import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { nirSchema } from '../patient/nir';
import { qualiteSchema } from '../patient/patient';

// Port de lecture de la carte Vitale (carte physique ou application carte Vitale).
//
// Structure provisoire, définie pour le lecteur simulé de l'étape 4. Elle sera alignée sur la
// documentation AreaFSE (docs/vendor/areafse) quand elle sera disponible : noms et formats des champs,
// codes d'erreur, présence de l'ALD et de l'AMC sur la carte.
// À VÉRIFIER : docs/vendor/areafse est vide ; aucun champ ci-dessous ne vient d'une documentation éditeur.

/** Support lu : carte physique ou application carte Vitale (APCV). */
export const SOURCES_LECTURE_VITALE = ['CARTE', 'APCV'] as const;
export const sourceLectureVitaleSchema = z.enum(SOURCES_LECTURE_VITALE);
export type SourceLectureVitale = z.infer<typeof sourceLectureVitaleSchema>;
export const LIBELLES_SOURCE_LECTURE_VITALE: Readonly<Record<SourceLectureVitale, string>> = {
  CARTE: 'Carte Vitale',
  APCV: 'Application carte Vitale',
};

function texteCarte(longueurMax: number) {
  return z.string().trim().min(1).max(longueurMax);
}

function texteCarteFacultatif(longueurMax: number) {
  return z.string().trim().min(1).max(longueurMax).nullable();
}

// Mêmes contraintes que la saisie (patientSaisieSchema) : une valeur lue doit pouvoir être enregistrée.
const codeOrganisme = z
  .string()
  .regex(/^\d{1,10}$/)
  .nullable();

/** Période de droits AMO. Une borne absente n'est pas portée par la carte. */
export const droitsAmoSchema = z
  .object({ debut: dateCalendaireSchema.nullable(), fin: dateCalendaireSchema.nullable() })
  .refine((d) => d.debut === null || d.fin === null || d.debut <= d.fin, {
    error: 'La fin des droits précède leur début.',
  });
export type DroitsAmo = z.output<typeof droitsAmoSchema>;

/** Complémentaire lue sur la carte, même forme qu'une couverture AMC saisie. */
export const amcVitaleSchema = z.object({
  organismeNom: texteCarte(200),
  organismeIdentifiant: texteCarteFacultatif(50),
  numeroAdherent: texteCarteFacultatif(50),
  typeContrat: texteCarteFacultatif(100),
  debutValidite: dateCalendaireSchema.nullable(),
  finValidite: dateCalendaireSchema.nullable(),
});

export const beneficiaireVitaleSchema = z.object({
  /** Nom tel que porté par la carte (nom usuel). */
  nom: texteCarte(100),
  prenom: texteCarte(200),
  dateNaissance: dateCalendaireSchema,
  /** Rang de naissance : distingue les bénéficiaires nés le même jour (jumeaux). */
  rang: z.number().int().min(1).max(9),
  nir: nirSchema,
  qualite: qualiteSchema,
  regime: codeOrganisme,
  caisse: codeOrganisme,
  centreGestionnaire: codeOrganisme,
  droitsAmo: droitsAmoSchema,
  c2s: z.boolean(),
  ald: z.boolean(),
  amc: amcVitaleSchema.nullable(),
});
export type BeneficiaireVitale = z.output<typeof beneficiaireVitaleSchema>;

export const vitaleReadResultSchema = z.object({
  beneficiaires: z.array(beneficiaireVitaleSchema).min(1).max(20),
  source: sourceLectureVitaleSchema,
  /** Instant de la lecture (ISO 8601 avec décalage, fourni par le port Clock). */
  dateLecture: z.iso.datetime({ offset: true }),
});
export type VitaleReadResult = z.output<typeof vitaleReadResultSchema>;

export const CODES_ERREUR_VITALE = [
  'AUCUN_LECTEUR',
  'CARTE_ABSENTE',
  'CARTE_INVALIDE',
  'CARTE_BLOQUEE',
  'ERREUR_TECHNIQUE',
] as const;
export type CodeErreurVitale = (typeof CODES_ERREUR_VITALE)[number];

/** Messages affichés à l'utilisateur. */
export const LIBELLES_ERREUR_VITALE: Readonly<Record<CodeErreurVitale, string>> = {
  AUCUN_LECTEUR: 'Aucun lecteur de carte Vitale n’est détecté sur ce poste.',
  CARTE_ABSENTE: 'Aucune carte n’est insérée dans le lecteur.',
  CARTE_INVALIDE: 'La carte insérée est illisible ou n’est pas une carte Vitale.',
  CARTE_BLOQUEE: 'Cette carte Vitale est bloquée : elle ne peut pas être utilisée.',
  ERREUR_TECHNIQUE:
    'La lecture de la carte a échoué. Réessayez ; si le problème persiste, contactez l’administrateur.',
};

/** Échec de lecture, typé par son code. Le message ne contient jamais de donnée de la carte. */
export class ErreurLectureVitale extends Error {
  constructor(readonly code: CodeErreurVitale) {
    super(LIBELLES_ERREUR_VITALE[code]);
    this.name = 'ErreurLectureVitale';
  }
}

export interface VitaleReader {
  /** Lit la carte insérée. Lève ErreurLectureVitale en cas d'échec. */
  readCard(): Promise<VitaleReadResult>;
}
