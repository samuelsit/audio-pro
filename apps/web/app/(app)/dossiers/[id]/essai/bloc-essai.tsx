import {
  LIBELLES_ALERTES_ESSAI,
  LIBELLES_ISSUES_ESSAI,
  LIBELLES_OREILLES,
  LIBELLES_TYPES_RDV_ESSAI,
  type Oreille,
  type StatutDossier,
} from '@ha/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import type { AppareilProposable, EssaiDetail } from '@/server/services/essais';
import { aujourdhui } from '@/server/services/patients';

import { AlertesEssai } from '../../../essais/alertes-essai';
import {
  BoutonAchat,
  FormulaireChangement,
  FormulaireProlongation,
  FormulaireRdv,
} from './formulaires-essai';

function Sous({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">{titre}</h3>
      {children}
    </section>
  );
}

function Depliant({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">{titre}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Appareils({ essai }: { essai: EssaiDetail }) {
  return (
    <Sous titre="Appareils">
      <ul className="grid gap-1 text-sm">
        {essai.appareils.map((a) => (
          <li key={a.id}>
            <span>{LIBELLES_OREILLES[a.oreille]} : </span>
            <Link
              href={`/stock/appareils/${a.appareilId}`}
              className="font-mono underline underline-offset-2"
            >
              {a.numeroSerie}
            </Link>
            <span>, {a.designation}, </span>
            {a.retireLe ? (
              <span className="text-muted-foreground">
                confié du {formaterDate(a.poseLe)} au {formaterDate(a.retireLe)}
                {a.motifRetrait ? ` (${a.motifRetrait})` : ''}
              </span>
            ) : (
              <span>confié le {formaterDate(a.poseLe)}</span>
            )}
          </li>
        ))}
      </ul>
    </Sous>
  );
}

function Rdvs({ essai }: { essai: EssaiDetail }) {
  return (
    <Sous titre="Rendez-vous">
      {essai.rdvs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rendez-vous enregistré.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {essai.rdvs.map((r) => (
            <li key={r.id}>
              {formaterDate(r.date)}, {LIBELLES_TYPES_RDV_ESSAI[r.type]} :{' '}
              <span className="whitespace-pre-wrap">{r.compteRendu}</span>
            </li>
          ))}
        </ul>
      )}
    </Sous>
  );
}

function Prolongation({ dossierId, essai }: { dossierId: string; essai: EssaiDetail }) {
  const { prolongation } = essai;
  if (!prolongation) {
    return null;
  }
  return (
    <Sous titre="Prolongation">
      <p className="text-sm">
        {prolongation.jours} jours, demande du {formaterDate(prolongation.dateDemande)} :{' '}
        <span className="whitespace-pre-wrap">{prolongation.motif}</span>
      </p>
      <p className="text-sm">
        <a
          href={`/dossiers/${dossierId}/essai/justificatif`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          Ouvrir la demande du prescripteur
        </a>
      </p>
    </Sous>
  );
}

/** Le service retire déjà les actions que le statut ou le rôle interdit ; il revérifie à l'envoi. */
export function BlocEssai({
  dossierId,
  statut,
  essai,
  proposables,
}: {
  dossierId: string;
  statut: StatutDossier;
  essai: EssaiDetail;
  proposables: readonly AppareilProposable[];
}) {
  const { etat, actions, issue } = essai;
  const oreilles: Oreille[] = [
    ...new Set(essai.appareils.filter((a) => a.retireLe === null).map((a) => a.oreille)),
  ];
  return (
    <div className="grid gap-5">
      <dl className="grid gap-1 text-sm sm:grid-cols-[12rem_1fr] sm:gap-x-4">
        <dt className="text-muted-foreground">Début</dt>
        <dd>{formaterDate(essai.dateDebut)}</dd>
        <dt className="text-muted-foreground">Jours écoulés</dt>
        <dd>{etat.joursEcoules}</dd>
        <dt className="text-muted-foreground">Échéance</dt>
        <dd>{formaterDate(etat.echeance)}</dd>
        <dt className="text-muted-foreground">Rendez-vous réalisés</dt>
        <dd>{etat.rdvRealises}</dd>
        {issue ? (
          <>
            <dt className="text-muted-foreground">Issue</dt>
            <dd>
              {LIBELLES_ISSUES_ESSAI[issue]}, le {formaterDate(essai.dateFin ?? '')}
            </dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Alertes</dt>
            <dd>
              <AlertesEssai alertes={etat.alertes} />
            </dd>
          </>
        )}
      </dl>

      {!issue && etat.alertes.length > 0 ? (
        <Alert>
          <AlertTitle>À traiter</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {etat.alertes.map((alerte) => (
                <li key={alerte}>{LIBELLES_ALERTES_ESSAI[alerte]}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {essai.ecartDevis ? (
        <Alert variant="destructive">
          <AlertTitle>Appareil différent du devis</AlertTitle>
          <AlertDescription>
            Un appareil en essai n’est pas celui de l’offre du devis : émettre une nouvelle version
            avant la signature.
          </AlertDescription>
        </Alert>
      ) : null}

      <Appareils essai={essai} />
      <Rdvs essai={essai} />
      <Prolongation dossierId={dossierId} essai={essai} />

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          {/* Téléchargement (route GET), pas une navigation : <a> et non <Link>. */}
          <a href={`/dossiers/${dossierId}/essai/compte-rendu`} download>
            Compte rendu au prescripteur
          </a>
        </Button>
        {actions.confirmerAchat ? <BoutonAchat dossierId={dossierId} statut={statut} /> : null}
      </div>

      {actions.ajouterRdv ? (
        <Depliant titre="Ajouter un rendez-vous">
          <FormulaireRdv key={essai.rdvs.length} dossierId={dossierId} jour={aujourdhui()} />
        </Depliant>
      ) : null}
      {actions.prolonger ? (
        <Depliant titre="Prolonger l’essai">
          <FormulaireProlongation dossierId={dossierId} />
        </Depliant>
      ) : null}
      {actions.changerAppareil ? (
        <Depliant titre="Changer un appareil">
          <FormulaireChangement
            key={essai.appareils.length}
            dossierId={dossierId}
            statut={statut}
            oreilles={oreilles}
            proposables={proposables}
          />
        </Depliant>
      ) : null}
    </div>
  );
}
