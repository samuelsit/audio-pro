import { z } from 'zod';

import { definirTravail } from '../travail';

/** Vérifie la chaîne complète (file, ouvrier, contexte client) sans rien écrire. */
export const travailDiagnostic = definirTravail({
  nom: 'diagnostic',
  charge: z.object({}),
  async executer({ organisationId, client }) {
    const centres = await client.centre.count();
    console.info(`Diagnostic ${organisationId} : ${centres} centre(s) visibles.`);
  },
});
