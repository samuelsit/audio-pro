import {
  cabineSaisieSchema,
  bornesJourMs,
  differencesAuditees,
  exceptionSaisieSchema,
  horairesOuvertureSchema,
  instantDePlage,
  jourDeChevauchement,
  LIBELLES_JOURS,
  peutGererAgenda,
  peutGererTypesRdv,
  typeRdvSaisieSchema,
  type ExceptionSaisie,
  type HorairesOuverture,
  type TypeException,
  type TypeRdvSaisie,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { centreActif, horaires } from './agenda-socle';

function verifierGestion(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutGererAgenda(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

// ---------------------------------------------------------------------------
// Cabines
// ---------------------------------------------------------------------------

export interface CabineResume {
  id: string;
  nom: string;
  actif: boolean;
}

export async function listerCabines(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<CabineResume[]> {
  verifierAccesCentre(acteur, centreId);
  await centreActif(base(acteur), centreId);
  return base(acteur).cabine.findMany({
    where: { centreId },
    select: { id: true, nom: true, actif: true },
    orderBy: { nom: 'asc' },
  });
}

const DOUBLON_CABINE = {
  cabine_centre_id_nom_key: ['nom', 'Ce centre a déjà une cabine de ce nom.'],
} as const;

export async function creerCabine(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  const donnees = valider(cabineSaisieSchema, saisie);
  verifierGestion(acteur, donnees.centreId);
  try {
    const { id } = await withAudit(
      acteur,
      (tx) => tx.cabine.create({ data: donnees, select: { id: true } }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'CABINE',
        entiteId: cree.id,
        centreId: donnees.centreId,
        champs: differencesAuditees('CABINE', null, donnees),
      }),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_CABINE, 'Cette cabine existe déjà.');
  }
}

/** Une cabine se désactive, sans se supprimer : ses rendez-vous passés la référencent. */
export async function changerActivationCabine(
  acteur: UtilisateurConnecte,
  id: string,
  actif: boolean,
): Promise<void> {
  const cabine = await base(acteur).cabine.findFirst({
    where: { id },
    select: { centreId: true, actif: true },
  });
  if (!cabine) {
    throw new AccesRefuseError();
  }
  verifierGestion(acteur, cabine.centreId);
  await withAudit(acteur, (tx) => tx.cabine.update({ where: { id }, data: { actif } }), {
    action: 'UPDATE',
    entiteType: 'CABINE',
    entiteId: id,
    centreId: cabine.centreId,
    champs: differencesAuditees('CABINE', { actif: cabine.actif }, { actif }),
  });
}

// ---------------------------------------------------------------------------
// Types de rendez-vous
// ---------------------------------------------------------------------------

export interface TypeRdvResume extends TypeRdvSaisie {
  id: string;
  actif: boolean;
}

const selectionType = {
  id: true,
  nom: true,
  dureeMinutes: true,
  couleur: true,
  requierePraticien: true,
  requiereCabine: true,
  reservableEnLigne: true,
  delaiMinimalMinutes: true,
  natureEssai: true,
  actif: true,
} as const;

/** Tous les rôles en ont besoin pour prendre un rendez-vous. */
export async function listerTypesRdv(acteur: UtilisateurConnecte): Promise<TypeRdvResume[]> {
  return base(acteur).typeRdv.findMany({ select: selectionType, orderBy: { nom: 'asc' } });
}

const DOUBLON_TYPE = {
  type_rdv_organisation_id_nom_key: ['nom', 'Ce type de rendez-vous existe déjà.'],
} as const;

function verifierGestionTypes(acteur: UtilisateurConnecte): void {
  if (!peutGererTypesRdv(acteur.role)) {
    throw new AccesRefuseError();
  }
}

export async function creerTypeRdv(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  verifierGestionTypes(acteur);
  const donnees = valider(typeRdvSaisieSchema, saisie);
  try {
    const { id } = await withAudit(
      acteur,
      (tx) =>
        tx.typeRdv.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        }),
      (cree) => ({
        action: 'CREATE',
        entiteType: 'TYPE_RDV',
        entiteId: cree.id,
        champs: differencesAuditees('TYPE_RDV', null, donnees),
      }),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_TYPE, 'Ce type de rendez-vous existe déjà.');
  }
}

export async function modifierTypeRdv(
  acteur: UtilisateurConnecte,
  id: string,
  saisie: unknown,
): Promise<void> {
  verifierGestionTypes(acteur);
  const donnees = valider(typeRdvSaisieSchema, saisie);
  const actuel = await base(acteur).typeRdv.findFirst({ where: { id }, select: selectionType });
  if (!actuel) {
    throw new AccesRefuseError();
  }
  const { id: _id, actif: _actif, ...avant } = actuel;
  try {
    await withAudit(acteur, (tx) => tx.typeRdv.update({ where: { id }, data: donnees }), {
      action: 'UPDATE',
      entiteType: 'TYPE_RDV',
      entiteId: id,
      champs: differencesAuditees('TYPE_RDV', avant, donnees),
    });
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_TYPE, 'Ce type de rendez-vous existe déjà.');
  }
}

export async function changerActivationTypeRdv(
  acteur: UtilisateurConnecte,
  id: string,
  actif: boolean,
): Promise<void> {
  verifierGestionTypes(acteur);
  const actuel = await base(acteur).typeRdv.findFirst({ where: { id }, select: { actif: true } });
  if (!actuel) {
    throw new AccesRefuseError();
  }
  await withAudit(acteur, (tx) => tx.typeRdv.update({ where: { id }, data: { actif } }), {
    action: 'UPDATE',
    entiteType: 'TYPE_RDV',
    entiteId: id,
    champs: differencesAuditees('TYPE_RDV', { actif: actuel.actif }, { actif }),
  });
}

// ---------------------------------------------------------------------------
// Horaires des praticiens
// ---------------------------------------------------------------------------

export interface HorairesPraticien {
  praticienId: string;
  nom: string;
  horaires: HorairesOuverture;
}

export async function listerHorairesPraticiens(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<HorairesPraticien[]> {
  verifierAccesCentre(acteur, centreId);
  await centreActif(base(acteur), centreId);
  const lignes = await base(acteur).praticienCentre.findMany({
    where: { centreId, praticien: { utilisateur: { actif: true } } },
    select: {
      praticienId: true,
      horaires: true,
      praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
    },
  });
  return lignes
    .map(({ praticienId, horaires: valeur, praticien }) => ({
      praticienId,
      nom: `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
      horaires: horaires(valeur),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Un praticien ne peut pas être attendu sur deux centres à la même heure. */
export async function modifierHorairesPraticien(
  acteur: UtilisateurConnecte,
  praticienId: string,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  const nouveaux = valider(horairesOuvertureSchema, saisie);
  verifierGestion(acteur, centreId);
  await withAudit(
    acteur,
    async (tx) => {
      const exercices = await tx.praticienCentre.findMany({
        where: { praticienId },
        select: { centreId: true, horaires: true },
      });
      const exercice = exercices.find((e) => e.centreId === centreId);
      if (!exercice) {
        throw new AccesRefuseError();
      }
      for (const autre of exercices) {
        const jour =
          autre.centreId === centreId
            ? null
            : jourDeChevauchement(nouveaux, horaires(autre.horaires));
        if (jour !== null) {
          throw new ErreurSaisie(
            {
              horaires: [
                `${LIBELLES_JOURS[jour]} : ce praticien est déjà attendu sur un autre centre.`,
              ],
            },
            `${LIBELLES_JOURS[jour]} : ce praticien est déjà attendu sur un autre centre.`,
          );
        }
      }
      await tx.praticienCentre.update({
        where: { praticienId_centreId: { praticienId, centreId } },
        data: { horaires: nouveaux },
      });
      return exercice;
    },
    (exercice) => ({
      action: 'UPDATE',
      entiteType: 'PRATICIEN',
      entiteId: praticienId,
      centreId,
      champs: differencesAuditees(
        'PRATICIEN',
        { horaires: horaires(exercice.horaires) },
        { horaires: nouveaux },
      ),
    }),
  );
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export interface ExceptionResume {
  id: string;
  type: TypeException;
  praticien: string | null;
  cabine: string | null;
  centreId: string | null;
  debut: number;
  fin: number;
}

/** Exceptions du centre et de ses praticiens, à partir de cet instant. */
export async function listerExceptions(
  acteur: UtilisateurConnecte,
  centreId: string,
  depuis: string,
): Promise<ExceptionResume[]> {
  verifierAccesCentre(acteur, centreId);
  await centreActif(base(acteur), centreId);
  const lignes = await base(acteur).exceptionAgenda.findMany({
    where: {
      fin: { gt: new Date(bornesJourMs(depuis).debut) },
      OR: [
        { centreId },
        { centreId: null, praticien: { centres: { some: { centreId } } } },
        { cabine: { centreId } },
      ],
    },
    select: {
      id: true,
      type: true,
      centreId: true,
      debut: true,
      fin: true,
      praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
      cabine: { select: { nom: true } },
    },
    orderBy: { debut: 'asc' },
  });
  return lignes.map(({ praticien, cabine, debut, fin, ...reste }) => ({
    ...reste,
    debut: debut.getTime(),
    fin: fin.getTime(),
    praticien: praticien && `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
    cabine: cabine?.nom ?? null,
  }));
}

/** Sans heures, journées entières : de minuit du premier jour à minuit du lendemain du dernier. */
function bornes(d: ExceptionSaisie): { debut: Date; fin: Date } {
  const debut = d.heureDebut
    ? instantDePlage(d.du, d.heureDebut, 'DEBUT')
    : bornesJourMs(d.du).debut;
  const fin = d.heureFin ? instantDePlage(d.au, d.heureFin, 'FIN') : bornesJourMs(d.au).fin;
  return { debut: new Date(debut), fin: new Date(fin) };
}

/** Seules les cibles qui ont un sens pour ce type, comme le CHECK `exception_agenda_cibles`. */
function cibles(d: ExceptionSaisie) {
  switch (d.type) {
    case 'DISPONIBILITE':
      return { praticienId: d.praticienId, centreId: d.centreId, cabineId: null };
    case 'CONGE':
      return { praticienId: d.praticienId, centreId: null, cabineId: null };
    case 'FERMETURE_CENTRE':
      return { praticienId: null, centreId: d.centreId, cabineId: null };
    case 'INDISPONIBILITE':
      return { praticienId: d.praticienId, centreId: d.centreId, cabineId: d.cabineId };
  }
}

export async function creerException(
  acteur: UtilisateurConnecte,
  centreCourant: string,
  saisie: unknown,
): Promise<string> {
  const d = valider(exceptionSaisieSchema, saisie);
  verifierGestion(acteur, centreCourant);
  const cible = cibles(d);
  if (cible.centreId !== null) {
    verifierAccesCentre(acteur, cible.centreId);
  }
  const { debut, fin } = bornes(d);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      if (cible.praticienId !== null) {
        const exercice = await tx.praticienCentre.findUnique({
          where: {
            praticienId_centreId: {
              praticienId: cible.praticienId,
              centreId: cible.centreId ?? centreCourant,
            },
          },
          select: { centreId: true },
        });
        if (!exercice) {
          throw ErreurSaisie.surChamp('praticienId', 'Ce praticien n’exerce pas dans ce centre.');
        }
      }
      if (cible.cabineId !== null) {
        const cabine = await tx.cabine.findFirst({
          where: { id: cible.cabineId, centreId: centreCourant },
          select: { id: true },
        });
        if (!cabine) {
          throw ErreurSaisie.surChamp('cabineId', 'Cette cabine n’appartient pas à ce centre.');
        }
      }
      return tx.exceptionAgenda.create({
        data: { type: d.type, ...cible, debut, fin, createdById: acteur.id },
        select: { id: true },
      });
    },
    (cree) => ({
      action: 'CREATE',
      entiteType: 'EXCEPTION_AGENDA',
      entiteId: cree.id,
      centreId: centreCourant,
      champs: differencesAuditees('EXCEPTION_AGENDA', null, {
        type: d.type,
        ...cible,
        debut: debut.toISOString(),
        fin: fin.toISOString(),
      }),
    }),
  );
  return id;
}

export async function supprimerException(
  acteur: UtilisateurConnecte,
  centreCourant: string,
  id: string,
): Promise<void> {
  verifierGestion(acteur, centreCourant);
  await withAudit(
    acteur,
    async (tx) => {
      const { count } = await tx.exceptionAgenda.deleteMany({
        where: {
          id,
          OR: [
            { centreId: centreCourant },
            { centreId: null, praticien: { centres: { some: { centreId: centreCourant } } } },
            { cabine: { centreId: centreCourant } },
          ],
        },
      });
      if (count !== 1) {
        throw new AccesRefuseError();
      }
    },
    {
      action: 'DELETE',
      entiteType: 'EXCEPTION_AGENDA',
      entiteId: id,
      centreId: centreCourant,
    },
  );
}
