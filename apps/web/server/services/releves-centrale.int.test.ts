import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import {
  deposerFacture,
  modifierFactureFournisseur,
  validerFactureFournisseur,
} from './factures-fournisseurs';
import { creerCentrale, creerFournisseur } from './fournisseurs';
import {
  importerReleve,
  listerReleves,
  obtenirReleve,
  previsualiserReleve,
  repointerReleve,
} from './releves-centrale';

let d: JeuDeDonnees;
let centraleAchatId: string;
let fournisseurId: string;
let compteur = 0;

const ENTETE = 'numero_facture;fournisseur;date;montant_ttc';

async function factureValidee(numero: string, ttc = '12,00', date = '2030-01-07') {
  const { admin } = d.acteurs;
  compteur += 1;
  const id = await deposerFacture(admin, Buffer.from(`%PDF-1.7 ${String(compteur)}`));
  await modifierFactureFournisseur(admin, id, {
    fournisseurId,
    centreId: d.centres.a.id,
    numero,
    dateFacture: date,
    montantHt: '10,00',
    montantTva: '2,00',
    montantTtc: ttc,
    lignes: [{ designation: 'Ligne', quantite: '1', prixUnitaireCentimes: '10,00' }],
  });
  await validerFactureFournisseur(admin, id);
  return id;
}

const releve = (csv: string, mois = '2030-01') => ({ centraleAchatId, mois, csv });

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  const { admin } = d.acteurs;
  centraleAchatId = await creerCentrale(admin, { nom: 'Centrale fictive', actif: true });
  fournisseurId = await creerFournisseur(admin, {
    type: 'FOURNISSEUR',
    nom: 'Acoustia',
    centraleAchatId,
    actif: true,
  });
});

describe('relevé de centrale', () => {
  it('prévisualise sans rien écrire', async () => {
    const { admin } = d.acteurs;
    const { lignes, erreurs } = await previsualiserReleve(
      admin,
      releve(`${ENTETE}\nFA-1;Acoustia;2030-01-07;12,00`),
    );
    expect(erreurs).toEqual([]);
    expect(lignes[0]).toMatchObject({ etat: 'MANQUANTE', numeroFacture: 'FA-1' });
    expect(await prisma().releveCentrale.count()).toBe(0);
  });

  it('pointe les factures, signale un montant différent, une absence, et ce qui manque au relevé', async () => {
    const { admin } = d.acteurs;
    const fa1 = await factureValidee('FA-1');
    await factureValidee('FA-2');
    const horsReleve = await factureValidee('FA-3');
    await factureValidee('FA-4', '12,00', '2030-02-03');

    const id = await importerReleve(
      admin,
      releve(
        [
          ENTETE,
          'FA-1;Acoustia;2030-01-07;12,00',
          'FA-2;Acoustia;2030-01-07;99,00',
          'FA-9;Acoustia;2030-01-07;12,00',
        ].join('\n'),
      ),
      Buffer.from('%PDF-1.7 releve'),
    );

    const vue = await obtenirReleve(admin, id);
    expect(vue).toMatchObject({ lignes: 3, ecarts: 2, aDocument: true });
    expect(vue.detail.map((l) => l.etat)).toEqual(['POINTEE', 'MONTANT_DIFFERENT', 'MANQUANTE']);
    expect(vue.detail[0]?.factureFournisseurId).toBe(fa1);
    expect(vue.horsReleve.map((f) => f.id)).toEqual([horsReleve]);
    expect((await listerReleves(admin))[0]).toMatchObject({ mois: '2030-01', ecarts: 2 });
  });

  it('une facture validée après l’import trouve sa ligne au nouveau pointage', async () => {
    const { admin } = d.acteurs;
    const id = await importerReleve(
      admin,
      releve(`${ENTETE}\nFA-1;Acoustia;2030-01-07;12,00`),
      null,
    );
    const facture = await factureValidee('FA-1');

    expect(await repointerReleve(admin, id)).toBe(1);
    expect((await obtenirReleve(admin, id)).detail[0]).toMatchObject({
      etat: 'POINTEE',
      factureFournisseurId: facture,
    });
    expect(await repointerReleve(admin, id)).toBe(0);
  });

  it('une facture d’un fournisseur hors centrale ne se pointe pas', async () => {
    const { admin } = d.acteurs;
    fournisseurId = await creerFournisseur(admin, {
      type: 'FOURNISSEUR',
      nom: 'Indépendant',
      actif: true,
    });
    await factureValidee('FA-1');
    const { lignes } = await previsualiserReleve(
      admin,
      releve(`${ENTETE}\nFA-1;Indépendant;2030-01-07;12,00`),
    );
    expect(lignes[0]?.etat).toBe('MANQUANTE');
  });

  it('refuse tout l’import si une ligne est fausse, et un second relevé du mois', async () => {
    const { admin } = d.acteurs;
    const juste = `${ENTETE}\nFA-1;Acoustia;2030-01-07;12,00`;
    await expect(
      importerReleve(admin, releve(`${juste}\nFA-2;Acoustia;2030-01-07;abc`), null),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(importerReleve(admin, releve(ENTETE), null)).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await prisma().releveCentrale.count()).toBe(0);

    await importerReleve(admin, releve(juste), null);
    await expect(importerReleve(admin, releve(juste), null)).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('refuse un PDF invalide ou une centrale inconnue, et réserve tout à l’administrateur', async () => {
    const { admin, assistantA } = d.acteurs;
    const juste = `${ENTETE}\nFA-1;Acoustia;2030-01-07;12,00`;
    await expect(
      importerReleve(admin, releve(juste), Buffer.from('<html>')),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      previsualiserReleve(admin, {
        ...releve(juste),
        centraleAchatId: '019a8000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(previsualiserReleve(assistantA, releve(juste))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(listerReleves(assistantA)).rejects.toBeInstanceOf(AccesRefuseError);
  });
});
