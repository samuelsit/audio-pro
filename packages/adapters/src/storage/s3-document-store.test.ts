import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { ErreurDocumentIntrouvable } from '@ha/domain';
import { describe, expect, it } from 'vitest';

import { chargerConfigurationS3, S3DocumentStore } from './s3-document-store';

const envRacine = path.join(import.meta.dirname, '../../../../.env');
if (existsSync(envRacine)) {
  process.loadEnvFile(envRacine);
}

// MinIO n'est pas un service de la CI : le test ne tourne qu'en local.
describe.skipIf(!process.env.S3_ENDPOINT)('S3DocumentStore (MinIO)', () => {
  it('dépose, relit et supprime un objet', async () => {
    const stockage = new S3DocumentStore(chargerConfigurationS3(process.env));
    const cle = `tests/${randomUUID()}`;
    const contenu = Buffer.from([0x00, 0xff, 0x10, 0x20]);

    await stockage.put(cle, contenu, 'application/octet-stream');
    expect(Buffer.from(await stockage.get(cle))).toEqual(contenu);

    await stockage.delete(cle);
    await expect(stockage.get(cle)).rejects.toThrow(ErreurDocumentIntrouvable);
  });
});
