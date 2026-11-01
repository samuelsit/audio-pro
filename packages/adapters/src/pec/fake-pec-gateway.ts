import type { DemandePec, PecGateway, ReponsePec } from '@ha/domain';

/** Validité simulée d'un accord, fixe pour que la démonstration ne dépende pas du jour. */
const VALIDITE_SIMULEE = '2099-12-31';

/**
 * Plateforme de tiers payant simulée : rien ne part vers un organisme. La réponse dépend du dernier chiffre du numéro
 * d'adhérent : 0 refuse, 1 accorde la moitié, 2 laisse la demande en attente, tout le reste accorde le total.
 * Une demande en attente est accordée à la consultation suivante.
 * `prochaineReponse` force la prochaine réponse. Le suivi vit en mémoire : une référence inconnue reste en attente.
 */
export class FakePecGateway implements PecGateway {
  readonly recues: DemandePec[] = [];
  readonly #reponses = new Map<string, ReponsePec>();
  readonly #demandes = new Map<string, DemandePec>();
  /** Statut et montant de la prochaine réponse simulée, jamais de donnée du patient. */
  prochaineReponse: Pick<ReponsePec, 'statut' | 'montantAccordeCentimes' | 'motif'> | null = null;

  #accord(reference: string, montant: number, statut: 'ACCORDEE' | 'PARTIELLE'): ReponsePec {
    return {
      reference,
      statut,
      numeroAccord: `SIM-ACC-${reference}`,
      montantAccordeCentimes: montant,
      validiteFin: VALIDITE_SIMULEE,
      motif: null,
    };
  }

  #simuler(reference: string, demande: DemandePec): ReponsePec {
    const total = demande.lignes.reduce((t, l) => t + l.montantDemandeCentimes, 0);
    switch (demande.numeroAdherent?.at(-1)) {
      case '0':
        return {
          reference,
          statut: 'REFUSEE',
          numeroAccord: null,
          montantAccordeCentimes: null,
          validiteFin: null,
          motif: 'Refus simulé.',
        };
      case '1':
        return this.#accord(reference, Math.floor(total / 2), 'PARTIELLE');
      case '2':
        return {
          reference,
          statut: 'DEMANDEE',
          numeroAccord: null,
          montantAccordeCentimes: null,
          validiteFin: null,
          motif: null,
        };
      default:
        return this.#accord(reference, total, 'ACCORDEE');
    }
  }

  #forcee(reference: string): ReponsePec | null {
    const forcee = this.prochaineReponse;
    this.prochaineReponse = null;
    if (forcee === null) {
      return null;
    }
    const accord = forcee.montantAccordeCentimes !== null;
    return {
      ...forcee,
      reference,
      numeroAccord: accord ? `SIM-ACC-${reference}` : null,
      validiteFin: accord ? VALIDITE_SIMULEE : null,
    };
  }

  demander(demande: DemandePec): Promise<ReponsePec> {
    this.recues.push(demande);
    const reference = `SIM-PEC-${demande.dossierId}-${String(this.recues.length)}`;
    const reponse = this.#forcee(reference) ?? this.#simuler(reference, demande);
    this.#demandes.set(reference, demande);
    this.#reponses.set(reference, reponse);
    return Promise.resolve(reponse);
  }

  consulter(reference: string): Promise<ReponsePec> {
    const actuelle = this.#reponses.get(reference) ?? {
      reference,
      statut: 'DEMANDEE' as const,
      numeroAccord: null,
      montantAccordeCentimes: null,
      validiteFin: null,
      motif: null,
    };
    if (actuelle.statut !== 'DEMANDEE') {
      return Promise.resolve(actuelle);
    }
    const demande = this.#demandes.get(reference);
    const total = demande?.lignes.reduce((t, l) => t + l.montantDemandeCentimes, 0) ?? 0;
    const reponse =
      this.#forcee(reference) ?? (demande ? this.#accord(reference, total, 'ACCORDEE') : actuelle);
    this.#reponses.set(reference, reponse);
    return Promise.resolve(reponse);
  }
}
