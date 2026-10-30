import type { LigneDbf } from '@ha/domain';

// Lecteur dBase III (version 0x03, sans mémo), le format des bases LPP diffusées par ameli.
// En-tête de 32 octets, descripteurs de champs de 32 octets terminés par 0x0D, puis enregistrements
// de longueur fixe précédés d'un octet de suppression (« * »). Texte en Latin-1.

const TAILLE_BLOC = 32;
const FIN_DESCRIPTEURS = 0x0d;
const MARQUE_SUPPRESSION = 0x2a;

export interface ChampDbf {
  readonly nom: string;
  readonly type: string;
  readonly longueur: number;
}

export interface TableDbf {
  /** Date de dernière mise à jour de l'en-tête (ISO). */
  readonly dateMiseAJour: string;
  readonly champs: readonly ChampDbf[];
  readonly lignes: readonly LigneDbf[];
}

export class ErreurDbf extends Error {
  constructor(message: string) {
    super(`Fichier dBase invalide : ${message}`);
    this.name = 'ErreurDbf';
  }
}

function dateEnTete(octets: Buffer): string {
  // Année sur un octet : à compter de 1900 selon la norme, mais sur 2 chiffres dans les bases LPP (26).
  const octetAnnee = octets.readUInt8(1);
  const annee = (octetAnnee < 100 ? 2000 : 1900) + octetAnnee;
  const mois = String(octets.readUInt8(2)).padStart(2, '0');
  const jour = String(octets.readUInt8(3)).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

function lireChamps(octets: Buffer, tailleEnTete: number): ChampDbf[] {
  const champs: ChampDbf[] = [];
  let position = TAILLE_BLOC;
  while (octets[position] !== FIN_DESCRIPTEURS) {
    if (position + TAILLE_BLOC > tailleEnTete) {
      throw new ErreurDbf('descripteurs de champs non terminés.');
    }
    const nom = octets.toString('latin1', position, position + 11).split('\0')[0] ?? '';
    champs.push({
      nom,
      type: String.fromCharCode(octets.readUInt8(position + 11)),
      longueur: octets.readUInt8(position + 16),
    });
    position += TAILLE_BLOC;
  }
  return champs;
}

/** Lit un fichier dBase complet ; les valeurs restent en texte, sans espaces de bord. */
export function lireDbf(octets: Buffer): TableDbf {
  if (octets.length < TAILLE_BLOC || octets[0] !== 0x03) {
    throw new ErreurDbf('format attendu dBase III (0x03).');
  }
  const nombre = octets.readUInt32LE(4);
  const tailleEnTete = octets.readUInt16LE(8);
  const tailleLigne = octets.readUInt16LE(10);
  if (tailleEnTete + nombre * tailleLigne > octets.length) {
    throw new ErreurDbf('fichier tronqué.');
  }

  const champs = lireChamps(octets, tailleEnTete);
  const lignes: LigneDbf[] = [];
  for (let i = 0; i < nombre; i += 1) {
    const debut = tailleEnTete + i * tailleLigne;
    if (octets[debut] === MARQUE_SUPPRESSION) {
      continue;
    }
    const ligne: Record<string, string> = {};
    let position = debut + 1;
    for (const { nom, longueur } of champs) {
      ligne[nom] = octets.toString('latin1', position, position + longueur).trim();
      position += longueur;
    }
    lignes.push(ligne);
  }
  return { dateMiseAJour: dateEnTete(octets), champs, lignes };
}
