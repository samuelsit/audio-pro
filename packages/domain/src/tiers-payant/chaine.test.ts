import { describe, expect, it } from 'vitest';

import type { Hacheur } from '../ports/hacheur';
import { chargeReglement, chargeRegularisation } from './chaine';

const HACHEUR: Hacheur = { sha256: (texte) => `h(${texte})` };

describe('charges du tiers payant', () => {
  const reglement = {
    id: 'r1',
    origineId: null,
    organisme: 'CPAM démo',
    complementaireId: null,
    dateReglement: '2026-11-02',
    reference: 'VIR-1',
    partAmoCentimes: 10_000,
    partAmcCentimes: 2_000,
    origine: 'MANUEL',
    identifiantExterne: null,
    motif: null,
  } as const;

  it('un règlement sans motif', () => {
    expect(chargeReglement(reglement, HACHEUR)).toMatchObject({
      id: 'r1',
      reference: 'VIR-1',
      partAmoCentimes: 10_000,
      motifEmpreinte: null,
    });
  });

  it('un motif n’est chaîné que par son empreinte', () => {
    const charge = chargeReglement({ ...reglement, motif: 'Erreur' }, HACHEUR);
    expect(charge).toMatchObject({ motifEmpreinte: 'h(Erreur)' });
    expect(charge).not.toHaveProperty('motif');
  });

  it('une régularisation', () => {
    expect(
      chargeRegularisation(
        {
          id: 'x1',
          origineId: null,
          creanceId: 'c1',
          reglementId: null,
          type: 'AMC',
          nature: 'TRANSFERT_PATIENT',
          montantCentimes: 3_000,
          motif: 'Refus',
        },
        HACHEUR,
      ),
    ).toEqual({
      id: 'x1',
      origineId: null,
      creanceId: 'c1',
      reglementId: null,
      type: 'AMC',
      nature: 'TRANSFERT_PATIENT',
      montantCentimes: 3_000,
      motifEmpreinte: 'h(Refus)',
    });
  });
});
