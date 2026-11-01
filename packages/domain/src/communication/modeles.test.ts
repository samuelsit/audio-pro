import { describe, expect, it } from 'vitest';

import { SCENARIOS_COMMUNICATION } from './catalogue';
import {
  MODELES_DEFAUT,
  modeleMessageSaisieSchema,
  piedEmail,
  rendreTexte,
  termesRefuses,
  valeursMessage,
  variablesAdmises,
  variablesDuTexte,
} from './modeles';
import { analyserSms } from './sms';

const SAISIE = {
  nom: 'Rappel',
  scenario: 'RAPPEL_RDV_J1',
  sujet: 'Rappel de votre rendez-vous',
  corpsEmail: 'Bonjour {prenom}, rendez-vous le {dateRdv}.',
  corpsSms: '{prenom}, RDV le {dateRdv} a {heureRdv}.',
  corpsCourrier: '',
};

describe('variablesDuTexte', () => {
  it('liste les variables', () => {
    expect(variablesDuTexte('{a} et {b}, sans {} ni { c }')).toEqual(['a', 'b']);
  });
});

describe('variablesAdmises', () => {
  it.each([
    ['RAPPEL_RDV_J1', true],
    ['ANNIVERSAIRE', false],
    [null, false],
  ] as const)('%s', (scenario, avecRdv) => {
    expect(variablesAdmises(scenario).includes('dateRdv')).toBe(avecRdv);
  });
});

describe('termesRefuses', () => {
  it.each([
    ['Votre appareil est prêt', ['APPAREIL']],
    ['fin d’essai', ['ESSAI']],
    ['Votre prothèse auditive', ['PROTHESE', 'AUDITIVE']],
    ['DEVIS à signer', ['DEVIS']],
    ['une surdité', ['SURDITE']],
    ['Bonjour, à bientôt', []],
    ['Essayez encore', []],
    ['{centre}', []],
  ])('%s', (texte, attendu) => {
    expect(termesRefuses(texte)).toEqual(attendu);
  });
});

describe('rendreTexte', () => {
  it('remplace les variables et efface celles sans valeur', () => {
    expect(rendreTexte('{prenom} : {lien}.', { prenom: 'Lou' })).toBe('Lou : .');
  });
});

describe('valeursMessage', () => {
  const entree = {
    prenoms: 'Marie Claire',
    centre: 'Centre Démo',
    telephoneCentre: '01 02 03 04 05',
    lien: 'https://exemple.test/l/abc',
    rdv: { date: '2027-02-02', heure: '14:30' },
  };

  it('ne garde que le premier prénom', () => {
    expect(valeursMessage(entree).prenom).toBe('Marie');
  });

  it('écrit la date et l’heure en clair', () => {
    expect(valeursMessage(entree)).toMatchObject({ dateRdv: 'mardi 2 février', heureRdv: '14h30' });
  });

  it('remplace le lien absent par le téléphone', () => {
    expect(valeursMessage({ ...entree, lien: null }).lien).toBe('01 02 03 04 05');
  });

  it('n’a pas de date sans rendez-vous', () => {
    expect(valeursMessage({ ...entree, rdv: null })).not.toHaveProperty('dateRdv');
  });
});

describe('MODELES_DEFAUT', () => {
  it.each(SCENARIOS_COMMUNICATION)('%s est neutre, valide et tient en deux SMS', (scenario) => {
    const textes = MODELES_DEFAUT[scenario];
    const verdict = modeleMessageSaisieSchema.safeParse({ nom: 'Défaut', scenario, ...textes });
    expect(verdict.success).toBe(true);
    const rendu = rendreTexte(textes.corpsSms, {
      prenom: 'Lou',
      centre: 'Centre Démo de Paris',
      telephoneCentre: '01 02 03 04 05',
      dateRdv: 'mercredi 30 septembre',
      heureRdv: '14h30',
      lien: 'https://exemple.test/l/AbCdEfGhIjKl',
    });
    expect(analyserSms(rendu).encodage).toBe('GSM7');
    expect(analyserSms(rendu).segments).toBeLessThanOrEqual(2);
  });
});

describe('modeleMessageSaisieSchema', () => {
  it('accepte un modèle valide et vide le courrier absent', () => {
    expect(modeleMessageSaisieSchema.parse(SAISIE).corpsCourrier).toBeNull();
  });

  it.each([
    ['variable inconnue', { corpsSms: 'Bonjour {nom}' }, 'corpsSms'],
    ['date hors scénario de RDV', { scenario: 'ANNIVERSAIRE' }, 'corpsEmail'],
    ['donnée de santé dans le SMS', { corpsSms: 'Votre appareil' }, 'corpsSms'],
    ['donnée de santé dans le sujet', { sujet: 'Votre essai se termine' }, 'sujet'],
    ['sujet trop court pour Scaleway', { sujet: 'Rappel' }, 'sujet'],
    ['variable inconnue dans une lettre', { corpsCourrier: 'Cher {nom}' }, 'corpsCourrier'],
  ])('refuse : %s', (_, changement, champ) => {
    const verdict = modeleMessageSaisieSchema.safeParse({ ...SAISIE, ...changement });
    expect(verdict.error?.issues[0]?.path).toEqual([champ]);
  });

  it('admet que la lettre nomme son objet', () => {
    const saisie = { ...SAISIE, corpsCourrier: 'Votre appareil a quatre ans.' };
    expect(modeleMessageSaisieSchema.safeParse(saisie).success).toBe(true);
  });
});

describe('piedEmail', () => {
  it('ajoute le centre et le lien de désinscription', () => {
    expect(piedEmail('Corps', 'Centre', 'https://exemple.test/d')).toBe(
      'Corps\n\n--\nCentre\nPour ne plus recevoir nos messages : https://exemple.test/d',
    );
  });
});
