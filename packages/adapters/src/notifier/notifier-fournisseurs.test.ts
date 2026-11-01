import { describe, expect, it, vi } from 'vitest';

import { FakeNotifier } from './fake-notifier';
import {
  creerNotifierDepuisEnv,
  notifierActif,
  NotifierFournisseurs,
} from './notifier-fournisseurs';
import type { OvhSms } from './ovh-sms';
import type { ScalewayEmail } from './scaleway-email';

const RECU = { idFournisseur: 'id', credits: 1 };
const REEL = {
  NOTIFIER: 'reel',
  OVH_SMS_APPLICATION_KEY: 'ak',
  OVH_SMS_APPLICATION_SECRET: 'as',
  OVH_SMS_CONSUMER_KEY: 'ck',
  OVH_SMS_SERVICE: 'sms-ab1',
  OVH_SMS_EXPEDITEUR: 'CENTRE',
  SCW_TEM_SECRET_KEY: 'secret',
  SCW_TEM_PROJECT_ID: 'projet',
  SCW_TEM_EXPEDITEUR: 'a@exemple.test',
  SCW_TEM_EXPEDITEUR_NOM: 'Centre',
};

describe('notifierActif', () => {
  it.each([
    [{ NOTIFIER: 'simulation' }, true],
    [{ NOTIFIER: 'simulation', NODE_ENV: 'production' }, false],
    [{ NOTIFIER: 'reel', NODE_ENV: 'production' }, true],
    [{}, false],
  ])('%j', (env, attendu) => {
    expect(notifierActif(env)).toBe(attendu);
  });
});

describe('creerNotifierDepuisEnv', () => {
  it('simule hors production', () => {
    expect(creerNotifierDepuisEnv({ NOTIFIER: 'simulation' })).toBeInstanceOf(FakeNotifier);
  });

  it('branche les fournisseurs', () => {
    expect(creerNotifierDepuisEnv(REEL)).toBeInstanceOf(NotifierFournisseurs);
  });

  it('refuse sans fournisseur', () => {
    expect(() => creerNotifierDepuisEnv({})).toThrow(/Aucun fournisseur/);
  });
});

describe('NotifierFournisseurs', () => {
  const sms = {
    envoyer: vi.fn().mockResolvedValue(RECU),
    etat: vi.fn().mockResolvedValue('DELIVRE'),
    oppositions: vi.fn().mockResolvedValue(['+33600000000']),
    retirerOpposition: vi.fn().mockResolvedValue(undefined),
  };
  const email = {
    envoyer: vi.fn().mockResolvedValue(RECU),
    etat: vi.fn().mockResolvedValue('ECHEC'),
  };
  const notifier = new NotifierFournisseurs(
    sms as unknown as OvhSms,
    email as unknown as ScalewayEmail,
  );

  it('route chaque canal vers son fournisseur', async () => {
    await notifier.envoyerSms({ destinataire: '+33600000000', texte: 'a' });
    await notifier.envoyerEmail({ destinataire: 'a@exemple.test', sujet: 's', texte: 't' });
    expect(sms.envoyer).toHaveBeenCalledOnce();
    expect(email.envoyer).toHaveBeenCalledOnce();
    await expect(notifier.etatEnvoi('SMS', 'id')).resolves.toBe('DELIVRE');
    await expect(notifier.etatEnvoi('EMAIL', 'id')).resolves.toBe('ECHEC');
  });

  it('laisse un courrier à imprimer', async () => {
    await expect(notifier.envoyerCourrier({ cleDocument: 'c', lettres: 1 })).resolves.toEqual({
      idFournisseur: null,
      credits: null,
    });
  });

  it('relit et retire les oppositions', async () => {
    await expect(notifier.oppositionsSms()).resolves.toEqual(['+33600000000']);
    await notifier.retirerOppositionSms('+33600000000');
    expect(sms.retirerOpposition).toHaveBeenCalledWith('+33600000000');
  });
});
