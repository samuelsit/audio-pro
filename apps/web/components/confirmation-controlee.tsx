'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Confirmation ouverte par le code, après une réponse du serveur, et non par un bouton. */
export function ConfirmationControlee({
  ouvert,
  titre,
  description,
  surConfirmation,
  surAnnulation,
}: {
  ouvert: boolean;
  titre: string;
  description: string;
  surConfirmation: () => void;
  surAnnulation: () => void;
}) {
  return (
    <AlertDialog
      open={ouvert}
      onOpenChange={(valeur) => {
        if (!valeur) {
          surAnnulation();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={surConfirmation}>Confirmer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
