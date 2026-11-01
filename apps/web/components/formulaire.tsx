'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EtatFormulaire } from '@/lib/formulaire';
import { cn } from '@/lib/utils';

// Champs non contrôlés : la saisie renvoyée par l'action (`etat.valeurs`) sert de valeur par défaut,
// pour survivre à la réinitialisation automatique du formulaire par React après l'action.

function valeurTexte(etat: EtatFormulaire, nom: string, defaut: string | null | undefined): string {
  const renvoyee = etat.valeurs?.[nom];
  return typeof renvoyee === 'string' ? renvoyee : (defaut ?? '');
}

function Erreurs({ id, messages }: { id: string; messages: readonly string[] | undefined }) {
  if (!messages?.length) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-destructive">
      {messages.join(' ')}
    </p>
  );
}

export function ChampTexte({
  etat,
  nom,
  libelle,
  defaut,
  type = 'text',
  requis = false,
  mentionFacultatif = true,
  autoComplete,
  aide,
  inputMode,
  suggestions,
  id = nom,
}: {
  etat: EtatFormulaire;
  nom: string;
  libelle: string;
  defaut?: string | null | undefined;
  type?: 'text' | 'email' | 'tel' | 'password' | 'date' | 'time' | undefined;
  requis?: boolean | undefined;
  /** « (facultatif) » après le libellé d'un champ non requis ; inutile dans un formulaire de filtres. */
  mentionFacultatif?: boolean | undefined;
  autoComplete?: string | undefined;
  aide?: string | undefined;
  inputMode?: 'numeric' | 'text' | undefined;
  /** Identifiant d'un `<datalist>` : aide à la saisie, sans restreindre ce qu'on peut taper. */
  suggestions?: string | undefined;
  /** À fournir quand un même formulaire se répète sur la page : `nom` y serait dupliqué. */
  id?: string | undefined;
}) {
  const erreurs = etat.erreurs?.[nom];
  const idErreur = `${id}-erreur`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {libelle}
        {requis || !mentionFacultatif ? null : (
          <span className="font-normal text-muted-foreground"> (facultatif)</span>
        )}
      </Label>
      <Input
        id={id}
        name={nom}
        type={type}
        required={requis}
        autoComplete={autoComplete}
        inputMode={inputMode}
        list={suggestions}
        defaultValue={type === 'password' ? undefined : valeurTexte(etat, nom, defaut)}
        aria-invalid={erreurs ? true : undefined}
        aria-describedby={erreurs ? idErreur : undefined}
      />
      {aide ? <p className="text-sm text-muted-foreground">{aide}</p> : null}
      <Erreurs id={idErreur} messages={erreurs} />
    </div>
  );
}

export function ListeDeroulante({
  etat,
  nom,
  libelle,
  options,
  defaut,
  vide,
  requis = true,
  surChangement,
  id = nom,
}: {
  etat: EtatFormulaire;
  nom: string;
  libelle: string;
  options: readonly { valeur: string; libelle: string }[];
  defaut?: string | undefined;
  /** Libellé de l'option vide (ex. « Tous », « Choisir… »). */
  vide?: string | undefined;
  requis?: boolean | undefined;
  /** Pour un formulaire dont d'autres champs dépendent de ce choix. */
  surChangement?: ((valeur: string) => void) | undefined;
  /** À fournir quand un même formulaire se répète sur la page : `nom` y serait dupliqué. */
  id?: string | undefined;
}) {
  const erreurs = etat.erreurs?.[nom];
  const valeur = valeurTexte(etat, nom, defaut);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{libelle}</Label>
      <select
        // React n'applique le defaultValue d'un <select> qu'au montage : on le remonte quand il change.
        key={valeur}
        id={id}
        name={nom}
        required={requis}
        defaultValue={valeur}
        onChange={surChangement ? (e) => surChangement(e.target.value) : undefined}
        aria-invalid={erreurs ? true : undefined}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
      >
        {vide ? <option value="">{vide}</option> : null}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      <Erreurs id={`${nom}-erreur`} messages={erreurs} />
    </div>
  );
}

export function ZoneDeTexte({
  etat,
  nom,
  libelle,
  defaut,
  requis = false,
  lignes = 4,
  aide,
  id = nom,
}: {
  etat: EtatFormulaire;
  nom: string;
  libelle: string;
  defaut?: string | null | undefined;
  requis?: boolean | undefined;
  lignes?: number | undefined;
  aide?: string | undefined;
  /** À fournir quand un même formulaire se répète sur la page : `nom` y serait dupliqué. */
  id?: string | undefined;
}) {
  const erreurs = etat.erreurs?.[nom];
  const idErreur = `${id}-erreur`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {libelle}
        {requis ? null : <span className="font-normal text-muted-foreground"> (facultatif)</span>}
      </Label>
      <textarea
        id={id}
        name={nom}
        rows={lignes}
        required={requis}
        defaultValue={valeurTexte(etat, nom, defaut)}
        aria-invalid={erreurs ? true : undefined}
        aria-describedby={erreurs ? idErreur : undefined}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      {aide ? <p className="text-sm text-muted-foreground">{aide}</p> : null}
      <Erreurs id={idErreur} messages={erreurs} />
    </div>
  );
}

export function CaseACocher({
  etat,
  nom,
  libelle,
  defaut,
}: {
  etat: EtatFormulaire;
  nom: string;
  libelle: string;
  defaut: boolean;
}) {
  const renvoyee = etat.valeurs?.[nom];
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={nom}
        defaultChecked={typeof renvoyee === 'boolean' ? renvoyee : defaut}
        className="size-4 accent-primary"
      />
      {libelle}
    </label>
  );
}

export function CasesCentres({
  etat,
  nom = 'centreIds',
  legende,
  centres,
  coches,
  aide,
}: {
  etat: EtatFormulaire;
  nom?: string | undefined;
  legende: string;
  centres: readonly { id: string; nom: string; actif?: boolean }[];
  coches: readonly string[];
  aide?: string | undefined;
}) {
  const renvoyees = etat.valeurs?.[nom];
  const selection = Array.isArray(renvoyees) ? renvoyees : coches;
  const erreurs = etat.erreurs?.[nom];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legende}</legend>
      {aide ? <p className="text-sm text-muted-foreground">{aide}</p> : null}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {centres.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={nom}
              value={c.id}
              defaultChecked={selection.includes(c.id)}
              className="size-4 accent-primary"
            />
            {c.nom}
            {c.actif === false ? <span className="text-muted-foreground">(inactif)</span> : null}
          </label>
        ))}
      </div>
      <Erreurs id={`${nom}-erreur`} messages={erreurs} />
    </fieldset>
  );
}

export function MessageFormulaire({ etat }: { etat: EtatFormulaire }) {
  if (etat.message) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{etat.message}</AlertDescription>
      </Alert>
    );
  }
  if (etat.succes) {
    return (
      <Alert role="status">
        <AlertDescription>{etat.succes}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function BoutonEnvoi({
  children,
  className,
  variant,
  nom,
  valeur,
  enCours = 'Enregistrement…',
}: {
  children: ReactNode;
  className?: string | undefined;
  variant?: 'default' | 'outline' | 'destructive' | undefined;
  /** Nom et valeur envoyés avec le formulaire quand c'est ce bouton qui le soumet. */
  nom?: string | undefined;
  valeur?: string | undefined;
  /** Libellé affiché pendant l'envoi. */
  enCours?: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn(className)}
      variant={variant}
      name={nom}
      value={valeur}
    >
      {pending ? enCours : children}
    </Button>
  );
}
