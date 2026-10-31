import {
  LIBELLES_OREILLES_DOSSIER,
  LIBELLES_SPECIALITES_PRESCRIPTEUR,
  LIBELLES_TYPES_APPAREILLAGE,
  type TypeAppareillage,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formaterDate, formaterJour } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerDevisDuDossier } from '@/server/services/devis';
import { appareilsProposables, obtenirEssai } from '@/server/services/essais';
import { obtenirDossier, type PrescriptionAffichee } from '@/server/services/dossiers';
import { obtenirFacture } from '@/server/services/factures';

import { AlerteDroits, EntetePatient } from '../../patients/entete-patient';
import { AbandonDossier } from './abandon-dossier';
import { BlocDevis } from './devis/bloc-devis';
import { BlocEssai } from './essai/bloc-essai';
import { BlocFacture } from './facture/bloc-facture';
import { FormulairePrescription } from './formulaire-prescription';
import { FriseStatuts } from './frise-statuts';
import { ListeConstats } from './liste-constats';

export const metadata: Metadata = { title: 'Dossier d’appareillage – HA-Gestion' };

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <dl className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{libelle}</dt>
      <dd className="text-sm">{children}</dd>
    </dl>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function libelleType(type: TypeAppareillage | null): string {
  return type ? LIBELLES_TYPES_APPAREILLAGE[type] : '—';
}

function LienScan({
  dossierId,
  prescription,
}: {
  dossierId: string;
  prescription: PrescriptionAffichee;
}) {
  return (
    <a
      href={`/dossiers/${dossierId}/prescriptions/${prescription.id}/scan`}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4"
    >
      Ouvrir le scan
    </a>
  );
}

function Prescription({
  dossierId,
  prescription,
}: {
  dossierId: string;
  prescription: PrescriptionAffichee;
}) {
  const { controles } = prescription;
  return (
    <>
      <Ligne libelle="Prescripteur">
        {prescription.prescripteur} ({LIBELLES_SPECIALITES_PRESCRIPTEUR[prescription.specialite]})
      </Ligne>
      <Ligne libelle="Date">{formaterDate(prescription.datePrescription)}</Ligne>
      <Ligne libelle="Oreilles">{LIBELLES_OREILLES_DOSSIER[prescription.oreilles]}</Ligne>
      <Ligne libelle="Mention de renouvellement">
        {prescription.mentionRenouvellement ? 'Oui' : 'Non'}
      </Ligne>
      <Ligne libelle="Ordonnance">
        <LienScan dossierId={dossierId} prescription={prescription} />
      </Ligne>
      <Ligne libelle="Saisie">
        Le {formaterJour(prescription.saisieLe)} par {prescription.saisiePar}
      </Ligne>
      {prescription.forceePar ? (
        <Alert variant="destructive">
          <AlertTitle>Enregistrée par forçage : {prescription.forceePar}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <ListeConstats
              constats={controles.erreursForcees}
              refus={controles.refusRenouvellement}
            />
            <p className="whitespace-pre-wrap">Motif : {prescription.motifForcage}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {controles.avertissements.length > 0 ? (
        <Alert>
          <AlertTitle>Avertissements</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={controles.avertissements} />
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

/** Ouvrir le dossier écrit une ligne READ dans le journal d'audit (service). */
export default async function PageDossier({ params }: PageProps<'/dossiers/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const dossier = await ouIntrouvable(obtenirDossier(acteur, id));
  const devis = await listerDevisDuDossier(acteur, id);
  const essai = await obtenirEssai(acteur, id);
  const facture = await obtenirFacture(acteur, id);
  const proposables = essai?.actions.changerAppareil ? await appareilsProposables(acteur, id) : [];
  const { fiche } = dossier;
  const [courante, ...anciennes] = dossier.prescriptions;
  const abandon = dossier.passages.find((p) => p.statut === 'ABANDONNE');
  const formulaire = (
    <FormulairePrescription
      // Une version enregistrée vide le formulaire.
      key={dossier.prescriptions.length}
      dossierId={dossier.id}
      statut={dossier.statut}
      oreilles={dossier.oreilles}
    />
  );

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} titre="Dossier d’appareillage">
        <Button asChild variant="outline">
          <Link href={`/patients/${fiche.id}/dossiers`}>Dossiers du patient</Link>
        </Button>
        {dossier.abandonnable ? (
          <AbandonDossier dossierId={dossier.id} statut={dossier.statut} />
        ) : null}
      </EntetePatient>

      <FriseStatuts statut={dossier.statut} passages={dossier.passages} />

      {fiche.amo ? <AlerteDroits etat={fiche.amo.etatDroits} fin={fiche.amo.finDroits} /> : null}

      {abandon ? (
        <Alert variant="destructive">
          <AlertTitle>Dossier abandonné le {formaterJour(abandon.horodatage)}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            Motif : {abandon.motif}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloc titre="Dossier">
          <Ligne libelle="Ouverture">{formaterDate(dossier.dateOuverture)}</Ligne>
          <Ligne libelle="Centre">{dossier.centre}</Ligne>
          <Ligne libelle="Audioprothésiste">{dossier.praticien}</Ligne>
          <Ligne libelle="Oreilles">{LIBELLES_OREILLES_DOSSIER[dossier.oreilles]}</Ligne>
          {dossier.typeDroite ? (
            <Ligne libelle="Oreille droite">{libelleType(dossier.typeDroite)}</Ligne>
          ) : null}
          {dossier.typeGauche ? (
            <Ligne libelle="Oreille gauche">{libelleType(dossier.typeGauche)}</Ligne>
          ) : null}
          {dossier.surdicecite ? (
            <Ligne libelle="Situation">
              <Badge variant="secondary">Personne sourde et aveugle</Badge>
            </Ligne>
          ) : null}
        </Bloc>

        <Bloc titre="Prescription">
          {courante ? (
            <Prescription dossierId={dossier.id} prescription={courante} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune prescription enregistrée.</p>
          )}
        </Bloc>
      </div>

      <Bloc titre="Devis">
        <BlocDevis dossierId={dossier.id} statut={dossier.statut} versions={devis} />
      </Bloc>

      {essai ? (
        <Bloc titre="Essai">
          <BlocEssai
            dossierId={dossier.id}
            statut={dossier.statut}
            essai={essai}
            proposables={proposables}
          />
        </Bloc>
      ) : null}

      {facture ? (
        <Bloc titre="Facture préparée">
          <BlocFacture dossierId={dossier.id} detail={facture} />
        </Bloc>
      ) : null}

      {dossier.prescriptionModifiable && !courante ? (
        <Bloc titre="Enregistrer la prescription">{formulaire}</Bloc>
      ) : null}
      {dossier.prescriptionModifiable && courante ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">Corriger la prescription</summary>
          <p className="my-3 text-sm text-muted-foreground">
            Une correction ajoute une nouvelle version. L’ancienne et son scan sont conservés.
          </p>
          {formulaire}
        </details>
      ) : null}

      {anciennes.length > 0 ? (
        <Bloc titre="Versions précédentes">
          <ul className="grid gap-2 text-sm">
            {anciennes.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-x-3">
                <span>
                  {formaterDate(p.datePrescription)}, {p.prescripteur}, saisie le{' '}
                  {formaterJour(p.saisieLe)}
                </span>
                <LienScan dossierId={dossier.id} prescription={p} />
              </li>
            ))}
          </ul>
        </Bloc>
      ) : null}
    </div>
  );
}
