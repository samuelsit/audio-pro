import { describe, expect, it } from 'vitest';

import { enTeteCentreHtml, rendreLettreHtml } from './courriers';

const CENTRE = {
  nom: 'Centre <Démo>',
  adresse: ['1 rue de la Paix', '75002 Paris'],
  telephone: '01 02 03 04 05',
  email: 'centre@exemple.test',
  siret: '12345678900011',
};

describe('enTeteCentreHtml', () => {
  it('porte les coordonnées du centre, échappées', () => {
    const html = enTeteCentreHtml(CENTRE);
    expect(html).toContain('Centre &lt;Démo&gt;');
    expect(html).toContain('<p>75002 Paris</p>');
    expect(html).toContain('SIRET 12345678900011');
  });
});

describe('rendreLettreHtml', () => {
  const html = rendreLettreHtml({
    centre: CENTRE,
    destinataire: { nom: 'Lou Martin', adresse: ['2 rue Haute', '69001 Lyon'] },
    lieu: 'Paris',
    date: '2027-02-01',
    objet: 'Votre suivi',
    corps: 'Bonjour <b>',
  });

  it('adresse la lettre', () => {
    expect(html).toContain('<strong>Lou Martin</strong>');
    expect(html).toContain('<p>69001 Lyon</p>');
  });

  it('date la lettre et échappe son corps', () => {
    expect(html).toContain('Paris, le 01/02/2027');
    expect(html).toContain('Bonjour &lt;b&gt;');
  });
});
