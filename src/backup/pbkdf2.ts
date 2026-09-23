/**
 * PBKDF2-HMAC-SHA256, écrit à la main.
 *
 * Pourquoi écrire cela soi-même ? Parce que l'environnement ne fournit rien :
 * `expo-crypto` propose AES-GCM, mais ni PBKDF2 ni Argon2 ; Hermes n'expose pas
 * `SubtleCrypto` ; et le polyfill `expo-standard-web-crypto` ne couvre que
 * `getRandomValues`, pas la dérivation de clé. Or il faut bien transformer un
 * mot de passe en clé de chiffrement, et le faire mal serait pire que tout.
 *
 * SHA-256, HMAC et PBKDF2 sont trois algorithmes courts et entièrement
 * spécifiés. La différence avec une dérivation « inventée » est qu'on peut les
 * **confronter aux vecteurs de test officiels** : c'est ce que fait
 * `tests/pbkdf2.test.ts`, qui rejoue les valeurs publiées dans la RFC 4231 pour
 * HMAC-SHA256 et la RFC 6070 pour PBKDF2 (avec SHA-256, dont les vecteurs sont
 * repris de la RFC 7914 et des exemples de référence).
 *
 * Limite de sécurité assumée : ce calcul se fait en JavaScript. Il est donc plus
 * lent que son équivalent natif, ce qui limite le nombre d'itérations
 * praticable. Le format de sauvegarde enregistre le nombre d'itérations
 * employé, afin qu'on puisse l'augmenter plus tard sans casser les fichiers
 * existants.
 */

import { concatener, octetsVersBase64, base64VersOctets, chaineVersOctets } from '../pdf/encodage.ts';

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

/** Constantes de tour de SHA-256 : racines cubiques des 64 premiers nombres premiers. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Rotation circulaire à droite sur 32 bits. */
function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Calcule SHA-256 et retourne les 32 octets du condensat.
 *
 * Utilise l'addition 32 bits « saupoudrée » (`>>> 0`) à chaque étape : sans
 * cela, JavaScript produirait des flottants et le résultat serait faux au-delà
 * de 2^31.
 */
export function sha256(message: Uint8Array): Uint8Array {
  const longueur = message.length;
  const bits = longueur * 8;

  // Remplissage PKCS#1 : un octet 0x80, des zéros, puis la longueur en 64 bits.
  const avecRemplissage = longueur + 1 + 8;
  const tailleBloc = Math.ceil(avecRemplissage / 64) * 64;
  const bloc = new Uint8Array(tailleBloc);
  bloc.set(message);
  bloc[longueur] = 0x80;

  // Les 8 derniers octets portent la longueur du message, en grand-boutiste.
  // On l'écrit sur 64 bits ; au-delà de 2^32, on répartit sur les deux mots.
  const vue = new DataView(bloc.buffer);
  vue.setUint32(tailleBloc - 8, Math.floor(bits / 0x100000000));
  vue.setUint32(tailleBloc - 4, bits >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let depart = 0; depart < tailleBloc; depart += 64) {
    // Les 16 premiers mots viennent directement du bloc.
    for (let i = 0; i < 16; i++) {
      w[i] = vue.getUint32(depart + i * 4);
    }

    // Les 48 suivants sont dérivés : c'est la « dilatation » de SHA-256.
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const sortie = new Uint8Array(32);
  const vueSortie = new DataView(sortie.buffer);
  vueSortie.setUint32(0, h0);
  vueSortie.setUint32(4, h1);
  vueSortie.setUint32(8, h2);
  vueSortie.setUint32(12, h3);
  vueSortie.setUint32(16, h4);
  vueSortie.setUint32(20, h5);
  vueSortie.setUint32(24, h6);
  vueSortie.setUint32(28, h7);

  return sortie;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

const TAILLE_BLOC_SHA256 = 64;

/**
 * Calcule HMAC-SHA256.
 *
 * Si la clé dépasse la taille d'un bloc, elle est d'abord condensée — c'est la
 * règle de la RFC 2104, et l'oublier rendrait le HMAC non conforme.
 */
export function hmacSha256(cle: Uint8Array, message: Uint8Array): Uint8Array {
  let cleUtilisee = cle;
  if (cleUtilisee.length > TAILLE_BLOC_SHA256) {
    cleUtilisee = sha256(cleUtilisee);
  }

  const blocCle = new Uint8Array(TAILLE_BLOC_SHA256);
  blocCle.set(cleUtilisee);

  const interieur = new Uint8Array(TAILLE_BLOC_SHA256);
  const exterieur = new Uint8Array(TAILLE_BLOC_SHA256);
  for (let i = 0; i < TAILLE_BLOC_SHA256; i++) {
    interieur[i] = blocCle[i] ^ 0x36;
    exterieur[i] = blocCle[i] ^ 0x5c;
  }

  const hashInterne = sha256(concatener([interieur, message]));
  return sha256(concatener([exterieur, hashInterne]));
}

// ---------------------------------------------------------------------------
// PBKDF2
// ---------------------------------------------------------------------------

/**
 * Dérive une clé de la longueur voulue.
 *
 * Le nombre d'itérations compte : chaque itération refait un HMAC complet, donc
 * doubler les itérations double le temps de calcul — pour l'utilisateur une
 * fois, pour un attaquant à chaque essai de mot de passe.
 */
export function pbkdf2(
  motDePasse: Uint8Array,
  sel: Uint8Array,
  iterations: number,
  longueurCle: number,
): Uint8Array {
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error('Le nombre d’itérations doit être au moins de 1.');
  }
  if (longueurCle < 1) {
    throw new Error('La longueur de clé doit être au moins d’un octet.');
  }

  const tailleBloc = 32; // Sortie de SHA-256.
  const nombreBlocs = Math.ceil(longueurCle / tailleBloc);
  const morceaux: Uint8Array[] = [];

  for (let bloc = 1; bloc <= nombreBlocs; bloc++) {
    // U_i = PRF(P, S || INT(i)), où INT(i) est l'indice de bloc en 32 bits
    // grand-boutiste.
    const indice = new Uint8Array(4);
    new DataView(indice.buffer).setUint32(0, bloc);

    let u = hmacSha256(motDePasse, concatener([sel, indice]));
    const accumulation = new Uint8Array(u);

    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(motDePasse, u);
      for (let j = 0; j < tailleBloc; j++) {
        accumulation[j] ^= u[j];
      }
    }

    morceaux.push(accumulation);
  }

  return concatener(morceaux).slice(0, longueurCle);
}

// ---------------------------------------------------------------------------
// Format « texte » de PBKDF2, pour la compatibilité des sauvegardes
// ---------------------------------------------------------------------------

/**
 * Dérive une clé à partir d'un mot de passe écrit par l'utilisateur et d'un sel.
 * Le mot de passe est converti en UTF-8 : les accents produisent donc toujours
 * la même clé, quel que soit l'appareil.
 */
export function deriverCleDepuisMotDePasse(
  motDePasse: string,
  sel: Uint8Array,
  iterations: number,
  longueurCle = 32,
): Uint8Array {
  return pbkdf2(chaineVersOctets(motDePasse), sel, iterations, longueurCle);
}

/** Convertit une clé en base64, pour l'écrire dans un fichier de sauvegarde. */
export function cleEnBase64(cle: Uint8Array): string {
  return octetsVersBase64(cle);
}

/** Relit une clé depuis sa forme base64. */
export function cleDepuisBase64(texte: string): Uint8Array {
  return base64VersOctets(texte);
}
