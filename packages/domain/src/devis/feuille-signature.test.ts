import { describe, expect, it } from 'vitest';

import { rendreFeuilleSignatureHtml } from './feuille-signature';

const VUE = {
  numero: '2026-000001 v1',
  audioprothesiste: 'Camille Audio',
  patient: 'Alex <Fictif>',
  offreRetenue: 'Offre 100 % santé (1.1)',
  dateSignature: '2026-11-01',
  traceBase64: 'iVBORw0KGgo=',
  empreinteDocument: 'abc123',
  referencePreuve: 'ref-1',
};

describe('rendreFeuilleSignatureHtml', () => {
  const html = rendreFeuilleSignatureHtml(VUE);

  it('reprend les éléments du § 5, le tracé et la preuve', () => {
    expect(html).toContain('2026-000001 v1');
    expect(html).toContain('Offre 100 % santé (1.1)');
    expect(html).toContain('Bon pour accord');
    expect(html).toContain('01/11/2026');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(html).toContain('abc123');
    expect(html).toContain('ref-1');
  });

  it('échappe les données saisies', () => {
    expect(html).toContain('Alex &lt;Fictif&gt;');
    expect(html).not.toContain('Alex <Fictif>');
  });
});
