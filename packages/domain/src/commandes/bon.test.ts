import { describe, expect, it } from 'vitest';

import { rendreBonCommandeHtml, type BonCommandeVue } from './bon';

const vue: BonCommandeVue = {
  numero: 'CMD-2030-000001',
  dateCommande: '2030-01-07',
  client: { raisonSociale: 'Réseau <Démo>', siret: '12345678900011' },
  livraison: {
    nom: 'Centre A',
    adresse: ['1 rue de l’Exemple', '75000 Paris'],
    telephone: '0100000000',
    email: 'centre-a@exemple.test',
  },
  fournisseur: { nom: 'Acoustia', adresse: '2 rue Fictive', numeroClient: 'CL-1' },
  lignes: [
    {
      reference: 'AU-1',
      designation: 'Aurore Essentiel',
      quantite: 2,
      prixUnitaireCentimes: 60_000,
      referencePatient: 'PT-01Z08ZAM',
      oreille: 'DROITE',
    },
    {
      reference: null,
      designation: 'Piles 13',
      quantite: 1,
      prixUnitaireCentimes: 100,
      referencePatient: 'PT-AAAAAAAA',
      oreille: null,
    },
    {
      reference: null,
      designation: 'Kit',
      quantite: 1,
      prixUnitaireCentimes: 100,
      referencePatient: null,
      oreille: null,
    },
  ],
};

describe('rendreBonCommandeHtml', () => {
  it('rend le bon, avec le total et le code interne', () => {
    const html = rendreBonCommandeHtml(vue);
    expect(html).toContain('Bon de commande n° CMD-2030-000001');
    expect(html).toContain('N° client CL-1');
    expect(html).toContain('SIRET 12345678900011');
    expect(html).toContain('Réf. interne PT-01Z08ZAM, oreille droite');
    expect(html).toContain('Total commandé');
  });

  it('échappe les données variables', () => {
    expect(rendreBonCommandeHtml(vue)).toContain('Réseau &lt;Démo&gt;');
  });

  it('sans prix connu, n’annonce aucun total', () => {
    const html = rendreBonCommandeHtml({
      ...vue,
      client: { raisonSociale: 'Réseau', siret: null },
      fournisseur: { nom: 'Acoustia', adresse: null, numeroClient: null },
      lignes: [
        {
          reference: null,
          designation: 'Kit',
          quantite: 1,
          prixUnitaireCentimes: null,
          referencePatient: null,
          oreille: null,
        },
      ],
    });
    expect(html).not.toContain('Total commandé');
    expect(html).not.toContain('SIRET');
    expect(html).not.toContain('N° client');
  });

  it('n’offre aucun champ d’identité', () => {
    const champs = Object.keys(vue.lignes[0] ?? {}).join(' ');
    expect(champs).not.toMatch(/nom|prenom|nir|naissance|patientId/i);
  });
});
