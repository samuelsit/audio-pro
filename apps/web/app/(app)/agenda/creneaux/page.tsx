import { dateCalendaireSchema, parametreOptionnel } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formaterDate } from '@/lib/format';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { chercherCreneaux, lireAgenda } from '@/server/services/agenda';
import { listerTypesRdv } from '@/server/services/agenda-parametres';
import { aujourdhui } from '@/server/services/patients';

import { centreDeLAgenda } from '../centre';

export const metadata: Metadata = { title: 'Prochain créneau – HA-Gestion' };

const CLASSE_LISTE = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

const criteresSchema = z.object({
  type: parametreOptionnel(z.string()),
  praticien: parametreOptionnel(z.string()),
  depuis: parametreOptionnel(dateCalendaireSchema).catch(undefined),
  centre: parametreOptionnel(z.string()),
});

export default async function PageCreneaux({ searchParams }: PageProps<'/agenda/creneaux'>) {
  const acteur = await requireSession();
  const { type, praticien, depuis, centre } = criteresSchema.parse(await searchParams);
  const { centreId } = await centreDeLAgenda(centre);
  if (centreId === null) {
    return <EtatVide titre="Aucun centre">Aucun centre n’est accessible.</EtatVide>;
  }
  const jour = depuis ?? aujourdhui();
  const [types, { praticiens }] = await Promise.all([
    listerTypesRdv(acteur),
    ouIntrouvable(lireAgenda(acteur, centreId, jour, jour)),
  ]);
  const actifs = types.filter((t) => t.actif);
  const creneaux = type
    ? await ouIntrouvable(
        chercherCreneaux(acteur, {
          centreId,
          typeRdvId: type,
          praticienId: praticien ?? '',
          depuis: jour,
        }),
      )
    : null;

  return (
    <div className="grid gap-4">
      <EntetePage titre="Prochain créneau">
        Créneaux libres sur 60 jours, disponibilités et rendez-vous pris en compte.
      </EntetePage>
      <form className="grid max-w-3xl items-end gap-3 sm:grid-cols-4">
        {centre ? <input type="hidden" name="centre" value={centre} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select id="type" name="type" defaultValue={type} required className={CLASSE_LISTE}>
            {actifs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="praticien">Praticien</Label>
          <select id="praticien" name="praticien" defaultValue={praticien} className={CLASSE_LISTE}>
            <option value="">Tous</option>
            {praticiens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="depuis">À partir du</Label>
          <Input id="depuis" name="depuis" type="date" defaultValue={jour} />
        </div>
        <Button type="submit">Chercher</Button>
      </form>
      {creneaux === null ? null : creneaux.length === 0 ? (
        <EtatVide titre="Aucun créneau">Aucun créneau libre sur cette période.</EtatVide>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Praticien</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {creneaux.map((c) => (
              <TableRow key={`${String(c.debut)}:${c.praticienId ?? ''}`}>
                <TableCell>{formaterDate(c.date)}</TableCell>
                <TableCell>{c.heure}</TableCell>
                <TableCell>{c.praticien ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={{
                        pathname: '/agenda',
                        query: {
                          vue: 'praticiens',
                          date: c.date,
                          heure: c.heure,
                          type,
                          ...(c.praticienId ? { praticien: c.praticienId } : {}),
                          ...(centre ? { centre } : {}),
                        },
                      }}
                    >
                      Réserver
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
