import { describe, expect, it } from 'vitest';

import { AUDIOGRAMME, aerienne, oreille } from './fixtures.test-support';
import { MODELES_PAR_DEFAUT } from './formulaire';
import { MENTION_GRADE } from './grade';
import { rendreSyntheseBilanHtml, type VueSyntheseBilan } from './synthese';

function modele(code: string) {
  const trouve = MODELES_PAR_DEFAUT.find((m) => m.code === code);
  if (trouve === undefined) {
    throw new Error(code);
  }
  return trouve;
}

// Données fictives.
const VUE: VueSyntheseBilan = {
  centre: {
    nom: 'Audition Démo – Centre Nord',
    adresse: ['1 rue de la Paix', '59000 Lille'],
    telephone: '03 00 00 00 00',
  },
  patient: { prenomNom: 'Jeanne Fictive', dateNaissance: '1950-03-12' },
  dateBilan: '2026-11-02',
  praticien: 'Camille Audio',
  anamnese: {
    nom: 'Anamnèse standard',
    definition: modele('ANAMNESE_STANDARD').definition,
    reponses: { otites: 'OUI', exposition: 'NON', gene_bruit: 7, environnement: 'Bruyant' },
  },
  otoscopies: [
    {
      oreille: 'GAUCHE',
      constat: { conduit: 'CERUMEN_PARTIEL', tympan: 'NON_VISIBLE', observation: null },
      photo: false,
    },
    {
      oreille: 'DROITE',
      constat: { conduit: 'LIBRE', tympan: 'NORMAL', observation: 'Sans particularité' },
      photo: true,
    },
  ],
  tonale: {
    source: 'SAISIE',
    date: '2026-11-02',
    appareil: 'Audiomètre de démonstration',
    audiogramme: AUDIOGRAMME,
  },
  vocales: [
    {
      source: 'SAISIE',
      date: '2026-11-02',
      appareil: null,
      vocale: {
        contexte: 'CALME',
        typeBruit: null,
        courbes: [
          {
            ecoute: 'DROITE',
            transducteur: 'CASQUE',
            appareille: false,
            liste: 'Lafon',
            points: [
              { niveau: 40, pourcentage: 30 },
              { niveau: 60, pourcentage: 90 },
            ],
          },
        ],
      },
    },
    {
      source: 'NOAH',
      date: '2026-11-02',
      appareil: null,
      vocale: {
        contexte: 'BRUIT',
        typeBruit: 'Cocktail party',
        courbes: [
          {
            ecoute: 'BINAURALE',
            transducteur: 'CHAMP_LIBRE',
            appareille: true,
            liste: null,
            points: [{ niveau: 5, pourcentage: 80 }],
          },
        ],
      },
    },
  ],
  questionnaires: [
    {
      nom: 'Bénéfice ressenti',
      definition: modele('BENEFICE_SIMPLE').definition,
      reponses: { benefice_calme: 8, benefice_bruit: 6, benefice_quotidien: 7 },
    },
    {
      nom: 'Satisfaction',
      definition: modele('SATISFACTION_SIMPLE').definition,
      reponses: { satisfaction_confort: 9 },
    },
  ],
};

const VIDE: VueSyntheseBilan = {
  ...VUE,
  centre: { ...VUE.centre, telephone: null },
  praticien: null,
  anamnese: null,
  otoscopies: [],
  tonale: null,
  vocales: [],
  questionnaires: [],
};

describe('rendreSyntheseBilanHtml', () => {
  it('bilan complet (instantané)', async () => {
    await expect(rendreSyntheseBilanHtml(VUE)).toMatchFileSnapshot(
      '__snapshots__/synthese-bilan.html',
    );
  });

  it('bilan vide (instantané)', async () => {
    await expect(rendreSyntheseBilanHtml(VIDE)).toMatchFileSnapshot(
      '__snapshots__/synthese-bilan-vide.html',
    );
  });

  it('porte toujours la mention du grade avec un audiogramme', () => {
    expect(rendreSyntheseBilanHtml(VUE)).toContain(MENTION_GRADE);
    expect(rendreSyntheseBilanHtml(VIDE)).not.toContain(MENTION_GRADE);
  });

  it('donne le grade global d’une perte asymétrique, et la perte unilatérale', () => {
    const html = rendreSyntheseBilanHtml({
      ...VIDE,
      tonale: {
        source: 'SAISIE',
        date: '2026-11-02',
        appareil: null,
        audiogramme: {
          droite: oreille({ aerienne: aerienne(10, 10, 10, 10) }),
          gauche: oreille({ aerienne: aerienne(70, 70, 70, 70) }),
        },
      },
    });
    expect(html).toContain('Perte unilatérale.');
    expect(html).toContain('Perte asymétrique.');
    expect(html).toContain('Grade global : 1');
    expect(html).toContain('28,0 dB HL');
  });

  it('dit « non calculable » sans grade', () => {
    const html = rendreSyntheseBilanHtml({
      ...VIDE,
      tonale: {
        source: 'SAISIE',
        date: '2026-11-02',
        appareil: null,
        audiogramme: { droite: oreille(), gauche: oreille() },
      },
    });
    expect(html).toContain('Non calculable');
  });

  it('ne contient aucune ressource externe', () => {
    expect(rendreSyntheseBilanHtml(VUE).replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(
      /https?:\/\//,
    );
  });

  it('échappe les textes saisis', () => {
    const html = rendreSyntheseBilanHtml({
      ...VIDE,
      patient: { prenomNom: '<script>x</script>', dateNaissance: '1950-03-12' },
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
