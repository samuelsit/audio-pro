import {
  centimes,
  DUREE_LIEN_DOCUMENT_JOURS,
  formatEuros,
  LIBELLES_RUBRIQUES_OFFRE,
  LIBELLES_STATUTS_DEVIS,
  lignesDemandeDepuisOffre,
  type Centimes,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import type { UtilisateurConnecte } from '@/server/auth/acces';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { pecGatewayDisponible } from '@/server/pec-gateway';
import { lignesCatalogueDevis, obtenirDevis } from '@/server/services/devis';
import { listerComplementaires } from '@/server/services/complementaires';
import { appareilsProposables } from '@/server/services/essais';
import { lirePecDossier } from '@/server/services/factures';
import { aujourdhui } from '@/server/services/patients';

import { BlocAcomptes } from '../../../../caisse/bloc-encaissements';
import { BoutonsPlateformePec, FormulairePec } from '../../facture/formulaires-facture';
import { ListeConstats } from '../../liste-constats';
import {
  BoutonEmettre,
  BoutonNouvelleVersion,
  BoutonSupprimer,
  FormulaireEnvoi,
  FormulaireEssai,
  FormulaireScan,
  FormulaireSignature,
} from '../actions-devis';

export const metadata: Metadata = { title: 'Devis – HA-Gestion' };

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function montant(valeur: Centimes | null | undefined, vide = '—'): string {
  return valeur === null || valeur === undefined ? vide : formatEuros(valeur);
}

/** Aide à la saisie : les appareils disponibles des modèles prévus au devis. */
async function appareilsDuDevis(acteur: UtilisateurConnecte, dossierId: string, devisId: string) {
  const [{ modeles }, appareils] = await Promise.all([
    lignesCatalogueDevis(acteur, devisId),
    appareilsProposables(acteur, dossierId),
  ]);
  const prevus = modeles.flatMap((offre) => Object.values(offre.modeles));
  return appareils.filter((a) => prevus.includes(a.modeleId));
}

/** Ouvrir le devis écrit une ligne READ dans le journal d'audit (service). */
export default async function PageDevis({ params }: PageProps<'/dossiers/[id]/devis/[devisId]'>) {
  const { id, devisId } = await params;
  const acteur = await requireSession();
  const devis = await ouIntrouvable(obtenirDevis(acteur, devisId));
  if (devis.dossierId !== id) {
    notFound();
  }
  const { actions, calcul } = devis;
  const identifiants = { dossierId: id, devisId, statut: devis.statut };
  const rubriques = devis.offres.map((o) => o.rubrique);
  const proposables = actions.demarrerEssai ? await appareilsDuDevis(acteur, id, devisId) : [];
  const [pecDossier, complementaires] = await Promise.all([
    lirePecDossier(acteur, id),
    listerComplementaires(acteur),
  ]);
  const offresDemandees = (calcul?.offres ?? []).map((offre) => ({
    rubrique: offre.rubrique,
    libelle: LIBELLES_RUBRIQUES_OFFRE[offre.rubrique],
    lignes: lignesDemandeDepuisOffre(offre),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Devis {devis.numeroAffiche}</h1>
        <Badge variant="secondary">{LIBELLES_STATUTS_DEVIS[devis.statut]}</Badge>
        <Button asChild variant="outline" className="ml-auto">
          <Link href={`/dossiers/${id}`}>Retour au dossier</Link>
        </Button>
      </div>

      {devis.tarifsAbsents ? (
        <Alert variant="destructive">
          <AlertTitle>Tarifs LPP absents</AlertTitle>
          <AlertDescription>
            Importer la base LPP : les montants ne peuvent pas être calculés.
          </AlertDescription>
        </Alert>
      ) : null}
      {devis.erreurs.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Points bloquants</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={devis.erreurs} />
          </AlertDescription>
        </Alert>
      ) : null}
      {devis.avertissements.length > 0 ? (
        <Alert>
          <AlertTitle>Avertissements</AlertTitle>
          <AlertDescription>
            <ListeConstats constats={devis.avertissements} />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        {actions.modifier ? (
          <Button asChild variant="outline">
            <Link href={`/dossiers/${id}/devis/${devisId}/modifier`}>Modifier</Link>
          </Button>
        ) : null}
        {actions.emettre ? <BoutonEmettre {...identifiants} /> : null}
        {actions.modifier ? <BoutonSupprimer {...identifiants} /> : null}
        {actions.imprimer ? (
          <Button asChild>
            <a href={`/dossiers/${id}/devis/${devisId}/pdf`} target="_blank" rel="noreferrer">
              Imprimer le devis
            </a>
          </Button>
        ) : null}
        {actions.nouvelleVersion ? <BoutonNouvelleVersion {...identifiants} /> : null}
      </div>

      {calcul?.offres.map((offre) => (
        <Bloc key={offre.rubrique} titre={LIBELLES_RUBRIQUES_OFFRE[offre.rubrique]}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Poste</TableHead>
                <TableHead className="text-right">Plafond</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Prix TTC</TableHead>
                <TableHead className="text-right">AMO</TableHead>
                <TableHead className="text-right">AMC estimée</TableHead>
                <TableHead className="text-right">Reste à charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { poste: 'Oreille droite', ligne: offre.droite },
                { poste: 'Oreille gauche', ligne: offre.gauche },
              ].flatMap(({ poste, ligne }) =>
                ligne
                  ? [
                      <TableRow key={poste}>
                        <TableCell>{poste}</TableCell>
                        <TableCell className="text-right">
                          {montant(ligne.plafond, 'Prix libre')}
                        </TableCell>
                        <TableCell className="text-right">{montant(ligne.base)}</TableCell>
                        <TableCell className="text-right">{montant(ligne.ttc)}</TableCell>
                        <TableCell className="text-right">{montant(ligne.amo)}</TableCell>
                        <TableCell className="text-right">
                          {montant(ligne.amc, 'Inconnue')}
                        </TableCell>
                        <TableCell className="text-right">
                          {montant(ligne.resteACharge ?? ligne.resteApresAMO)}
                        </TableCell>
                      </TableRow>,
                    ]
                  : [],
              )}
              {offre.consommables ? (
                <TableRow>
                  <TableCell>Consommables, piles et accessoires</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">{montant(offre.consommables.ttc)}</TableCell>
                  <TableCell className="text-right">{montant(offre.consommables.amo)}</TableCell>
                  <TableCell className="text-right">
                    {montant(offre.consommables.amc, 'Inconnue')}
                  </TableCell>
                  <TableCell className="text-right">
                    {montant(offre.consommables.resteACharge ?? offre.consommables.resteApresAMO)}
                  </TableCell>
                </TableRow>
              ) : null}
              <TableRow className="font-medium">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right">{montant(offre.total.ttc)}</TableCell>
                <TableCell className="text-right">{montant(offre.total.amo)}</TableCell>
                <TableCell className="text-right">{montant(offre.total.amc, 'Inconnue')}</TableCell>
                <TableCell className="text-right">
                  {montant(offre.total.resteACharge ?? offre.total.resteApresAMO)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {offre.total.amc === null ? (
            <p className="text-sm text-muted-foreground">
              Part AMC inconnue : le reste affiché est celui après l’AMO seule, et le devis imprimé
              laisse ces deux montants vides.
            </p>
          ) : null}
        </Bloc>
      ))}

      <Bloc titre="Informations">
        <dl className="grid gap-2 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="text-muted-foreground">Date d’émission</dt>
          <dd>{formaterDate(devis.dateEmission)}</dd>
          <dt className="text-muted-foreground">Valable jusqu’au</dt>
          <dd>{formaterDate(devis.dateFinValidite)}</dd>
          <dt className="text-muted-foreground">Délivrance prévue au plus tôt</dt>
          <dd>{formaterDate(calcul?.dateDelivrancePrevue)}</dd>
          <dt className="text-muted-foreground">Garantie minimale jusqu’au</dt>
          <dd>{formaterDate(calcul?.finGarantieMinimale)}</dd>
          <dt className="text-muted-foreground">Taux AMO</dt>
          <dd>{devis.tauxAmo} %</dd>
          {devis.depotGarantieCentimes === null ? null : (
            <>
              <dt className="text-muted-foreground">Dépôt de garantie</dt>
              <dd>{formatEuros(centimes(devis.depotGarantieCentimes))}</dd>
            </>
          )}
          {devis.offreEssai ? (
            <>
              <dt className="text-muted-foreground">Offre choisie pour l’essai</dt>
              <dd>{LIBELLES_RUBRIQUES_OFFRE[devis.offreEssai]}</dd>
            </>
          ) : null}
          {devis.offreRetenue ? (
            <>
              <dt className="text-muted-foreground">Offre choisie à l’issue de l’essai</dt>
              <dd>{LIBELLES_RUBRIQUES_OFFRE[devis.offreRetenue]}</dd>
            </>
          ) : null}
          {devis.signature ? (
            <>
              <dt className="text-muted-foreground">Signature</dt>
              <dd>
                Le {formaterDate(devis.signature.dateSignature)}, enregistrée par{' '}
                {devis.signature.saisiePar}
                {devis.signature.electronique ? (
                  <>
                    {', à l’écran. '}
                    <a
                      href={`/dossiers/${id}/devis/${devisId}/preuve`}
                      className="underline underline-offset-4"
                    >
                      Télécharger la preuve
                    </a>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
          {devis.scanDepose ? (
            <>
              <dt className="text-muted-foreground">Devis signé</dt>
              <dd>
                <a
                  href={`/dossiers/${id}/devis/${devisId}/scan`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {devis.signature?.electronique ? 'Ouvrir le devis signé' : 'Ouvrir le scan'}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      </Bloc>

      {pecDossier.saisissable ? (
        <Bloc titre="Prise en charge complémentaire">
          <FormulairePec
            dossierId={id}
            pec={pecDossier.pec}
            complementaires={complementaires}
            devisId={devisId}
            offres={offresDemandees}
          />
          {pecGatewayDisponible() && pecDossier.pec ? (
            <BoutonsPlateformePec dossierId={id} reference={pecDossier.pec.referencePlateforme} />
          ) : null}
        </Bloc>
      ) : null}

      {devis.pecDifferente ? (
        <Alert>
          <AlertTitle>Prise en charge différente du devis</AlertTitle>
          <AlertDescription>
            La part AMC de ce devis ne reprend pas la réponse de la complémentaire, accord ou refus.
            Une nouvelle version la reprendrait ; sans elle, la facture l’appliquera quand même.
          </AlertDescription>
        </Alert>
      ) : null}
      {actions.envoyer ? (
        <Bloc titre="Envoyer au patient">
          <p className="text-sm text-muted-foreground">
            Le message ne contient qu’un lien, valable {DUREE_LIEN_DOCUMENT_JOURS} jours. Le patient
            l’ouvre avec sa date de naissance.
          </p>
          <FormulaireEnvoi dossierId={id} devisId={devisId} canaux={devis.canauxPatient} />
        </Bloc>
      ) : null}
      {actions.demarrerEssai ? (
        <Bloc titre="Démarrer l’essai">
          <FormulaireEssai
            {...identifiants}
            rubriques={rubriques}
            oreilles={devis.oreilles}
            proposables={proposables}
          />
        </Bloc>
      ) : null}
      {devis.statut === 'SIGNE' ? (
        <Bloc titre="Acomptes">
          <BlocAcomptes devisId={devisId} />
        </Bloc>
      ) : null}
      {actions.deposerScan ? (
        <Bloc titre="Signature à l’issue de l’essai">
          {actions.signerEcran ? (
            <div>
              <Button asChild>
                <Link href={`/dossiers/${id}/devis/${devisId}/signature`}>Signer à l’écran</Link>
              </Button>
            </div>
          ) : null}
          <FormulaireScan {...identifiants} />
          {actions.signer ? (
            <FormulaireSignature {...identifiants} rubriques={rubriques} jour={aujourdhui()} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {devis.scanDepose
                ? 'L’audioprothésiste enregistre ensuite la signature.'
                : 'Déposer le scan, puis enregistrer la signature.'}
            </p>
          )}
        </Bloc>
      ) : null}
    </div>
  );
}
