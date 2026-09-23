/**
 * Encodages binaires, écrits sans dépendance.
 *
 * Ce module est volontairement **pur** : il ne touche ni à Expo, ni au système
 * de fichiers, ni à React. C'est ce qui permet de le vérifier par des tests
 * ordinaires, et de l'utiliser aussi bien pour l'archive ZIP que pour la
 * sauvegarde chiffrée.
 *
 * `btoa` et `atob` n'existent pas dans l'environnement React Native, et
 * `TextEncoder` n'est pas garanti : on écrit donc les conversions explicitement.
 */

/** Table du CRC-32, calculée une seule fois au chargement. */
const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** Somme de contrôle CRC-32, telle qu'attendue par le format ZIP. */
export function crc32(donnees: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < donnees.length; i += 1) {
    crc = TABLE_CRC[(crc ^ donnees[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const ALPHABET_BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode des octets en Base64. */
export function octetsVersBase64(octets: Uint8Array): string {
  let resultat = '';

  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i];
    const b = i + 1 < octets.length ? octets[i + 1] : 0;
    const c = i + 2 < octets.length ? octets[i + 2] : 0;

    resultat += ALPHABET_BASE64[a >> 2];
    resultat += ALPHABET_BASE64[((a & 0x03) << 4) | (b >> 4)];
    resultat += i + 1 < octets.length ? ALPHABET_BASE64[((b & 0x0f) << 2) | (c >> 6)] : '=';
    resultat += i + 2 < octets.length ? ALPHABET_BASE64[c & 0x3f] : '=';
  }

  return resultat;
}

/** Décode du Base64 en octets. Les caractères de remplissage et les blancs sont tolérés. */
export function base64VersOctets(base64: string): Uint8Array {
  const propre = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const longueur = Math.floor((propre.length * 3) / 4);
  const octets = new Uint8Array(longueur);

  let index = 0;
  for (let i = 0; i < propre.length; i += 4) {
    const a = ALPHABET_BASE64.indexOf(propre[i]);
    const b = ALPHABET_BASE64.indexOf(propre[i + 1]);
    const c = ALPHABET_BASE64.indexOf(propre[i + 2]);
    const d = ALPHABET_BASE64.indexOf(propre[i + 3]);

    if (a < 0 || b < 0) break;

    if (index < longueur) octets[index++] = (a << 2) | (b >> 4);
    if (index < longueur && c >= 0) octets[index++] = ((b & 0x0f) << 4) | (c >> 2);
    if (index < longueur && d >= 0) octets[index++] = ((c & 0x03) << 6) | d;
  }

  return octets;
}

/** Encode une chaîne en UTF-8. */
export function chaineVersOctets(chaine: string): Uint8Array {
  const octets: number[] = [];

  for (const caractere of chaine) {
    const point = caractere.codePointAt(0);
    if (point === undefined) continue;

    if (point < 0x80) {
      octets.push(point);
    } else if (point < 0x800) {
      octets.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      octets.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      octets.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }

  return new Uint8Array(octets);
}

/** Décode des octets UTF-8 en chaîne. */
export function octetsVersChaine(octets: Uint8Array): string {
  let resultat = '';
  let i = 0;

  while (i < octets.length) {
    const premier = octets[i];

    if (premier < 0x80) {
      resultat += String.fromCharCode(premier);
      i += 1;
    } else if ((premier & 0xe0) === 0xc0 && i + 1 < octets.length) {
      resultat += String.fromCharCode(((premier & 0x1f) << 6) | (octets[i + 1] & 0x3f));
      i += 2;
    } else if ((premier & 0xf0) === 0xe0 && i + 2 < octets.length) {
      resultat += String.fromCharCode(
        ((premier & 0x0f) << 12) | ((octets[i + 1] & 0x3f) << 6) | (octets[i + 2] & 0x3f),
      );
      i += 3;
    } else if ((premier & 0xf8) === 0xf0 && i + 3 < octets.length) {
      const point =
        ((premier & 0x07) << 18) |
        ((octets[i + 1] & 0x3f) << 12) |
        ((octets[i + 2] & 0x3f) << 6) |
        (octets[i + 3] & 0x3f);
      resultat += String.fromCodePoint(point);
      i += 4;
    } else {
      // Octet isolé non valide : on l'ignore plutôt que de produire du charabia.
      i += 1;
    }
  }

  return resultat;
}

/** Met bout à bout plusieurs tableaux d'octets. */
export function concatener(morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((taille, morceau) => taille + morceau.length, 0);
  const resultat = new Uint8Array(total);

  let position = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, position);
    position += morceau.length;
  }

  return resultat;
}

/** Compare deux tableaux d'octets. Utilisé par les sauvegardes chiffrées. */
export function octetsEgaux(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}
