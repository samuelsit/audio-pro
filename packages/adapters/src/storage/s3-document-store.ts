import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ErreurDocumentIntrouvable, type DocumentStore } from '@ha/domain';
import { z } from 'zod';

const configurationSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
});

export type ConfigurationS3 = z.output<typeof configurationSchema>;

/** Le message d'erreur nomme les variables manquantes, jamais leur valeur. */
export function chargerConfigurationS3(
  env: Readonly<Record<string, string | undefined>>,
): ConfigurationS3 {
  const resultat = configurationSchema.safeParse(env);
  if (!resultat.success) {
    const variables = resultat.error.issues.map((i) => String(i.path[0])).join(', ');
    throw new Error(`Configuration du stockage incomplète : ${variables}.`);
  }
  return resultat.data;
}

/** Service compatible S3 : MinIO en local (ADR-001). Les octets reçus sont déjà chiffrés. */
export class S3DocumentStore implements DocumentStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configuration: ConfigurationS3) {
    this.bucket = configuration.S3_BUCKET;
    this.client = new S3Client({
      endpoint: configuration.S3_ENDPOINT,
      region: configuration.S3_REGION,
      credentials: {
        accessKeyId: configuration.S3_ACCESS_KEY,
        secretAccessKey: configuration.S3_SECRET_KEY,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(cle: string, contenu: Uint8Array, typeContenu: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cle,
        Body: contenu,
        ContentType: typeContenu,
      }),
    );
  }

  async get(cle: string): Promise<Uint8Array> {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: cle }),
      );
      if (!Body) {
        throw new ErreurDocumentIntrouvable();
      }
      return await Body.transformToByteArray();
    } catch (erreur) {
      throw erreur instanceof NoSuchKey ? new ErreurDocumentIntrouvable() : erreur;
    }
  }

  async delete(cle: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: cle }));
  }
}
