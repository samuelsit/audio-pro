'use client';

import {
  disposerEnVoies,
  heureDepuisMinutes,
  instantSaisi,
  localDepuisInstant,
  PAS_DUREE_MINUTES,
  positionDansLaGrille,
  type Intervalle,
} from '@ha/domain';
import { useRouter } from 'next/navigation';
import { useOptimistic, useRef, useState, useTransition, type PointerEvent } from 'react';
import { toast } from 'sonner';

import { ConfirmationControlee } from '@/components/confirmation-controlee';
import { cn } from '@/lib/utils';
import type { RdvGrille } from '@/server/services/agenda';

import { deplacerRdvAction, type SaisieDeplacement } from './actions';

const PX_PAR_MINUTE = 1.2;

export interface Colonne {
  cle: string;
  titre: string;
  date: string;
  /** `undefined` : tous les rendez-vous du jour ; sinon, ceux de ce praticien (`null` : sans praticien). */
  praticienId?: string | null | undefined;
  plages: readonly Intervalle[];
  /** Rendez-vous du praticien sur un autre centre : affichés sans identité. */
  ailleurs: readonly Intervalle[];
  /** Créneaux tenus par un patient en train de réserver en ligne. */
  verrous: readonly Intervalle[];
}

interface Geste {
  rdv: RdvGrille;
  mode: 'deplacer' | 'redimensionner';
  departX: number;
  departY: number;
  colonne: number;
  debutMinutes: number;
  dureeMinutes: number;
  bouge: boolean;
}

function arrondir(minutes: number): number {
  return Math.round(minutes / PAS_DUREE_MINUTES) * PAS_DUREE_MINUTES;
}

function style(debutMinutes: number, dureeMinutes: number, origine: number) {
  return {
    top: (debutMinutes - origine) * PX_PAR_MINUTE,
    height: dureeMinutes * PX_PAR_MINUTE,
  };
}

function dansLaColonne(rdv: RdvGrille, colonne: Colonne): boolean {
  return (
    localDepuisInstant(rdv.debut).date === colonne.date &&
    (colonne.praticienId === undefined || colonne.praticienId === rdv.praticienId)
  );
}

export function GrilleAgenda({
  colonnes,
  rdv,
  bornes,
  surOuverture,
  surCreneau,
}: {
  colonnes: readonly Colonne[];
  rdv: readonly RdvGrille[];
  bornes: { debut: number; fin: number };
  surOuverture: (id: string) => void;
  surCreneau: (date: string, heure: string, praticienId: string | null | undefined) => void;
}) {
  const router = useRouter();
  const [, demarrer] = useTransition();
  const [geste, setGeste] = useState<Geste | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{
    id: string;
    saisie: SaisieDeplacement;
    message: string;
  } | null>(null);
  const [affiches, appliquer] = useOptimistic(
    rdv,
    (
      actuels,
      {
        id,
        debut,
        fin,
        praticienId,
      }: Pick<RdvGrille, 'id' | 'debut' | 'fin'> & {
        praticienId: string | null;
      },
    ) => actuels.map((r) => (r.id === id ? { ...r, debut, fin, praticienId } : r)),
  );
  const colonnesRef = useRef<(HTMLDivElement | null)[]>([]);
  const vientDeBouger = useRef(false);
  const hauteur = (bornes.fin - bornes.debut) * PX_PAR_MINUTE;
  const heures = Array.from(
    { length: (bornes.fin - bornes.debut) / 60 },
    (_, i) => bornes.debut + i * 60,
  );

  function colonneSousPointeur(x: number, defaut: number): number {
    const indice = colonnesRef.current.findIndex((el) => {
      const rect = el?.getBoundingClientRect();
      return rect !== undefined && x >= rect.left && x < rect.right;
    });
    return indice === -1 ? defaut : indice;
  }

  function debuter(e: PointerEvent, r: RdvGrille, colonne: number, mode: Geste['mode']) {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setGeste({
      rdv: r,
      mode,
      departX: e.clientX,
      departY: e.clientY,
      colonne,
      ...positionDansLaGrille(r),
      bouge: false,
    });
  }

  function suivre(e: PointerEvent) {
    if (!geste) {
      return;
    }
    const delta = arrondir((e.clientY - geste.departY) / PX_PAR_MINUTE);
    const position = positionDansLaGrille(geste.rdv);
    const bouge =
      geste.bouge ||
      Math.abs(e.clientX - geste.departX) > 4 ||
      Math.abs(delta) >= PAS_DUREE_MINUTES;
    if (geste.mode === 'redimensionner') {
      setGeste({
        ...geste,
        bouge,
        dureeMinutes: Math.max(PAS_DUREE_MINUTES, position.dureeMinutes + delta),
      });
      return;
    }
    setGeste({
      ...geste,
      bouge,
      colonne: colonneSousPointeur(e.clientX, geste.colonne),
      debutMinutes: Math.min(
        Math.max(bornes.debut, position.debutMinutes + delta),
        bornes.fin - position.dureeMinutes,
      ),
    });
  }

  function envoyer(id: string, saisie: SaisieDeplacement, praticienActuel: string | null) {
    const debut = instantSaisi(saisie.date, saisie.heure);
    demarrer(async () => {
      if (debut !== null) {
        appliquer({
          id,
          debut,
          fin: debut + saisie.dureeMinutes * 60_000,
          praticienId: saisie.praticienId === undefined ? praticienActuel : saisie.praticienId,
        });
      }
      const etat = await deplacerRdvAction(id, saisie);
      if (etat.conflitAgenda?.confirmable) {
        setAConfirmer({ id, saisie, message: etat.message ?? '' });
      } else if (etat.message) {
        toast.error(etat.message);
      }
      router.refresh();
    });
  }

  function terminer() {
    if (!geste) {
      return;
    }
    const { rdv: r, colonne, debutMinutes, dureeMinutes, bouge } = geste;
    setGeste(null);
    vientDeBouger.current = bouge;
    const cible = colonnes[colonne];
    if (!bouge || !cible) {
      return;
    }
    envoyer(
      r.id,
      {
        version: r.version,
        date: cible.date,
        heure: heureDepuisMinutes(debutMinutes),
        dureeMinutes,
        ...(cible.praticienId === undefined ? {} : { praticienId: cible.praticienId }),
      },
      r.praticienId,
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid min-w-fit"
        style={{ gridTemplateColumns: `3.5rem repeat(${colonnes.length}, minmax(9rem, 1fr))` }}
      >
        <div className="border-b bg-muted/40" />
        {colonnes.map((c) => (
          <div
            key={c.cle}
            className="border-b border-l bg-muted/40 px-2 py-1.5 text-sm font-medium"
          >
            {c.titre}
          </div>
        ))}

        <div className="relative" style={{ height: hauteur }}>
          {heures.map((minutes) => (
            <span
              key={minutes}
              className="absolute right-1 text-xs text-muted-foreground"
              style={{ top: (minutes - bornes.debut) * PX_PAR_MINUTE }}
            >
              {heureDepuisMinutes(minutes)}
            </span>
          ))}
        </div>

        {colonnes.map((colonne, indice) => {
          const visibles = affiches.filter((r) => dansLaColonne(r, colonne));
          const voies = disposerEnVoies(visibles);
          return (
            <div
              key={colonne.cle}
              ref={(el) => {
                colonnesRef.current[indice] = el;
              }}
              data-testid={`colonne-${colonne.cle}`}
              className="relative border-l bg-muted/50"
              style={{ height: hauteur }}
              onClick={(e) => {
                if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.plage) {
                  return;
                }
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                const minutes = bornes.debut + Math.floor(y / PX_PAR_MINUTE / 15) * 15;
                surCreneau(colonne.date, heureDepuisMinutes(minutes), colonne.praticienId);
              }}
            >
              {colonne.plages.map((plage) => {
                const { debutMinutes, dureeMinutes } = positionDansLaGrille(plage);
                return (
                  <div
                    key={plage.debut}
                    data-plage="oui"
                    className="absolute inset-x-0 bg-background"
                    style={style(debutMinutes, dureeMinutes, bornes.debut)}
                  />
                );
              })}
              {heures.map((minutes) => (
                <div
                  key={minutes}
                  className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                  style={{ top: (minutes - bornes.debut) * PX_PAR_MINUTE }}
                />
              ))}
              {colonne.ailleurs.map((occupation) => {
                const { debutMinutes, dureeMinutes } = positionDansLaGrille(occupation);
                return (
                  <div
                    key={occupation.debut}
                    className="absolute inset-x-1 rounded bg-muted px-1 text-xs text-muted-foreground"
                    style={style(debutMinutes, dureeMinutes, bornes.debut)}
                  >
                    Autre centre
                  </div>
                );
              })}
              {colonne.verrous.map((verrou) => {
                const { debutMinutes, dureeMinutes } = positionDansLaGrille(verrou);
                return (
                  <div
                    key={verrou.debut}
                    data-testid="verrou-en-ligne"
                    className="pointer-events-none absolute inset-x-1 rounded border border-dashed px-1 text-xs text-muted-foreground"
                    style={style(debutMinutes, dureeMinutes, bornes.debut)}
                  >
                    Réservation en ligne en cours
                  </div>
                );
              })}
              {visibles.map((r) => {
                const enGeste = geste?.rdv.id === r.id;
                const position = enGeste ? geste : positionDansLaGrille(r);
                if (enGeste && geste.colonne !== indice) {
                  return null;
                }
                const voie = voies.get(r.id) ?? { rang: 0, voies: 1 };
                const deplacable = r.statut === 'PLANIFIE' || r.statut === 'CONFIRME';
                return (
                  <button
                    key={r.id}
                    type="button"
                    data-testid={`rdv-${r.id}`}
                    aria-label={`${heureDepuisMinutes(position.debutMinutes)} ${r.type} ${r.nom}`}
                    className={cn(
                      'absolute touch-none overflow-hidden rounded border-l-4 bg-card px-1 text-left text-xs shadow-sm select-none',
                      deplacable && 'cursor-grab',
                      enGeste && 'z-10 cursor-grabbing ring-2 ring-ring',
                      r.statut === 'ABSENT' && 'line-through opacity-50',
                    )}
                    style={{
                      ...style(position.debutMinutes, position.dureeMinutes, bornes.debut),
                      borderLeftColor: r.couleur,
                      left: `${(voie.rang / voie.voies) * 100}%`,
                      width: `${100 / voie.voies}%`,
                    }}
                    onPointerDown={(e) => {
                      if (deplacable) {
                        debuter(e, r, indice, 'deplacer');
                      }
                    }}
                    onPointerMove={suivre}
                    onPointerUp={terminer}
                    onClick={() => {
                      if (vientDeBouger.current) {
                        vientDeBouger.current = false;
                        return;
                      }
                      surOuverture(r.id);
                    }}
                  >
                    <span className="block truncate font-medium">{r.nom}</span>
                    <span className="block truncate text-muted-foreground">
                      {heureDepuisMinutes(position.debutMinutes)} · {r.type}
                      {r.cabine ? ` · ${r.cabine}` : ''}
                    </span>
                    {deplacable ? (
                      <span
                        aria-hidden
                        data-testid={`poignee-${r.id}`}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        onPointerDown={(e) => {
                          debuter(e, r, indice, 'redimensionner');
                        }}
                        onPointerMove={suivre}
                        onPointerUp={terminer}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <ConfirmationControlee
        ouvert={aConfirmer !== null}
        titre="Confirmer ce créneau ?"
        description={aConfirmer?.message ?? ''}
        surAnnulation={() => {
          setAConfirmer(null);
        }}
        surConfirmation={() => {
          if (aConfirmer) {
            const { id, saisie } = aConfirmer;
            setAConfirmer(null);
            envoyer(id, { ...saisie, confirmerHorsDisponibilites: true }, null);
          }
        }}
      />
    </div>
  );
}
