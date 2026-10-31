import { describe, expect, it } from 'vitest';

import {
  AucunCentreAccessibleError,
  centresAccessibles,
  CHOIX_TOUS_LES_CENTRES,
  peutAccederAuCentre,
  resoudrePerimetre,
  type ProfilAcces,
} from './perimetre';

const admin: ProfilAcces = { role: 'ADMIN_CLIENT', centreIds: [] };
const assistantA: ProfilAcces = { role: 'ASSISTANT', centreIds: ['A'] };
const audioAB: ProfilAcces = { role: 'AUDIO', centreIds: ['A', 'B'] };
const sansCentre: ProfilAcces = { role: 'ASSISTANT', centreIds: [] };
const responsableAB: ProfilAcces = { role: 'RESPONSABLE_CENTRE', centreIds: ['A', 'B'] };
const responsableSansCentre: ProfilAcces = { role: 'RESPONSABLE_CENTRE', centreIds: [] };

describe('peutAccederAuCentre', () => {
  it.each([
    { profil: admin, centre: 'A', attendu: true },
    { profil: admin, centre: 'C', attendu: true },
    { profil: assistantA, centre: 'A', attendu: true },
    { profil: assistantA, centre: 'B', attendu: false },
    { profil: audioAB, centre: 'B', attendu: true },
    { profil: audioAB, centre: 'C', attendu: false },
    { profil: sansCentre, centre: 'A', attendu: false },
    { profil: responsableAB, centre: 'B', attendu: true },
    { profil: responsableAB, centre: 'C', attendu: false },
  ])('$profil.role $profil.centreIds → $centre : $attendu', ({ profil, centre, attendu }) => {
    expect(peutAccederAuCentre(profil, centre)).toBe(attendu);
  });
});

describe('centresAccessibles', () => {
  const centres = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

  it.each([
    { profil: admin, attendu: ['A', 'B', 'C'] },
    { profil: assistantA, attendu: ['A'] },
    { profil: audioAB, attendu: ['A', 'B'] },
    { profil: sansCentre, attendu: [] },
  ])('$profil.role $profil.centreIds → $attendu', ({ profil, attendu }) => {
    expect(centresAccessibles(profil, centres).map((c) => c.id)).toEqual(attendu);
  });
});

describe('resoudrePerimetre', () => {
  const tous = { type: 'tous' };
  const centre = (centreId: string) => ({ type: 'centre', centreId });

  it.each([
    { cas: 'ADMIN_CLIENT sans choix', profil: admin, choix: undefined, attendu: tous },
    { cas: 'ADMIN_CLIENT « tous »', profil: admin, choix: CHOIX_TOUS_LES_CENTRES, attendu: tous },
    { cas: 'ADMIN_CLIENT centre valide', profil: admin, choix: 'B', attendu: centre('B') },
    { cas: 'ADMIN_CLIENT centre inconnu', profil: admin, choix: 'Z', attendu: tous },
    { cas: 'ASSISTANT sans choix', profil: assistantA, choix: undefined, attendu: centre('A') },
    { cas: 'ASSISTANT son centre', profil: assistantA, choix: 'A', attendu: centre('A') },
    { cas: 'ASSISTANT centre B forgé', profil: assistantA, choix: 'B', attendu: centre('A') },
    { cas: 'ASSISTANT « tous » forgé', profil: assistantA, choix: 'tous', attendu: centre('A') },
    { cas: 'AUDIO second centre', profil: audioAB, choix: 'B', attendu: centre('B') },
    { cas: 'RESPONSABLE sans choix', profil: responsableAB, choix: undefined, attendu: tous },
    { cas: 'RESPONSABLE « tous »', profil: responsableAB, choix: 'tous', attendu: tous },
    { cas: 'RESPONSABLE son centre', profil: responsableAB, choix: 'B', attendu: centre('B') },
    { cas: 'RESPONSABLE centre C forgé', profil: responsableAB, choix: 'C', attendu: tous },
  ])('$cas', ({ profil, choix, attendu }) => {
    expect(resoudrePerimetre(profil, choix, ['A', 'B', 'C'])).toEqual(attendu);
  });

  it('ignore un rattachement à un centre non sélectionnable (inactif)', () => {
    expect(resoudrePerimetre(audioAB, 'A', ['B', 'C'])).toEqual(centre('B'));
  });

  it('refuse un profil sans centre accessible', () => {
    expect(() => resoudrePerimetre(sansCentre, undefined, ['A'])).toThrow(
      AucunCentreAccessibleError,
    );
    expect(() => resoudrePerimetre(assistantA, 'A', ['B'])).toThrow(/Aucun centre actif/);
    expect(() => resoudrePerimetre(responsableSansCentre, undefined, ['A'])).toThrow(
      AucunCentreAccessibleError,
    );
  });
});
