import { describe, expect, it } from 'vitest';

import { evenementAgendaSchema } from './evenements';

const charge = {
  rendezVousId: 'r1',
  centreId: 'c1',
  typeRdvId: 't1',
  patientId: 'p1',
  dossierId: null,
  praticienId: 'u1',
  cabineId: null,
  debut: '2027-01-11T08:00:00.000Z',
  fin: '2027-01-11T08:30:00.000Z',
};

describe('evenementAgendaSchema', () => {
  it.each([
    { type: 'RDV_CREE', charge },
    { type: 'RDV_ANNULE', charge },
    {
      type: 'RDV_DEPLACE',
      charge: { ...charge, ancienDebut: charge.debut, ancienFin: charge.fin },
    },
  ])('accepte $type', (evenement) => {
    expect(evenementAgendaSchema.parse(evenement)).toEqual(evenement);
  });

  it('refuse un déplacement sans son ancien horaire', () => {
    expect(evenementAgendaSchema.safeParse({ type: 'RDV_DEPLACE', charge }).success).toBe(false);
  });

  it('ne laisse passer aucun champ d’identité', () => {
    const resultat = evenementAgendaSchema.parse({
      type: 'RDV_CREE',
      charge: { ...charge, nom: 'Durand', telephone: '0600000000' },
    });
    expect(Object.keys(resultat.charge)).not.toContain('nom');
    expect(Object.keys(resultat.charge)).not.toContain('telephone');
  });
});
