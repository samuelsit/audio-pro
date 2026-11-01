import { z } from 'zod';

import { texteObligatoire, texteOptionnelSchema } from '../commun/texte';
import { centimes, centimesDepuisSaisieEuros, type Centimes } from '../money';
import type { Hacheur } from '../ports/hacheur';
import type { NaturePiece } from '../facture/types';

export const MODES_PAIEMENT = ['CB', 'ESPECES', 'CHEQUE', 'VIREMENT', 'FINANCEMENT'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export const LIBELLES_MODES_PAIEMENT: Readonly<Record<ModePaiement, string>> = {
  CB: 'Carte bancaire',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  VIREMENT: 'Virement',
  FINANCEMENT: 'Financement',
};

/** Une correction est une opération de sens inverse, jamais une modification (R33). */
export const NATURES_MOUVEMENT = ['ENCAISSEMENT', 'REMBOURSEMENT', 'ANNULATION'] as const;
export type NatureMouvement = (typeof NATURES_MOUVEMENT)[number];

export const LIBELLES_NATURES_MOUVEMENT: Readonly<Record<NatureMouvement, string>> = {
  ENCAISSEMENT: 'Encaissement',
  REMBOURSEMENT: 'Remboursement',
  ANNULATION: 'Annulation',
};

const ECHEANCES_MAX = 60;
const echeancesSchema = z.coerce.number().int().min(1).max(ECHEANCES_MAX);

function ajouterErreur(ctx: z.RefinementCtx, champ: string, message: string): void {
  ctx.addIssue({ code: 'custom', path: [champ], message });
}

/** Montant strictement positif, ou `null` avec l'erreur posée sur le champ. */
function montantSaisi(saisie: string, champ: string, ctx: z.RefinementCtx): Centimes | null {
  const montant = centimesDepuisSaisieEuros(saisie);
  if (montant === null || montant === 0) {
    ajouterErreur(ctx, champ, 'Montant invalide (exemple : 150,00).');
    return null;
  }
  return centimes(montant);
}

/** Le rendu n'existe qu'en espèces. Sans montant remis, le patient a donné l'appoint. */
export function calculerRendu(montant: Centimes, remis: Centimes): Centimes {
  return centimes(remis - montant);
}

export const encaissementSaisieSchema = z
  .object({
    mode: z.enum(MODES_PAIEMENT, { error: 'Choisir le mode de paiement.' }),
    montant: texteObligatoire('Le montant est obligatoire.'),
    remis: texteOptionnelSchema,
    reference: texteOptionnelSchema.pipe(
      z.string().max(100, '100 caractères au maximum.').nullable(),
    ),
    partenaire: texteOptionnelSchema.pipe(
      z.string().max(100, '100 caractères au maximum.').nullable(),
    ),
    echeances: texteOptionnelSchema,
  })
  .transform(({ mode, montant, remis, reference, partenaire, echeances }, ctx) => {
    const montantCentimes = montantSaisi(montant, 'montant', ctx);
    if (montantCentimes === null) {
      return z.NEVER;
    }
    const remisCentimes =
      mode === 'ESPECES' && remis !== null ? montantSaisi(remis, 'remis', ctx) : montantCentimes;
    if (remisCentimes === null) {
      return z.NEVER;
    }
    if (remisCentimes < montantCentimes) {
      ajouterErreur(ctx, 'remis', 'Le montant remis est inférieur au montant encaissé.');
    }
    const financement = mode === 'FINANCEMENT';
    const lecture = echeancesSchema.safeParse(echeances);
    if (financement && partenaire === null) {
      ajouterErreur(ctx, 'partenaire', 'Le partenaire de financement est obligatoire.');
    }
    if (financement && !lecture.success) {
      ajouterErreur(ctx, 'echeances', `De 1 à ${String(ECHEANCES_MAX)} échéances.`);
    }
    return {
      mode,
      montantCentimes,
      remisCentimes: mode === 'ESPECES' ? remisCentimes : null,
      renduCentimes:
        mode === 'ESPECES' ? calculerRendu(montantCentimes, remisCentimes) : centimes(0),
      reference,
      partenaire: financement ? partenaire : null,
      echeances: financement ? (lecture.data ?? null) : null,
    };
  });
export type EncaissementSaisi = z.output<typeof encaissementSaisieSchema>;

export const remboursementSaisieSchema = z
  .object({
    nature: z.enum(['REMBOURSEMENT', 'ANNULATION'], { error: 'Choisir l’opération.' }),
    mode: z.enum(MODES_PAIEMENT, { error: 'Choisir le mode de paiement.' }),
    montant: texteObligatoire('Le montant est obligatoire.'),
    motif: texteObligatoire('Le motif est obligatoire.', 500),
    reference: texteOptionnelSchema.pipe(
      z.string().max(100, '100 caractères au maximum.').nullable(),
    ),
  })
  .transform(({ nature, mode, montant, motif, reference }, ctx) => {
    const montantCentimes = montantSaisi(montant, 'montant', ctx);
    return montantCentimes === null ? z.NEVER : { nature, mode, montantCentimes, motif, reference };
  });
export type RemboursementSaisi = z.output<typeof remboursementSaisieSchema>;

export interface Mouvement {
  readonly nature: NatureMouvement;
  readonly montantCentimes: number;
}

/** Encaissé moins rendu aux patients. */
export function encaisseNet(mouvements: readonly Mouvement[]): Centimes {
  return centimes(
    mouvements.reduce(
      (net, { nature, montantCentimes }) =>
        net + (nature === 'ENCAISSEMENT' ? montantCentimes : -montantCentimes),
      0,
    ),
  );
}

/** Ce qu'il reste à rendre sur un encaissement, remboursements et annulations déduits. */
export function resteRemboursable(
  montantOrigine: number,
  inverses: readonly { readonly montantCentimes: number }[],
): Centimes {
  return centimes(inverses.reduce((reste, i) => reste - i.montantCentimes, montantOrigine));
}

export interface PieceSoldee {
  readonly nature: NaturePiece;
  readonly totalTtcCentimes: number;
  readonly totalAmoCentimes: number;
  readonly totalResteCentimes: number;
  readonly tiersPayantAmo: boolean;
}

/** Ce qu'une pièce met à la charge du patient : sans tiers payant, il règle aussi la part AMO. */
export function partPatientDeLaPiece(
  piece: Pick<PieceSoldee, 'totalAmoCentimes' | 'totalResteCentimes' | 'tiersPayantAmo'>,
): Centimes {
  const { totalResteCentimes, totalAmoCentimes, tiersPayantAmo } = piece;
  return centimes(totalResteCentimes + (tiersPayantAmo ? 0 : totalAmoCentimes));
}

export interface Solde {
  /** TTC facturé, avoirs déduits. */
  readonly ttcNet: Centimes;
  /** Reste à charge, avoirs déduits. */
  readonly resteNet: Centimes;
  readonly encaisse: Centimes;
  /** Part du patient : reste à charge, part AMO sans tiers payant et créances passées à sa charge. */
  readonly partPatient: Centimes;
  /** Ce que le patient doit encore, et le plus qu'on puisse encaisser. */
  readonly du: Centimes;
  /** Encaissé au-delà de sa part : à rembourser, ou à reporter sur la prochaine facture du dossier. */
  readonly tropPercu: Centimes;
}

/**
 * Solde d'un dossier ou d'une vente directe, toujours calculé : une pièce validée ne change plus. Après un avoir
 * total, le dossier garde ses paiements pour la facture suivante. La part des organismes n'est pas encaissable au
 * guichet : un patient qui l'avance est une facture sans tiers payant.
 * `transfertsNets` : créances d'organisme passées à la charge du patient, contre-passations déduites.
 * Source : convention-audioprothesistes.pdf, art. 27, p. 26 (dispense d'avance).
 * À VÉRIFIER : R34, R43.
 */
export function calculerSolde(
  pieces: readonly PieceSoldee[],
  mouvements: readonly Mouvement[],
  transfertsNets = 0,
): Solde {
  const signe = (nature: NaturePiece) => (nature === 'FACTURE' ? 1 : -1);
  const ttcNet = pieces.reduce((t, p) => t + signe(p.nature) * p.totalTtcCentimes, 0);
  const resteNet = pieces.reduce((t, p) => t + signe(p.nature) * p.totalResteCentimes, 0);
  const partPatient = pieces.reduce(
    (t, p) => t + signe(p.nature) * partPatientDeLaPiece(p),
    transfertsNets,
  );
  const encaisse = encaisseNet(mouvements);
  return {
    ttcNet: centimes(ttcNet),
    resteNet: centimes(resteNet),
    encaisse,
    partPatient: centimes(partPatient),
    du: centimes(Math.max(partPatient - encaisse, 0)),
    tropPercu: centimes(Math.max(encaisse - partPatient, 0)),
  };
}

/** Acomptes repris par une facture : jamais plus que la part du patient (R35). */
export function acomptesADeduire(acomptesNets: number, partPatient: number): Centimes {
  return centimes(Math.max(Math.min(acomptesNets, partPatient), 0));
}

/** Texte libre chiffré en base : le maillon n'en garde que l'empreinte. */
export function empreinteTexte(texte: string | null, hacheur: Hacheur): string | null {
  return texte === null ? null : hacheur.sha256(texte);
}

/** Encaissement, remboursement ou annulation, tel que chaîné. */
export interface MouvementAChainer {
  readonly id: string;
  readonly nature: NatureMouvement;
  readonly origineId: string | null;
  readonly factureId: string | null;
  readonly devisId: string | null;
  readonly patientId: string;
  readonly mode: ModePaiement;
  readonly montantCentimes: number;
  readonly remisCentimes: number | null;
  readonly renduCentimes: number;
  readonly partenaire: string | null;
  readonly echeances: number | null;
  readonly reference: string | null;
  readonly motif: string | null;
}

/** Charge d'un maillon d'encaissement, recalculée à la vérification depuis la ligne elle-même. */
export function chargeMouvement(m: MouvementAChainer, hacheur: Hacheur): unknown {
  return {
    id: m.id,
    nature: m.nature,
    origineId: m.origineId,
    factureId: m.factureId,
    devisId: m.devisId,
    patientId: m.patientId,
    mode: m.mode,
    montantCentimes: m.montantCentimes,
    remisCentimes: m.remisCentimes,
    renduCentimes: m.renduCentimes,
    echeances: m.echeances,
    partenaireEmpreinte: empreinteTexte(m.partenaire, hacheur),
    referenceEmpreinte: empreinteTexte(m.reference, hacheur),
    motifEmpreinte: empreinteTexte(m.motif, hacheur),
  };
}

export const TYPE_MAILLON_MOUVEMENT = {
  ENCAISSEMENT: 'ENCAISSEMENT',
  REMBOURSEMENT: 'REMBOURSEMENT',
  ANNULATION: 'ANNULATION_ENCAISSEMENT',
} as const satisfies Readonly<Record<NatureMouvement, string>>;
