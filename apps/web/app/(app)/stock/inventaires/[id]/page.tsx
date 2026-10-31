import { formatEuros, LIBELLES_STATUTS_INVENTAIRE } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Button } from '@/components/ui/button';
import { ouIntrouvable, perimetreCourant } from '@/server/auth/gardes';
import { obtenirInventaire, type EcartAppareil } from '@/server/services/inventaires';

import {
  cloturerInventaireAction,
  compterAccessoireAction,
  justifierEcartAction,
  pointerAppareilAction,
} from '../actions';
import {
  FormulaireCloture,
  FormulaireComptage,
  FormulaireJustification,
  FormulairePointage,
} from '../formulaires-inventaire';

export const metadata: Metadata = { title: 'Inventaire – HA-Gestion' };

export default async function PageInventaire({ params }: PageProps<'/stock/inventaires/[id]'>) {
  const { id } = await params;
  const { acteur } = await perimetreCourant();
  const inventaire = await ouIntrouvable(obtenirInventaire(acteur, id));
  const ouvert = inventaire.statut === 'EN_COURS';
  const justifiable = ouvert && inventaire.gestion;

  function ligneEcart({ numeroSerie, justification }: EcartAppareil) {
    return (
      <li key={numeroSerie} className="grid gap-1">
        <span className="font-mono">{numeroSerie}</span>
        {justifiable ? (
          <FormulaireJustification
            action={justifierEcartAction.bind(null, id, { numeroSerie })}
            libelle={`Justification de ${numeroSerie}`}
            defaut={justification}
          />
        ) : (
          <span className="text-muted-foreground">{justification ?? 'Non justifié'}</span>
        )}
      </li>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre={`Inventaire – ${inventaire.centre}`}>
          {LIBELLES_STATUTS_INVENTAIRE[inventaire.statut]}
          {ouvert
            ? ` : ${inventaire.appareilsPointes} appareil(s) pointé(s), ${inventaire.appareilsAttendus} attendu(s).`
            : '.'}
        </EntetePage>
        <Button asChild variant="outline">
          <Link href="/stock/inventaires">Tous les inventaires</Link>
        </Button>
      </div>

      {inventaire.valeur ? (
        <p>
          Valeur du stock à la clôture : {formatEuros(inventaire.valeur.valeurCentimes)}
          {inventaire.valeur.articlesSansPrix > 0
            ? `, hors ${inventaire.valeur.articlesSansPrix} article(s) sans prix d’achat.`
            : '.'}
        </p>
      ) : null}

      {ouvert ? (
        <section className="grid gap-2">
          <h2 className="font-medium">Pointer les appareils</h2>
          <FormulairePointage action={pointerAppareilAction.bind(null, id)} />
        </section>
      ) : null}

      <section className="grid gap-2">
        <h2 className="font-medium">Appareils manquants ({inventaire.manquants.length})</h2>
        <ul className="grid gap-3">{inventaire.manquants.map(ligneEcart)}</ul>
      </section>

      <section className="grid gap-2">
        <h2 className="font-medium">Appareils en excédent ({inventaire.excedents.length})</h2>
        <ul className="grid gap-3">{inventaire.excedents.map(ligneEcart)}</ul>
      </section>

      <section className="grid gap-2">
        <h2 className="font-medium">Accessoires</h2>
        <ul className="grid gap-3">
          {inventaire.accessoires.map((a) => (
            <li key={a.accessoireId} className="grid gap-1">
              <span>
                {a.accessoire} : {a.quantiteTheorique} en stock
                {a.quantiteComptee === null ? '' : `, ${a.quantiteComptee} compté(s)`}
                {a.ecart ? `, écart de ${a.ecart}` : ''}
              </span>
              {ouvert ? (
                <FormulaireComptage
                  action={compterAccessoireAction.bind(null, id, a.accessoireId)}
                  libelle={`Quantité comptée de ${a.accessoire}`}
                  defaut={a.quantiteComptee}
                />
              ) : null}
              {a.ecart && justifiable ? (
                <FormulaireJustification
                  action={justifierEcartAction.bind(null, id, { accessoireId: a.accessoireId })}
                  libelle={`Justification de ${a.accessoire}`}
                  defaut={a.justification}
                />
              ) : a.ecart ? (
                <span className="text-muted-foreground">{a.justification ?? 'Non justifié'}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {justifiable ? <FormulaireCloture action={cloturerInventaireAction.bind(null, id)} /> : null}
    </div>
  );
}
