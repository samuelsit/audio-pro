import { prisma, viderBaseJetable } from '@ha/db';

import { chargerUtilisateurConnecte, type UtilisateurConnecte } from '@/server/auth/acces';

export async function viderBase(): Promise<void> {
  await viderBaseJetable(process.env.DATABASE_URL ?? '');
}

function centre(organisationId: string, nom: string) {
  return prisma().centre.create({
    data: {
      organisationId,
      nom,
      adresseLigne1: '1 rue de l’Exemple',
      codePostal: '75000',
      ville: 'Paris',
      email: `${nom.toLowerCase().replace(/\s+/g, '-')}@exemple.test`,
      telephone: '0100000000',
    },
  });
}

function utilisateur(
  organisationId: string,
  prenom: string,
  role: 'ADMIN' | 'AUDIO' | 'ASSISTANT',
  centreIds: string[],
) {
  return prisma().utilisateur.create({
    data: {
      organisationId,
      prenom,
      nom: 'Test',
      name: `${prenom} Test`,
      email: `${prenom.toLowerCase()}@exemple.test`,
      role,
      doitChangerMotDePasse: false,
      centres: { create: centreIds.map((centreId) => ({ centreId })) },
    },
  });
}

/**
 * Jeu de données fictif : centres A, B, C ; un ADMIN ; un AUDIO rattaché à A et B (praticien à A et B) ;
 * un AUDIO rattaché à C (praticien à C) ; un ASSISTANT à A ; un ASSISTANT à B ; un ASSISTANT sans centre actif.
 */
export async function creerJeuDeDonnees() {
  const org = await prisma().organisation.create({ data: { nom: 'Réseau Test' } });
  const [a, b, c, ferme] = await Promise.all([
    centre(org.id, 'Centre A'),
    centre(org.id, 'Centre B'),
    centre(org.id, 'Centre C'),
    centre(org.id, 'Centre Fermé'),
  ]);
  await prisma().centre.update({ where: { id: ferme.id }, data: { actif: false } });

  const admin = await utilisateur(org.id, 'Admin', 'ADMIN', []);
  const audioAB = await utilisateur(org.id, 'Audioab', 'AUDIO', [a.id, b.id]);
  const audioC = await utilisateur(org.id, 'Audioc', 'AUDIO', [c.id]);
  const assistantA = await utilisateur(org.id, 'Assistanta', 'ASSISTANT', [a.id]);
  const assistantB = await utilisateur(org.id, 'Assistantb', 'ASSISTANT', [b.id]);
  const assistantFerme = await utilisateur(org.id, 'Assistantferme', 'ASSISTANT', [ferme.id]);

  const praticienAB = await prisma().praticien.create({
    data: {
      utilisateurId: audioAB.id,
      rpps: '19999999907',
      centres: { create: [{ centreId: a.id }, { centreId: b.id }] },
    },
  });
  const praticienC = await prisma().praticien.create({
    data: {
      utilisateurId: audioC.id,
      rpps: '19999999915',
      centres: { create: [{ centreId: c.id }] },
    },
  });

  const charger = async (id: string): Promise<UtilisateurConnecte> => {
    const u = await chargerUtilisateurConnecte(id);
    if (!u) {
      throw new Error(`Utilisateur de test ${id} introuvable.`);
    }
    return u;
  };

  return {
    organisation: org,
    centres: { a, b, c, ferme },
    utilisateurs: { admin, audioAB, audioC, assistantA, assistantB, assistantFerme },
    praticiens: { praticienAB, praticienC },
    acteurs: {
      admin: await charger(admin.id),
      audioAB: await charger(audioAB.id),
      assistantA: await charger(assistantA.id),
      assistantB: await charger(assistantB.id),
    },
  };
}

export type JeuDeDonnees = Awaited<ReturnType<typeof creerJeuDeDonnees>>;
