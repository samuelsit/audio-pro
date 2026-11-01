import { describe, expect, it } from 'vitest';

import { interpreterCsv } from '../commun/csv';
import {
  bornesDuMois,
  ENTETES_CSV_RELEVE,
  ligneCsvReleveSchema,
  pointerLigneReleve,
  releveSaisieSchema,
} from './releve';

const facture = { id: 'f1', fournisseur: 'Acoustia', numero: 'FA-1', montantTtcCentimes: 144_000 };
const ligne = { fournisseur: 'Acoustia', numeroFacture: 'FA-1', montantTtcCentimes: 144_000 };

describe('pointerLigneReleve', () => {
  it.each([
    ['facture trouvée, même montant', ligne, { etat: 'POINTEE', factureFournisseurId: 'f1' }],
    [
      'casse et espaces ne comptent pas',
      { ...ligne, fournisseur: ' ACOUSTIA ', numeroFacture: 'fa-1' },
      { etat: 'POINTEE', factureFournisseurId: 'f1' },
    ],
    [
      'montant différent',
      { ...ligne, montantTtcCentimes: 1 },
      { etat: 'MONTANT_DIFFERENT', factureFournisseurId: 'f1' },
    ],
    [
      'facture absente',
      { ...ligne, numeroFacture: 'FA-2' },
      { etat: 'MANQUANTE', factureFournisseurId: null },
    ],
    [
      'même numéro, autre fournisseur',
      { ...ligne, fournisseur: 'Sonora' },
      { etat: 'MANQUANTE', factureFournisseurId: null },
    ],
  ])('%s', (_, l, attendu) => {
    expect(pointerLigneReleve(l, [facture])).toEqual(attendu);
  });
});

describe('bornesDuMois', () => {
  it.each([
    ['2030-01', '2030-01-01', '2030-02-01'],
    ['2030-09', '2030-09-01', '2030-10-01'],
    ['2030-12', '2030-12-01', '2031-01-01'],
  ])('%s', (mois, debut, fin) => {
    expect(bornesDuMois(mois)).toEqual({ debut, fin });
  });
});

describe('fichier de relevé', () => {
  const entete = ENTETES_CSV_RELEVE.join(';');

  it('lit un fichier, et refuse une ligne invalide sans s’arrêter', () => {
    const { lignes, erreurs } = interpreterCsv(
      `${entete}\nFA-1;Acoustia;2030-01-07;1 440,00\n;Acoustia;2030-01-07;abc`,
      ENTETES_CSV_RELEVE,
      ligneCsvReleveSchema,
    );
    expect(lignes[0]?.valeur).toEqual({
      numeroFacture: 'FA-1',
      fournisseur: 'Acoustia',
      dateFacture: '2030-01-07',
      montantTtcCentimes: 144_000,
    });
    expect(erreurs.map((e) => e.ligne)).toEqual([3, 3]);
  });

  it('valide la saisie', () => {
    const saisie = {
      centraleAchatId: '019a8000-0000-7000-8000-000000000001',
      mois: '2030-01',
      csv: 'x',
    };
    expect(releveSaisieSchema.safeParse(saisie).success).toBe(true);
    expect(releveSaisieSchema.safeParse({ ...saisie, mois: '2030-13' }).success).toBe(false);
    expect(releveSaisieSchema.safeParse({ ...saisie, csv: '' }).success).toBe(false);
  });
});
