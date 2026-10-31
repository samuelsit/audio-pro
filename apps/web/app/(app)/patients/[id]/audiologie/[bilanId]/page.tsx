import {
  formaterScore,
  LIBELLES_ETATS_CONDUIT,
  LIBELLES_ETATS_TYMPAN,
  LIBELLES_OREILLES,
  LIBELLES_TYPES_MESURE,
  libelleReponse,
  rendreVocaleSvg,
} from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EtatVide } from '@/components/etat-vide';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ReponseLue } from '@/server/services/audiologie';

import { chargerBilan } from '../charger';
import { BadgeSource, BlocTonale, EnteteBilan, Graphique } from '../composants';

export const metadata: Metadata = { title: 'Bilan audiologique – HA-Gestion' };

function Reponses({ reponse }: { reponse: ReponseLue }) {
  const questions = reponse.modele.definition.sections
    .flatMap((s) => s.questions)
    .filter((q) => reponse.reponses[q.id] !== undefined);
  return (
    <div className="grid gap-2">
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {questions.map((q) => (
          <div key={q.id} className="flex justify-between gap-3 border-b py-1">
            <dt className="text-muted-foreground">{q.libelle}</dt>
            <dd className="text-right">{libelleReponse(q, reponse.reponses)}</dd>
          </div>
        ))}
      </dl>
      {reponse.scores.map((s) => (
        <p key={s.id} className="text-sm">
          <strong>{s.libelle}</strong> : {formaterScore(s.valeur)}
        </p>
      ))}
    </div>
  );
}

export default async function PageBilan({
  params,
}: PageProps<'/patients/[id]/audiologie/[bilanId]'>) {
  const { id, bilanId } = await params;
  const { bilan } = await chargerBilan(id, bilanId);
  const racine = `/patients/${id}/audiologie/${bilanId}`;
  const vide =
    !bilan.tonale &&
    !bilan.anamnese &&
    bilan.vocales.length === 0 &&
    bilan.otoscopies.length === 0 &&
    bilan.questionnaires.length === 0;

  return (
    <div className="grid gap-6">
      <div>
        <Button asChild variant="outline">
          <Link href={`/patients/${id}/dossiers/nouveau?bilan=${bilanId}`}>Créer un dossier</Link>
        </Button>
      </div>
      <EnteteBilan bilan={bilan} courant="bilan">
        {vide ? (
          <EtatVide titre="Bilan à compléter">
            Commencez par l’<Link href={`${racine}/anamnese`}>anamnèse</Link> ou l’
            <Link href={`${racine}/tonale`}>audiogramme</Link>.
          </EtatVide>
        ) : null}
        {bilan.anamnese ? (
          <section className="grid gap-2" aria-label="Anamnèse">
            <h2 className="text-lg font-semibold">Anamnèse</h2>
            <Reponses reponse={bilan.anamnese} />
          </section>
        ) : null}
        {bilan.otoscopies.length > 0 ? (
          <section className="grid gap-2" aria-label="Otoscopie">
            <h2 className="text-lg font-semibold">Otoscopie</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oreille</TableHead>
                  <TableHead>Conduit</TableHead>
                  <TableHead>Tympan</TableHead>
                  <TableHead>Observation</TableHead>
                  <TableHead>Photo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bilan.otoscopies.map((o) => (
                  <TableRow key={o.oreille}>
                    <TableCell>{LIBELLES_OREILLES[o.oreille]}</TableCell>
                    <TableCell>{LIBELLES_ETATS_CONDUIT[o.constat.conduit]}</TableCell>
                    <TableCell>{LIBELLES_ETATS_TYMPAN[o.constat.tympan]}</TableCell>
                    <TableCell className="whitespace-normal">
                      {o.constat.observation ?? '—'}
                    </TableCell>
                    <TableCell>
                      {o.photo ? (
                        <a href={`${racine}/otoscopie/${o.oreille}/photo`}>Voir la photo</a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}
        {bilan.tonale ? (
          <section className="grid gap-2" aria-label="Audiométrie tonale">
            <h2 className="text-lg font-semibold">{LIBELLES_TYPES_MESURE.TONALE}</h2>
            <BlocTonale tonale={bilan.tonale} />
          </section>
        ) : null}
        {bilan.vocales.map(({ id: mesureId, vocale, source }) => (
          <section
            key={mesureId}
            className="grid gap-2"
            aria-label={`Audiométrie vocale, ${vocale.contexte === 'CALME' ? 'calme' : 'bruit'}`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {vocale.contexte === 'CALME'
                  ? LIBELLES_TYPES_MESURE.VOCALE_CALME
                  : LIBELLES_TYPES_MESURE.VOCALE_BRUIT}
              </h2>
              <BadgeSource source={source} />
            </div>
            <Graphique svg={rendreVocaleSvg(vocale)} />
          </section>
        ))}
        {bilan.questionnaires.map((q) => (
          <section key={q.id} className="grid gap-2" aria-label={q.modele.nom}>
            <h2 className="text-lg font-semibold">{q.modele.nom}</h2>
            <Reponses reponse={q} />
          </section>
        ))}
      </EnteteBilan>
    </div>
  );
}
