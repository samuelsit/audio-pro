import { formaterNir, LIBELLES_ORIGINE, LIBELLES_QUALITE, LIBELLES_SEXE } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { doublonsDeLaFiche, obtenirPatient } from '@/server/services/patients';

import { adresseSurUneLigne, dateEtAge, libelleMotifs } from '../affichage';
import { AlerteDroits, BadgeC2s, EntetePatient } from '../entete-patient';
import { LectureVitale } from '../lecture-vitale';

export const metadata: Metadata = { title: 'Fiche patient – HA-Gestion' };

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

function ouiNon(valeur: boolean): string {
  return valeur ? 'Oui' : 'Non';
}

/** Ouvrir la fiche écrit une ligne READ dans le journal d'audit (service). */
export default async function PageFichePatient({ params }: PageProps<'/patients/[id]'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const ouverture = await ouIntrouvable(obtenirPatient(acteur, id));
  if (ouverture.type === 'fusionnee') {
    redirect(`/patients/${ouverture.conserveeId}`);
  }
  const { fiche } = ouverture;
  const doublons = await doublonsDeLaFiche(acteur, fiche);
  const peutFusionner = acteur.role === 'ADMIN' || acteur.role === 'AUDIO';
  const { amo, amc } = fiche;

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche}>
        <LectureVitale patientId={fiche.id} />
        <Button asChild>
          <Link href={`/patients/${fiche.id}/modifier`}>Modifier</Link>
        </Button>
      </EntetePatient>

      {amo ? <AlerteDroits etat={amo.etatDroits} fin={amo.finDroits} /> : null}

      {doublons.visibles.length > 0 || doublons.horsPerimetre.length > 0 ? (
        <Alert>
          <AlertTitle>Doublons possibles</AlertTitle>
          <AlertDescription className="grid gap-2">
            <ul className="grid gap-1">
              {doublons.visibles.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    <Link
                      href={`/patients/${d.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {d.prenoms} {(d.nomUsage ?? d.nomNaissance).toUpperCase()}
                    </Link>{' '}
                    ({formaterDate(d.dateNaissance)}, {d.centreNom}) — {libelleMotifs(d.motifs)}
                    {d.qualite
                      ? `, ${LIBELLES_QUALITE[d.qualite]} rang ${d.rangNaissance ?? '?'}`
                      : ''}
                  </span>
                  {peutFusionner ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/patients/fusion?conservee=${fiche.id}&doublon=${d.id}`}>
                        Fusionner
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {doublons.horsPerimetre.map((d, index) => (
              <p key={index}>
                Un patient correspondant ({libelleMotifs(d.motifs)}) existe au centre {d.centreNom}{' '}
                : contactez l’administrateur.
              </p>
            ))}
            {!peutFusionner && doublons.visibles.length > 0 ? (
              <p>La fusion est réservée aux audioprothésistes et à l’administrateur.</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloc titre="Identité">
          <Ligne libelle="Nom de naissance">{fiche.nomNaissance}</Ligne>
          <Ligne libelle="Nom d’usage">{fiche.nomUsage ?? '—'}</Ligne>
          <Ligne libelle="Prénoms">{fiche.prenoms}</Ligne>
          <Ligne libelle="Date de naissance">{dateEtAge(fiche)}</Ligne>
          <Ligne libelle="Sexe">{LIBELLES_SEXE[fiche.sexe]}</Ligne>
          <Ligne libelle="Centre de rattachement">{fiche.centre.nom}</Ligne>
          <Ligne libelle="Médecin traitant">{fiche.medecinTraitant ?? '—'}</Ligne>
        </Bloc>

        <Bloc titre="Coordonnées">
          <Ligne libelle="Adresse">{adresseSurUneLigne(fiche)}</Ligne>
          <Ligne libelle="Téléphone">{fiche.telephone ?? '—'}</Ligne>
          <Ligne libelle="E-mail">{fiche.email ?? '—'}</Ligne>
          <Ligne libelle="Contact par SMS">{ouiNon(fiche.consentementSms)}</Ligne>
          <Ligne libelle="Contact par e-mail">{ouiNon(fiche.consentementEmail)}</Ligne>
          <Ligne libelle="Contact par courrier">{ouiNon(fiche.consentementCourrier)}</Ligne>
        </Bloc>

        <Bloc titre="Couverture AMO">
          {amo ? (
            <>
              <Ligne libelle="NIR">
                <span className="font-mono">{formaterNir(amo.nir)}</span>
              </Ligne>
              <Ligne libelle="Qualité">
                {LIBELLES_QUALITE[amo.qualite]}, rang de naissance {amo.rangNaissance}
              </Ligne>
              <Ligne libelle="Régime / caisse / centre">
                <span className="font-mono">
                  {[amo.regime, amo.caisse, amo.centreGestionnaire]
                    .map((v) => v ?? '—')
                    .join(' / ')}
                </span>
              </Ligne>
              <Ligne libelle="Fin de droits">{formaterDate(amo.finDroits)}</Ligne>
              <Ligne libelle="Indicateurs">
                <span className="flex flex-wrap gap-2">
                  {amo.c2s ? <BadgeC2s /> : null}
                  {amo.ald ? <Badge>ALD</Badge> : null}
                  {!amo.c2s && !amo.ald ? '—' : null}
                </span>
              </Ligne>
              <Ligne libelle="Origine">
                {LIBELLES_ORIGINE[amo.origine]}
                {amo.derniereLectureVitale
                  ? ` — dernière lecture Vitale le ${formaterDateHeure(new Date(amo.derniereLectureVitale))}`
                  : ''}
              </Ligne>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune couverture AMO enregistrée.</p>
          )}
        </Bloc>

        <Bloc titre="Couverture AMC">
          {amc ? (
            <>
              <Ligne libelle="Organisme">
                {amc.organismeNom}
                {amc.organismeIdentifiant ? (
                  <span className="font-mono text-muted-foreground">
                    {' '}
                    ({amc.organismeIdentifiant})
                  </span>
                ) : null}
              </Ligne>
              <Ligne libelle="N° d’adhérent">{amc.numeroAdherent ?? '—'}</Ligne>
              <Ligne libelle="Type de contrat">{amc.typeContrat ?? '—'}</Ligne>
              <Ligne libelle="Validité">
                {amc.debutValidite || amc.finValidite
                  ? `du ${formaterDate(amc.debutValidite)} au ${formaterDate(amc.finValidite)}`
                  : '—'}
              </Ligne>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune complémentaire enregistrée.</p>
          )}
        </Bloc>
      </div>

      <Bloc titre="Notes">
        <p className="text-sm whitespace-pre-wrap">{fiche.notes ?? '—'}</p>
      </Bloc>
    </div>
  );
}
