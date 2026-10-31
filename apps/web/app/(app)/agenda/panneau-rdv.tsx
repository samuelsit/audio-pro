'use client';

import {
  CIVILITES,
  estDeplacable,
  LIBELLES_CIVILITE,
  LIBELLES_SEXE,
  LIBELLES_STATUTS_RDV,
  localDepuisInstant,
  peutPasserA,
  positionDansLaGrille,
  SEXES,
  type StatutRdv,
} from '@ha/domain';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ChampTexte, ListeDeroulante } from '@/components/formulaire';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formaterDate } from '@/lib/format';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import type { RdvDetail } from '@/server/services/agenda';

import {
  annulerRdvAction,
  changerStatutRdvAction,
  deplacerRdvAction,
  lireRdvAction,
  marquerArriveeAction,
  modifierNotesRdvAction,
  prendreEnChargeAction,
} from './actions';
import { ChoixPatient } from './choix-patient';

function ArriveeProspect({
  rdv,
  executer,
}: {
  rdv: RdvDetail;
  executer: (action: () => Promise<EtatFormulaire>) => void;
}) {
  const [existant, setExistant] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatFormulaire>(ETAT_INITIAL);
  const [enCours, demarrer] = useTransition();

  function envoyer(formData: FormData, confirmerDoublon: boolean) {
    demarrer(async () => {
      const resultat = await marquerArriveeAction(
        rdv.id,
        rdv.version,
        existant
          ? { mode: 'EXISTANT', patientId: existant }
          : {
              mode: 'NOUVEAU',
              civilite: formData.get('civilite'),
              nomNaissance: formData.get('nomNaissance'),
              prenoms: formData.get('prenoms'),
              dateNaissance: formData.get('dateNaissance'),
              sexe: formData.get('sexe'),
              confirmerDoublon,
            },
      );
      setEtat(resultat);
      if (resultat.succes) {
        executer(() => Promise.resolve(resultat));
      }
    });
  }

  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        envoyer(new FormData(e.currentTarget), false);
      }}
    >
      <p className="text-sm font-medium">Arrivée du prospect</p>
      <p className="text-sm text-muted-foreground">
        Créez sa fiche, ou reliez une fiche existante.
      </p>
      {etat.message ? <p className="text-sm text-destructive">{etat.message}</p> : null}
      <ChoixPatient
        libelle="Fiche existante"
        surChoix={(patient) => {
          setExistant(patient?.id ?? null);
        }}
      />
      {existant ? null : (
        <>
          <ChampTexte
            etat={etat}
            nom="nomNaissance"
            libelle="Nom de naissance"
            defaut={rdv.prospectNom}
            requis
          />
          <ChampTexte etat={etat} nom="prenoms" libelle="Prénoms" requis />
          <ChampTexte
            etat={etat}
            nom="dateNaissance"
            libelle="Date de naissance"
            aide="JJ/MM/AAAA"
            requis
          />
          <ListeDeroulante
            etat={etat}
            nom="civilite"
            libelle="Civilité"
            options={CIVILITES.map((c) => ({ valeur: c, libelle: LIBELLES_CIVILITE[c] }))}
          />
          <ListeDeroulante
            etat={etat}
            nom="sexe"
            libelle="Sexe"
            options={SEXES.map((s) => ({ valeur: s, libelle: LIBELLES_SEXE[s] }))}
          />
        </>
      )}
      {etat.doublons ? (
        <div className="grid gap-2 rounded-md bg-muted p-2 text-sm">
          <p>Ce patient existe peut-être déjà : reliez sa fiche ci-dessus, ou confirmez.</p>
          <ul>
            {etat.doublons.visibles.map((d) => (
              <li key={d.id}>
                {d.nomNaissance} {d.prenoms}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={enCours}
            onClick={(e) => {
              const formulaire = e.currentTarget.form;
              if (formulaire) {
                envoyer(new FormData(formulaire), true);
              }
            }}
          >
            Créer quand même
          </Button>
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={enCours}>
          Enregistrer l’arrivée
        </Button>
      </div>
    </form>
  );
}

function FormulaireDeplacement({
  rdv,
  praticiens,
  executer,
}: {
  rdv: RdvDetail;
  praticiens: readonly { id: string; nom: string }[];
  executer: (action: () => Promise<EtatFormulaire>) => void;
}) {
  const { date, heure } = localDepuisInstant(rdv.debut);
  const { dureeMinutes } = positionDansLaGrille(rdv);
  const [confirmer, setConfirmer] = useState(false);
  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        executer(async () => {
          const etat = await deplacerRdvAction(rdv.id, {
            version: rdv.version,
            date: String(donnees.get('date')),
            heure: String(donnees.get('heure')),
            dureeMinutes: Number(donnees.get('dureeMinutes')),
            praticienId: String(donnees.get('praticienId')) || null,
            confirmerHorsDisponibilites: confirmer,
          });
          setConfirmer(etat.conflitAgenda?.confirmable ?? false);
          return etat;
        });
      }}
    >
      <p className="text-sm font-medium">Déplacer</p>
      <div className="grid grid-cols-3 gap-2">
        <ChampTexte
          etat={ETAT_INITIAL}
          nom="date"
          libelle="Date"
          type="date"
          defaut={date}
          requis
        />
        <ChampTexte
          etat={ETAT_INITIAL}
          nom="heure"
          libelle="Heure"
          type="time"
          defaut={heure}
          requis
        />
        <div className="grid gap-1.5">
          <Label htmlFor="dureeDeplacement">Durée (min)</Label>
          <input
            id="dureeDeplacement"
            name="dureeMinutes"
            type="number"
            min={5}
            step={5}
            defaultValue={dureeMinutes}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          />
        </div>
      </div>
      <ListeDeroulante
        etat={ETAT_INITIAL}
        nom="praticienId"
        libelle="Praticien"
        defaut={rdv.praticienId ?? ''}
        options={praticiens.map((p) => ({ valeur: p.id, libelle: p.nom }))}
        vide="Aucun"
        requis={false}
      />
      <div>
        <Button type="submit" variant="outline">
          {confirmer ? 'Confirmer malgré tout' : 'Déplacer'}
        </Button>
      </div>
    </form>
  );
}

export function PanneauRdv({
  id,
  praticiens,
  surFermeture,
}: {
  id: string | null;
  praticiens: readonly { id: string; nom: string }[];
  surFermeture: () => void;
}) {
  const [charge, setCharge] = useState<{ id: string; rdv: RdvDetail | null } | null>(null);
  const [notes, setNotes] = useState('');
  const [enCours, demarrer] = useTransition();
  const rdv = charge?.id === id ? (charge?.rdv ?? null) : null;

  useEffect(() => {
    if (id === null) {
      return;
    }
    void lireRdvAction(id).then((detail) => {
      setCharge({ id, rdv: detail });
      setNotes(detail?.notes ?? '');
    });
  }, [id]);

  function executer(action: () => Promise<EtatFormulaire>) {
    demarrer(async () => {
      const etat = await action();
      if (etat.succes) {
        toast.success(etat.succes);
        surFermeture();
      } else if (etat.message) {
        toast.error(etat.message);
      }
    });
  }

  const statut: StatutRdv | undefined = rdv?.statut;
  const debut = rdv ? localDepuisInstant(rdv.debut) : null;
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(ouvert) => {
        if (!ouvert) {
          surFermeture();
        }
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{rdv?.nom ?? 'Rendez-vous'}</SheetTitle>
          <SheetDescription>
            {rdv && debut
              ? `${rdv.type}, le ${formaterDate(debut.date)} à ${debut.heure}`
              : charge?.id === id
                ? 'Ce rendez-vous n’est plus accessible.'
                : 'Chargement…'}
          </SheetDescription>
        </SheetHeader>
        {rdv && statut ? (
          <div className="grid gap-4 px-4 pb-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{LIBELLES_STATUTS_RDV[statut]}</Badge>
              {rdv.telephone ? <span>{rdv.telephone}</span> : null}
              {rdv.cabine ? <span>{rdv.cabine}</span> : null}
              {rdv.patientId && rdv.ficheAccessible ? (
                <Link className="underline" href={`/patients/${rdv.patientId}`}>
                  Fiche patient
                </Link>
              ) : null}
              {rdv.dossierId ? (
                <Link className="underline" href={`/dossiers/${rdv.dossierId}`}>
                  Dossier
                </Link>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {peutPasserA(statut, 'CONFIRME') ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => changerStatutRdvAction(rdv.id, rdv.version, 'CONFIRME'));
                  }}
                >
                  Confirmer
                </Button>
              ) : null}
              {peutPasserA(statut, 'ARRIVE') && rdv.patientId !== null ? (
                <Button
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => marquerArriveeAction(rdv.id, rdv.version));
                  }}
                >
                  Marquer arrivé
                </Button>
              ) : null}
              {statut === 'ARRIVE' && !rdv.priseEnCharge ? (
                <Button
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => prendreEnChargeAction(rdv.id, rdv.version));
                  }}
                >
                  Prendre en charge
                </Button>
              ) : null}
              {peutPasserA(statut, 'VU') ? (
                <Button
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => changerStatutRdvAction(rdv.id, rdv.version, 'VU'));
                  }}
                >
                  Terminer
                </Button>
              ) : null}
              {peutPasserA(statut, 'ABSENT') ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => changerStatutRdvAction(rdv.id, rdv.version, 'ABSENT'));
                  }}
                >
                  Absent
                </Button>
              ) : null}
              {peutPasserA(statut, 'ANNULE') ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => annulerRdvAction(rdv.id, rdv.version));
                  }}
                >
                  Annuler le rendez-vous
                </Button>
              ) : null}
            </div>
            {peutPasserA(statut, 'ARRIVE') && rdv.patientId === null ? (
              <ArriveeProspect rdv={rdv} executer={executer} />
            ) : null}
            {estDeplacable(statut) ? (
              <FormulaireDeplacement rdv={rdv} praticiens={praticiens} executer={executer} />
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="notesRdv">Notes</Label>
              <textarea
                id="notesRdv"
                rows={3}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              />
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={enCours}
                  onClick={() => {
                    executer(() => modifierNotesRdvAction(rdv.id, rdv.version, notes));
                  }}
                >
                  Enregistrer les notes
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Durée : {positionDansLaGrille(rdv).dureeMinutes} minutes
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
