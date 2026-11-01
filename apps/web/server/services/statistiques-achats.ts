import {
  agregerAchats,
  agregerDelais,
  filtreStatistiquesSchema,
  formatEuros,
  centimes,
  ligneCsv,
  peutGererAchats,
  type FiltreStatistiques,
  type LigneAchats,
  type LigneDelais,
  type Perimetre,
  type TypeEcartAchat,
} from '@ha/domain';

import { AccesRefuseError, verifierPerimetre, type UtilisateurConnecte } from '../auth/acces';
import { auteurDepuisActeur, journaliser } from '../audit/journal';
import { base } from '../chiffrement';
import { valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';

export interface LigneEcarts {
  type: TypeEcartAchat;
  ouverts: number;
  traites: number;
}

export interface StatistiquesAchats {
  filtre: FiltreStatistiques;
  achats: LigneAchats[];
  totalHtCentimes: number;
  delais: LigneDelais[];
  ecarts: LigneEcarts[];
}

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function clause(acteur: UtilisateurConnecte, perimetre: Perimetre) {
  if (!peutGererAchats(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
  };
}

/** Bornes incluses, sur le jour civil. Les achats se datent à la facture, les délais à l'envoi. */
export async function statistiquesAchats(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<StatistiquesAchats> {
  const portee = clause(acteur, perimetre);
  const filtre = valider(filtreStatistiquesSchema, saisie);
  const { du, au, fournisseurId } = filtre;
  const debut = versDate(du);
  const fin = new Date(versDate(au).getTime() + 86_400_000);
  const parFournisseur = fournisseurId ? { fournisseurId } : {};
  const client = base(acteur);
  const [factures, commandes, ecarts] = await Promise.all([
    client.factureFournisseur.findMany({
      where: {
        ...portee,
        ...parFournisseur,
        statut: 'VALIDEE',
        dateFacture: { gte: debut, lt: fin },
      },
      select: {
        montantHtCentimes: true,
        fournisseur: { select: { nom: true } },
        centre: { select: { nom: true } },
      },
    }),
    client.commande.findMany({
      where: {
        ...portee,
        ...parFournisseur,
        envoyeeLe: { gte: debut, lt: fin },
        receptions: { some: {} },
      },
      select: {
        envoyeeLe: true,
        fournisseur: { select: { nom: true } },
        receptions: {
          select: { dateReception: true },
          orderBy: { dateReception: 'asc' },
          take: 1,
        },
      },
    }),
    client.ecartAchat.groupBy({
      by: ['type', 'statut'],
      where: {
        ...portee,
        createdAt: { gte: debut, lt: fin },
        ...(fournisseurId
          ? { OR: [{ commande: { fournisseurId } }, { factureFournisseur: { fournisseurId } }] }
          : {}),
      },
      _count: { _all: true },
    }),
  ]);
  const achats = agregerAchats(
    factures.map((f) => ({
      fournisseur: f.fournisseur?.nom ?? '',
      centre: f.centre?.nom ?? '',
      montantHtCentimes: f.montantHtCentimes ?? 0,
    })),
  );
  const parType = new Map<TypeEcartAchat, LigneEcarts>();
  for (const { type, statut, _count } of ecarts) {
    const ligne = parType.get(type) ?? { type, ouverts: 0, traites: 0 };
    const aTraiter = statut === 'OUVERT' || statut === 'CONTESTE';
    parType.set(type, {
      type,
      ouverts: ligne.ouverts + (aTraiter ? _count._all : 0),
      traites: ligne.traites + (aTraiter ? 0 : _count._all),
    });
  }
  return {
    filtre,
    achats,
    totalHtCentimes: achats.reduce((t, l) => t + l.montantHtCentimes, 0),
    delais: agregerDelais(
      commandes.flatMap((c) => {
        const [premiere] = c.receptions;
        return c.envoyeeLe && premiere
          ? [
              {
                fournisseur: c.fournisseur.nom,
                envoyeeLe: c.envoyeeLe.toISOString(),
                recueLe: premiere.dateReception.toISOString(),
              },
            ]
          : [];
      }),
    ),
    ecarts: [...parType.values()].sort((a, b) => b.ouverts + b.traites - a.ouverts - a.traites),
  };
}

const ENTETES_CSV = ['Fournisseur', 'Centre', 'Factures', 'Montant HT'];

/** Export journalisé des achats, sans donnée patient. */
export async function exporterAchats(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<AsyncGenerator<string>> {
  const { achats, filtre } = await statistiquesAchats(acteur, perimetre, saisie);
  await journaliser(base(acteur), auteurDepuisActeur(acteur), {
    action: 'EXPORT',
    entiteType: 'FACTURE_FOURNISSEUR',
    centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
    details: { format: 'CSV', filtres: filtre },
  });
  async function* lignes(): AsyncGenerator<string> {
    yield ligneCsv(ENTETES_CSV);
    for (const l of achats) {
      yield ligneCsv([
        l.fournisseur,
        l.centre,
        String(l.factures),
        formatEuros(centimes(l.montantHtCentimes)),
      ]);
    }
  }
  return lignes();
}
