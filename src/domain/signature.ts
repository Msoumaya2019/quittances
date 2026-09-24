/**
 * La signature d'un document, quelle que soit sa nature.
 *
 * Un bail, un état des lieux et un inventaire se signent de la même façon : un
 * tracé au doigt, un nom, une date. Décrire trois fois cette forme aurait
 * produit trois vocabulaires pour une seule réalité, et la première correction
 * apportée à l'un aurait laissé les deux autres en arrière.
 *
 * Ce module est **pur** : ni SQLite, ni React, ni système de fichiers. C'est ce
 * qui permet de l'éprouver par `node --test`, sans émulateur.
 */

export interface Signature {
  /**
   * Qui signe : `bailleur`, `mandataire`, ou l'identifiant du titulaire.
   *
   * C'est un identifiant et non un nom : deux locataires peuvent porter le même
   * nom, et confondre leurs signatures serait grave. Le nom affiché sous le
   * tracé est conservé à part, dans `nom`.
   */
  signataire: string;
  /** Nom affiché sous le tracé. */
  nom: string;
  /** Date de signature, `AAAA-MM-JJ`. */
  date: string;
  /**
   * Le tracé, sous la forme que le document insère.
   *
   * C'est une **image** — le tracé vectoriel encodé en `data:` — et non un
   * chemin SVG nu : les documents l'insèrent par une balise `img`. La
   * transformation vit dans `pdf/trace.ts`, avec la mise en page qui la
   * consomme.
   */
  trace: string;
}

/**
 * Un signataire attendu sur un document.
 *
 * Sert à vérifier qu'on n'oublie personne : un état des lieux signé du seul
 * bailleur, ou d'un seul des deux colocataires, ne constate rien pour les
 * absents. Le domaine ne devine pas qui doit signer — il reçoit la liste.
 */
export interface SignataireAttendu {
  /** Identifiant, tel qu'il apparaîtra dans `Signature.signataire`. */
  id: string;
  /** Nom affiché, pour dire qui manque. */
  nom: string;
}

/**
 * Une signature est-elle exploitable ?
 *
 * Un signataire identifié, un nom, une date, et **un tracé non vide** : une
 * signature sans tracé n'est pas une signature, c'est une case cochée. Le
 * contrôle vit ici pour que les trois documents l'appliquent de la même façon.
 */
export function signatureValide(s: Signature | null | undefined): boolean {
  if (!s) return false;
  return (
    typeof s.signataire === 'string' &&
    s.signataire.trim().length > 0 &&
    typeof s.nom === 'string' &&
    s.nom.trim().length > 0 &&
    typeof s.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    typeof s.trace === 'string' &&
    s.trace.trim().length > 0
  );
}

/**
 * Les signataires attendus qui n'ont pas signé.
 *
 * On compare sur l'identifiant, jamais sur le nom : deux personnes peuvent
 * s'appeler « Martin », et l'une des deux signatures manquerait alors sans que
 * personne ne s'en aperçoive.
 */
export function signatairesManquants(
  signatures: Signature[] | undefined,
  attendus: SignataireAttendu[],
): SignataireAttendu[] {
  const signes = new Set(
    (signatures ?? []).filter(signatureValide).map((s) => s.signataire),
  );
  return attendus.filter((a) => !signes.has(a.id));
}

/**
 * Les signataires reçus qui n'étaient pas attendus.
 *
 * Une signature surnuméraire n'est pas une faute — un mandataire peut signer
 * sans figurer dans la liste des titulaires — mais elle doit être **vue**. La
 * signaler vaut mieux que de la laisser passer pour un titulaire.
 */
export function signatairesInattendus(
  signatures: Signature[] | undefined,
  attendus: SignataireAttendu[],
): Signature[] {
  const connus = new Set(attendus.map((a) => a.id));
  return (signatures ?? []).filter(signatureValide).filter((s) => !connus.has(s.signataire));
}

/** Remplacer ou ajouter la signature d'un signataire, sans toucher aux autres. */
export function poserSignature(
  signatures: Signature[] | undefined,
  signature: Signature,
): Signature[] {
  const autres = (signatures ?? []).filter((s) => s.signataire !== signature.signataire);
  return [...autres, signature];
}

/** Retirer la signature d'un signataire — pour la refaire avant de figer. */
export function retirerSignature(
  signatures: Signature[] | undefined,
  signataire: string,
): Signature[] {
  return (signatures ?? []).filter((s) => s.signataire !== signataire);
}

/**
 * Qui doit signer un document, dans quel ordre et sous quel identifiant.
 *
 * Le bailleur d'abord, puis chaque titulaire dans l'ordre du bail, puis le
 * mandataire s'il y en a un. Cette liste sert à **deux** endroits : le
 * formulaire, qui refuse d'avancer tant qu'un signataire manque, et l'émission,
 * qui réimprime le document. Deux constructions séparées finiraient par ne plus
 * désigner les mêmes personnes — et un document imprimé sans la signature d'un
 * locataire nommé est un document que le juge écarte.
 *
 * L'identifiant du locataire est celui du titulaire, **jamais son rang** : deux
 * personnes peuvent porter le même nom de famille, et une signature glissée
 * sous le mauvais nom ne se voit pas.
 */
export function signatairesAttendus(params: {
  nomBailleur: string;
  titulaires: readonly { id: string; nom: string; prenom: string }[];
  mandataire?: string | null;
}): SignataireAttendu[] {
  const attendus: SignataireAttendu[] = [
    { id: 'bailleur', nom: params.nomBailleur },
    ...params.titulaires.map((t) => ({ id: t.id, nom: `${t.prenom} ${t.nom}`.trim() })),
  ];
  const mandataire = params.mandataire?.trim();
  if (mandataire) attendus.push({ id: 'mandataire', nom: mandataire });
  return attendus;
}

/**
 * Combien d'exemplaires imprimer, pour que chaque partie ait le sien.
 *
 * L'article 3-2 de la loi du 6 juillet 1989 demande un état des lieux « en
 * autant d'exemplaires que de parties ». Le bailleur en garde toujours un ; le
 * locataire en reçoit un, qu'il soit seul ou cinq en colocation — l'écran le
 * dit plutôt que de laisser chacun imprimer à l'aveugle.
 */
export function exemplairesNecessaires(nombreLocataires: number): number {
  return 1 + Math.max(1, nombreLocataires);
}
