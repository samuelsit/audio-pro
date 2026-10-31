import type { Oreille } from '../audio-rules/code-prestation';
import {
  controleDevis,
  type DevisAControler,
  type EntrepriseDevis,
  type OffreDevis,
  type ResultatControleDevis,
} from '../audio-rules/controle-devis';
import {
  premiereDelivrancePossible,
  type OreilleDossier,
} from '../audio-rules/controle-prescription';
import type { Delivrance } from '../audio-rules/renouvellement';
import type { TarifsAudio } from '../audio-rules/tarifs';
import { centimes } from '../money';
import { ficheAideComplete, ficheConsommableComplete, type OffreDonnees } from './types';

/** Faits extérieurs au devis, lus par le service. */
export interface ContexteDevis {
  readonly dateNaissance: string;
  readonly c2s: boolean;
  readonly surdicecite: boolean;
  readonly prescription: DevisAControler['prescription'];
  readonly oreilles: readonly OreilleDossier[];
  readonly historiqueDelivrances: readonly Delivrance[];
  readonly entreprise: EntrepriseDevis;
}

/** Contenu du devis à contrôler, à sa date d'émission. */
export interface DevisDonnees {
  readonly dateDevis: string;
  readonly dateFinValidite: string;
  readonly refusOffreC2S: boolean;
  readonly contratResponsable: boolean;
  readonly tauxAMO: number;
  readonly bobineTPresentee: boolean;
  readonly ficheTechniqueJointe: boolean;
  readonly datePrecedentDroite: string | null;
  readonly datePrecedentGauche: string | null;
  readonly offres: readonly OffreDonnees[];
}

function offresDeLOreille(offres: readonly OffreDonnees[], oreille: Oreille): OffreDevis[] {
  return offres.flatMap((offre) =>
    offre.aides
      .filter((aide) => aide.oreille === oreille)
      .map((aide) => ({
        rubrique: offre.rubrique,
        classe: aide.classe,
        prixTTC: aide.prixUnitaire,
        priseEnChargeAMC: (oreille === 'DROITE' ? offre.amcDroite : offre.amcGauche) ?? centimes(0),
        nombreOptions: aide.designation.options.length,
        ficheComplete: ficheAideComplete(aide.designation),
      })),
  );
}

/** La date de délivrance prévue est la première possible : 30 jours d'essai après le devis (R2). */
export function versDevisAControler(devis: DevisDonnees, contexte: ContexteDevis): DevisAControler {
  return {
    ...devis,
    ...contexte,
    dateDelivrancePrevue: premiereDelivrancePossible(devis.dateDevis),
    oreilles: contexte.oreilles.map(({ oreille, type }) => ({
      oreille,
      type,
      datePrecedentAppareillage:
        oreille === 'DROITE' ? devis.datePrecedentDroite : devis.datePrecedentGauche,
      offres: offresDeLOreille(devis.offres, oreille),
    })),
    consommables: devis.offres.flatMap(({ rubrique, consommables }) =>
      consommables.map((ligne) => ({
        rubrique,
        remboursable: ligne.codeLpp !== null,
        ficheComplete: ficheConsommableComplete(ligne.designation),
      })),
    ),
  };
}

/** `controleDevis` sur un devis et ses faits extérieurs. `tarifs` : résolus à la délivrance prévue. */
export function controlerDevis(
  devis: DevisDonnees,
  contexte: ContexteDevis,
  tarifs: TarifsAudio,
): ResultatControleDevis {
  return controleDevis(versDevisAControler(devis, contexte), tarifs);
}
