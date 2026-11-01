import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { texteObligatoire } from '../commun/texte';
import { centimesDepuisSaisieEuros } from '../money';

/**
 * Colonnes du fichier de relevé. Format défini ici, provisoire : aucun relevé réel n'est documenté (À VÉRIFIER
 * avec la centrale). La date s'écrit AAAA-MM-JJ, le montant en euros.
 */
export const ENTETES_CSV_RELEVE = ['numero_facture', 'fournisseur', 'date', 'montant_ttc'] as const;

export const ligneCsvReleveSchema = z
  .object({
    numero_facture: texteObligatoire('Le numéro de facture est obligatoire.', 100),
    fournisseur: texteObligatoire('Le fournisseur est obligatoire.'),
    date: dateCalendaireSchema,
    montant_ttc: z.string().transform((saisie, ctx) => {
      const centimes = centimesDepuisSaisieEuros(saisie);
      if (centimes === null) {
        ctx.addIssue({ code: 'custom', message: 'Montant invalide.' });
        return z.NEVER;
      }
      return centimes;
    }),
  })
  .transform((l) => ({
    numeroFacture: l.numero_facture,
    fournisseur: l.fournisseur,
    dateFacture: l.date,
    montantTtcCentimes: l.montant_ttc,
  }));
export type LigneReleve = z.output<typeof ligneCsvReleveSchema>;

export const releveSaisieSchema = z.object({
  centraleAchatId: z.uuid('Choisir la centrale.'),
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu : AAAA-MM.'),
  csv: z.string().min(1, 'Choisir le fichier du relevé.'),
});

export const ETATS_POINTAGE_RELEVE = ['POINTEE', 'MANQUANTE', 'MONTANT_DIFFERENT'] as const;
export type EtatPointageReleve = (typeof ETATS_POINTAGE_RELEVE)[number];

export const LIBELLES_POINTAGE_RELEVE: Readonly<Record<EtatPointageReleve, string>> = {
  POINTEE: 'Pointée',
  MANQUANTE: 'Facture absente',
  MONTANT_DIFFERENT: 'Montant différent',
};

export interface FactureAPointer {
  readonly id: string;
  readonly fournisseur: string;
  readonly numero: string;
  readonly montantTtcCentimes: number;
}

export interface LignePointee {
  readonly etat: EtatPointageReleve;
  readonly factureFournisseurId: string | null;
}

function normaliser(texte: string): string {
  return texte.trim().toLowerCase();
}

/** Cherche la facture validée qu'une ligne du relevé regroupe : même fournisseur, même numéro. */
export function pointerLigneReleve(
  ligne: Pick<LigneReleve, 'fournisseur' | 'numeroFacture' | 'montantTtcCentimes'>,
  factures: readonly FactureAPointer[],
): LignePointee {
  const facture = factures.find(
    (f) =>
      normaliser(f.numero) === normaliser(ligne.numeroFacture) &&
      normaliser(f.fournisseur) === normaliser(ligne.fournisseur),
  );
  if (!facture) {
    return { etat: 'MANQUANTE', factureFournisseurId: null };
  }
  return {
    etat: facture.montantTtcCentimes === ligne.montantTtcCentimes ? 'POINTEE' : 'MONTANT_DIFFERENT',
    factureFournisseurId: facture.id,
  };
}

/** Bornes d'un mois AAAA-MM, en dates ISO : le premier jour, et le premier du mois suivant. */
export function bornesDuMois(mois: string): { readonly debut: string; readonly fin: string } {
  const [annee = 0, numero = 1] = mois.split('-').map(Number);
  const suivant =
    numero === 12
      ? `${String(annee + 1)}-01`
      : `${String(annee)}-${String(numero + 1).padStart(2, '0')}`;
  return { debut: `${mois}-01`, fin: `${suivant}-01` };
}
