import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FakeNotifier } from './fake-notifier';

describe('FakeNotifier', () => {
  it('garde les messages en mémoire', async () => {
    const notifier = new FakeNotifier();
    await notifier.envoyerSms({ destinataire: '+33600000000', texte: 'Bonjour' });
    await notifier.envoyerEmail({ destinataire: 'a@exemple.test', sujet: 'S', texte: 'T' });
    expect(notifier.envoyes.map((m) => m.canal)).toEqual(['SMS', 'EMAIL']);
  });

  it('écrit une ligne JSON par message dans le fichier demandé', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notifier-'));
    const fichier = join(dossier, 'messages.jsonl');
    const notifier = new FakeNotifier(fichier);
    await notifier.envoyerSms({ destinataire: '+33600000000', texte: 'Bonjour' });
    const lignes = (await readFile(fichier, 'utf8')).trim().split('\n');
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([
      { canal: 'SMS', destinataire: '+33600000000', texte: 'Bonjour' },
    ]);
    await rm(dossier, { recursive: true });
  });

  it('garde le nom des pièces jointes dans le fichier, pas leurs octets', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notifier-'));
    const fichier = join(dossier, 'messages.jsonl');
    const notifier = new FakeNotifier(fichier);
    const pieceJointe = {
      nomFichier: 'bon.pdf',
      typeContenu: 'application/pdf',
      contenu: Uint8Array.from([1, 2]),
    };
    await notifier.envoyerEmail({
      destinataire: 'a@exemple.test',
      sujet: 'S',
      texte: 'T',
      piecesJointes: [pieceJointe],
    });
    expect(JSON.parse(await readFile(fichier, 'utf8'))).toMatchObject({
      piecesJointes: ['bon.pdf'],
    });
    expect(notifier.envoyes[0]).toMatchObject({ piecesJointes: [pieceJointe] });
    await rm(dossier, { recursive: true });
  });

  it('simule une panne', async () => {
    const notifier = new FakeNotifier();
    notifier.enPanne = true;
    await expect(
      notifier.envoyerSms({ destinataire: '+33600000000', texte: 'Bonjour' }),
    ).rejects.toThrow();
    expect(notifier.envoyes).toEqual([]);
  });
});
