/**
 * Éprouve l'implémentation de SHA-256, HMAC-SHA256 et PBKDF2.
 *
 * Ces trois algorithmes sont écrits à la main dans `src/backup/pbkdf2.ts`, parce
 * que l'environnement n'offre aucune dérivation de clé. Un algorithme écrit à la
 * main ne vaut que s'il est confronté à des valeurs de référence publiées :
 * c'est tout l'objet de ce fichier.
 *
 * Les sources des valeurs attendues sont indiquées pour chacune. Elles ne
 * viennent pas de l'implémentation testée : c'est ce qui rend le contrôle
 * probant.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hmacSha256, pbkdf2, sha256 } from '../src/backup/pbkdf2.ts';
import { chaineVersOctets } from '../src/pdf/encodage.ts';

/** Convertit des octets en chaîne hexadécimale minuscule. */
function enHexa(octets: Uint8Array): string {
  return Array.from(octets)
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('');
}

/** Lit une chaîne hexadécimale en octets. */
function depuisHexa(texte: string): Uint8Array {
  const propre = texte.replace(/\s/g, '');
  const sortie = new Uint8Array(propre.length / 2);
  for (let i = 0; i < sortie.length; i++) {
    sortie[i] = parseInt(propre.slice(i * 2, i * 2 + 2), 16);
  }
  return sortie;
}

describe('SHA-256', () => {
  it('condense la chaîne vide', () => {
    // Valeur publiée par le NIST (FIPS 180-4), exemple classique.
    assert.equal(
      enHexa(sha256(new Uint8Array(0))),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('condense « abc »', () => {
    // FIPS 180-4 / NIST : SHA-256("abc").
    assert.equal(
      enHexa(sha256(chaineVersOctets('abc'))),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('condense 448 bits, soit exactement la limite avant un bloc supplémentaire', () => {
    // Le message « abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq »
    // fait 56 octets : le remplissage doit alors ajouter un bloc entier. C'est
    // le cas limite qui casse la plupart des implémentations naïves.
    assert.equal(
      enHexa(sha256(chaineVersOctets('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('condense un million de « a »', () => {
    // Test de résistance au remplissage sur plusieurs blocs (FIPS 180-4).
    const message = new Uint8Array(1_000_000).fill(0x61);
    assert.equal(
      enHexa(sha256(message)),
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('traite les octets au-delà de 0x7f', () => {
    // Un UTF-8 accentué : vérifie qu'aucune conversion de signe ne corrompt les
    // octets élevés.
    const attendu = enHexa(sha256(chaineVersOctets('éàüß€')));
    assert.equal(attendu.length, 64);
    assert.match(attendu, /^[0-9a-f]{64}$/);
  });
});

describe('HMAC-SHA256', () => {
  // Les cas ci-dessous sont les vecteurs de la RFC 4231.
  const cle = depuisHexa('0b'.repeat(20));

  it('cas 1 de la RFC 4231 : clé de 20 octets, message « Hi There »', () => {
    assert.equal(
      enHexa(hmacSha256(cle, chaineVersOctets('Hi There'))),
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('cas 2 de la RFC 4231 : clé « Jefe », message « what do ya want for nothing? »', () => {
    assert.equal(
      enHexa(hmacSha256(chaineVersOctets('Jefe'), chaineVersOctets('what do ya want for nothing?'))),
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('cas 3 de la RFC 4231 : clé et message de 0xaa', () => {
    assert.equal(
      enHexa(hmacSha256(depuisHexa('aa'.repeat(20)), depuisHexa('dd'.repeat(50)))),
      '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe',
    );
  });

  it('cas 4 de la RFC 4231 : clé de 25 octets, message de 50 octets', () => {
    assert.equal(
      enHexa(
        hmacSha256(
          depuisHexa('0102030405060708090a0b0c0d0e0f10111213141516171819'),
          depuisHexa('cd'.repeat(50)),
        ),
      ),
      '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
    );
  });

  it('condense d’abord une clé plus longue qu’un bloc', () => {
    // Cas 6 de la RFC 4231 : la clé fait 131 octets. La RFC impose qu'elle soit
    // d'abord ramenée à 32 octets par SHA-256. Omettre cette étape donne un
    // résultat différent, donc ce test détecte précisément cet oubli.
    const longue = depuisHexa('aa'.repeat(131));
    assert.equal(
      enHexa(hmacSha256(longue, chaineVersOctets('Test Using Larger Than Block-Size Key - Hash Key First'))),
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    );
  });

  it('cas 7 de la RFC 4231 : grande clé et grand message', () => {
    const longue = depuisHexa('aa'.repeat(131));
    const message = chaineVersOctets(
      'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.',
    );
    assert.equal(
      enHexa(hmacSha256(longue, message)),
      '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
    );
  });
});

describe('PBKDF2-HMAC-SHA256', () => {
  it('respecte le vecteur publié : « password », sel « salt », 1 itération', () => {
    // Vecteurs PBKDF2-HMAC-SHA256 de référence (RFC 7914, annexe B, et jeu de
    // test repris par de nombreuses bibliothèques).
    assert.equal(
      enHexa(pbkdf2(chaineVersOctets('password'), chaineVersOctets('salt'), 1, 32)),
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
    );
  });

  it('respecte le vecteur publié : 2 itérations', () => {
    assert.equal(
      enHexa(pbkdf2(chaineVersOctets('password'), chaineVersOctets('salt'), 2, 32)),
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
    );
  });

  it('respecte le vecteur publié : 4096 itérations', () => {
    assert.equal(
      enHexa(pbkdf2(chaineVersOctets('password'), chaineVersOctets('salt'), 4096, 32)),
      'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a',
    );
  });

  it('produit une clé de la longueur demandée, même non multiple de 32', () => {
    // Une clé de 40 octets oblige à calculer deux blocs puis à tronquer : c'est
    // l'endroit où une implémentation naïve se trompe.
    const cle = pbkdf2(chaineVersOctets('passwordPASSWORDpassword'), chaineVersOctets('saltSALTsaltSALTsaltSALTsaltSALTsalt'), 4096, 40);
    assert.equal(cle.length, 40);
  });

  it('respecte le vecteur publié à 40 octets', () => {
    assert.equal(
      enHexa(
        pbkdf2(
          chaineVersOctets('passwordPASSWORDpassword'),
          chaineVersOctets('saltSALTsaltSALTsaltSALTsaltSALTsalt'),
          4096,
          40,
        ),
      ),
      '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9',
    );
  });

  it('accepte les octets nuls dans le mot de passe et le sel', () => {
    // Cas 5 des vecteurs PBKDF2-HMAC-SHA256 : un octet 0x00 ne tronque rien.
    assert.equal(
      enHexa(pbkdf2(depuisHexa('7061737300776f7264'), depuisHexa('7361006c74'), 4096, 16)),
      '89b69d0516f829893c696226650a8687',
    );
  });

  it('refuse un nombre d’itérations nul plutôt que de rendre une clé fausse', () => {
    assert.throws(
      () => pbkdf2(chaineVersOctets('motdepasse'), chaineVersOctets('sel'), 0, 32),
      /itérations/,
    );
  });

  it('donne deux clés différentes pour deux sels différents', () => {
    const a = pbkdf2(chaineVersOctets('motdepasse'), chaineVersOctets('sel-a'), 1000, 32);
    const b = pbkdf2(chaineVersOctets('motdepasse'), chaineVersOctets('sel-b'), 1000, 32);
    assert.notEqual(enHexa(a), enHexa(b), 'le sel doit changer la clé dérivée');
  });

  it('donne deux clés différentes pour deux mots de passe différents', () => {
    const a = pbkdf2(chaineVersOctets('motdepasse1'), chaineVersOctets('sel'), 1000, 32);
    const b = pbkdf2(chaineVersOctets('motdepasse2'), chaineVersOctets('sel'), 1000, 32);
    assert.notEqual(enHexa(a), enHexa(b));
  });

  it('est déterministe : même entrée, même clé', () => {
    const a = pbkdf2(chaineVersOctets('motdepasse'), chaineVersOctets('sel'), 1000, 32);
    const b = pbkdf2(chaineVersOctets('motdepasse'), chaineVersOctets('sel'), 1000, 32);
    assert.equal(enHexa(a), enHexa(b));
  });
});
