import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import { calculerDevis, type ContexteCalcul } from './calcul';
import {
  AIDE_CLASSE_I,
  AIDE_CLASSE_II,
  aide,
  offre,
  piles,
  TARIFS,
  TARIFS_CONSOMMABLES,
} from './fixtures.test-support';
import { MODELE_DEVIS } from './modele';
import { echapperHtml, rendreDevisHtml, type VueDevis } from './rendu';
import type { OffreDonnees } from './types';

const CONTEXTE: ContexteCalcul = {
  dateNaissance: '1950-03-12',
  dateDelivrancePrevue: '2026-11-29',
  c2s: false,
  refusOffreC2S: false,
  surdicecite: false,
  tauxAMO: 60,
};

const OFFRES: readonly OffreDonnees[] = [
  offre({
    aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
    consommables: [piles(4)],
    amcDroite: centimes(71_000),
    amcGauche: centimes(71_000),
    amcConsommables: centimes(240),
  }),
  offre({
    rubrique: 'AUTRE_OFFRE',
    aides: [
      aide('DROITE', 180_000, AIDE_CLASSE_II, 190_000),
      aide('GAUCHE', 180_000, AIDE_CLASSE_II, 190_000),
    ],
  }),
];

function vue(modif: Partial<VueDevis> = {}, offres: readonly OffreDonnees[] = OFFRES): VueDevis {
  return {
    entreprise: {
      nom: 'Audition Démo SAS – Centre Démo Nord',
      adresse: ['12 rue de l’Exemple', '59000 Lille'],
      telephone: '0300000001',
      email: 'nord@exemple.test',
      siret: '00000000000000',
      rcs: 'RCS Démo 000 000 000',
      finess: '000000000',
      tvaIntracommunautaire: 'FR00000000000',
    },
    audioprothesiste: { prenomNom: 'Camille Audio', identifiant: '00000000000' },
    patient: {
      prenomNom: 'Michel Lefebvre',
      nir: '150037500000000',
      organismeComplementaire: 'Mutuelle Démo',
    },
    datePrescription: '2026-10-15',
    numero: '2026-000001 v1',
    dateEmission: '2026-10-30',
    lieuEmission: 'Lille',
    dateFinValidite: '2026-12-30',
    oreilles: {
      DROITE: { type: 'RENOUVELLEMENT', datePrecedent: '2019-05-02' },
      GAUCHE: { type: 'PRIMO', datePrecedent: null },
    },
    c2s: false,
    bobineTPresentee: true,
    depotGarantie: centimes(10_000),
    offres,
    calcul: calculerDevis(offres, CONTEXTE, TARIFS, TARIFS_CONSOMMABLES),
    ...modif,
  };
}

function texteVisible(html: string): string {
  return html
    .replace(/<style>[\s\S]*<\/style>/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ');
}

describe('rendreDevisHtml', () => {
  it('reproduit le modèle (instantané)', async () => {
    await expect(rendreDevisHtml(vue())).toMatchFileSnapshot('__snapshots__/devis-normalise.html');
  });

  it('une seule oreille, sans autre offre (instantané)', async () => {
    const offres = [offre({ aides: [aide('DROITE', 95_000)] })];
    await expect(
      rendreDevisHtml(
        vue(
          {
            oreilles: {
              DROITE: { type: 'PRIMO', datePrecedent: null },
              GAUCHE: { type: null, datePrecedent: null },
            },
            depotGarantie: null,
            bobineTPresentee: false,
            datePrescription: null,
          },
          offres,
        ),
      ),
    ).toMatchFileSnapshot('__snapshots__/devis-normalise-droite-seule.html');
  });

  it.each(Object.values(MODELE_DEVIS).flat())('garde la mention « %s »', (texte) => {
    expect(rendreDevisHtml(vue({}, []))).toContain(texte);
  });

  it.each([
    'Nom de l’entreprise',
    'Audioprothésiste (prénom, nom)',
    'Adresse d’exercice',
    'Courriel',
    'N° d’identification ADELI ou RPPS',
    'Patient (prénom, nom)',
    'N° de sécurité sociale',
    'Organisme complémentaire d’assurance maladie (facultatif)',
    'Date de la prescription médicale préalable obligatoire :',
    'N° du devis',
    'Date et lieu d’émission :',
    'Valable jusqu’au (validité d’au moins 2 mois) :',
    '1.1. Offre 100% santé',
    '1.2. Autre offre :',
    'Aide auditive droite',
    'Aide auditive gauche',
    'Consommables, piles et accessoires',
    'Total offre 100% santé',
    'Total autre offre',
    'Prix HT après remise',
    'Montant pris en charge par l’assurance maladie obligatoire',
    'Montant pris en charge par l’organisme complémentaire d’assurance maladie, si connu',
    'Montant total du reste à charge, si connu :',
    '2. Présentation de la bobine T :',
    '3. Essai de l’aide auditive sans engagement de votre part :',
    '4. Informations sur les prestations et garanties :',
    '5. Validation de la commande et engagement final :',
    'Offre choisie pour la réalisation de l’essai',
    'Offre choisie à l’issue de la réalisation de l’essai',
    'Nom, prénom et signature de l’audioprothésiste D.E ayant réalisé le devis :',
    'Informations d’identification de l’entreprise (n° SIRET, n° RCS, n° FINESS, n° TVA intracommunautaire)',
  ])('garde la rubrique « %s »', (rubrique) => {
    expect(texteVisible(rendreDevisHtml(vue()))).toContain(rubrique);
  });

  it('imprime montants, codes et cases', () => {
    const html = rendreDevisHtml(vue());
    const texte = texteVisible(html);
    expect(texte).toContain('(P1D)');
    expect(texte).toContain('(P2G)');
    expect(texte).toContain('(PIL)');
    expect(texte).toContain('483,60');
    expect(texte).toContain('Date et lieu d’émission : 30/10/2026 à Lille');
    expect(texte).toContain('date du précédent appareillage : 02/05/2019');
    expect(texte).toContain('100,00');
    expect(html.match(/case cochee/g)).toHaveLength(3);
  });

  it('C2S : le code de regroupement reste P2', () => {
    expect(texteVisible(rendreDevisHtml(vue({ c2s: true })))).toContain('(P2D)');
  });

  it('gauche identique à droite : le dit sans répéter', () => {
    expect(texteVisible(rendreDevisHtml(vue()))).toContain('Identique à l’aide auditive droite.');
  });

  it('gauche différente : seules les différences figurent', () => {
    const offres = [
      offre({
        aides: [
          aide('DROITE', 95_000),
          aide('GAUCHE', 95_000, { ...AIDE_CLASSE_I, type: 'RIC', nombreCanaux: 16 }),
        ],
      }),
    ];
    const texte = texteVisible(rendreDevisHtml(vue({}, offres)));
    expect(texte).toContain('- type : RIC, nombre de canaux : 16 ;');
    expect(texte).not.toContain('Identique à l’aide auditive droite.');
  });

  it('ne répète pas la gamme déjà comprise dans le nom du modèle', () => {
    const offres = [
      offre({ aides: [aide('DROITE', 95_000, { ...AIDE_CLASSE_I, modele: 'Aurore 1 C' })] }),
    ];
    expect(texteVisible(rendreDevisHtml(vue({}, offres)))).toContain('modèle : Aurore 1 C ;');
  });

  it('gauche seule : description complète', () => {
    const offres = [offre({ aides: [aide('GAUCHE', 95_000)] })];
    const texte = texteVisible(rendreDevisHtml(vue({}, offres)));
    expect(texte).toContain('référence commerciale : AU-ESS-1 ;');
  });

  it('accepte une fiche partielle, sans « null » imprimé', () => {
    const partielle = {
      ...AIDE_CLASSE_I,
      adresseFabricant: null,
      marque: null,
      referenceCommerciale: null,
      lieuFabrication: null,
      nombreCanaux: null,
      connectivite: null,
      antiLarsen: null,
      bobineT: false,
    };
    const offres = [
      offre({
        aides: [aide('DROITE', 95_000, partielle)],
        consommables: [
          {
            ...piles(),
            designation: { nom: 'Piles', marque: null, referenceCommerciale: null },
          },
        ],
      }),
    ];
    const html = rendreDevisHtml(
      vue(
        {
          patient: { prenomNom: 'A B', nir: '150037500000000', organismeComplementaire: null },
          entreprise: { ...vue().entreprise, siret: null },
        },
        offres,
      ),
    );
    expect(html).not.toContain('null');
    expect(texteVisible(html)).toContain('accessibilité de la boucle magnétique ou bobine T : non');
  });

  it('une rubrique de renouvellement sans date laisse les pointillés', () => {
    const texte = texteVisible(
      rendreDevisHtml(
        vue({
          oreilles: {
            DROITE: { type: 'PRIMO', datePrecedent: '2019-05-02' },
            GAUCHE: { type: null, datePrecedent: null },
          },
        }),
      ),
    );
    expect(texte).toContain('date du précédent appareillage : …/…/……');
  });

  it('échappe toute donnée saisie', () => {
    const offres = [
      offre({
        aides: [aide('DROITE', 95_000, { ...AIDE_CLASSE_I, marque: '<script>alert(1)</script>' })],
      }),
    ];
    const html = rendreDevisHtml(
      vue(
        {
          patient: {
            prenomNom: '<img src=x onerror=alert(1)>',
            nir: '150037500000000',
            organismeComplementaire: '"><b>',
          },
          lieuEmission: 'L&L',
        },
        offres,
      ),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('"><b>');
    expect(html).toContain('L&amp;L');
  });

  it('ne charge aucune ressource externe', () => {
    const html = rendreDevisHtml(vue());
    expect(html).not.toMatch(/https?:|<link|<script|src=/);
  });
});

describe('echapperHtml', () => {
  it('échappe les caractères sensibles', () => {
    expect(echapperHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});
