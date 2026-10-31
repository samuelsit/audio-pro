import { describe, expect, it } from 'vitest';

import {
  peutGererModelesFormulaire,
  peutModifierMesure,
  peutSaisirFormulaire,
  peutSaisirMesure,
} from './droits';

describe('droits sur le dossier audiologique', () => {
  it.each([
    { role: 'ADMIN_CLIENT', mesure: true, formulaire: true, modeles: true },
    { role: 'RESPONSABLE_CENTRE', mesure: true, formulaire: true, modeles: false },
    { role: 'AUDIO', mesure: true, formulaire: true, modeles: false },
    { role: 'ASSISTANT', mesure: false, formulaire: true, modeles: false },
  ] as const)('$role', ({ role, mesure, formulaire, modeles }) => {
    expect(peutSaisirMesure(role)).toBe(mesure);
    expect(peutSaisirFormulaire(role)).toBe(formulaire);
    expect(peutGererModelesFormulaire(role)).toBe(modeles);
  });

  it.each([
    { source: 'SAISIE', attendu: true },
    { source: 'NOAH', attendu: false },
  ] as const)('mesure $source', ({ source, attendu }) => {
    expect(peutModifierMesure(source)).toBe(attendu);
  });
});
