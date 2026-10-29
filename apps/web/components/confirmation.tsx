'use client';

import { useRef, useTransition } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * Bouton qui demande confirmation avant d'agir. Deux usages :
 * - avec `action` : appelle la server action après confirmation ;
 * - sans `action`, placé dans un formulaire : le soumet après confirmation (validation HTML comprise).
 */
export function BoutonConfirmation({
  libelle,
  titre,
  description,
  confirmer = 'Confirmer',
  variant = 'destructive',
  action,
}: {
  libelle: string;
  titre: string;
  description: string;
  confirmer?: string;
  variant?: 'default' | 'outline' | 'destructive';
  action?: () => Promise<void>;
}) {
  const declencheur = useRef<HTMLButtonElement>(null);
  const [enCours, demarrer] = useTransition();

  function valider() {
    if (action) {
      demarrer(action);
    } else {
      declencheur.current?.form?.requestSubmit();
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button ref={declencheur} type="button" variant={variant} disabled={enCours}>
          {enCours ? 'En cours…' : libelle}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={valider}>{confirmer}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
