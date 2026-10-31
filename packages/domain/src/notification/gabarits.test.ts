import { describe, expect, it } from 'vitest';

import {
  GABARITS_NOTIFICATION,
  messageCodeSms,
  parametresGabaritSchema,
  rendreMessage,
} from './gabarits';

const PARAMETRES = {
  centre: 'Centre Nord',
  telephoneCentre: '0123456789',
  date: '2027-01-11',
  heure: '10:30',
};
const LIEN = 'https://exemple.test/rdv/lien/abc';

describe('rendreMessage', () => {
  it.each([
    { gabarit: 'RDV_CONFIRME', contient: 'est confirmé le lundi 11 janvier à 10h30', lien: true },
    { gabarit: 'RDV_ACCEPTE', contient: 'est confirmé le lundi 11 janvier à 10h30', lien: true },
    { gabarit: 'RDV_DEMANDE_RECUE', contient: 'est bien reçue', lien: true },
    { gabarit: 'RDV_DEPLACE', contient: 'a lieu le lundi 11 janvier à 10h30', lien: true },
    { gabarit: 'RDV_REFUSE', contient: 'Contactez le centre au 0123456789', lien: false },
    { gabarit: 'RDV_ANNULE', contient: 'est annulé', lien: false },
  ] as const)('$gabarit', ({ gabarit, contient, lien }) => {
    const { corps, sujet } = rendreMessage(gabarit, PARAMETRES, LIEN);
    expect(corps).toContain(contient);
    expect(corps.includes(LIEN)).toBe(lien);
    expect(sujet).not.toBe('');
  });

  it.each(GABARITS_NOTIFICATION)('%s cite le centre, jamais de libellé médical', (gabarit) => {
    const { corps, sujet } = rendreMessage(gabarit, PARAMETRES, LIEN);
    expect(corps).toContain('Centre Nord');
    expect(`${corps} ${sujet}`).not.toMatch(/bilan|essai|appareil|audition|surdité/i);
  });
});

describe('parametresGabaritSchema', () => {
  it.each(['type', 'motif', 'nom'])('refuse le champ %s', (champ) => {
    expect(parametresGabaritSchema.safeParse({ ...PARAMETRES, [champ]: 'x' }).success).toBe(false);
  });
});

describe('messageCodeSms', () => {
  it('contient le code', () => {
    expect(messageCodeSms('123456')).toContain('123456');
  });
});
