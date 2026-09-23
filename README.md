# Quittances de loyer

Une application mobile qui produit vos quittances de loyer **en un clic**.

Elle fonctionne **entièrement hors ligne** : aucun compte à créer, aucun serveur,
aucun abonnement, aucune donnée envoyée où que ce soit. Tout vit sur votre
téléphone.

Elle est pensée pour un bailleur particulier qui veut faire ses quittances en
quelques secondes par mois, sans se tromper sur les montants.

## Les trois promesses

Trois règles portent la fiabilité des documents. Chacune vit dans **une seule
fonction pure**, éprouvée par un test qui tourne sans téléphone.

| Promesse | Où elle est tenue |
| --- | --- |
| **Jamais de quittance sans paiement intégral enregistré** | `documentAutorise` et `peutEmettreQuittance` (`src/domain/payments.ts`), doublées d'un garde-fou dans `src/pdf/render.ts` |
| **Un changement de loyer ne modifie aucun mois passé** | `planifierChangementLoyer` (`src/domain/rent.ts`) |
| **Aucune règle de calcul n'est dupliquée entre l'écran et le document** | `contexteDuMois` (`src/domain/payments.ts`), seul point d'assemblage |

Ces promesses ne sont pas des intentions : elles sont **falsifiables**. Chaque
test a été retourné contre la règle qu'il prétend garder, pour vérifier qu'il
échoue bien quand on la casse. Détail dans `ARCHITECTURE.md`.

## Ce que fait l'application

Quatre onglets :

- **Accueil** — le tableau de bord du mois : ce qui est encaissé, ce qui reste dû,
  et un bouton pour agir directement.
- **Logements** — vos biens, leurs locataires, leurs loyers, avec l'historique
  mois par mois.
- **Quittances** — les documents produits, et la **génération groupée** de tous
  les logements en une fois.
- **Plus** — propriétaires, modèles de document, sauvegarde chiffrée, rappels.

Points de fond :

- **Le statut « payé » n'est pas modifiable à la main.** Il découle mécaniquement
  de la somme des paiements enregistrés. On ne peut donc pas marquer un mois payé
  sans enregistrer le paiement correspondant.
- **Deux modèles de document** : classique et moderne.
- **Mentions légales françaises** incluses dans les documents.
- **Sauvegarde chiffrée** par mot de passe (AES-256-GCM), exportable et
  restaurable, entièrement hors ligne.
- **Verrou biométrique** optionnel à l'ouverture.
- **Rappel mensuel local** pour ne pas oublier d'encaisser, programmé par le
  système du téléphone, sans serveur.

## Installer sur Android

L'APK se télécharge depuis la page
[**Releases**](https://github.com/Msoumaya2019/quittances/releases) de ce dépôt.

1. **Téléchargez le fichier `.apk`** — depuis un ordinateur, puis transférez-le
   sur le téléphone, ou directement depuis le navigateur du téléphone.
   Il pèse **environ 115 Mo** : sur un forfait mobile, préférez le Wi-Fi.
2. **Ouvrez le fichier** depuis les notifications ou l'application « Fichiers ».
3. Android affiche **« Installation d'applications inconnues »** : c'est normal
   pour une application qui ne vient pas du Play Store. Autorisez la source
   concernée (votre navigateur ou votre gestionnaire de fichiers), puis validez.
4. Play Protect peut afficher un avertissement supplémentaire. Vous pouvez
   poursuivre : l'APK est signé par le service de compilation d'Expo.
5. L'application **Quittances** apparaît alors dans vos applications.

Pour désinstaller, passez par les réglages Android habituels. Vos données
partent avec l'application : **pensez à exporter une sauvegarde** depuis l'écran
PLUS si vous voulez les conserver.

### Et sur iPhone ?

Pas par ce chemin. Un fichier IPA non signé **ne s'installe pas** sur un iPhone :
Apple exige une signature liée à un compte développeur. Le flux de travail
`ios-ipa.yml` existe et produit bien un IPA, mais pour l'installer il faut soit
un compte Apple Developer (99 $/an) pour une distribution ad hoc, soit passer par
l'App Store, soit compiler depuis un Mac avec un identifiant Apple gratuit pour
un usage personnel limité dans le temps.

## Compiler vous-même

Tout se passe dans GitHub Actions : **aucun SDK Android ni Java à installer**.

1. **Ouvrez un compte Expo** (gratuit) sur [expo.dev](https://expo.dev).
2. **Créez un jeton d'accès** : *Account settings* → *Access tokens* → *Create token*.
   Copiez-le : il ne sera plus affiché.
3. **Déposez-le dans les secrets du dépôt** : *Settings* → *Secrets and variables*
   → *Actions* → *New repository secret*, nom exactement `EXPO_TOKEN`.
   Un secret GitHub est chiffré et n'est **jamais** lisible en clair, ni par le
   dépôt, ni par un visiteur.
4. **Lancez la compilation** : onglet *Actions* → *APK Android* → *Run workflow*.
   Comptez une vingtaine de minutes.
5. **Récupérez le fichier** : à la fin de l'exécution, dans la section *Artifacts*
   — ou, pour une version étiquetée `v*`, directement dans les *Releases*.

Le détail pas à pas, et le dépannage des erreurs courantes, sont dans
[`.github/COMPILATION.md`](.github/COMPILATION.md).

## Vérifier

```bash
npm install --legacy-peer-deps
npm run verifier:tout
```

Trois contrôles, dans l'ordre : les flux de travail GitHub (62 vérifications),
les types TypeScript, puis **139 tests sur la couche domaine**. Les tests
tournent en quelques secondes sous Node, sans émulateur ni appareil.

## Ce qui est vérifié, et ce qui reste à éprouver

Par honnêteté, la frontière est écrite ici.

**Vérifié automatiquement** — l'installation des dépendances telle que la fait le
serveur de compilation, l'absence d'erreur de type, les 139 tests du domaine,
la validité des deux flux de travail, la signature et le contenu de l'APK
(paquet d'application présent, aucune permission inutile, non déverrouillable),
et l'absence de tout secret dans le dépôt et dans son historique.

**Pas encore éprouvé** — l'exécution de l'application sur un téléphone réel, et
le rendu visuel des écrans. Aucun appareil n'était disponible au moment du
développement. C'est la première chose à faire au premier lancement : créer un
logement, enregistrer un paiement, générer une quittance, et vérifier le PDF.

## Sécurité

- **Aucun secret dans ce dépôt.** Le seul élément sensible est le jeton
  `EXPO_TOKEN`, qui vit dans les *secrets GitHub* et n'apparaît dans aucun
  fichier suivi ni dans l'historique Git.
- **Aucun certificat, aucun mot de passe de signature.** L'APK est signé par le
  service Expo, avec une clé qu'Expo détient pour vous.
- Les flux de travail déclarent des permissions minimales (`contents: read`) et
  refusent de produire une application dont les types ou les tests échouent.

## Architecture

[`ARCHITECTURE.md`](ARCHITECTURE.md) décrit l'arborescence, la chaîne de
génération d'un document, les règles de calcul, et pourquoi certaines décisions
non évidentes ont été prises (dont le point d'entrée de l'application, qui a
déjà rendu tout le code mort une fois).

## Licence

MIT — voir [`LICENSE`](LICENSE).
