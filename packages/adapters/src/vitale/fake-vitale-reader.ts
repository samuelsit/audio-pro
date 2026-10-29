import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  beneficiaireVitaleSchema,
  ErreurLectureVitale,
  sourceLectureVitaleSchema,
  type Clock,
  type VitaleReadResult,
  type VitaleReader,
} from '@ha/domain';
import { z } from 'zod';

/**
 * Carte « insérée » dans le lecteur simulé : un fichier de fixtures/vitale, ou un incident sans fichier.
 * Valeur transportée dans un cookie de développement (`encoderSimulation` / `decoderSimulation`).
 */
export type SimulationVitale =
  | { readonly type: 'carte'; readonly fichier: string }
  | { readonly type: 'aucun-lecteur' }
  | { readonly type: 'lecteur-vide' }
  | { readonly type: 'illisible' }
  | { readonly type: 'panne' };

export const INCIDENTS_SIMULES = [
  { type: 'aucun-lecteur', libelle: 'Aucun lecteur' },
  { type: 'lecteur-vide', libelle: 'Lecteur sans carte' },
  { type: 'illisible', libelle: 'Carte illisible' },
  { type: 'panne', libelle: 'Panne du lecteur' },
] as const satisfies readonly {
  type: Exclude<SimulationVitale['type'], 'carte'>;
  libelle: string;
}[];

// Nom de fichier simple : la valeur vient d'un cookie, aucune traversée de chemin possible.
const NOM_FICHIER = /^[a-z0-9-]+\.json$/;

export function encoderSimulation(simulation: SimulationVitale): string {
  return simulation.type === 'carte' ? `carte:${simulation.fichier}` : simulation.type;
}

/** Valeur absente ou inconnue : lecteur sans carte. */
export function decoderSimulation(valeur: string | undefined): SimulationVitale {
  if (valeur?.startsWith('carte:')) {
    const fichier = valeur.slice('carte:'.length);
    return NOM_FICHIER.test(fichier) ? { type: 'carte', fichier } : { type: 'lecteur-vide' };
  }
  const incident = INCIDENTS_SIMULES.find((i) => i.type === valeur);
  return incident ? { type: incident.type } : { type: 'lecteur-vide' };
}

/** Format des fichiers de fixtures/vitale (propre au lecteur simulé, voir son README). */
const carteSimuleeSchema = z.object({
  libelle: z.string().min(1),
  etat: z.enum(['VALIDE', 'BLOQUEE']),
  source: sourceLectureVitaleSchema,
  beneficiaires: z.array(beneficiaireVitaleSchema).min(1),
});

/** Lecteur Vitale simulé : lit des cartes fictives au format JSON. Développement et tests uniquement. */
export class FakeVitaleReader implements VitaleReader {
  constructor(
    private readonly options: {
      readonly dossier: string;
      readonly simulation: SimulationVitale;
      readonly clock: Clock;
    },
  ) {}

  async readCard(): Promise<VitaleReadResult> {
    const { simulation } = this.options;
    switch (simulation.type) {
      case 'aucun-lecteur':
        throw new ErreurLectureVitale('AUCUN_LECTEUR');
      case 'lecteur-vide':
        throw new ErreurLectureVitale('CARTE_ABSENTE');
      case 'illisible':
        throw new ErreurLectureVitale('CARTE_INVALIDE');
      case 'panne':
        throw new ErreurLectureVitale('ERREUR_TECHNIQUE');
      case 'carte':
        return this.lireFichier(simulation.fichier);
    }
  }

  private async lireFichier(fichier: string): Promise<VitaleReadResult> {
    if (!NOM_FICHIER.test(fichier)) {
      throw new ErreurLectureVitale('CARTE_ABSENTE');
    }
    let contenu: string;
    try {
      contenu = await readFile(join(this.options.dossier, fichier), 'utf8');
    } catch {
      throw new ErreurLectureVitale('ERREUR_TECHNIQUE');
    }
    let carte: z.output<typeof carteSimuleeSchema>;
    try {
      carte = carteSimuleeSchema.parse(JSON.parse(contenu));
    } catch {
      throw new ErreurLectureVitale('CARTE_INVALIDE');
    }
    if (carte.etat === 'BLOQUEE') {
      throw new ErreurLectureVitale('CARTE_BLOQUEE');
    }
    return {
      beneficiaires: carte.beneficiaires,
      source: carte.source,
      dateLecture: this.options.clock.now(),
    };
  }
}

/** Cartes proposées par le sélecteur de simulation, triées par nom de fichier. */
export async function cartesSimulees(
  dossier: string,
): Promise<{ fichier: string; libelle: string }[]> {
  let fichiers: string[];
  try {
    fichiers = (await readdir(dossier)).filter((f) => NOM_FICHIER.test(f)).sort();
  } catch {
    return [];
  }
  return Promise.all(
    fichiers.map(async (fichier) => {
      try {
        const { libelle } = z
          .object({ libelle: z.string().min(1) })
          .parse(JSON.parse(await readFile(join(dossier, fichier), 'utf8')));
        return { fichier, libelle };
      } catch {
        return { fichier, libelle: fichier };
      }
    }),
  );
}

/**
 * Lecteur utilisé tant qu'aucun lecteur réel n'est branché (AreaFSE, étape 17) et hors simulation :
 * toute lecture échoue avec AUCUN_LECTEUR.
 */
export class LecteurVitaleAbsent implements VitaleReader {
  readCard(): Promise<VitaleReadResult> {
    return Promise.reject(new ErreurLectureVitale('AUCUN_LECTEUR'));
  }
}
