import { describe, expect, it } from 'vitest';

import { EMPREINTE_INITIALE, enchainer, serialiserCanonique } from '../facture/chaine';
import type { Hacheur } from '../ports/hacheur';
import {
  chargeArchive,
  contenuArchive,
  NOTICE_ARCHIVE,
  verifierArchive,
  type MaillonArchive,
} from './archive';

const HACHEUR: Hacheur = { sha256: (texte) => `h(${texte})` };

function maillons(): MaillonArchive[] {
  const premier = {
    rang: 4,
    type: 'FACTURE_VALIDEE',
    charge: { a: 1 },
    empreintePrecedente: EMPREINTE_INITIALE,
  } as const;
  const empreinte = enchainer(premier, HACHEUR);
  const second = {
    format: 2,
    rang: 5,
    type: 'ENCAISSEMENT',
    charge: { b: 2 },
    empreintePrecedente: empreinte,
    centreId: 'c1',
    acteurId: 'u1',
    horodatage: '2026-11-02T09:00:00.000Z',
  } as const;
  return [
    {
      ...premier,
      format: 1,
      centreId: 'c1',
      acteurId: 'u1',
      horodatage: '2026-11-01T09:00:00.000Z',
      empreinte,
    },
    { ...second, empreinte: enchainer(second, HACHEUR) },
  ];
}

const ENTREE = {
  debut: '2026-11-01',
  fin: '2026-11-30',
  versionCaisse: '1.0',
  centre: { id: 'c1', nom: 'Centre', siret: null },
  clePublique: 'cle',
  maillons: maillons(),
  pieces: [],
  lignes: [],
  mouvements: [],
  sessions: [],
  comptages: [],
  clotures: [],
};

describe('archive', () => {
  const contenu = contenuArchive(ENTREE);

  it('joint la notice en français et se lit en JSON', () => {
    expect(JSON.parse(contenu)).toMatchObject({ notice: NOTICE_ARCHIVE, debut: '2026-11-01' });
  });

  it('se vérifie seule', () => {
    expect(verifierArchive(contenu, HACHEUR.sha256(contenu), HACHEUR)).toEqual({
      valide: true,
      maillons: 2,
    });
  });

  it('accepte une archive vide', () => {
    const vide = contenuArchive({ ...ENTREE, maillons: [] });
    expect(verifierArchive(vide, HACHEUR.sha256(vide), HACHEUR)).toEqual({
      valide: true,
      maillons: 0,
    });
  });

  it('refuse une empreinte différente', () => {
    expect(verifierArchive(contenu, 'autre', HACHEUR)).toEqual({
      valide: false,
      raison: 'EMPREINTE',
    });
  });

  it('refuse un fichier illisible', () => {
    expect(verifierArchive('{', HACHEUR.sha256('{'), HACHEUR)).toEqual({
      valide: false,
      raison: 'FORMAT',
    });
    expect(verifierArchive('{}', HACHEUR.sha256('{}'), HACHEUR)).toEqual({
      valide: false,
      raison: 'FORMAT',
    });
  });

  it('refuse un maillon altéré, même avec une empreinte de fichier recalculée', () => {
    const [premier, second] = maillons() as [MaillonArchive, MaillonArchive];
    const altere = contenuArchive({
      ...ENTREE,
      maillons: [premier, { ...second, charge: { b: 3 } }],
    });
    expect(verifierArchive(altere, HACHEUR.sha256(altere), HACHEUR)).toEqual({
      valide: false,
      raison: 'MAILLON',
    });
  });

  it('chargeArchive porte l’empreinte du fichier', () => {
    const archive = {
      id: 'a1',
      debut: '2026-11-01',
      fin: '2026-11-30',
      rangDebut: 4,
      rangFin: 5,
      empreinteContenu: 'e',
      tailleOctets: 10,
      versionCaisse: '1.0',
    };
    expect(serialiserCanonique(chargeArchive(archive))).toContain('"empreinteContenu":"e"');
  });
});
