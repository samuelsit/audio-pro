'use client';

import {
  definitionFormulaireSchema,
  LIBELLES_MODES_SCORE,
  LIBELLES_NATURES_FORMULAIRE,
  LIBELLES_TYPES_QUESTION,
  MODES_SCORE,
  NATURES_FORMULAIRE,
  TYPES_QUESTION,
  type DefinitionFormulaire,
  type ModeScore,
  type NatureFormulaire,
  type Question,
  type Score,
  type TypeQuestion,
} from '@ha/domain';
import { useActionState, useState } from 'react';

import {
  BoutonEnvoi,
  ChampTexte,
  ListeDeroulante,
  MessageFormulaire,
} from '@/components/formulaire';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

type Section = DefinitionFormulaire['sections'][number];

const identifiant = () => `q_${crypto.randomUUID().slice(0, 8)}`;

const questionVide = (): Question => ({
  id: identifiant(),
  libelle: '',
  type: 'TEXTE',
  obligatoire: false,
});

const sectionVide = (): Section => ({ titre: '', questions: [questionVide()] });

const DEFINITION_VIDE: DefinitionFormulaire = { sections: [sectionVide()], scores: [] };

/** Changer de type garde l'identifiant et le libellé, et donne ses valeurs par défaut au nouveau. */
function avecType(question: Question, type: TypeQuestion): Question {
  const { id, libelle, obligatoire } = question;
  const commun = { id, libelle, obligatoire };
  switch (type) {
    case 'TEXTE':
    case 'OUI_NON':
      return { ...commun, type };
    case 'CHOIX':
      return { ...commun, type, options: ['', ''] };
    case 'ECHELLE':
      return { ...commun, type, min: 0, max: 10 };
  }
}

const CLASSE_LISTE =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function EditeurQuestion({
  question,
  surChangement,
  surRetrait,
}: {
  question: Question;
  surChangement: (question: Question) => void;
  surRetrait: () => void;
}) {
  return (
    <div className="grid gap-2 border-b pb-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          Question
          <Input
            value={question.libelle}
            onChange={(e) => surChangement({ ...question, libelle: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Type
          <select
            className={CLASSE_LISTE}
            value={question.type}
            onChange={(e) => surChangement(avecType(question, e.target.value as TypeQuestion))}
          >
            {TYPES_QUESTION.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_TYPES_QUESTION[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={question.obligatoire}
            onChange={(e) => surChangement({ ...question, obligatoire: e.target.checked })}
          />
          Obligatoire
        </label>
        <Button type="button" variant="outline" onClick={surRetrait}>
          Retirer
        </Button>
      </div>
      {question.type === 'CHOIX' ? (
        <label className="grid gap-1 text-sm">
          Options, une par ligne
          <textarea
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={question.options.join('\n')}
            onChange={(e) => surChangement({ ...question, options: e.target.value.split('\n') })}
          />
        </label>
      ) : null}
      {question.type === 'ECHELLE' ? (
        <div className="flex gap-3">
          <label className="grid gap-1 text-sm">
            Minimum
            <Input
              inputMode="numeric"
              className="w-24"
              value={String(question.min)}
              onChange={(e) => surChangement({ ...question, min: Number(e.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Maximum
            <Input
              inputMode="numeric"
              className="w-24"
              value={String(question.max)}
              onChange={(e) => surChangement({ ...question, max: Number(e.target.value) })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function EditeurScore({
  score,
  echelles,
  surChangement,
  surRetrait,
}: {
  score: Score;
  echelles: readonly Question[];
  surChangement: (score: Score) => void;
  surRetrait: () => void;
}) {
  const basculer = (questionId: string, retenue: boolean) =>
    surChangement({
      ...score,
      questions: retenue
        ? [...score.questions, { questionId, inverse: false }]
        : score.questions.filter((q) => q.questionId !== questionId),
    });
  const inverser = (questionId: string, inverse: boolean) =>
    surChangement({
      ...score,
      questions: score.questions.map((q) => (q.questionId === questionId ? { ...q, inverse } : q)),
    });
  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Score</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          Libellé
          <Input
            value={score.libelle}
            onChange={(e) => surChangement({ ...score, libelle: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Calcul
          <select
            className={CLASSE_LISTE}
            value={score.mode}
            onChange={(e) => surChangement({ ...score, mode: e.target.value as ModeScore })}
          >
            {MODES_SCORE.map((m) => (
              <option key={m} value={m}>
                {LIBELLES_MODES_SCORE[m]}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={surRetrait}>
          Retirer le score
        </Button>
      </div>
      <ul className="grid gap-1 text-sm">
        {echelles.map((q) => {
          const retenue = score.questions.find((s) => s.questionId === q.id);
          return (
            <li key={q.id} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={retenue !== undefined}
                  onChange={(e) => basculer(q.id, e.target.checked)}
                />
                {q.libelle || 'Question sans libellé'}
              </label>
              {retenue ? (
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={retenue.inverse}
                    onChange={(e) => inverser(q.id, e.target.checked)}
                  />
                  Échelle inversée
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function EditeurModele({
  action,
  modele,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  modele: {
    readonly nom: string;
    readonly nature: NatureFormulaire;
    readonly definition: DefinitionFormulaire;
  } | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [definition, setDefinition] = useState(modele?.definition ?? DEFINITION_VIDE);
  const verification = definitionFormulaireSchema.safeParse(definition);
  const erreursServeur = etat.erreurs?.definition ?? [];
  const echelles = definition.sections.flatMap((s) =>
    s.questions.filter((q) => q.type === 'ECHELLE'),
  );

  const changerSection = (indice: number, section: Section) =>
    setDefinition({
      ...definition,
      sections: definition.sections.map((s, i) => (i === indice ? section : s)),
    });

  return (
    <form action={envoyer} className="grid max-w-4xl gap-6">
      <MessageFormulaire etat={etat} />
      {erreursServeur.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreursServeur.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampTexte etat={etat} nom="nom" libelle="Nom" defaut={modele?.nom} requis />
        {modele ? (
          <input type="hidden" name="nature" value={modele.nature} />
        ) : (
          <ListeDeroulante
            etat={etat}
            nom="nature"
            libelle="Nature"
            vide="Choisir…"
            options={NATURES_FORMULAIRE.map((n) => ({
              valeur: n,
              libelle: LIBELLES_NATURES_FORMULAIRE[n],
            }))}
          />
        )}
      </div>
      {definition.sections.map((section, s) => (
        <fieldset key={s} className="grid gap-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Section {s + 1}</legend>
          <div className="flex items-end gap-3">
            <label className="grid flex-1 gap-1 text-sm">
              Titre
              <Input
                value={section.titre}
                onChange={(e) => changerSection(s, { ...section, titre: e.target.value })}
              />
            </label>
            {definition.sections.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDefinition({
                    ...definition,
                    sections: definition.sections.filter((_, i) => i !== s),
                  })
                }
              >
                Retirer la section
              </Button>
            ) : null}
          </div>
          {section.questions.map((question) => (
            <EditeurQuestion
              key={question.id}
              question={question}
              surChangement={(nouvelle) =>
                changerSection(s, {
                  ...section,
                  questions: section.questions.map((q) => (q.id === question.id ? nouvelle : q)),
                })
              }
              surRetrait={() =>
                changerSection(s, {
                  ...section,
                  questions: section.questions.filter((q) => q.id !== question.id),
                })
              }
            />
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                changerSection(s, {
                  ...section,
                  questions: [...section.questions, questionVide()],
                })
              }
            >
              Ajouter une question
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setDefinition({ ...definition, sections: [...definition.sections, sectionVide()] })
          }
        >
          Ajouter une section
        </Button>
      </div>
      <section className="grid gap-3" aria-label="Scores">
        <h2 className="text-lg font-semibold">Scores</h2>
        {definition.scores.map((score) => (
          <EditeurScore
            key={score.id}
            score={score}
            echelles={echelles}
            surChangement={(nouveau) =>
              setDefinition({
                ...definition,
                scores: definition.scores.map((c) => (c.id === score.id ? nouveau : c)),
              })
            }
            surRetrait={() =>
              setDefinition({
                ...definition,
                scores: definition.scores.filter((c) => c.id !== score.id),
              })
            }
          />
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={echelles.length === 0}
            onClick={() =>
              setDefinition({
                ...definition,
                scores: [
                  ...definition.scores,
                  { id: identifiant(), libelle: '', mode: 'SOMME', questions: [] },
                ],
              })
            }
          >
            Ajouter un score
          </Button>
        </div>
      </section>
      {verification.success ? null : (
        <Alert role="status">
          <AlertDescription>
            {[...new Set(verification.error.issues.map((i) => i.message))].join(' ')}
          </AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />
      <div>
        <BoutonEnvoi>Enregistrer</BoutonEnvoi>
      </div>
    </form>
  );
}
