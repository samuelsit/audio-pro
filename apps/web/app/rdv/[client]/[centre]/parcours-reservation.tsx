'use client';

import {
  TEXTE_CONSENTEMENT_RGPD,
  TEXTE_CONSENTEMENT_SMS,
  type InstantDisponible,
} from '@ha/domain';
import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react';

import { CaseACocher, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ContexteNonSecurise, resoudreDefi } from '@/lib/captcha-navigateur';
import { coche, texte, type EtatFormulaire } from '@/lib/formulaire';
import { formaterDateLongue } from '@/lib/format';
import type {
  ConfirmationReservation,
  LectureCreneaux,
} from '@/server/services/reservation-en-ligne';

import {
  chargerCreneauxAction,
  defiCaptchaAction,
  demanderCodeAction,
  libererAction,
  validerCodeAction,
  verrouillerAction,
  type AdresseCentre,
} from './actions';

interface TypePublic {
  id: string;
  nom: string;
  dureeMinutes: number;
  requierePraticien: boolean;
}

type Etape =
  | { readonly nom: 'CHOIX' }
  | { readonly nom: 'COORDONNEES'; readonly jeton: string; readonly instant: InstantDisponible }
  | {
      readonly nom: 'CODE';
      readonly jeton: string;
      readonly instant: InstantDisponible;
      readonly telephone: string;
    }
  | { readonly nom: 'CONFIRMATION'; readonly confirmation: ConfirmationReservation };

function parJour(instants: readonly InstantDisponible[]): [string, InstantDisponible[]][] {
  const jours = new Map<string, InstantDisponible[]>();
  for (const instant of instants) {
    jours.set(instant.date, [...(jours.get(instant.date) ?? []), instant]);
  }
  return [...jours.entries()];
}

function dateDuJour(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}

export function ParcoursReservation({
  adresse,
  types,
  praticiens,
  telephoneCentre,
}: {
  adresse: AdresseCentre;
  types: readonly TypePublic[];
  praticiens: readonly { id: string; nom: string }[];
  telephoneCentre: string;
}) {
  const [etape, setEtape] = useState<Etape>({ nom: 'CHOIX' });
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [praticienId, setPraticienId] = useState('');
  const [lecture, setLecture] = useState<LectureCreneaux | null>(null);
  const [etat, setEtat] = useState<EtatFormulaire>({});
  const [pagePleine, setPagePleine] = useState(false);
  const [occupe, demarrer] = useTransition();
  const type = types.find((t) => t.id === typeId);

  const charger = useCallback(
    async (depuis: string, cumul: readonly InstantDisponible[] = []) => {
      const reponse = await chargerCreneauxAction(adresse, {
        typeRdvId: typeId,
        praticienId,
        depuis,
      });
      if (!reponse.ok) {
        setEtat(reponse.etat);
        return;
      }
      setLecture({ ...reponse.valeur, instants: [...cumul, ...reponse.valeur.instants] });
    },
    [adresse, typeId, praticienId],
  );

  useEffect(() => {
    if (etape.nom !== 'CHOIX' || typeId === '') {
      return;
    }
    demarrer(() => charger(dateDuJour()));
  }, [etape.nom, typeId, praticienId, charger]);

  function revenirAuChoix(message: EtatFormulaire) {
    setEtat(message);
    setEtape({ nom: 'CHOIX' });
  }

  function choisir(instant: InstantDisponible) {
    setEtat({});
    demarrer(async () => {
      const defi = await defiCaptchaAction();
      if (!defi.ok) {
        setEtat(defi.etat);
        return;
      }
      let captcha: string;
      try {
        captcha = await resoudreDefi(defi.valeur);
      } catch (erreur) {
        if (erreur instanceof ContexteNonSecurise) {
          setPagePleine(true);
          return;
        }
        throw erreur;
      }
      const reponse = await verrouillerAction(adresse, {
        typeRdvId: typeId,
        praticienId,
        debut: instant.debut,
        captcha,
      });
      if (!reponse.ok) {
        setEtat(reponse.etat);
        await charger(dateDuJour());
        return;
      }
      setEtape({ nom: 'COORDONNEES', jeton: reponse.valeur.jeton, instant });
    });
  }

  function changerDeCreneau(jeton: string) {
    setEtat({});
    demarrer(async () => {
      await libererAction(adresse, jeton);
      setEtape({ nom: 'CHOIX' });
    });
  }

  function envoyerCoordonnees(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (etape.nom !== 'COORDONNEES') {
      return;
    }
    const formData = new FormData(evenement.currentTarget);
    const saisie = {
      nom: texte(formData, 'nom'),
      prenom: texte(formData, 'prenom'),
      dateNaissance: texte(formData, 'dateNaissance'),
      telephone: texte(formData, 'telephone'),
      email: texte(formData, 'email'),
      motif: texte(formData, 'motif'),
      consentementRgpd: coche(formData, 'consentementRgpd'),
      consentementSms: coche(formData, 'consentementSms'),
    };
    demarrer(async () => {
      const reponse = await demanderCodeAction(adresse, etape.jeton, saisie);
      if (reponse.ok) {
        setEtat({});
        setEtape({ ...etape, nom: 'CODE', telephone: reponse.valeur.telephone });
      } else if (reponse.retourAuChoix) {
        revenirAuChoix(reponse.etat);
      } else {
        setEtat({ ...reponse.etat, valeurs: saisie });
      }
    });
  }

  function envoyerCode(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (etape.nom !== 'CODE') {
      return;
    }
    const code = texte(new FormData(evenement.currentTarget), 'code');
    demarrer(async () => {
      const reponse = await validerCodeAction(adresse, etape.jeton, code);
      if (reponse.ok) {
        setEtat({});
        setEtape({ nom: 'CONFIRMATION', confirmation: reponse.valeur });
      } else if (reponse.retourAuChoix) {
        revenirAuChoix(reponse.etat);
      } else {
        setEtat(reponse.etat);
      }
    });
  }

  if (pagePleine) {
    return (
      <p>
        La réservation ne peut pas se faire dans ce cadre.{' '}
        <a
          className="underline"
          href={`/rdv/${adresse.client}/${adresse.centre}`}
          target="_blank"
          rel="noopener"
        >
          Ouvrir la page de réservation
        </a>
      </p>
    );
  }

  if (etape.nom === 'CONFIRMATION') {
    const { date, heure, aValider } = etape.confirmation;
    return (
      <section className="grid gap-2" aria-live="polite">
        <h2 className="text-lg font-semibold">
          {aValider ? 'Demande enregistrée' : 'Rendez-vous confirmé'}
        </h2>
        <p>
          {formaterDateLongue(date)} à {heure.replace(':', 'h')}
        </p>
        <p className="text-muted-foreground">
          {aValider
            ? 'Le centre doit encore valider ce créneau : vous recevrez sa réponse par SMS.'
            : 'Vous recevrez une confirmation par SMS, avec un lien pour annuler ou déplacer.'}
        </p>
      </section>
    );
  }

  if (etape.nom === 'COORDONNEES') {
    return (
      <form onSubmit={envoyerCoordonnees} className="grid gap-4">
        <p className="font-medium">
          {formaterDateLongue(etape.instant.date)} à {etape.instant.heure.replace(':', 'h')}
        </p>
        <MessageFormulaire etat={etat} />
        <ChampTexte etat={etat} nom="nom" libelle="Nom" autoComplete="family-name" requis />
        <ChampTexte etat={etat} nom="prenom" libelle="Prénom" autoComplete="given-name" requis />
        <ChampTexte
          etat={etat}
          nom="dateNaissance"
          libelle="Date de naissance"
          aide="JJ/MM/AAAA"
          autoComplete="bday"
          requis
        />
        <ChampTexte
          etat={etat}
          nom="telephone"
          libelle="Téléphone mobile"
          type="tel"
          aide="Un code de vérification vous sera envoyé par SMS."
          autoComplete="tel"
          requis
        />
        <ChampTexte etat={etat} nom="email" libelle="E-mail" type="email" autoComplete="email" />
        <ChampTexte etat={etat} nom="motif" libelle="Motif" />
        <CaseACocher
          etat={etat}
          nom="consentementRgpd"
          libelle={TEXTE_CONSENTEMENT_RGPD}
          defaut={false}
        />
        <CaseACocher
          etat={etat}
          nom="consentementSms"
          libelle={TEXTE_CONSENTEMENT_SMS}
          defaut={false}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={occupe}>
            Recevoir le code
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={occupe}
            onClick={() => {
              changerDeCreneau(etape.jeton);
            }}
          >
            Changer de créneau
          </Button>
        </div>
      </form>
    );
  }

  if (etape.nom === 'CODE') {
    return (
      <form onSubmit={envoyerCode} className="grid gap-4">
        <p>Saisissez le code envoyé au {etape.telephone}.</p>
        <MessageFormulaire etat={etat} />
        <ChampTexte
          etat={etat}
          nom="code"
          libelle="Code reçu par SMS"
          inputMode="numeric"
          autoComplete="one-time-code"
          requis
        />
        <div>
          <Button type="submit" size="lg" disabled={occupe}>
            Confirmer le rendez-vous
          </Button>
        </div>
      </form>
    );
  }

  if (types.length === 0) {
    return <p>Aucun rendez-vous n’est réservable en ligne. Appelez le {telephoneCentre}.</p>;
  }

  return (
    <div className="grid gap-5">
      <MessageFormulaire etat={etat} />
      <div className="grid gap-1.5">
        <Label htmlFor="type-rdv">Type de rendez-vous</Label>
        <select
          id="type-rdv"
          className="h-10 rounded-lg border border-input bg-background px-2"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
          }}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom} ({t.dureeMinutes} min)
            </option>
          ))}
        </select>
      </div>
      {type?.requierePraticien && praticiens.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="praticien">Praticien</Label>
          <select
            id="praticien"
            className="h-10 rounded-lg border border-input bg-background px-2"
            value={praticienId}
            onChange={(e) => {
              setPraticienId(e.target.value);
            }}
          >
            <option value="">Peu importe</option>
            {praticiens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <section className="grid gap-4" aria-busy={occupe}>
        <h2 className="font-medium">Créneaux disponibles</h2>
        {lecture !== null && lecture.instants.length === 0 && lecture.suite === null ? (
          <p>Aucun créneau libre pour le moment. Appelez le {telephoneCentre}.</p>
        ) : null}
        {parJour(lecture?.instants ?? []).map(([date, instants]) => (
          <div key={date} className="grid gap-2">
            <h3 className="text-sm font-medium">{formaterDateLongue(date)}</h3>
            <div className="flex flex-wrap gap-2">
              {instants.map((instant) => (
                <Button
                  key={instant.debut}
                  variant="outline"
                  size="lg"
                  disabled={occupe}
                  onClick={() => {
                    choisir(instant);
                  }}
                >
                  {instant.heure.replace(':', 'h')}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {lecture?.suite ? (
          <div>
            <Button
              variant="secondary"
              size="lg"
              disabled={occupe}
              onClick={() => {
                const { suite, instants } = lecture;
                demarrer(() => charger(suite as string, instants));
              }}
            >
              Voir les jours suivants
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
