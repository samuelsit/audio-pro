import { describe, expect, it, vi } from 'vitest';

import { chargerConfigurationScalewayEmail, ScalewayEmail } from './scaleway-email';

const CONFIGURATION = {
  SCW_TEM_SECRET_KEY: 'secret',
  SCW_TEM_PROJECT_ID: 'projet',
  SCW_TEM_EXPEDITEUR: 'ne-pas-repondre@exemple.test',
  SCW_TEM_EXPEDITEUR_NOM: 'Votre centre',
};
const MESSAGE = { destinataire: 'a@exemple.test', sujet: 'Sujet assez long', texte: 'a < b\nfin' };

function client(reponse: Response, configuration = CONFIGURATION) {
  const requeter = vi.fn<typeof fetch>().mockResolvedValue(reponse);
  return { requeter, email: new ScalewayEmail(configuration, requeter) };
}

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status });
}

function corpsEnvoye(requeter: ReturnType<typeof client>['requeter']): Record<string, unknown> {
  return JSON.parse(String(requeter.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
}

describe('chargerConfigurationScalewayEmail', () => {
  it('nomme les variables manquantes', () => {
    expect(() => chargerConfigurationScalewayEmail({})).toThrow(/SCW_TEM_SECRET_KEY/);
  });

  it('accepte une configuration complète', () => {
    expect(chargerConfigurationScalewayEmail(CONFIGURATION).SCW_TEM_PROJECT_ID).toBe('projet');
  });
});

describe('ScalewayEmail.envoyer', () => {
  it('poste le message et rend son identifiant', async () => {
    const { requeter, email } = client(reponse({ emails: [{ id: 'abc' }] }));
    await expect(email.envoyer(MESSAGE)).resolves.toEqual({ idFournisseur: 'abc', credits: null });
    const [url, options] = requeter.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails');
    expect(options.headers).toMatchObject({ 'X-Auth-Token': 'secret' });
    expect(corpsEnvoye(requeter)).toEqual({
      from: { email: 'ne-pas-repondre@exemple.test', name: 'Votre centre' },
      to: [{ email: 'a@exemple.test' }],
      subject: 'Sujet assez long',
      text: 'a < b\nfin',
      html: '<html><body><p>a &lt; b<br>fin</p></body></html>',
      project_id: 'projet',
    });
  });

  it('joint les pièces et l’adresse de réponse', async () => {
    const { requeter, email } = client(reponse({ emails: [{ id: 'abc' }] }));
    await email.envoyer({
      ...MESSAGE,
      repondreA: 'centre@exemple.test',
      piecesJointes: [
        { nomFichier: 'bon.pdf', typeContenu: 'application/pdf', contenu: Uint8Array.of(1, 2) },
      ],
    });
    expect(corpsEnvoye(requeter)).toMatchObject({
      attachments: [{ name: 'bon.pdf', type: 'application/pdf', content: 'AQI=' }],
      additional_headers: [{ key: 'Reply-To', value: 'centre@exemple.test' }],
    });
  });

  it('n’ajoute les en-têtes de désinscription que si on les a validés', async () => {
    const lien = 'https://exemple.test/desinscription/jeton';
    const sans = client(reponse({ emails: [{ id: 'a' }] }));
    await sans.email.envoyer({ ...MESSAGE, lienDesinscription: lien });
    expect(corpsEnvoye(sans.requeter)).not.toHaveProperty('additional_headers');

    const avec = client(reponse({ emails: [{ id: 'a' }] }), {
      ...CONFIGURATION,
      SCW_TEM_LIST_UNSUBSCRIBE: 'actif',
    } as typeof CONFIGURATION);
    await avec.email.envoyer({ ...MESSAGE, lienDesinscription: lien });
    expect(corpsEnvoye(avec.requeter)).toMatchObject({
      additional_headers: [
        { key: 'List-Unsubscribe', value: `<${lien}>` },
        { key: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
      ],
    });
  });

  it('lève sans citer l’adresse', async () => {
    const { email } = client(reponse({}, 400));
    await expect(email.envoyer(MESSAGE)).rejects.toThrow('Scaleway : envoi refusé (HTTP 400).');
  });
});

describe('ScalewayEmail.etat', () => {
  it.each([
    ['sent', 'DELIVRE'],
    ['failed', 'ECHEC'],
    ['canceled', 'ECHEC'],
    ['new', 'EN_COURS'],
    ['sending', 'EN_COURS'],
    ['unknown', 'EN_COURS'],
  ])('%s', async (status, attendu) => {
    const { email } = client(reponse({ status }));
    await expect(email.etat('abc')).resolves.toBe(attendu);
  });

  it('lève sur une panne', async () => {
    const { email } = client(reponse({}, 500));
    await expect(email.etat('abc')).rejects.toThrow(/HTTP 500/);
  });
});
