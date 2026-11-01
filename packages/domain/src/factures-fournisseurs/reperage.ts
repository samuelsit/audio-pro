import type { FactureExtraite } from './extraction';

export interface FicheCentre {
  readonly id: string;
  readonly siret: string | null;
}

export interface CompteCentre {
  readonly fournisseurId: string;
  readonly centreId: string;
  readonly numeroClient: string;
}

export interface FicheFournisseur {
  readonly id: string;
  readonly siret: string | null;
  readonly emailFacturation: string | null;
}

export interface FactureRepere {
  readonly fournisseurId: string | null;
  readonly centreId: string | null;
  readonly expediteurInconnu: boolean;
}

function memeAdresse(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Repère le fournisseur (SIRET, sinon expéditeur) et le centre (SIRET, sinon numéro de client). Une adresse
 * unique reçoit tout : le centre se lit sur la facture. Un doute laisse le champ vide, jamais un choix au hasard.
 */
export function reperer(
  extraite: Pick<FactureExtraite, 'sirets' | 'numerosClient'>,
  expediteur: string | null,
  fournisseurs: readonly FicheFournisseur[],
  centres: readonly FicheCentre[],
  comptes: readonly CompteCentre[],
): FactureRepere {
  const parExpediteur =
    expediteur === null
      ? undefined
      : fournisseurs.find(
          (f) => f.emailFacturation !== null && memeAdresse(f.emailFacturation, expediteur),
        );
  const parSiret = fournisseurs.find((f) => f.siret !== null && extraite.sirets.includes(f.siret));
  const fournisseurId = parSiret?.id ?? parExpediteur?.id ?? null;

  const centresParSiret = centres.filter(
    (c) => c.siret !== null && extraite.sirets.includes(c.siret),
  );
  const centresParCompte = comptes.filter(
    (c) =>
      (fournisseurId === null || c.fournisseurId === fournisseurId) &&
      extraite.numerosClient.includes(c.numeroClient),
  );
  const [centreId, ...autres] = new Set(
    centresParSiret.length > 0
      ? centresParSiret.map((c) => c.id)
      : centresParCompte.map((c) => c.centreId),
  );
  return {
    fournisseurId,
    centreId: centreId !== undefined && autres.length === 0 ? centreId : null,
    expediteurInconnu: expediteur !== null && parExpediteur === undefined,
  };
}
