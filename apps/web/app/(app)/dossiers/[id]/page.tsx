import {
  LIBELLES_CIBLES_LIEN,
  LIBELLES_DESTINATAIRES_LIEN,
  LIBELLES_OREILLES_DOSSIER,
  LIBELLES_SPECIALITES_PRESCRIPTEUR,
  LIBELLES_TYPES_APPAREILLAGE,
  type TypeAppareillage,
  formatEuros,
  LIBELLES_NATURES_PIECE,
  peutValiderFacture,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formaterDate, formaterDateHeure, formaterJour } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { listerDevisDuDossier } from '@/server/services/devis';
import { appareilsProposables, obtenirEssai } from '@/server/services/essais';
import { obtenirDossier, type PrescriptionAffichee } from '@/server/services/dossiers';
import { listerComplementaires } from '@/server/services/complementaires';
import { lirePecDossier, obtenirFacture } from '@/server/services/factures';
import { piecesDuDossier } from '@/server/services/facturation';
import { listerLiensDocument } from '@/server/services/liens-document';

import { AlerteDroits, EntetePatient } from '../../patients/entete-patient';
import { choisirBilanReferenceAction } from '../actions';
import { AbandonDossier } from './abandon-dossier';
import { BlocDevis } from './devis/bloc-devis';
import { BlocEssai } from './essai/bloc-essai';
import { BoutonRevoquerLien } from './essai/formulaires-essai';
import { BlocFacture } from './facture/bloc-facture';
import { FormulairePec } from './facture/formulaires-facture';
import { FormulaireBilanReference } from './formulaire-bilan-reference';
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
  const pieces = await piecesDuDossier(acteur, id);
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

  const bilanReference = dossier.bilans.find((b) => b.id === dossier.bilanReferenceId);
  const [pecDossier, complementaires] = await Promise.all([
    lirePecDossier(acteur, dossier.id),
    listerComplementaires(acteur),
  ]);
  const liens = await listerLiensDocument(acteur, dossier.id);

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
          <Ligne libelle="Bilan de référence">
            {bilanReference ? (
              <Link
                className="underline underline-offset-2"
                href={`/patients/${dossier.patientId}/audiologie/${bilanReference.id}`}
              >
                Bilan du {formaterDate(bilanReference.dateBilan)}
              </Link>
            ) : (
              'Aucun'
            )}
          </Ligne>
          {dossier.prescriptionModifiable && dossier.bilans.length > 0 ? (
            <FormulaireBilanReference
              action={choisirBilanReferenceAction.bind(null, dossier.id)}
              bilans={dossier.bilans}
              bilanId={dossier.bilanReferenceId}
              statutAttendu={dossier.statut}
            />
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

      {pecDossier.saisissable ? (
        <Bloc titre="Prise en charge complémentaire">
          <FormulairePec
            dossierId={dossier.id}
            pec={pecDossier.pec}
            complementaires={complementaires}
          />
        </Bloc>
      ) : null}

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
        <Bloc titre="Facture">
          <BlocFacture
            dossierId={dossier.id}
            detail={facture}
            validable={peutValiderFacture(acteur.role)}
            complementaires={complementaires}
          />
        </Bloc>
      ) : null}

      {pieces.length > 0 ? (
        <Bloc titre="Factures et avoirs">
          <ul className="grid gap-2 text-sm">
            {pieces.map((p) => (
              <li key={p.id}>
                <Link href={`/factures/${p.id}`} className="underline underline-offset-2">
                  {LIBELLES_NATURES_PIECE[p.nature]} {p.numero}
                </Link>
                {`, ${formatEuros(p.totalTTC)}`}
              </li>
            ))}
          </ul>
        </Bloc>
      ) : null}

      {liens.length > 0 ? (
        <Bloc titre="Liens envoyés">
          <ul className="grid gap-2 text-sm">
            {liens.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {LIBELLES_CIBLES_LIEN[l.cible]}, {LIBELLES_DESTINATAIRES_LIEN[l.destinataire]}
                </span>
                <span>envoyé le {formaterDateHeure(l.creeLe)}</span>
                <span>
                  {l.ouvert
                    ? `valable jusqu’au ${formaterDateHeure(l.expireLe)}`
                    : l.revoque
                      ? 'révoqué'
                      : 'fermé'}
                </span>
                <span>{l.ouvertures} ouverture(s)</span>
                {l.ouvert ? <BoutonRevoquerLien dossierId={dossier.id} lienId={l.id} /> : null}
              </li>
            ))}
          </ul>
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
