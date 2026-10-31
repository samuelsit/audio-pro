import { randomUUID } from 'node:crypto';

import {
  audiogrammeSaisieSchema,
  avertissementsAudiogramme,
  bilanSaisieSchema,
  calculerScores,
  constatOtoscopiqueSchema,
  metadonneesMesureSchema,
  OREILLES,
  otoscopieSaisieSchema,
  peutAccederAuCentre,
  peutModifierMesure,
  peutSaisirFormulaire,
  peutSaisirMesure,
  rendreSyntheseBilanHtml,
  reponsesSchema,
  syntheseTonale,
  TYPES_DOCUMENT,
  validerReponses,
  VERSION_SCHEMA_MESURE,
  verifierPhotoOtoscopie,
  vocaleSaisieSchema,
  type Audiogramme,
  type ConstatOtoscopique,
  type NatureFormulaire,
  type Oreille,
  type Reponses,
  type ResultatScore,
  type Role,
  type SourceMesure,
  type SyntheseTonale,
  type TypeDocument,
  type TypeMesure,
  type VueSyntheseBilan,
  type Vocale,
} from '@ha/domain';
import { z } from 'zod';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { rendeurPdf } from '../pdf';
import { depuisDate, versDate } from './dossiers';
import {
  assurerModelesParDefaut,
  lireModele,
  modelesActifs,
  type ModeleFormulaireLu,
} from './modeles-formulaire';
import { aujourdhui, lireFiche, type Client } from './patients';

export const MESSAGE_MESURE_IMPORTEE = 'Cette mesure vient de NOAH : elle ne se modifie pas ici.';
const MESSAGE_DOUBLON_MESURE = 'Cette mesure vient d’être saisie par ailleurs : rechargez la page.';

const NOM_FICHIER_SYNTHESE = 'synthese-bilan-audiologique.pdf';

const tonaleSaisieSchema = z.object({
  appareil: metadonneesMesureSchema.shape.appareil,
  audiogramme: audiogrammeSaisieSchema,
});

const vocaleEnveloppeSchema = z.object({
  appareil: metadonneesMesureSchema.shape.appareil,
  vocale: vocaleSaisieSchema,
});

interface BilanLu {
  readonly id: string;
  readonly patientId: string;
  readonly centreId: string;
  readonly dateBilan: string;
}

/**
 * Lit le bilan et vérifie le droit sur le centre actuel du patient, pas sur celui du bilan :
 * l'historique suit le patient quand il change de centre (ADR-022).
 */
async function lireBilan(
  client: Client,
  acteur: UtilisateurConnecte,
  bilanId: string,
): Promise<BilanLu> {
  const bilan = await client.bilanAudiologique.findFirst({
    where: { id: bilanId, organisationId: acteur.organisationId },
    select: {
      id: true,
      patientId: true,
      centreId: true,
      dateBilan: true,
      patient: { select: { centreId: true } },
    },
  });
  if (!bilan || !peutAccederAuCentre(acteur, bilan.patient.centreId)) {
    throw new AccesRefuseError();
  }
  return { ...bilan, dateBilan: depuisDate(bilan.dateBilan) };
}

function evenementBilan(action: 'CREATE' | 'READ' | 'PRINT', bilan: BilanLu): EvenementAudit {
  return {
    action,
    entiteType: 'BILAN_AUDIOLOGIQUE',
    entiteId: bilan.id,
    patientId: bilan.patientId,
    centreId: bilan.centreId,
  };
}

function verifier(autorise: (role: Role) => boolean, acteur: UtilisateurConnecte): void {
  if (!autorise(acteur.role)) {
    throw new AccesRefuseError();
  }
}

function lireAudiogramme(donnees: string): Audiogramme {
  return audiogrammeSaisieSchema.parse(JSON.parse(donnees));
}

function lireVocale(donnees: string): Vocale {
  return vocaleSaisieSchema.parse(JSON.parse(donnees));
}

function lireConstat(constat: string): ConstatOtoscopique {
  return constatOtoscopiqueSchema.parse(JSON.parse(constat));
}

function lireReponses(reponses: string): Reponses {
  return reponsesSchema.parse(JSON.parse(reponses));
}

export interface MetaMesure {
  readonly id: string;
  readonly source: SourceMesure;
  readonly date: string;
  readonly appareil: string | null;
}

export interface TonaleLue extends MetaMesure {
  readonly audiogramme: Audiogramme;
  readonly synthese: SyntheseTonale;
  readonly avertissements: readonly string[];
}

export interface VocaleLue extends MetaMesure {
  readonly vocale: Vocale;
}

export interface OtoscopieLue {
  readonly oreille: Oreille;
  readonly source: SourceMesure;
  readonly constat: ConstatOtoscopique;
  readonly photo: boolean;
}

export interface ReponseLue {
  readonly id: string;
  readonly modele: ModeleFormulaireLu;
  readonly nature: NatureFormulaire;
  readonly reponses: Reponses;
  readonly scores: readonly ResultatScore[];
}

export interface BilanDetail extends BilanLu {
  readonly centreNom: string;
  readonly praticien: string | null;
  readonly tonale: TonaleLue | null;
  readonly vocales: readonly VocaleLue[];
  readonly otoscopies: readonly OtoscopieLue[];
  readonly anamnese: ReponseLue | null;
  readonly questionnaires: readonly ReponseLue[];
  readonly modeles: readonly ModeleFormulaireLu[];
}

function versMeta(ligne: {
  id: string;
  source: SourceMesure;
  mesureLe: Date;
  appareil: string | null;
}): MetaMesure {
  return {
    id: ligne.id,
    source: ligne.source,
    date: depuisDate(ligne.mesureLe),
    appareil: ligne.appareil,
  };
}

function versTonale(ligne: Parameters<typeof versMeta>[0] & { donnees: string }): TonaleLue {
  const audiogramme = lireAudiogramme(ligne.donnees);
  return {
    ...versMeta(ligne),
    audiogramme,
    synthese: syntheseTonale(audiogramme),
    avertissements: avertissementsAudiogramme(audiogramme),
  };
}

// La mesure NOAH passe après la saisie : une correction manuelle prime à l'affichage.
const ORDRE_MESURES = [{ source: 'asc' }, { mesureLe: 'desc' }, { id: 'desc' }] as const;

async function lireDetail(
  client: Client,
  acteur: UtilisateurConnecte,
  bilan: BilanLu,
): Promise<BilanDetail> {
  // À la suite, jamais en parallèle : `client` peut être une transaction.
  const entete = await client.bilanAudiologique.findUniqueOrThrow({
    where: { id: bilan.id },
    select: {
      centre: { select: { nom: true } },
      praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
    },
  });
  const mesures = await client.mesureAudiologique.findMany({
    where: { bilanId: bilan.id },
    orderBy: [...ORDRE_MESURES],
    select: {
      id: true,
      type: true,
      source: true,
      mesureLe: true,
      appareil: true,
      donnees: true,
    },
  });
  const otoscopies = await client.otoscopie.findMany({
    where: { bilanId: bilan.id },
    select: { oreille: true, source: true, constat: true, photoCle: true },
  });
  const reponses = await client.reponseFormulaire.findMany({
    where: { bilanId: bilan.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, modeleId: true, nature: true, reponses: true },
  });
  const modeles = await modelesActifs(client, acteur);
  const lues: ReponseLue[] = [];
  for (const r of reponses) {
    const modele = await lireModele(client, acteur, r.modeleId);
    const contenu = lireReponses(r.reponses);
    lues.push({
      id: r.id,
      modele,
      nature: r.nature,
      reponses: contenu,
      scores: calculerScores(modele.definition, contenu),
    });
  }
  const tonale = mesures.find((m) => m.type === 'TONALE');
  const utilisateur = entete.praticien?.utilisateur;
  return {
    ...bilan,
    centreNom: entete.centre.nom,
    praticien: utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}` : null,
    tonale: tonale ? versTonale(tonale) : null,
    vocales: mesures
      .filter((m) => m.type !== 'TONALE')
      .map((m) => ({ ...versMeta(m), vocale: lireVocale(m.donnees) })),
    otoscopies: otoscopies.map((o) => ({
      oreille: o.oreille,
      source: o.source,
      constat: lireConstat(o.constat),
      photo: o.photoCle !== null,
    })),
    anamnese: lues.find((r) => r.nature === 'ANAMNESE') ?? null,
    questionnaires: lues.filter((r) => r.nature !== 'ANAMNESE'),
    modeles,
  };
}

/** Ouvre un bilan : une ligne READ dans le journal. */
export async function obtenirBilan(
  acteur: UtilisateurConnecte,
  bilanId: string,
): Promise<BilanDetail> {
  return withAudit(
    acteur,
    async (tx) => lireDetail(tx, acteur, await lireBilan(tx, acteur, bilanId)),
    (bilan) => evenementBilan('READ', bilan),
  );
}

export async function creerBilan(
  acteur: UtilisateurConnecte,
  patientId: string,
  saisie: unknown,
): Promise<string> {
  verifier(peutSaisirFormulaire, acteur);
  const { dateBilan } = valider(bilanSaisieSchema, saisie);
  if (dateBilan > aujourdhui()) {
    throw ErreurSaisie.surChamp('dateBilan', 'La date du bilan ne peut pas être future.');
  }
  const bilan = await withAudit(
    acteur,
    async (tx) => {
      const fiche = await lireFiche(tx, acteur, patientId);
      if (fiche.fusionneDansId !== null) {
        throw new AccesRefuseError();
      }
      await assurerModelesParDefaut(tx, acteur);
      const praticien = await tx.praticien.findUnique({
        where: { utilisateurId: acteur.id },
        select: { id: true },
      });
      const cree = await tx.bilanAudiologique.create({
        data: {
          patientId,
          centreId: fiche.centre.id,
          praticienId: praticien?.id ?? null,
          dateBilan: versDate(dateBilan),
          createdById: acteur.id,
        },
        select: { id: true, patientId: true, centreId: true },
      });
      return { ...cree, dateBilan };
    },
    (cree) => evenementBilan('CREATE', cree),
  );
  return bilan.id;
}

export interface LigneBilan {
  readonly id: string;
  readonly dateBilan: string;
  readonly centreNom: string;
  readonly tonale: TonaleLue | null;
}

/** Bilans du patient, du plus ancien au plus récent : l'ordre de l'évolution. */
export async function listerBilans(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<readonly LigneBilan[]> {
  return withAudit(
    acteur,
    async (tx) => {
      const fiche = await lireFiche(tx, acteur, patientId);
      const bilans = await tx.bilanAudiologique.findMany({
        where: { patientId },
        orderBy: [{ dateBilan: 'asc' }, { id: 'asc' }],
        select: { id: true, dateBilan: true, centre: { select: { nom: true } } },
      });
      const mesures = await tx.mesureAudiologique.findMany({
        where: { bilanId: { in: bilans.map((b) => b.id) }, type: 'TONALE' },
        orderBy: [...ORDRE_MESURES],
        select: {
          id: true,
          bilanId: true,
          source: true,
          mesureLe: true,
          appareil: true,
          donnees: true,
        },
      });
      return {
        fiche,
        lignes: bilans.map((b) => {
          const tonale = mesures.find((m) => m.bilanId === b.id);
          return {
            id: b.id,
            dateBilan: depuisDate(b.dateBilan),
            centreNom: b.centre.nom,
            tonale: tonale ? versTonale(tonale) : null,
          };
        }),
      };
    },
    ({ fiche }) => ({
      action: 'READ',
      entiteType: 'BILAN_AUDIOLOGIQUE',
      patientId,
      centreId: fiche.centre.id,
    }),
  ).then(({ lignes }) => lignes);
}

async function mesureExistante(
  client: Client,
  bilanId: string,
  type: TypeMesure,
): Promise<{ id: string; source: SourceMesure } | null> {
  return client.mesureAudiologique.findFirst({
    where: { bilanId, type },
    orderBy: [...ORDRE_MESURES],
    select: { id: true, source: true },
  });
}

async function enregistrerMesure(
  acteur: UtilisateurConnecte,
  bilanId: string,
  type: TypeMesure,
  appareil: string | null,
  contenu: unknown,
): Promise<void> {
  verifier(peutSaisirMesure, acteur);
  const donnees = JSON.stringify(contenu);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const bilan = await lireBilan(tx, acteur, bilanId);
        const existante = await mesureExistante(tx, bilanId, type);
        if (existante && !peutModifierMesure(existante.source)) {
          throw new ErreurSaisie({}, MESSAGE_MESURE_IMPORTEE);
        }
        const ecrite = existante
          ? await tx.mesureAudiologique.update({
              where: { id: existante.id },
              data: {
                appareil,
                donnees,
                versionSchema: VERSION_SCHEMA_MESURE,
                auteurId: acteur.id,
              },
              select: { id: true },
            })
          : await tx.mesureAudiologique.create({
              data: {
                bilanId,
                type,
                mesureLe: versDate(bilan.dateBilan),
                appareil,
                donnees,
                versionSchema: VERSION_SCHEMA_MESURE,
                auteurId: acteur.id,
              },
              select: { id: true },
            });
        return { bilan, id: ecrite.id, creation: existante === null };
      },
      ({ bilan, id, creation }) => ({
        action: creation ? 'CREATE' : 'UPDATE',
        entiteType: 'MESURE_AUDIOLOGIQUE',
        entiteId: id,
        patientId: bilan.patientId,
        centreId: bilan.centreId,
        details: { bilanId, type, source: 'SAISIE' },
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, {}, MESSAGE_DOUBLON_MESURE);
  }
}

export async function enregistrerTonale(
  acteur: UtilisateurConnecte,
  bilanId: string,
  saisie: unknown,
): Promise<void> {
  const { appareil, audiogramme } = valider(tonaleSaisieSchema, saisie);
  await enregistrerMesure(acteur, bilanId, 'TONALE', appareil, audiogramme);
}

export async function enregistrerVocale(
  acteur: UtilisateurConnecte,
  bilanId: string,
  saisie: unknown,
): Promise<void> {
  const { appareil, vocale } = valider(vocaleEnveloppeSchema, saisie);
  const type = vocale.contexte === 'CALME' ? 'VOCALE_CALME' : 'VOCALE_BRUIT';
  await enregistrerMesure(acteur, bilanId, type, appareil, vocale);
}

/** La photo se dépose avant la transaction : le stockage ne peut pas y prendre part. */
export async function enregistrerOtoscopie(
  acteur: UtilisateurConnecte,
  bilanId: string,
  saisie: unknown,
  photo: Uint8Array | null,
): Promise<void> {
  verifier(peutSaisirMesure, acteur);
  const { oreille, ...constat } = valider(otoscopieSaisieSchema, saisie);
  const document = photo === null ? null : verifierPhotoOtoscopie(photo);
  if (document && !document.valide) {
    throw ErreurSaisie.surChamp('photo', document.message);
  }
  await lireBilan(base(acteur), acteur, bilanId);
  const nouvelle =
    photo !== null && document?.valide
      ? {
          photoCle: `otoscopies/${randomUUID()}`,
          photoType: document.type,
          photoTaille: photo.length,
        }
      : null;
  if (nouvelle && photo) {
    await documents().put(nouvelle.photoCle, photo, nouvelle.photoType);
  }
  try {
    const { ancienneCle } = await withAudit(
      acteur,
      async (tx) => {
        const bilan = await lireBilan(tx, acteur, bilanId);
        const existante = await tx.otoscopie.findUnique({
          where: { bilanId_oreille: { bilanId, oreille } },
          select: { id: true, source: true, photoCle: true },
        });
        if (existante && !peutModifierMesure(existante.source)) {
          throw new ErreurSaisie({}, MESSAGE_MESURE_IMPORTEE);
        }
        const champs = {
          constat: JSON.stringify(constat),
          auteurId: acteur.id,
          ...(nouvelle ?? {}),
        };
        const ecrite = existante
          ? await tx.otoscopie.update({
              where: { id: existante.id },
              data: champs,
              select: { id: true },
            })
          : await tx.otoscopie.create({
              data: { bilanId, oreille, ...champs },
              select: { id: true },
            });
        return {
          bilan,
          id: ecrite.id,
          creation: existante === null,
          ancienneCle: nouvelle ? (existante?.photoCle ?? null) : null,
        };
      },
      ({ bilan, id, creation }) => ({
        action: creation ? 'CREATE' : 'UPDATE',
        entiteType: 'OTOSCOPIE',
        entiteId: id,
        patientId: bilan.patientId,
        centreId: bilan.centreId,
        details: { bilanId, oreille, photo: nouvelle !== null },
      }),
    );
    if (ancienneCle !== null) {
      await documents()
        .delete(ancienneCle)
        .catch(() => undefined);
    }
  } catch (erreur) {
    if (nouvelle) {
      await documents()
        .delete(nouvelle.photoCle)
        .catch(() => undefined);
    }
    traduireDoublon(erreur, {}, MESSAGE_DOUBLON_MESURE);
  }
}

export interface PhotoOtoscopie {
  readonly contenu: Uint8Array;
  readonly type: TypeDocument;
}

function typePhoto(type: string): TypeDocument {
  const trouve = TYPES_DOCUMENT.find((t) => t === type);
  if (trouve === undefined) {
    throw new AccesRefuseError();
  }
  return trouve;
}

/** Ouvre une photo : une ligne READ, comme le bilan. */
export async function lirePhotoOtoscopie(
  acteur: UtilisateurConnecte,
  bilanId: string,
  oreille: unknown,
): Promise<PhotoOtoscopie> {
  const cote = z.enum(OREILLES).safeParse(oreille);
  if (!cote.success) {
    throw new AccesRefuseError();
  }
  const { cle, type } = await withAudit(
    acteur,
    async (tx) => {
      const bilan = await lireBilan(tx, acteur, bilanId);
      const ligne = await tx.otoscopie.findUnique({
        where: { bilanId_oreille: { bilanId, oreille: cote.data } },
        select: { id: true, photoCle: true, photoType: true },
      });
      if (!ligne?.photoCle || !ligne.photoType) {
        throw new AccesRefuseError();
      }
      return { bilan, id: ligne.id, cle: ligne.photoCle, type: ligne.photoType };
    },
    ({ bilan, id }) => ({
      action: 'READ',
      entiteType: 'OTOSCOPIE',
      entiteId: id,
      patientId: bilan.patientId,
      centreId: bilan.centreId,
      details: { bilanId, photo: true },
    }),
  );
  return { contenu: await documents().get(cle), type: typePhoto(type) };
}

export async function enregistrerFormulaire(
  acteur: UtilisateurConnecte,
  bilanId: string,
  modeleId: string,
  saisie: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  verifier(peutSaisirFormulaire, acteur);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const bilan = await lireBilan(tx, acteur, bilanId);
        const modele = await lireModele(tx, acteur, modeleId);
        const resultat = validerReponses(modele.definition, saisie);
        if (!resultat.valide) {
          throw new ErreurSaisie(resultat.erreurs);
        }
        const reponses = JSON.stringify(resultat.reponses);
        const existante = await tx.reponseFormulaire.findUnique({
          where: { bilanId_modeleId: { bilanId, modeleId } },
          select: { id: true },
        });
        if (!existante && !modele.actif) {
          throw new ErreurSaisie({}, 'Ce modèle n’est plus proposé.');
        }
        const ecrite = existante
          ? await tx.reponseFormulaire.update({
              where: { id: existante.id },
              data: { reponses, auteurId: acteur.id },
              select: { id: true },
            })
          : await tx.reponseFormulaire.create({
              data: {
                bilanId,
                modeleId,
                nature: modele.nature,
                reponses,
                auteurId: acteur.id,
              },
              select: { id: true },
            });
        return { bilan, id: ecrite.id, creation: existante === null, nature: modele.nature };
      },
      ({ bilan, id, creation, nature }) => ({
        action: creation ? 'CREATE' : 'UPDATE',
        entiteType: 'REPONSE_FORMULAIRE',
        entiteId: id,
        patientId: bilan.patientId,
        centreId: bilan.centreId,
        details: { bilanId, modeleId, nature },
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, {}, 'Une anamnèse existe déjà pour ce bilan : rechargez la page.');
  }
}

function formulaireSynthese({ modele, reponses }: ReponseLue) {
  return { nom: modele.nom, definition: modele.definition, reponses };
}

/** Synthèse en PDF, rendue à la demande et jamais stockée : une ligne PRINT à chaque téléchargement. */
export async function syntheseBilan(
  acteur: UtilisateurConnecte,
  bilanId: string,
): Promise<{ contenu: Uint8Array; nomFichier: string }> {
  const client = base(acteur);
  const bilan = await lireBilan(client, acteur, bilanId);
  const detail = await lireDetail(client, acteur, bilan);
  const [centre, patient] = await Promise.all([
    client.centre.findUniqueOrThrow({
      where: { id: bilan.centreId },
      select: {
        nom: true,
        adresseLigne1: true,
        adresseLigne2: true,
        codePostal: true,
        ville: true,
        telephone: true,
      },
    }),
    client.patient.findUniqueOrThrow({
      where: { id: bilan.patientId },
      select: { prenoms: true, nomUsage: true, nomNaissance: true, dateNaissance: true },
    }),
  ]);
  const vue: VueSyntheseBilan = {
    centre: {
      nom: centre.nom,
      adresse: [
        centre.adresseLigne1,
        ...(centre.adresseLigne2 === null ? [] : [centre.adresseLigne2]),
        `${centre.codePostal} ${centre.ville}`,
      ],
      telephone: centre.telephone,
    },
    patient: {
      prenomNom: `${patient.prenoms} ${patient.nomUsage ?? patient.nomNaissance}`,
      dateNaissance: depuisDate(patient.dateNaissance),
    },
    dateBilan: bilan.dateBilan,
    praticien: detail.praticien,
    anamnese: detail.anamnese && formulaireSynthese(detail.anamnese),
    otoscopies: detail.otoscopies,
    tonale: detail.tonale,
    vocales: detail.vocales,
    questionnaires: detail.questionnaires.map(formulaireSynthese),
  };
  const contenu = await rendeurPdf().rendre(rendreSyntheseBilanHtml(vue));
  await withAudit(acteur, async () => undefined, evenementBilan('PRINT', bilan));
  return { contenu, nomFichier: NOM_FICHIER_SYNTHESE };
}
