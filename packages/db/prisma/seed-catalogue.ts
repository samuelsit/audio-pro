import type { PrismaClient } from '../src/generated/prisma/client';
import type {
  ClasseLpp,
  OptionAideAuditive,
  TypeAideAuditive,
} from '../src/generated/prisma/enums';

// Catalogue fictif : fabricants, gammes et modèles inventés, prix de démonstration.
// Les codes LPP sont les 8 codes génériques réels de la base 908 (voir ADR-008) : droite et gauche,
// plus et moins de 20 ans. Ils sont amorcés ici pour que le seed fonctionne sans import de la LPP.

const CODES_GENERIQUES: Readonly<Record<ClasseLpp, readonly string[]>> = {
  CLASSE_I: ['2351057', '2365119', '2325120', '2337749'],
  CLASSE_II: ['2392530', '2341840', '2307926', '2369117'],
};

/** Piles 13 et 312, réelles elles aussi, pour les accessoires du seed. */
export const CODES_PILES = { PILES_13: '2332976', PILES_312: '2356907' } as const;

const ACOUSTIA = '019a4000-0000-7000-8000-000000000001';
const SONORA = '019a4000-0000-7000-8000-000000000002';
const VIBRA = '019a4000-0000-7000-8000-000000000003';

const FABRICANTS = [
  {
    id: ACOUSTIA,
    nom: 'Acoustia Démo',
    adresse: '10 rue de l’Exemple, 75000 Paris',
    mandataire: null,
  },
  { id: SONORA, nom: 'Sonora Démo', adresse: '20 rue Fictive, 69000 Lyon', mandataire: null },
  {
    id: VIBRA,
    nom: 'Vibra Démo',
    adresse: '30 Example Street, Faketown',
    mandataire: 'Vibra Démo France, 40 avenue Imaginaire, 31000 Toulouse',
  },
] as const;

const OPTIONS_CLASSE_I: OptionAideAuditive[] = [
  'REDUCTEUR_ACOUPHENE',
  'CONNECTIVITE_SANS_FIL',
  'REDUCTEUR_BRUIT_VENT',
];

const OPTIONS_CLASSE_II: OptionAideAuditive[] = [...OPTIONS_CLASSE_I, 'SYNCHRONISATION_BINAURALE'];

/** Mentions du devis normalisé, communes aux modèles fictifs : 12 canaux en classe I, 24 en classe II. */
function ficheDevis({ gamme, nom, classe }: ModeleDemo) {
  const classeI = classe === 'CLASSE_I';
  return {
    marque: gamme,
    referenceCommerciale: `${gamme}-${nom}`.toUpperCase().replace(/\s+/g, '-'),
    lieuFabrication: 'UE' as const,
    nombreCanaux: classeI ? 12 : 24,
    connectivite: classeI ? 'Bluetooth' : 'Bluetooth, télécommande',
    antiLarsen: true,
    reducteurAcouphenes: true,
    bobineT: true,
    options: classeI ? OPTIONS_CLASSE_I : OPTIONS_CLASSE_II,
  };
}

interface ModeleDemo {
  fabricantId: string;
  gamme: string;
  nom: string;
  type: TypeAideAuditive;
  classe: ClasseLpp;
  prixConseilleCentimes: number;
}

const MODELES: readonly ModeleDemo[] = [
  {
    fabricantId: ACOUSTIA,
    gamme: 'Aurore',
    nom: 'Aurore 1 C',
    type: 'CONTOUR',
    classe: 'CLASSE_I',
    prixConseilleCentimes: 95_000,
  },
  {
    fabricantId: ACOUSTIA,
    gamme: 'Aurore',
    nom: 'Aurore 1 R',
    type: 'RIC',
    classe: 'CLASSE_I',
    prixConseilleCentimes: 95_000,
  },
  {
    fabricantId: ACOUSTIA,
    gamme: 'Aurore',
    nom: 'Aurore 5 R',
    type: 'RIC',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 149_000,
  },
  {
    fabricantId: ACOUSTIA,
    gamme: 'Aurore',
    nom: 'Aurore 7 R',
    type: 'RIC',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 189_000,
  },
  {
    fabricantId: SONORA,
    gamme: 'Lyra',
    nom: 'Lyra Essentiel',
    type: 'CONTOUR',
    classe: 'CLASSE_I',
    prixConseilleCentimes: 92_000,
  },
  {
    fabricantId: SONORA,
    gamme: 'Lyra',
    nom: 'Lyra Confort',
    type: 'INTRA',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 139_000,
  },
  {
    fabricantId: SONORA,
    gamme: 'Lyra',
    nom: 'Lyra Premium',
    type: 'RIC',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 179_000,
  },
  {
    fabricantId: VIBRA,
    gamme: 'Écho',
    nom: 'Écho 100',
    type: 'INTRA',
    classe: 'CLASSE_I',
    prixConseilleCentimes: 95_000,
  },
  {
    fabricantId: VIBRA,
    gamme: 'Écho',
    nom: 'Écho 300',
    type: 'RIC',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 129_000,
  },
  {
    fabricantId: VIBRA,
    gamme: 'Écho',
    nom: 'Écho 500',
    type: 'CONTOUR',
    classe: 'CLASSE_II',
    prixConseilleCentimes: 159_000,
  },
];

export const NOMBRE_FABRICANTS_DEMO = FABRICANTS.length;
export const NOMBRE_MODELES_DEMO = MODELES.length;

export async function seedCatalogue(db: PrismaClient, organisationId: string): Promise<void> {
  await db.lppCode.createMany({
    data: [...Object.values(CODES_GENERIQUES).flat(), ...Object.values(CODES_PILES)].map(
      (code) => ({
        code,
      }),
    ),
    skipDuplicates: true,
  });
  for (const fabricant of FABRICANTS) {
    const donnees = { ...fabricant, organisationId };
    await db.fabricant.upsert({ where: { id: fabricant.id }, create: donnees, update: donnees });
  }
  for (const modele of MODELES) {
    await seedModele(db, modele, organisationId);
  }
}

async function seedModele(
  db: PrismaClient,
  modele: ModeleDemo,
  organisationId: string,
): Promise<void> {
  const { fabricantId, gamme, nom } = modele;
  const { id } = await db.modeleAideAuditive.upsert({
    where: { fabricantId_gamme_nom: { fabricantId, gamme, nom } },
    create: { ...modele, ...ficheDevis(modele), organisationId },
    update: { ...modele, ...ficheDevis(modele) },
    select: { id: true },
  });
  await db.modeleCodeLpp.deleteMany({ where: { modeleId: id } });
  await db.modeleCodeLpp.createMany({
    data: CODES_GENERIQUES[modele.classe].map((code) => ({ modeleId: id, code })),
  });
}

/** Catalogue propre au centre indépendant : le catalogue n'est pas partagé entre clients (ADR-008). */
export async function seedCatalogueIndependant(
  db: PrismaClient,
  organisationId: string,
): Promise<void> {
  const fabricantId = '019a4000-0000-7000-8000-000000000011';
  const fabricant = {
    id: fabricantId,
    organisationId,
    nom: 'Acoustia Démo',
    adresse: '10 rue de l’Exemple, 75000 Paris',
    mandataire: null,
  };
  await db.fabricant.upsert({ where: { id: fabricantId }, create: fabricant, update: fabricant });
  for (const modele of MODELES.filter((m) => m.fabricantId === ACOUSTIA)) {
    await seedModele(db, { ...modele, fabricantId }, organisationId);
  }
}
