'use client';

import {
  CIVILITES,
  LIBELLES_CIVILITE,
  LIBELLES_MOTIF_DOUBLON,
  LIBELLES_QUALITE,
  LIBELLES_SEXE,
  QUALITES,
  SEXES,
  type DoublonsPossibles,
  type PreRemplissagePatient,
} from '@ha/domain';
import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';

import {
  BoutonEnvoi,
  CaseACocher,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
  ZoneDeTexte,
} from '@/components/formulaire';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { PatientDetail } from '@/server/services/patients';

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{titre}</legend>
      {children}
    </fieldset>
  );
}

function motifs(liste: readonly (keyof typeof LIBELLES_MOTIF_DOUBLON)[]): string {
  return liste.map((m) => LIBELLES_MOTIF_DOUBLON[m]).join(', ');
}

/** Doublons possibles : fiches ouvrables dans le périmètre, simple mention du centre sinon. */
function DoublonsDetectes({ doublons }: { doublons: DoublonsPossibles }) {
  return (
    <Alert role="alert">
      <AlertTitle>Ce patient existe peut-être déjà</AlertTitle>
      <AlertDescription className="grid gap-3">
        {doublons.visibles.length > 0 ? (
          <ul className="grid gap-1">
            {doublons.visibles.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/patients/${d.id}`}
                  className="font-medium underline underline-offset-4"
                  target="_blank"
                >
                  {d.prenoms} {(d.nomUsage ?? d.nomNaissance).toUpperCase()}
                </Link>
                , né(e) le {formaterDate(d.dateNaissance)}, {d.centreNom} — {motifs(d.motifs)}
                {d.qualite
                  ? ` (${LIBELLES_QUALITE[d.qualite]}, rang ${d.rangNaissance ?? '?'})`
                  : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {doublons.horsPerimetre.map((d, index) => (
          <p key={index}>
            Un patient correspondant ({motifs(d.motifs)}) existe au centre {d.centreNom} : contactez
            l’administrateur.
          </p>
        ))}
        <p>
          Vérifiez qu’il ne s’agit pas de la même personne (un ayant droit peut partager le NIR de
          l’assuré). Si c’est bien un nouveau patient, utilisez « Créer quand même » en bas du
          formulaire.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function FormulairePatient({
  action,
  centres,
  centreParDefaut,
  patient,
  preRempli,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  centres: readonly { id: string; nom: string }[];
  centreParDefaut?: string | undefined;
  patient?: PatientDetail | undefined;
  /** Création : valeurs lues sur la carte Vitale. */
  preRempli?: PreRemplissagePatient | undefined;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const amo = patient?.amo;
  const amc = patient?.amc;
  const p = preRempli;
  return (
    <form action={envoyer} className="grid max-w-3xl gap-6">
      <MessageFormulaire etat={etat} />
      {etat.doublons ? <DoublonsDetectes doublons={etat.doublons} /> : null}

      <Section titre="Identité">
        <ListeDeroulante
          etat={etat}
          nom="centreId"
          libelle="Centre de rattachement"
          options={centres.map((c) => ({ valeur: c.id, libelle: c.nom }))}
          defaut={patient?.centre.id ?? centreParDefaut}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ListeDeroulante
            etat={etat}
            nom="civilite"
            libelle="Civilité"
            options={CIVILITES.map((c) => ({ valeur: c, libelle: LIBELLES_CIVILITE[c] }))}
            defaut={patient?.civilite}
            vide="Choisir…"
          />
          <ListeDeroulante
            etat={etat}
            nom="sexe"
            libelle="Sexe"
            options={SEXES.map((s) => ({ valeur: s, libelle: LIBELLES_SEXE[s] }))}
            defaut={patient?.sexe}
            vide="Choisir…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="nomNaissance"
            libelle="Nom de naissance"
            defaut={patient?.nomNaissance ?? p?.nomNaissance}
            requis
          />
          <ChampTexte etat={etat} nom="nomUsage" libelle="Nom d’usage" defaut={patient?.nomUsage} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="prenoms"
            libelle="Prénoms"
            defaut={patient?.prenoms ?? p?.prenoms}
            requis
          />
          <ChampTexte
            etat={etat}
            nom="dateNaissance"
            libelle="Date de naissance"
            type="date"
            defaut={patient?.dateNaissance ?? p?.dateNaissance}
            requis
          />
        </div>
      </Section>

      <Section titre="Coordonnées">
        <ChampTexte
          etat={etat}
          nom="adresseLigne1"
          libelle="Adresse"
          defaut={patient?.adresseLigne1}
        />
        <ChampTexte
          etat={etat}
          nom="adresseLigne2"
          libelle="Complément d’adresse"
          defaut={patient?.adresseLigne2}
        />
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <ChampTexte
            etat={etat}
            nom="codePostal"
            libelle="Code postal"
            defaut={patient?.codePostal}
            inputMode="numeric"
          />
          <ChampTexte etat={etat} nom="ville" libelle="Ville" defaut={patient?.ville} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="telephone"
            libelle="Téléphone"
            type="tel"
            defaut={patient?.telephone}
          />
          <ChampTexte
            etat={etat}
            nom="email"
            libelle="E-mail"
            type="email"
            defaut={patient?.email}
          />
        </div>
        <ChampTexte
          etat={etat}
          nom="medecinTraitant"
          libelle="Médecin traitant"
          defaut={patient?.medecinTraitant}
        />
        <div className="grid gap-2">
          <p className="text-sm font-medium">Le patient accepte d’être contacté par :</p>
          <div className="flex flex-wrap gap-6">
            <CaseACocher
              etat={etat}
              nom="consentementSms"
              libelle="SMS"
              defaut={patient?.consentementSms ?? false}
            />
            <CaseACocher
              etat={etat}
              nom="consentementEmail"
              libelle="E-mail"
              defaut={patient?.consentementEmail ?? false}
            />
            <CaseACocher
              etat={etat}
              nom="consentementCourrier"
              libelle="Courrier"
              defaut={patient?.consentementCourrier ?? false}
            />
          </div>
        </div>
      </Section>

      <Section titre="Couverture AMO (assurance maladie obligatoire)">
        {p ? (
          <p className="text-sm text-muted-foreground">
            Données lues sur la carte Vitale : si vous les modifiez, la couverture sera enregistrée
            en « saisie manuelle ».
          </p>
        ) : null}
        {amo?.origine === 'VITALE' ? (
          <p className="text-sm text-muted-foreground">
            Données lues sur la carte Vitale : une modification manuelle les fera passer en « saisie
            manuelle ».
          </p>
        ) : null}
        <ChampTexte
          etat={etat}
          nom="amoNir"
          libelle="NIR (clé comprise)"
          defaut={amo?.nir ?? p?.amoNir}
          autoComplete="off"
          aide="Laisser vide s’il n’y a pas de couverture AMO à enregistrer."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ListeDeroulante
            etat={etat}
            nom="amoQualite"
            libelle="Qualité"
            options={QUALITES.map((q) => ({ valeur: q, libelle: LIBELLES_QUALITE[q] }))}
            defaut={amo?.qualite ?? p?.amoQualite ?? 'ASSURE'}
          />
          <ChampTexte
            etat={etat}
            nom="amoRangNaissance"
            libelle="Rang de naissance"
            defaut={amo ? String(amo.rangNaissance) : (p?.amoRangNaissance ?? '1')}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ChampTexte
            etat={etat}
            nom="amoRegime"
            libelle="Régime"
            defaut={amo?.regime ?? p?.amoRegime}
            inputMode="numeric"
          />
          <ChampTexte
            etat={etat}
            nom="amoCaisse"
            libelle="Caisse"
            defaut={amo?.caisse ?? p?.amoCaisse}
            inputMode="numeric"
          />
          <ChampTexte
            etat={etat}
            nom="amoCentreGestionnaire"
            libelle="Centre gestionnaire"
            defaut={amo?.centreGestionnaire ?? p?.amoCentreGestionnaire}
            inputMode="numeric"
          />
        </div>
        <ChampTexte
          etat={etat}
          nom="amoFinDroits"
          libelle="Fin de droits"
          type="date"
          defaut={amo?.finDroits ?? p?.amoFinDroits}
        />
        <div className="flex flex-wrap gap-6">
          <CaseACocher
            etat={etat}
            nom="amoC2s"
            libelle="Bénéficiaire de la C2S"
            defaut={amo?.c2s ?? p?.amoC2s ?? false}
          />
          <CaseACocher
            etat={etat}
            nom="amoAld"
            libelle="ALD"
            defaut={amo?.ald ?? p?.amoAld ?? false}
          />
        </div>
      </Section>

      <Section titre="Couverture AMC (complémentaire)">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <ChampTexte
            etat={etat}
            nom="amcOrganismeNom"
            libelle="Organisme"
            defaut={amc?.organismeNom ?? p?.amcOrganismeNom}
            aide="Laisser vide s’il n’y a pas de complémentaire à enregistrer."
          />
          <ChampTexte
            etat={etat}
            nom="amcOrganismeIdentifiant"
            libelle="Identifiant de l’organisme"
            defaut={amc?.organismeIdentifiant ?? p?.amcOrganismeIdentifiant}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="amcNumeroAdherent"
            libelle="N° d’adhérent"
            defaut={amc?.numeroAdherent ?? p?.amcNumeroAdherent}
          />
          <ChampTexte
            etat={etat}
            nom="amcTypeContrat"
            libelle="Type de contrat"
            defaut={amc?.typeContrat ?? p?.amcTypeContrat}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampTexte
            etat={etat}
            nom="amcDebutValidite"
            libelle="Début de validité"
            type="date"
            defaut={amc?.debutValidite ?? p?.amcDebutValidite}
          />
          <ChampTexte
            etat={etat}
            nom="amcFinValidite"
            libelle="Fin de validité"
            type="date"
            defaut={amc?.finValidite ?? p?.amcFinValidite}
          />
        </div>
      </Section>

      <ZoneDeTexte
        etat={etat}
        nom="notes"
        libelle="Notes"
        defaut={patient?.notes}
        aide="Chiffrées en base. Ne pas y recopier le NIR."
      />

      {/* Le bouton principal vient d'abord : la touche Entrée ne confirme jamais un doublon. */}
      <div className="flex flex-wrap gap-2">
        <BoutonEnvoi>{patient ? 'Enregistrer' : 'Créer la fiche'}</BoutonEnvoi>
        {etat.doublons ? (
          <BoutonEnvoi variant="outline" nom="confirmerDoublon" valeur="on">
            Créer quand même
          </BoutonEnvoi>
        ) : null}
      </div>
    </form>
  );
}
