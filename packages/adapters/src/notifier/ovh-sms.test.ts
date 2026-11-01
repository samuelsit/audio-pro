import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { chargerConfigurationOvhSms, OvhSms } from './ovh-sms';

const CONFIGURATION = {
  OVH_SMS_APPLICATION_KEY: 'ak',
  OVH_SMS_APPLICATION_SECRET: 'as',
  OVH_SMS_CONSUMER_KEY: 'ck',
  OVH_SMS_SERVICE: 'sms-ab1',
  OVH_SMS_EXPEDITEUR: 'CENTRE',
};

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status });
}

function client(...reponses: Response[]) {
  const requeter = vi.fn<typeof fetch>();
  requeter.mockResolvedValueOnce(reponse(1000));
  for (const r of reponses) {
    requeter.mockResolvedValueOnce(r);
  }
  return { requeter, sms: new OvhSms(CONFIGURATION, { requeter, maintenantMs: () => 990_000 }) };
}

describe('chargerConfigurationOvhSms', () => {
  it('nomme les variables manquantes, jamais les valeurs', () => {
    expect(() =>
      chargerConfigurationOvhSms({ ...CONFIGURATION, OVH_SMS_CONSUMER_KEY: '' }),
    ).toThrow(/OVH_SMS_CONSUMER_KEY/);
    expect(() =>
      chargerConfigurationOvhSms({ ...CONFIGURATION, OVH_SMS_CONSUMER_KEY: '' }),
    ).not.toThrow(/\bas\b/);
  });
});

describe('OvhSms.envoyer', () => {
  it('signe la requête à l’heure du serveur', async () => {
    const { requeter, sms } = client(
      reponse({ ids: [42], invalidReceivers: [], totalCreditsRemoved: 2 }),
    );
    const recu = await sms.envoyer({ destinataire: '+33600000000', texte: 'Bonjour' });
    expect(recu).toEqual({ idFournisseur: '42', credits: 2 });
    const [url, options] = requeter.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://eu.api.ovh.com/1.0/sms/sms-ab1/jobs');
    const enTetes = options.headers as Record<string, string>;
    expect(enTetes['X-Ovh-Timestamp']).toBe('1000');
    const attendue = createHash('sha1')
      .update(`as+ck+POST+${url}+${String(options.body)}+1000`)
      .digest('hex');
    expect(enTetes['X-Ovh-Signature']).toBe(`$1$${attendue}`);
  });

  it('ne lève jamais la clause STOP', async () => {
    const { requeter, sms } = client(
      reponse({ ids: [1], invalidReceivers: [], totalCreditsRemoved: 1 }),
    );
    await sms.envoyer({ destinataire: '+33600000000', texte: 'Bonjour' });
    const options = requeter.mock.calls[1]?.[1];
    expect(JSON.parse(String(options?.body))).toMatchObject({
      noStopClause: false,
      sender: 'CENTRE',
      receivers: ['+33600000000'],
    });
  });

  it('ne relit l’horloge qu’une fois', async () => {
    const accepte = () => reponse({ ids: [1], invalidReceivers: [], totalCreditsRemoved: 1 });
    const { requeter, sms } = client(accepte(), accepte());
    await sms.envoyer({ destinataire: '+33600000000', texte: 'a' });
    await sms.envoyer({ destinataire: '+33600000000', texte: 'b' });
    expect(requeter).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['refus HTTP', reponse({}, 403), /HTTP 403/],
    [
      'destinataire invalide',
      reponse({ ids: [], invalidReceivers: ['x'], totalCreditsRemoved: 0 }),
      /destinataire refusé/,
    ],
  ])('lève une erreur sans citer le numéro : %s', async (_, recue, attendu) => {
    const { sms } = client(recue);
    await expect(sms.envoyer({ destinataire: '+33600000000', texte: 'a' })).rejects.toThrow(
      attendu,
    );
    const { sms: autre } = client(
      reponse({ ids: [], invalidReceivers: [], totalCreditsRemoved: 0 }),
    );
    await expect(autre.envoyer({ destinataire: '+33600000000', texte: 'a' })).rejects.not.toThrow(
      /\+336/,
    );
  });

  it('échoue sans horloge', async () => {
    const requeter = vi.fn<typeof fetch>().mockResolvedValueOnce(reponse({}, 503));
    const sms = new OvhSms(CONFIGURATION, { requeter });
    await expect(sms.envoyer({ destinataire: '+33600000000', texte: 'a' })).rejects.toThrow(
      /horloge/,
    );
  });
});

describe('OvhSms.etat', () => {
  it.each([
    ['livré', { ptt: 4 }, 'DELIVRE'],
    ['date de livraison', { ptt: 3, deliveredAt: '2027-02-01T10:00:00+01:00' }, 'DELIVRE'],
    ['expiré', { ptt: 8, deliveredAt: null }, 'ECHEC'],
    ['liste noire', { ptt: 23 }, 'ECHEC'],
    ['accepté', { ptt: 3 }, 'EN_COURS'],
    ['inconnu', { ptt: 6 }, 'EN_COURS'],
  ])('%s', async (_, corps, attendu) => {
    const { sms } = client(reponse(corps));
    await expect(sms.etat('42')).resolves.toBe(attendu);
  });

  it('reste en cours sur un envoi introuvable', async () => {
    const { sms } = client(reponse({}, 404));
    await expect(sms.etat('42')).resolves.toBe('EN_COURS');
  });

  it('lève sur une panne', async () => {
    const { sms } = client(reponse({}, 500));
    await expect(sms.etat('42')).rejects.toThrow(/HTTP 500/);
  });
});

describe('OvhSms, oppositions', () => {
  it('lit la liste des STOP', async () => {
    const { sms } = client(reponse(['+33600000000']));
    await expect(sms.oppositions()).resolves.toEqual(['+33600000000']);
  });

  it('lève si la liste est illisible', async () => {
    const { sms } = client(reponse({}, 403));
    await expect(sms.oppositions()).rejects.toThrow(/HTTP 403/);
  });

  it('retire un numéro, déjà retiré ou non', async () => {
    const { requeter, sms } = client(reponse(null), reponse({}, 404));
    await sms.retirerOpposition('+33600000000');
    await sms.retirerOpposition('+33600000000');
    expect(requeter.mock.calls[1]?.[0]).toContain('/blacklists/%2B33600000000');
  });

  it('lève si le retrait échoue', async () => {
    const { sms } = client(reponse({}, 500));
    await expect(sms.retirerOpposition('+33600000000')).rejects.toThrow(/HTTP 500/);
  });
});
