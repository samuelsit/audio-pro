import {
  formaterNir,
  LIBELLES_CIVILITE,
  type AmcSaisie,
  type AmoSaisie,
  type ChampCarte,
  type ValeurComparee,
  LIBELLES_MOTIF_DOUBLON,
  LIBELLES_QUALITE,
  LIBELLES_SEXE,
  type ChampFusion,
  type MotifDoublon,
} from '@ha/domain';

import { formaterDate } from '@/lib/format';
import type {
  CouvertureAmcDetail,
  CouvertureAmoDetail,
  PatientDetail,
  PatientResume,
} from '@/server/services/patients';

// Mise en forme des fiches patient, partagée par la liste, la fiche et l'écran de fusion.

/** « LEFÈVRE » ou « MARTIN (née LEFÈVRE) » : nom d'usage d'abord, comme à l'accueil. */
export function nomAffiche(
  p: Pick<PatientResume, 'nomNaissance' | 'nomUsage' | 'civilite'>,
): string {
  if (p.nomUsage === null || p.nomUsage === p.nomNaissance) {
    return p.nomNaissance.toUpperCase();
  }
  const ne = p.civilite === 'MME' ? 'née' : 'né';
  return `${p.nomUsage.toUpperCase()} (${ne} ${p.nomNaissance.toUpperCase()})`;
}

export function identiteComplete(p: PatientResume): string {
  return `${LIBELLES_CIVILITE[p.civilite]} ${p.prenoms} ${nomAffiche(p)}`;
}

export function dateEtAge(p: Pick<PatientResume, 'dateNaissance' | 'age'>): string {
  return `${formaterDate(p.dateNaissance)} (${p.age} an${p.age > 1 ? 's' : ''})`;
}

export function libelleMotifs(motifs: readonly MotifDoublon[]): string {
  return motifs.map((m) => LIBELLES_MOTIF_DOUBLON[m]).join(', ');
}

export function adresseSurUneLigne(
  p: Pick<PatientDetail, 'adresseLigne1' | 'adresseLigne2' | 'codePostal' | 'ville'>,
): string {
  const ville = [p.codePostal, p.ville].filter(Boolean).join(' ');
  return [p.adresseLigne1, p.adresseLigne2, ville].filter(Boolean).join(', ') || '—';
}

export function resumeAmo(
  amo: Pick<
    CouvertureAmoDetail,
    'nir' | 'qualite' | 'rangNaissance' | 'finDroits' | 'c2s' | 'ald'
  > | null,
): string {
  if (!amo) {
    return 'Aucune';
  }
  const indicateurs = [amo.c2s ? 'C2S' : null, amo.ald ? 'ALD' : null].filter(Boolean);
  return [
    formaterNir(amo.nir),
    `${LIBELLES_QUALITE[amo.qualite]}, rang ${amo.rangNaissance}`,
    amo.finDroits ? `droits jusqu’au ${formaterDate(amo.finDroits)}` : null,
    indicateurs.length > 0 ? indicateurs.join(' + ') : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

export function resumeAmc(amc: CouvertureAmcDetail | AmcSaisie | null): string {
  if (!amc) {
    return 'Aucune';
  }
  return [
    amc.organismeNom,
    amc.numeroAdherent ? `adhérent ${amc.numeroAdherent}` : null,
    amc.finValidite ? `jusqu’au ${formaterDate(amc.finValidite)}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

function ouiNon(valeur: boolean): string {
  return valeur ? 'Oui' : 'Non';
}

/** Valeur d'un champ arbitré à l'écran de fusion. */
export function valeurChampFusion(fiche: PatientDetail, champ: ChampFusion): string {
  switch (champ) {
    case 'centreId':
      return fiche.centre.nom;
    case 'civilite':
      return LIBELLES_CIVILITE[fiche.civilite];
    case 'sexe':
      return LIBELLES_SEXE[fiche.sexe];
    case 'dateNaissance':
      return formaterDate(fiche.dateNaissance);
    case 'adresse':
      return adresseSurUneLigne(fiche);
    case 'consentementSms':
    case 'consentementEmail':
    case 'consentementCourrier':
      return ouiNon(fiche[champ]);
    case 'amo':
      return resumeAmo(fiche.amo);
    case 'amc':
      return resumeAmc(fiche.amc);
    default:
      return fiche[champ] ?? '—';
  }
}

/** Valeur d'un champ à l'écran de comparaison base / carte Vitale. */
export function valeurChampCarte(champ: ChampCarte, valeur: ValeurComparee): string {
  switch (champ) {
    case 'amo':
      return resumeAmo(valeur as AmoSaisie | null);
    case 'amc':
      return resumeAmc(valeur as AmcSaisie | null);
    case 'dateNaissance':
    case 'finDroits':
      return valeur === null ? '—' : formaterDate(valeur as string);
    case 'nir':
      return valeur === null ? '—' : formaterNir(valeur as string);
    case 'qualite':
      return valeur === null ? '—' : LIBELLES_QUALITE[valeur as AmoSaisie['qualite']];
    case 'c2s':
    case 'ald':
      return valeur === null ? '—' : ouiNon(valeur as boolean);
    default:
      return valeur === null ? '—' : String(valeur);
  }
}
