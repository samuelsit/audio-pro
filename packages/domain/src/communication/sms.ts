export const ENCODAGES_SMS = ['GSM7', 'UNICODE'] as const;
export type EncodageSms = (typeof ENCODAGES_SMS)[number];

const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENSION = '^{}\\[~]|€';

/** Mention STOP ajoutée par OVH comprise. Source : docs/vendor/ovh-sms/README.md, « Longueurs ». */
const LONGUEURS: Readonly<Record<EncodageSms, { premier: number; suivants: number }>> = {
  GSM7: { premier: 149, suivants: 153 },
  UNICODE: { premier: 59, suivants: 70 },
};

export interface AnalyseSms {
  readonly encodage: EncodageSms;
  readonly caracteres: number;
  readonly segments: number;
}

function enGsm7(texte: string): boolean {
  return [...texte].every((c) => GSM7.includes(c) || GSM7_EXTENSION.includes(c));
}

/** Longueur facturée d'un SMS. Une seule lettre hors de la table GSM fait tout le message en Unicode. */
export function analyserSms(texte: string): AnalyseSms {
  const encodage: EncodageSms = enGsm7(texte) ? 'GSM7' : 'UNICODE';
  const caracteres =
    encodage === 'GSM7'
      ? [...texte].reduce((n, c) => n + (GSM7_EXTENSION.includes(c) ? 2 : 1), 0)
      : texte.length;
  const { premier, suivants } = LONGUEURS[encodage];
  const segments = caracteres <= premier ? 1 : 1 + Math.ceil((caracteres - premier) / suivants);
  return { encodage, caracteres, segments };
}
