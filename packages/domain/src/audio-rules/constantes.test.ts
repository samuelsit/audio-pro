import { describe, expect, it } from 'vitest';

import { dateCalendaireSchema } from '../commun/date';
import * as constantes from './constantes';

describe('constantes réglementaires', () => {
  it.each(Object.entries(constantes))('%s porte une source et une date d’effet', (_nom, c) => {
    expect(c.source).not.toBe('');
    expect(c.dateEffet === null || dateCalendaireSchema.safeParse(c.dateEffet).success).toBe(true);
    expect(Number.isInteger(c.valeur)).toBe(true);
  });

  it.each(Object.entries(constantes).filter(([, c]) => c.dateEffet === null))(
    '%s, sans date d’effet connue, le signale dans sa source',
    (_nom, c) => {
      expect(c.source).toMatch(/À VÉRIFIER|Choix applicatif|modèle non daté/);
    },
  );
});
