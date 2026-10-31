import { randomBytes } from 'node:crypto';

import { ErreurDocumentIntrouvable, type DocumentStore } from '@ha/domain';
import { describe, expect, it } from 'vitest';

import { ChiffreurAesGcm } from '../crypto/aes-gcm';
import { ErreurDechiffrement } from '../crypto/chiffreur';
import { chargerTrousseau } from '../crypto/trousseau';
import { DocumentStoreChiffre } from './document-store-chiffre';
import { FakeDocumentStore } from './fake-document-store';
import { chargerConfigurationS3 } from './s3-document-store';

const chiffreur = new ChiffreurAesGcm(
  chargerTrousseau({
    CHIFFREMENT_CLES: `a:${randomBytes(32).toString('base64')}`,
    CHIFFREMENT_CLE_ACTIVE: 'a',
  }),
);
const SCAN = Buffer.from('%PDF-1.7 ordonnance fictive', 'utf8');

describe('FakeDocumentStore', () => {
  it('rend le document déposé et oublie le document supprimé', async () => {
    const stockage = new FakeDocumentStore();
    await stockage.put('a', SCAN);
    expect(Buffer.from(await stockage.get('a'))).toEqual(SCAN);
    await stockage.delete('a');
    await expect(stockage.get('a')).rejects.toThrow(ErreurDocumentIntrouvable);
  });
});

describe('DocumentStoreChiffre', () => {
  it('dépose des octets illisibles et rend le document', async () => {
    const brut = new FakeDocumentStore();
    const stockage: DocumentStore = new DocumentStoreChiffre(brut, chiffreur);
    await stockage.put('a', SCAN, 'application/pdf');
    expect(Buffer.from(brut.objets.get('a') ?? []).includes(SCAN)).toBe(false);
    expect(Buffer.from(await stockage.get('a'))).toEqual(SCAN);
  });

  it('refuse un objet déplacé sous une autre clé', async () => {
    const brut = new FakeDocumentStore();
    const stockage: DocumentStore = new DocumentStoreChiffre(brut, chiffreur);
    await stockage.put('a', SCAN, 'application/pdf');
    brut.objets.set('b', brut.objets.get('a') ?? new Uint8Array());
    await expect(stockage.get('b')).rejects.toThrow(ErreurDechiffrement);
  });

  it('supprime l’objet', async () => {
    const brut = new FakeDocumentStore();
    const stockage: DocumentStore = new DocumentStoreChiffre(brut, chiffreur);
    await stockage.put('a', SCAN, 'application/pdf');
    await stockage.delete('a');
    expect(brut.objets.size).toBe(0);
  });
});

describe('chargerConfigurationS3', () => {
  const ENV = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'eu-west-3',
    S3_ACCESS_KEY: 'cle',
    S3_SECRET_KEY: 'secret-de-test',
    S3_BUCKET: 'documents',
  };

  it('accepte une configuration complète', () => {
    expect(chargerConfigurationS3(ENV)).toEqual(ENV);
  });

  it('nomme les variables manquantes sans divulguer les autres', () => {
    expect(() => chargerConfigurationS3({ ...ENV, S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
    expect(() => chargerConfigurationS3({ ...ENV, S3_BUCKET: undefined })).not.toThrow(
      /secret-de-test/,
    );
  });
});
