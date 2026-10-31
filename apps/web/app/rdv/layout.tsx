import type { ReactNode } from 'react';

/** Espace public du patient : texte large, zones de clic généreuses, le public est souvent âgé. */
export default function LayoutRdv({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-base">{children}</div>;
}
