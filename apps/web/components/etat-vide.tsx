import { Construction } from 'lucide-react';
import type { ReactNode } from 'react';

/** Zone affichée quand il n'y a rien à montrer (liste vide, écran pas encore disponible). */
export function EtatVide({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <Construction className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{titre}</p>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
