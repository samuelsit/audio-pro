'use client';

import {
  ECOUTES_VOCALE,
  LIBELLES_ECOUTES_VOCALE,
  LIBELLES_TRANSDUCTEURS_VOCALE,
  meilleurPourcentage,
  niveauA50Pourcent,
  PLAGES_VOCALE,
  rendreVocaleSvg,
  TRANSDUCTEURS_VOCALE,
  vocaleSaisieSchema,
  type ContexteVocale,
  type EcouteVocale,
  type TransducteurVocale,
  type Vocale,
} from '@ha/domain';
import { useActionState, useId, useState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

import { Graphique } from '../../composants';

interface PointSaisi {
  readonly cle: number;
  readonly niveau: string;
  readonly pourcentage: string;
}

interface CourbeSaisie {
  readonly cle: number;
  readonly ecoute: EcouteVocale;
  readonly transducteur: TransducteurVocale;
  readonly appareille: boolean;
  readonly liste: string;
  readonly points: readonly PointSaisi[];
}

let prochaineCle = 1;
const cle = () => prochaineCle++;

const pointVide = (): PointSaisi => ({ cle: cle(), niveau: '', pourcentage: '' });

const courbeVide = (): CourbeSaisie => ({
  cle: cle(),
  ecoute: 'DROITE',
  transducteur: 'CASQUE',
  appareille: false,
  liste: '',
  points: [pointVide(), pointVide(), pointVide()],
});

function depuisVocale(vocale: Vocale | null): CourbeSaisie[] {
  if (!vocale) {
    return [courbeVide()];
  }
  return vocale.courbes.map((c) => ({
    ...c,
    cle: cle(),
    liste: c.liste ?? '',
    points: c.points.map((p) => ({
      cle: cle(),
      niveau: String(p.niveau),
      pourcentage: String(p.pourcentage),
    })),
  }));
}

/** Un texte illisible devient `NaN`, que le schéma refuse. Une ligne vide est ignorée. */
function versSaisie(contexte: ContexteVocale, typeBruit: string, courbes: readonly CourbeSaisie[]) {
  return {
    contexte,
    typeBruit: contexte === 'BRUIT' ? typeBruit : null,
    courbes: courbes.map(({ points, ...c }) => ({
      ecoute: c.ecoute,
      transducteur: c.transducteur,
      appareille: c.appareille,
      liste: c.liste,
      points: points
        .filter((p) => p.niveau.trim() !== '' || p.pourcentage.trim() !== '')
        .map((p) => ({
          niveau: Number(p.niveau.replace(',', '.')),
          pourcentage: Number(p.pourcentage.replace(',', '.')),
        })),
    })),
  };
}

const CLASSE_LISTE =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function EditeurCourbe({
  courbe,
  numero,
  contexte,
  retirable,
  surChangement,
  surRetrait,
}: {
  courbe: CourbeSaisie;
  numero: number;
  contexte: ContexteVocale;
  retirable: boolean;
  surChangement: (courbe: CourbeSaisie) => void;
  surRetrait: () => void;
}) {
  const racine = useId();
  const { axe } = PLAGES_VOCALE[contexte];
  const changerPoint = (cible: number, champ: 'niveau' | 'pourcentage', valeur: string) =>
    surChangement({
      ...courbe,
      points: courbe.points.map((p) => (p.cle === cible ? { ...p, [champ]: valeur } : p)),
    });
  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Courbe {numero}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          Écoute
          <select
            className={CLASSE_LISTE}
            value={courbe.ecoute}
            onChange={(e) => surChangement({ ...courbe, ecoute: e.target.value as EcouteVocale })}
          >
            {ECOUTES_VOCALE.map((o) => (
              <option key={o} value={o}>
                {LIBELLES_ECOUTES_VOCALE[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Mode
          <select
            className={CLASSE_LISTE}
            value={courbe.transducteur}
            onChange={(e) =>
              surChangement({
                ...courbe,
                transducteur: e.target.value as TransducteurVocale,
              })
            }
          >
            {TRANSDUCTEURS_VOCALE.map((o) => (
              <option key={o} value={o}>
                {LIBELLES_TRANSDUCTEURS_VOCALE[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={courbe.appareille}
            onChange={(e) => surChangement({ ...courbe, appareille: e.target.checked })}
          />
          Avec appareil
        </label>
        <label className="grid gap-1 text-sm">
          Liste
          <Input
            value={courbe.liste}
            onChange={(e) => surChangement({ ...courbe, liste: e.target.value })}
          />
        </label>
        {retirable ? (
          <Button type="button" variant="outline" onClick={surRetrait}>
            Retirer la courbe
          </Button>
        ) : null}
      </div>
      <table className="w-fit text-sm">
        <thead>
          <tr>
            <th scope="col" className="pr-2 text-left font-medium">
              {axe}
            </th>
            <th scope="col" className="text-left font-medium">
              Intelligibilité (%)
            </th>
          </tr>
        </thead>
        <tbody>
          {courbe.points.map((p, i) => (
            <tr key={p.cle}>
              <td className="py-0.5 pr-2">
                <Input
                  id={`${racine}-n-${String(i)}`}
                  aria-label={`Courbe ${String(numero)}, niveau ${String(i + 1)}`}
                  inputMode="numeric"
                  className="w-24"
                  value={p.niveau}
                  onChange={(e) => changerPoint(p.cle, 'niveau', e.target.value)}
                />
              </td>
              <td className="py-0.5">
                <Input
                  id={`${racine}-p-${String(i)}`}
                  aria-label={`Courbe ${String(numero)}, pourcentage ${String(i + 1)}`}
                  inputMode="numeric"
                  className="w-24"
                  value={p.pourcentage}
                  onChange={(e) => changerPoint(p.cle, 'pourcentage', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => surChangement({ ...courbe, points: [...courbe.points, pointVide()] })}
        >
          Ajouter un point
        </Button>
      </div>
    </fieldset>
  );
}

export function SaisieVocale({
  action,
  contexte,
  vocale,
  appareil,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  contexte: ContexteVocale;
  vocale: Vocale | null;
  appareil: string | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [courbes, setCourbes] = useState<readonly CourbeSaisie[]>(() => depuisVocale(vocale));
  const [typeBruit, setTypeBruit] = useState(vocale?.typeBruit ?? '');
  const saisie = versSaisie(contexte, typeBruit, courbes);
  const verification = vocaleSaisieSchema.safeParse(saisie);
  const erreursServeur = Object.values(etat.erreurs ?? {}).flat();

  return (
    <form action={envoyer} className="grid gap-4">
      <MessageFormulaire etat={etat} />
      {erreursServeur.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreursServeur.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      {contexte === 'BRUIT' ? (
        <label className="grid max-w-sm gap-1 text-sm">
          Type de bruit
          <Input value={typeBruit} onChange={(e) => setTypeBruit(e.target.value)} />
        </label>
      ) : null}
      <div className="flex flex-wrap items-start gap-6">
        <div className="grid gap-3">
          {courbes.map((courbe, i) => (
            <EditeurCourbe
              key={courbe.cle}
              courbe={courbe}
              numero={i + 1}
              contexte={contexte}
              retirable={courbes.length > 1}
              surChangement={(nouvelle) =>
                setCourbes(courbes.map((c) => (c.cle === courbe.cle ? nouvelle : c)))
              }
              surRetrait={() => setCourbes(courbes.filter((c) => c.cle !== courbe.cle))}
            />
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCourbes([...courbes, courbeVide()])}
            >
              Ajouter une courbe
            </Button>
          </div>
        </div>
        {verification.success ? (
          <div className="grid gap-2">
            <Graphique svg={rendreVocaleSvg(verification.data)} />
            <ul className="text-sm">
              {verification.data.courbes.map((c, i) => {
                const niveau = niveauA50Pourcent(c.points);
                return (
                  <li key={i}>
                    {LIBELLES_ECOUTES_VOCALE[c.ecoute]} : meilleur score{' '}
                    {String(meilleurPourcentage(c.points)).replace('.', ',')} %
                    {niveau === null ? '' : `, 50 % à ${niveau.toFixed(1).replace('.', ',')} dB`}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {verification.success ? null : (
        <Alert role="status">
          <AlertDescription>
            {[...new Set(verification.error.issues.map((i) => i.message))].join(' ')}
          </AlertDescription>
        </Alert>
      )}
      <div className="max-w-sm">
        <ChampTexte etat={etat} nom="appareil" libelle="Audiomètre" defaut={appareil} />
      </div>
      <input type="hidden" name="vocale" value={JSON.stringify(saisie)} />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
