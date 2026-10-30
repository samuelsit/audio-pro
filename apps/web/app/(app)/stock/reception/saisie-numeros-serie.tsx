'use client';

import { normaliserNumeroSerie } from '@ha/domain';
import { X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Saisie à la suite. Une douchette tape le numéro puis Entrée (ou Tabulation) : la touche ajoute le numéro
 * à la liste sans soumettre le formulaire, et le champ reste prêt pour le scan suivant. Chaque numéro part
 * dans un champ caché : la liste survit à un refus du serveur, seules les lignes en cause sont à retirer.
 */
export function SaisieNumerosSerie({ erreurs }: { erreurs: readonly string[] | undefined }) {
  const [numeros, setNumeros] = useState<readonly string[]>([]);
  const [saisie, setSaisie] = useState('');
  const [alerte, setAlerte] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  function ajouter(): void {
    const numero = normaliserNumeroSerie(saisie);
    if (numero === '') {
      return;
    }
    setSaisie('');
    if (numeros.includes(numero)) {
      setAlerte(`${numero} est déjà dans la liste.`);
      return;
    }
    setAlerte(null);
    setNumeros([numero, ...numeros]);
  }

  function auClavier(evenement: KeyboardEvent<HTMLInputElement>): void {
    if (evenement.key === 'Enter' || (evenement.key === 'Tab' && saisie !== '')) {
      evenement.preventDefault();
      ajouter();
      champ.current?.focus();
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="scan">Numéros de série ({numeros.length})</Label>
      <Input
        ref={champ}
        id="scan"
        autoComplete="off"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={auClavier}
        onBlur={ajouter}
        aria-describedby="scan-aide"
      />
      <p id="scan-aide" className="text-sm text-muted-foreground">
        Scannez, ou tapez le numéro puis Entrée.
      </p>
      {alerte ? (
        <p role="status" className="text-sm text-destructive">
          {alerte}
        </p>
      ) : null}
      {erreurs?.length ? (
        <ul className="text-sm text-destructive">
          {erreurs.map((erreur) => (
            <li key={erreur}>{erreur}</li>
          ))}
        </ul>
      ) : null}
      {numeros.length > 0 ? (
        <ul aria-label="Numéros saisis" className="grid gap-1 rounded-md border p-2">
          {numeros.map((numero) => (
            <li key={numero} className="flex items-center justify-between gap-2">
              <input type="hidden" name="numerosSerie" value={numero} />
              <span className="font-mono text-sm">{numero}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Retirer ${numero}`}
                onClick={() => setNumeros(numeros.filter((n) => n !== numero))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
