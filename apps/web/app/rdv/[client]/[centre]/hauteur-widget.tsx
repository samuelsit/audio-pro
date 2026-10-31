'use client';

import { useEffect } from 'react';

/** Dans une iframe, annonce la hauteur du contenu à `rdv-widget.js`, qui ajuste le cadre. */
export function HauteurWidget() {
  useEffect(() => {
    const annoncer = () => {
      window.parent.postMessage(
        { type: 'ha-rdv-hauteur', hauteur: document.documentElement.scrollHeight },
        '*',
      );
    };
    const observateur = new ResizeObserver(annoncer);
    observateur.observe(document.body);
    annoncer();
    return () => {
      observateur.disconnect();
    };
  }, []);
  return null;
}
