import {
  ajouterJours,
  bornesGrille,
  dateCalendaireSchema,
  heureSchema,
  JOURS_SEMAINE,
  LIBELLES_JOURS,
  localDepuisInstant,
  lundiDeLaSemaine,
  parametreOptionnel,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { lireAgenda, type AgendaPeriode } from '@/server/services/agenda';
import { listerTypesRdv } from '@/server/services/agenda-parametres';
import { aujourdhui } from '@/server/services/patients';

import { AgendaClient } from './agenda-client';
import { centreDeLAgenda } from './centre';
import type { Colonne } from './grille-agenda';

export const metadata: Metadata = { title: 'Agenda – HA-Gestion' };

const VUES = { praticiens: 'Praticiens', jour: 'Jour', semaine: 'Semaine' } as const;
type Vue = keyof typeof VUES;

const criteresSchema = z.object({
  vue: z.enum(['praticiens', 'jour', 'semaine']).catch('praticiens'),
  date: parametreOptionnel(dateCalendaireSchema).catch(undefined),
  praticien: parametreOptionnel(z.string()),
  centre: parametreOptionnel(z.string()),
  heure: parametreOptionnel(heureSchema).catch(undefined),
  type: parametreOptionnel(z.string()),
});

function occupationsDe(agenda: AgendaPeriode, praticienId: string | undefined, jour: string) {
  return agenda.occupationsAilleurs.filter(
    (o) => o.praticienId === praticienId && localDepuisInstant(o.debut).date === jour,
  );
}

function verrousDe(agenda: AgendaPeriode, praticienId: string | undefined | null, jour: string) {
  return agenda.verrous.filter(
    (v) =>
      (praticienId === undefined || v.praticienId === praticienId) &&
      localDepuisInstant(v.debut).date === jour,
  );
}

function colonnesDe(
  vue: Vue,
  date: string,
  praticienId: string | undefined,
  agenda: AgendaPeriode,
): Colonne[] {
  const plagesDe = (praticien: string | undefined, jour: string) =>
    praticien ? (agenda.plages[`${praticien}:${jour}`] ?? []) : (agenda.ouverture[jour] ?? []);
  if (vue === 'semaine') {
    const lundi = lundiDeLaSemaine(date);
    return JOURS_SEMAINE.map((jour, i) => {
      const jourDate = ajouterJours(lundi, i);
      return {
        cle: jourDate,
        titre: `${LIBELLES_JOURS[jour]} ${formaterDate(jourDate).slice(0, 5)}`,
        date: jourDate,
        praticienId,
        plages: plagesDe(praticienId, jourDate),
        ailleurs: occupationsDe(agenda, praticienId, jourDate),
        verrous: verrousDe(agenda, praticienId, jourDate),
      };
    });
  }
  if (vue === 'jour') {
    return [
      {
        cle: date,
        titre: formaterDate(date),
        date,
        praticienId,
        plages: plagesDe(praticienId, date),
        ailleurs: occupationsDe(agenda, praticienId, date),
        verrous: verrousDe(agenda, praticienId, date),
      },
    ];
  }
  const colonnes: Colonne[] = agenda.praticiens.map((p) => ({
    cle: p.id,
    titre: p.nom,
    date,
    praticienId: p.id,
    plages: plagesDe(p.id, date),
    ailleurs: occupationsDe(agenda, p.id, date),
    verrous: verrousDe(agenda, p.id, date),
  }));
  return agenda.rdv.some((r) => r.praticienId === null)
    ? [
        ...colonnes,
        {
          cle: 'sans-praticien',
          titre: 'Sans praticien',
          date,
          praticienId: null,
          plages: agenda.ouverture[date] ?? [],
          ailleurs: [],
          verrous: verrousDe(agenda, null, date),
        },
      ]
    : colonnes;
}

export default async function PageAgenda({ searchParams }: PageProps<'/agenda'>) {
  const acteur = await requireSession();
  const criteres = criteresSchema.parse(await searchParams);
  const { vue, praticien } = criteres;
  const date = criteres.date ?? aujourdhui();
  const { centreId, choix } = await centreDeLAgenda(criteres.centre);
  if (centreId === null) {
    return <EtatVide titre="Aucun centre">Aucun centre n’est accessible.</EtatVide>;
  }
  const du = vue === 'semaine' ? lundiDeLaSemaine(date) : date;
  const au = vue === 'semaine' ? ajouterJours(du, JOURS_SEMAINE.length - 1) : date;
  const [agenda, types] = await Promise.all([
    ouIntrouvable(lireAgenda(acteur, centreId, du, au)),
    listerTypesRdv(acteur),
  ]);
  const praticienId = agenda.praticiens.some((p) => p.id === praticien) ? praticien : undefined;
  const colonnes = colonnesDe(vue, date, praticienId, agenda);
  const lien = (changements: Record<string, string | undefined>) => {
    const parametres = new URLSearchParams();
    const valeurs = { vue, date, praticien: praticienId, centre: criteres.centre, ...changements };
    for (const [cle, valeur] of Object.entries(valeurs)) {
      if (valeur) {
        parametres.set(cle, valeur);
      }
    }
    return `/agenda?${parametres.toString()}`;
  };
  const pas = vue === 'semaine' ? JOURS_SEMAINE.length : 1;
  const bornes = bornesGrille([
    ...agenda.rdv,
    ...colonnes.flatMap((c) => c.plages),
    ...colonnes.flatMap((c) => c.ailleurs),
  ]);

  return (
    <div className="grid gap-4">
      <EntetePage titre="Agenda">
        {vue === 'semaine' ? `Semaine du ${formaterDate(du)}` : `Journée du ${formaterDate(date)}`}
      </EntetePage>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Vue de l’agenda" className="flex gap-1">
          {(Object.keys(VUES) as Vue[]).map((v) => (
            <Button key={v} asChild size="sm" variant={v === vue ? 'default' : 'outline'}>
              <Link href={lien({ vue: v })}>{VUES[v]}</Link>
            </Button>
          ))}
        </nav>
        <nav aria-label="Période" className="flex gap-1">
          <Button asChild size="sm" variant="outline">
            <Link href={lien({ date: ajouterJours(date, -pas) })}>Précédent</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={lien({ date: aujourdhui() })}>Aujourd’hui</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={lien({ date: ajouterJours(date, pas) })}>Suivant</Link>
          </Button>
        </nav>
        {vue === 'praticiens' ? null : (
          <nav aria-label="Praticien" className="flex flex-wrap gap-1">
            <Button asChild size="sm" variant={praticienId ? 'outline' : 'default'}>
              <Link href={lien({ praticien: undefined })}>Tous</Link>
            </Button>
            {agenda.praticiens.map((p) => (
              <Button
                key={p.id}
                asChild
                size="sm"
                variant={p.id === praticienId ? 'default' : 'outline'}
              >
                <Link href={lien({ praticien: p.id })}>{p.nom}</Link>
              </Button>
            ))}
          </nav>
        )}
        {choix.length > 1 ? (
          <nav aria-label="Centre de l’agenda" className="flex flex-wrap gap-1">
            {choix.map((c) => (
              <Button
                key={c.id}
                asChild
                size="sm"
                variant={c.id === centreId ? 'default' : 'outline'}
              >
                <Link href={lien({ centre: c.id, praticien: undefined })}>{c.nom}</Link>
              </Button>
            ))}
          </nav>
        ) : null}
      </div>

      <AgendaClient
        key={`${centreId}:${criteres.heure ?? ''}`}
        centreId={centreId}
        colonnes={colonnes}
        rdv={agenda.rdv}
        bornes={bornes}
        types={types}
        praticiens={agenda.praticiens}
        cabines={agenda.cabines}
        dateCourante={date}
        nouveau={
          criteres.heure
            ? {
                date,
                heure: criteres.heure,
                praticienId: praticienId ?? null,
                typeRdvId: criteres.type,
              }
            : null
        }
      />
    </div>
  );
}
