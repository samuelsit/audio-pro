'use server';

import { revalidatePath } from 'next/cache';

import { texte, type EtatFormulaire } from '@/lib/formulaire';
import { executer } from '@/server/actions';
import { requireSession } from '@/server/auth/gardes';
import {
  compterCaisse,
  lancerArchivage,
  lancerClotures,
  lancerVerification,
  modifierParametresComptables,
  ouvrirCaisse,
  verifierArchiveEnregistree,
} from '@/server/services/caisse';
import {
  encaisserAcompte,
  encaisserFacture,
  rembourserEncaissement,
} from '@/server/services/encaissements';
import {
  LIBELLES_RAISONS_RUPTURE,
  COLONNES_FEC,
  MODES_PAIEMENT,
  NATURES_LIGNE_FACTURE,
  type RaisonRupture,
} from '@ha/domain';

function terminer(succes: string): EtatFormulaire {
  revalidatePath('/caisse', 'layout');
  return { succes };
}

function saisieEncaissement(formData: FormData) {
  return {
    mode: texte(formData, 'mode'),
    montant: texte(formData, 'montant'),
    remis: texte(formData, 'remis'),
    reference: texte(formData, 'reference'),
    partenaire: texte(formData, 'partenaire'),
    echeances: texte(formData, 'echeances'),
  };
}

export async function encaisserFactureAction(
  factureId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisieEncaissement(formData);
  const erreur = await executer(() => encaisserFacture(acteur, factureId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath(`/factures/${factureId}`);
  return terminer('Encaissement enregistré.');
}

export async function encaisserAcompteAction(
  devisId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = saisieEncaissement(formData);
  const erreur = await executer(() => encaisserAcompte(acteur, devisId, donnees), donnees);
  if (erreur) {
    return erreur;
  }
  revalidatePath('/dossiers', 'layout');
  return terminer('Acompte enregistré.');
}

export async function rembourserAction(
  encaissementId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    nature: texte(formData, 'nature'),
    mode: texte(formData, 'mode'),
    montant: texte(formData, 'montant'),
    motif: texte(formData, 'motif'),
    reference: texte(formData, 'reference'),
  };
  const erreur = await executer(
    () => rembourserEncaissement(acteur, encaissementId, donnees),
    donnees,
  );
  if (erreur) {
    return erreur;
  }
  revalidatePath('/factures', 'layout');
  revalidatePath('/dossiers', 'layout');
  return terminer('Opération enregistrée.');
}

export async function ouvrirCaisseAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    fond: texte(formData, 'fond'),
    justification: texte(formData, 'justification'),
  };
  const erreur = await executer(() => ouvrirCaisse(acteur, centreId, donnees), donnees);
  return erreur ?? terminer('Caisse ouverte.');
}

export async function compterCaisseAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const donnees = {
    comptees: texte(formData, 'comptees'),
    remiseBanque: texte(formData, 'remiseBanque'),
    justification: texte(formData, 'justification'),
  };
  const erreur = await executer(() => compterCaisse(acteur, centreId, donnees), donnees);
  return erreur ?? terminer('Comptage enregistré.');
}

export async function lancerCloturesAction(centreId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  let bilan = '';
  const erreur = await executer(async () => {
    const { jours, mois, exercices } = await lancerClotures(acteur, centreId);
    bilan = `Clôtures : ${String(jours)} journée(s), ${String(mois)} mois, ${String(exercices)} exercice(s).`;
  });
  return erreur ?? terminer(bilan);
}

export async function lancerArchivageAction(centreId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  let bilan = '';
  const erreur = await executer(async () => {
    bilan = `${String(await lancerArchivage(acteur, centreId))} archive(s) créée(s).`;
  });
  return erreur ?? terminer(bilan);
}

export async function verifierArchiveAction(archiveId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const resultat = await verifierArchiveEnregistree(acteur, archiveId);
  return resultat.valide
    ? { succes: `Archive intègre : ${String(resultat.maillons)} maillons.` }
    : { message: `Archive altérée (${resultat.raison}).` };
}

export async function verifierChaineAction(centreId: string): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const resultat = await lancerVerification(acteur, centreId);
  revalidatePath('/caisse', 'layout');
  if (resultat.valide) {
    return { succes: `Chaîne intègre : ${String(resultat.maillons)} maillons vérifiés.` };
  }
  const raison: RaisonRupture = resultat.raison;
  return {
    message: `Chaîne rompue au rang ${String(resultat.rang)} : ${LIBELLES_RAISONS_RUPTURE[raison]}.`,
  };
}

export async function modifierParametresAction(
  centreId: string,
  _: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const acteur = await requireSession();
  const saisie = {
    comptes: {
      journalVentes: texte(formData, 'journalVentes'),
      journalVentesLibelle: texte(formData, 'journalVentesLibelle'),
      journalTresorerie: texte(formData, 'journalTresorerie'),
      journalTresorerieLibelle: texte(formData, 'journalTresorerieLibelle'),
      compteClients: texte(formData, 'compteClients'),
      compteAmo: texte(formData, 'compteAmo'),
      compteAmc: texte(formData, 'compteAmc'),
      compteAcomptes: texte(formData, 'compteAcomptes'),
      compteTva: texte(formData, 'compteTva'),
      compteEcartNegatif: texte(formData, 'compteEcartNegatif'),
      compteEcartPositif: texte(formData, 'compteEcartPositif'),
      ventes: Object.fromEntries(
        NATURES_LIGNE_FACTURE.map((n) => [n, texte(formData, `vente-${n}`)]),
      ),
      tresorerie: Object.fromEntries(
        MODES_PAIEMENT.map((m) => [m, texte(formData, `tresorerie-${m}`)]),
      ),
    },
    profil: {
      nom: texte(formData, 'profilNom'),
      separateur: texte(formData, 'separateur') === 'tab' ? '\t' : texte(formData, 'separateur'),
      decimale: texte(formData, 'decimale'),
      formatDate: texte(formData, 'formatDate'),
      entete: formData.get('entete') === 'on',
      colonnes: COLONNES_FEC.filter((c) => formData.get(`colonne-${c}`) === 'on'),
    },
    moisClotureExercice: texte(formData, 'moisClotureExercice'),
  };
  const erreur = await executer(() => modifierParametresComptables(acteur, centreId, saisie));
  return erreur ?? terminer('Paramètres enregistrés.');
}
