import { describe, expect, it } from 'vitest';

import {
  arriveeProspectSchema,
  cabineSaisieSchema,
  changementStatutRdvSchema,
  deplacementRdvSchema,
  exceptionSaisieSchema,
  rdvSaisieSchema,
  rechercheCreneauxSchema,
  typeRdvSaisieSchema,
} from './saisie';
import { TYPES_RDV_DEFAUT } from './types-defaut';

function messages(resultat: { error?: { issues: { message: string }[] } | undefined }) {
  return resultat.error?.issues.map((i) => i.message);
}

const PATIENT = {
  centreId: 'c1',
  typeRdvId: 't1',
  patientId: 'p1',
  date: '2027-01-11',
  heure: '09:00',
  dureeMinutes: '30',
  praticienId: 'u1',
  origine: 'INTERNE',
};

const PROSPECT = {
  ...PATIENT,
  patientId: '',
  prospectNom: ' Camille Durand ',
  prospectTelephone: '01 23 45 67 89',
};

describe('rdvSaisieSchema', () => {
  it('accepte un RDV de patient', () => {
    const rdv = rdvSaisieSchema.parse(PATIENT);
    expect(rdv).toMatchObject({
      patientId: 'p1',
      prospectNom: null,
      dossierId: null,
      cabineId: null,
      notes: null,
      dureeMinutes: 30,
      confirmerHorsDisponibilites: false,
    });
  });

  it('accepte un RDV de prospect', () => {
    expect(rdvSaisieSchema.parse(PROSPECT)).toMatchObject({
      patientId: null,
      prospectNom: 'Camille Durand',
    });
  });

  it.each([
    {
      cas: 'ni patient ni prospect',
      saisie: { ...PATIENT, patientId: '' },
      attendu: [
        'Choisir un patient, ou saisir le nom du prospect.',
        'Le téléphone du prospect est obligatoire.',
      ],
    },
    {
      cas: 'patient et prospect',
      saisie: { ...PROSPECT, patientId: 'p1' },
      attendu: ['Choisir un patient ou un prospect, pas les deux.'],
    },
    {
      cas: 'téléphone seul sur un patient',
      saisie: { ...PATIENT, prospectTelephone: '0123456789' },
      attendu: ['Choisir un patient ou un prospect, pas les deux.'],
    },
    {
      cas: 'dossier sans patient',
      saisie: { ...PROSPECT, dossierId: 'd1' },
      attendu: ['Un dossier suppose un patient.'],
    },
    {
      cas: 'traverse minuit',
      saisie: { ...PATIENT, heure: '23:50', dureeMinutes: '30' },
      attendu: ['Un rendez-vous se termine le jour où il commence.'],
    },
    {
      cas: 'durée hors pas',
      saisie: { ...PATIENT, dureeMinutes: '32' },
      attendu: ['Une durée se règle par 5 minutes.'],
    },
    {
      cas: 'durée trop courte',
      saisie: { ...PATIENT, dureeMinutes: '0' },
      attendu: ['Au moins 5 minutes.'],
    },
    {
      cas: 'durée trop longue',
      saisie: { ...PATIENT, dureeMinutes: '500' },
      attendu: ['Au plus 480 minutes.'],
    },
  ])('refuse : $cas', ({ saisie, attendu }) => {
    expect(messages(rdvSaisieSchema.safeParse(saisie))).toEqual(attendu);
  });
});

describe('deplacementRdvSchema', () => {
  const deplacement = { version: '3', date: '2027-01-11', heure: '10:00', dureeMinutes: 45 };

  it('garde le praticien si le champ est absent', () => {
    const resultat = deplacementRdvSchema.parse(deplacement);
    expect(resultat.praticienId).toBeUndefined();
    expect(resultat.version).toBe(3);
  });

  it('refuse un RDV qui traverse minuit', () => {
    expect(messages(deplacementRdvSchema.safeParse({ ...deplacement, heure: '23:30' }))).toEqual([
      'Un rendez-vous se termine le jour où il commence.',
    ]);
  });
});

describe('changementStatutRdvSchema', () => {
  it.each(['CONFIRME', 'VU', 'ABSENT'])('accepte %s', (statut) => {
    expect(changementStatutRdvSchema.parse({ version: 1, statut }).statut).toBe(statut);
  });

  it.each(['ARRIVE', 'ANNULE', 'PLANIFIE'])('réserve %s à sa propre action', (statut) => {
    expect(changementStatutRdvSchema.safeParse({ version: 1, statut }).success).toBe(false);
  });
});

describe('arriveeProspectSchema', () => {
  it('relie une fiche existante', () => {
    expect(arriveeProspectSchema.parse({ mode: 'EXISTANT', patientId: 'p1' })).toEqual({
      mode: 'EXISTANT',
      patientId: 'p1',
    });
  });

  it('exige l’identité minimale d’une fiche nouvelle', () => {
    const resultat = arriveeProspectSchema.safeParse({
      mode: 'NOUVEAU',
      civilite: 'MME',
      nomNaissance: 'Durand',
      prenoms: '',
      dateNaissance: '',
      sexe: 'FEMININ',
    });
    expect(messages(resultat)).toEqual([
      'Le prénom est obligatoire.',
      'La date de naissance est obligatoire.',
    ]);
  });
});

describe('cabineSaisieSchema', () => {
  it('exige un nom', () => {
    expect(messages(cabineSaisieSchema.safeParse({ centreId: 'c1', nom: ' ' }))).toEqual([
      'Le nom de la cabine est obligatoire.',
    ]);
  });
});

describe('typeRdvSaisieSchema', () => {
  const type = {
    nom: 'Bilan',
    dureeMinutes: '60',
    couleur: '#2563EB',
    requierePraticien: true,
    requiereCabine: false,
    reservableEnLigne: false,
    delaiMinimalMinutes: '0',
    natureEssai: '',
  };

  it('normalise la couleur et la nature', () => {
    expect(typeRdvSaisieSchema.parse(type)).toMatchObject({
      couleur: '#2563eb',
      natureEssai: null,
    });
  });

  it('accepte une nature d’essai', () => {
    expect(typeRdvSaisieSchema.parse({ ...type, natureEssai: 'POSE' }).natureEssai).toBe('POSE');
  });

  it('exige au moins une ressource', () => {
    expect(messages(typeRdvSaisieSchema.safeParse({ ...type, requierePraticien: false }))).toEqual([
      'Un rendez-vous occupe un praticien, une cabine ou les deux.',
    ]);
  });

  it.each(TYPES_RDV_DEFAUT.map((t) => ({ ...t })))('type par défaut valide : $nom', (t) => {
    expect(typeRdvSaisieSchema.parse(t)).toEqual(t);
  });
});

describe('exceptionSaisieSchema', () => {
  const periode = { du: '2027-08-02', au: '2027-08-13' };

  it.each([
    { cas: 'congé', saisie: { type: 'CONGE', praticienId: 'u1', ...periode } },
    {
      cas: 'congé d’un jour',
      saisie: { type: 'CONGE', praticienId: 'u1', du: '2027-08-02', au: '2027-08-02' },
    },
    { cas: 'fermeture', saisie: { type: 'FERMETURE_CENTRE', centreId: 'c1', ...periode } },
    {
      cas: 'disponibilité',
      saisie: {
        type: 'DISPONIBILITE',
        praticienId: 'u1',
        centreId: 'c1',
        du: '2027-08-07',
        au: '2027-08-07',
        heureDebut: '09:00',
        heureFin: '12:00',
      },
    },
    {
      cas: 'indisponibilité de cabine',
      saisie: { type: 'INDISPONIBILITE', cabineId: 'k1', ...periode },
    },
    {
      cas: 'indisponibilité de praticien',
      saisie: { type: 'INDISPONIBILITE', praticienId: 'u1', ...periode },
    },
  ])('accepte : $cas', ({ saisie }) => {
    expect(exceptionSaisieSchema.safeParse(saisie).success).toBe(true);
  });

  it.each([
    {
      cas: 'congé sans praticien',
      saisie: { type: 'CONGE', ...periode },
      attendu: 'Choisir le praticien.',
    },
    {
      cas: 'fermeture sans centre',
      saisie: { type: 'FERMETURE_CENTRE', ...periode },
      attendu: 'Choisir le centre.',
    },
    {
      cas: 'disponibilité sans praticien',
      saisie: { type: 'DISPONIBILITE', centreId: 'c1', ...periode },
      attendu: 'Choisir le praticien.',
    },
    {
      cas: 'disponibilité sans centre',
      saisie: { type: 'DISPONIBILITE', praticienId: 'u1', ...periode },
      attendu: 'Choisir le centre.',
    },
    {
      cas: 'indisponibilité sans cible',
      saisie: { type: 'INDISPONIBILITE', ...periode },
      attendu: 'Choisir un praticien ou une cabine.',
    },
    {
      cas: 'indisponibilité à deux cibles',
      saisie: { type: 'INDISPONIBILITE', praticienId: 'u1', cabineId: 'k1', ...periode },
      attendu: 'Choisir un praticien ou une cabine.',
    },
    {
      cas: 'fin avant le début',
      saisie: { type: 'CONGE', praticienId: 'u1', du: '2027-08-13', au: '2027-08-02' },
      attendu: 'La fin doit suivre le début.',
    },
    {
      cas: 'une seule heure',
      saisie: { type: 'CONGE', praticienId: 'u1', ...periode, heureDebut: '09:00' },
      attendu: 'Saisir les deux heures, ou aucune.',
    },
    {
      cas: 'même jour, heures inversées',
      saisie: {
        type: 'CONGE',
        praticienId: 'u1',
        du: '2027-08-02',
        au: '2027-08-02',
        heureDebut: '12:00',
        heureFin: '09:00',
      },
      attendu: 'La fin doit suivre le début.',
    },
  ])('refuse : $cas', ({ saisie, attendu }) => {
    expect(messages(exceptionSaisieSchema.safeParse(saisie))).toEqual([attendu]);
  });
});

describe('rechercheCreneauxSchema', () => {
  it('accepte une recherche sans praticien', () => {
    expect(
      rechercheCreneauxSchema.parse({
        centreId: 'c1',
        typeRdvId: 't1',
        praticienId: '',
        depuis: '2027-01-11',
      }).praticienId,
    ).toBeNull();
  });
});
