'use client';

import { useActionState } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ETAT_INITIAL } from '@/lib/formulaire';
import { formaterDate } from '@/lib/format';
import type { GarantieAffichee } from '@/server/services/garanties';

import { enregistrerAssuranceAction } from '../../actions';

/** La date de fin n'est pas modifiable : seule l'assurance se saisit, sur un document à part (devis p. 2 § 4). */
export function BlocGarantie({
  appareilId,
  garantie,
}: {
  appareilId: string;
  garantie: GarantieAffichee;
}) {
  const [etat, envoyer] = useActionState(
    enregistrerAssuranceAction.bind(null, appareilId),
    ETAT_INITIAL,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Garantie
          <Badge variant={garantie.enCours ? 'default' : 'outline'}>
            {garantie.enCours ? 'En cours' : 'Terminée'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm">
          Du {formaterDate(garantie.dateDebut)} au {formaterDate(garantie.dateFin)}
          {garantie.reprise ? ', reprise de l’appareil échangé' : ''}.
        </p>
        <form action={envoyer} className="grid max-w-2xl gap-4">
          <MessageFormulaire etat={etat} />
          <div className="grid gap-4 sm:grid-cols-3">
            <ChampTexte
              etat={etat}
              nom="assureur"
              libelle="Assureur (perte, vol, casse)"
              defaut={garantie.assureur}
            />
            <ChampTexte etat={etat} nom="contrat" libelle="Contrat" defaut={garantie.contrat} />
            <ChampTexte
              etat={etat}
              nom="assuranceFin"
              libelle="Fin de l’assurance"
              type="date"
              defaut={garantie.assuranceFin}
            />
          </div>
          <div>
            <BoutonEnvoi>Enregistrer l’assurance</BoutonEnvoi>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
