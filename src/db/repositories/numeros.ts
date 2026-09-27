/**
 * Souches des documents émis.
 *
 * Une **souche** est ce qui reste d'un document numéroté quand le document
 * lui-même a disparu : son numéro, et la date à laquelle il a été consommé. Un
 * carnet à souches fonctionne ainsi — on détache la feuille, la souche demeure,
 * et le numéro ne resservira pas.
 *
 * Cette table n'existe que pour une promesse : **un numéro attribué n'est jamais
 * réattribué**. Le rang suivant se calcule sur le rang maximal des documents
 * présents ; supprimer le dernier document d'une année fait donc retomber ce
 * maximum. Sans souche, la quittance suivante reprendrait le numéro de celle
 * qu'on vient de retirer — et si celle-ci a déjà été remise au locataire, deux
 * quittances différentes porteraient le même numéro.
 *
 * Elle ne peut pas être une colonne de `documents` : `documents.logement_id` est
 * `ON DELETE CASCADE`, donc supprimer un logement effacerait ses souches et
 * libérerait ses numéros. Une souche ne dépend donc de rien, et n'a aucune clé
 * étrangère.
 */

import { executer, lireToutes } from '../database';
import { maintenantISO } from '../ids';
import { rangDeNumero } from '../../domain/numbering';
import type { TypeDocument } from '../../domain/types';

interface LigneSouche {
  numero: string;
  type: string;
  annee: number;
  consomme_le: string;
}

export interface Souche {
  numero: string;
  type: TypeDocument;
  annee: number;
  consommeLe: string;
}

function versDomaine(l: LigneSouche): Souche {
  return {
    numero: l.numero,
    type: l.type as TypeDocument,
    annee: l.annee,
    consommeLe: l.consomme_le,
  };
}

/**
 * Les rangs déjà consommés pour un type et une année.
 *
 * Le rang n'est **pas** stocké : il se relit du numéro. Deux représentations du
 * même fait finiraient par diverger, et une souche dont le numéro dit 7 quand la
 * colonne dit 5 rendrait la numérotation imprévisible. Un numéro illisible — une
 * sauvegarde abîmée — est ignoré plutôt que de faire échouer l'émission : la
 * conséquence est un rang peut-être repris, jamais une quittance impossible à
 * produire.
 */
export async function rangsConsommes(
  type: TypeDocument,
  annee: number,
): Promise<number[]> {
  const lignes = await lireToutes<{ numero: string }>(
    'SELECT numero FROM numeros_consommes WHERE type = ? AND annee = ?',
    [type, annee],
  );

  const rangs: number[] = [];
  for (const ligne of lignes) {
    const rang = rangDeNumero(ligne.numero, type, annee);
    if (rang !== null) rangs.push(rang);
  }
  return rangs;
}

/**
 * Consomme un numéro : il ne sera plus jamais attribué.
 *
 * `ON CONFLICT DO NOTHING` plutôt qu'une erreur : consommer deux fois le même
 * numéro n'est pas un état à refuser, c'est un état **déjà satisfait**. La
 * garantie qui compte — le numéro est pris — tient dans les deux cas. Refuser
 * ferait échouer une émission pour une raison que le bailleur ne pourrait ni
 * comprendre ni corriger.
 *
 * La contrainte de clé primaire reste le dernier mot : elle rend la double
 * consommation impossible au niveau de la base, et non par la seule prudence de
 * l'appelant.
 */
export async function consommerNumero(entree: {
  numero: string;
  type: TypeDocument;
  annee: number;
}): Promise<void> {
  await executer(
    `INSERT INTO numeros_consommes (numero, type, annee, consomme_le)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(numero) DO NOTHING`,
    [entree.numero, entree.type, entree.annee, maintenantISO()],
  );
}

/** Toutes les souches, de la plus récente à la plus ancienne. */
export async function toutesLesSouches(): Promise<Souche[]> {
  const lignes = await lireToutes<LigneSouche>(
    'SELECT * FROM numeros_consommes ORDER BY consomme_le DESC, numero DESC',
  );
  return lignes.map(versDomaine);
}
