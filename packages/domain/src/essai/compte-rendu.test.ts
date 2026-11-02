import { describe, expect, it } from 'vitest';

import { rendreCompteRenduEssaiHtml, type VueCompteRenduEssai } from './compte-rendu';

// Données fictives.
const VUE: VueCompteRenduEssai = {
  entreprise: {
    nom: 'Audition Démo – Centre Nord',
    adresse: ['1 rue de la Paix', '59000 Lille'],
    telephone: '03 00 00 00 00',
    email: 'nord@exemple.test',
  },
  audioprothesiste: { prenomNom: 'Camille Audio', identifiant: '10000000001' },
  prescripteur: {
    prenomNom: 'Alex Martin',
    cabinet: 'Cabinet ORL',
    adresse: ['3 place du Marché', '69002 Lyon'],
  },
  patient: { prenomNom: 'Jeanne Fictive', dateNaissance: '1950-03-12' },
  lieu: 'Lille',
  dateCourrier: '2026-11-02',
  debut: '2026-10-01',
  fin: null,
  echeance: '2026-11-15',
  issue: null,
  prolongation: { dateDemande: '2026-10-20', jours: 15 },
  appareils: [
    {
      oreille: 'DROITE',
      designation: 'Fabricant Gamme A',
      numeroSerie: 'AB123',
      pose: '2026-10-01',
      retrait: '2026-10-10',
    },
    {
      oreille: 'DROITE',
      designation: 'Fabricant Gamme B',
      numeroSerie: 'CD456',
      pose: '2026-10-10',
      retrait: null,
    },
  ],
  rdvs: [{ date: '2026-10-01', type: 'POSE', compteRendu: 'Pose et réglages' }],
};

describe('rendreCompteRenduEssaiHtml', () => {
  it('rend le déroulé de l’essai en cours', () => {
    const html = rendreCompteRenduEssaiHtml(VUE);
    expect(html).toContain('Essai en cours, échéance au 15/11/2026.');
    expect(html).toContain('Prolongation de 15 jours à votre demande du 20/10/2026.');
    expect(html).toContain('<td>CD456</td><td>10/10/2026</td><td>—</td>');
    expect(html).toContain('<td>AB123</td><td>01/10/2026</td><td>10/10/2026</td>');
    expect(html).toContain('<td>Pose</td>');
    expect(html).toContain('Cabinet ORL');
  });

  it('indique l’issue, sans prolongation ni cabinet', () => {
    const html = rendreCompteRenduEssaiHtml({
      ...VUE,
      issue: 'ACHAT',
      fin: '2026-11-02',
      prolongation: null,
      prescripteur: { prenomNom: 'Alex Martin', cabinet: null, adresse: [] },
    });
    expect(html).toContain('Issue de l’essai : achat, le 02/11/2026.');
    expect(html).not.toContain('Prolongation');
    expect(html).not.toContain('Cabinet ORL');
  });

  it('échappe les textes libres', () => {
    const html = rendreCompteRenduEssaiHtml({
      ...VUE,
      rdvs: [{ date: '2026-10-01', type: 'CONTROLE', compteRendu: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
