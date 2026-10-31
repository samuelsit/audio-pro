'use client';

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from 'react';

import { CaseACocher, ListeDeroulante, MessageFormulaire } from '@/components/formulaire';
import { Button } from '@/components/ui/button';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';

const LARGEUR = 640;
const HAUTEUR = 280;

/** Signature au doigt ou au stylet : `touch-none` empêche le geste de faire défiler la page. */
export function ZoneSignature({
  action,
  statut,
  offres,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  statut: string;
  offres: readonly { valeur: string; libelle: string }[];
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT_INITIAL);
  const toile = useRef<HTMLCanvasElement>(null);
  const trace = useRef(false);
  const [signe, setSigne] = useState(false);
  const erreursTrace = etat.erreurs?.trace;

  function position(evenement: PointerEvent<HTMLCanvasElement>): [number, number] {
    const cadre = evenement.currentTarget.getBoundingClientRect();
    return [
      ((evenement.clientX - cadre.left) * LARGEUR) / cadre.width,
      ((evenement.clientY - cadre.top) * HAUTEUR) / cadre.height,
    ];
  }

  function commencer(evenement: PointerEvent<HTMLCanvasElement>) {
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    const contexte = evenement.currentTarget.getContext('2d');
    contexte?.beginPath();
    contexte?.moveTo(...position(evenement));
    trace.current = true;
  }

  function tracer(evenement: PointerEvent<HTMLCanvasElement>) {
    if (!trace.current) {
      return;
    }
    const contexte = evenement.currentTarget.getContext('2d');
    if (contexte) {
      contexte.lineWidth = 2;
      contexte.lineCap = 'round';
      contexte.lineTo(...position(evenement));
      contexte.stroke();
      setSigne(true);
    }
  }

  function effacer() {
    toile.current?.getContext('2d')?.clearRect(0, 0, LARGEUR, HAUTEUR);
    setSigne(false);
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    toile.current?.toBlob((image) => {
      if (image) {
        donnees.set('trace', new File([image], 'signature.png', { type: 'image/png' }));
      }
      startTransition(() => envoyer(donnees));
    }, 'image/png');
  }

  return (
    <form onSubmit={soumettre} className="grid max-w-2xl gap-4">
      <MessageFormulaire etat={etat} />
      <input type="hidden" name="statutAttendu" value={statut} />
      <ListeDeroulante
        etat={etat}
        nom="offreRetenue"
        libelle="Offre choisie à l’issue de l’essai"
        vide="Choisir…"
        options={offres}
      />
      <CaseACocher
        etat={etat}
        nom="bonPourAccord"
        libelle="Bon pour accord, j’accepte les conditions du devis"
        defaut={false}
      />
      <canvas
        ref={toile}
        width={LARGEUR}
        height={HAUTEUR}
        role="img"
        aria-label="Cadre de signature"
        className="w-full touch-none rounded-lg border bg-white"
        onPointerDown={commencer}
        onPointerMove={tracer}
        onPointerUp={() => {
          trace.current = false;
        }}
      />
      {erreursTrace ? <p className="text-sm text-destructive">{erreursTrace.join(' ')}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enCours || !signe}>
          {enCours ? 'Enregistrement…' : 'Valider la signature'}
        </Button>
        <Button type="button" variant="outline" onClick={effacer}>
          Effacer
        </Button>
      </div>
    </form>
  );
}
