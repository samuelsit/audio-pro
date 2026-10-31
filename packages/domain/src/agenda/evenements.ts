import { z } from 'zod';

// Événements publiés pour les rappels (étape 19). Ni nom, ni téléphone, ni libellé de type : un libellé
// « Fin d'essai » est déjà une donnée de santé, et ces charges sortent du dossier patient.

const instantSchema = z.iso.datetime({ offset: true });

const rendezVousSchema = z.object({
  rendezVousId: z.string().min(1),
  centreId: z.string().min(1),
  typeRdvId: z.string().min(1),
  patientId: z.string().min(1).nullable(),
  dossierId: z.string().min(1).nullable(),
  praticienId: z.string().min(1).nullable(),
  cabineId: z.string().min(1).nullable(),
  debut: instantSchema,
  fin: instantSchema,
});

export const evenementAgendaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RDV_CREE'), charge: rendezVousSchema }),
  z.object({
    type: z.literal('RDV_DEPLACE'),
    charge: rendezVousSchema.extend({ ancienDebut: instantSchema, ancienFin: instantSchema }),
  }),
  z.object({ type: z.literal('RDV_ANNULE'), charge: rendezVousSchema }),
]);
export type EvenementAgenda = z.output<typeof evenementAgendaSchema>;
export type TypeEvenementAgenda = EvenementAgenda['type'];
