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

Oui — et **sans aucun compte Apple**. Le flux **« IPA appareil »**
(`.github/workflows/ios-ipa-appareil.yml`) produit un fichier que **eSign**
sait signer puis installer.

La confusion à lever tient en une phrase : **« signé » et « compilé pour un
appareil » sont deux questions distinctes.** Ce dépôt ne contient aucun
identifiant Apple, donc rien ne peut y être *signé*. Mais on peut parfaitement
*compiler pour un iPhone* sans rien signer : `xcodebuild -sdk iphoneos` avec
`CODE_SIGNING_ALLOWED=NO` produit un binaire qui vise le matériel, et que
personne n'a signé.

C'est exactement ce qu'attend un outil de signature sur l'appareil — eSign,
AltStore, Sideloadly. Ces outils **re-signent** une application avec *votre*
certificat ; ils ne la recompilent pas. Il leur faut donc un binaire qui vise
déjà le bon processeur et la bonne plateforme, et c'est ce que ce flux fournit.

1. Lancez le flux **IPA appareil** (onglet *Actions*, puis *Run workflow*).
2. Téléchargez l'artefact `ipa-appareil-non-signe` :
   `Quittances-1.0.0-appareil-non-signe.ipa`.
3. Ouvrez-le dans **eSign**, signez-le avec votre certificat, installez.

Ce que le flux contrôle **sur le fichier produit**, et refuse de livrer sinon :
`DTPlatformName = iphoneos`, `CFBundleSupportedPlatforms` contient `iPhoneOS`,
binaire `arm64`, aucun `embedded.mobileprovision`, aucune `_CodeSignature`,
`main.jsbundle` présent.

Deux points à savoir avant de vous y fier :

- **La durée de vie dépend de votre certificat.** Un identifiant Apple gratuit
  donne sept jours et trois applications à la fois ; un compte Apple Developer
  donne un an. Un certificat partagé peut être révoqué sans préavis, et
  l'application cesse alors de s'ouvrir : il faut re-signer.
- **Exportez une sauvegarde avant de compter sur l'installation.** Re-signer
  change l'identité de signature de l'application, et iOS peut alors lui donner
  un conteneur neuf. Tout est stocké localement : gardez le fichier de
  sauvegarde **et son mot de passe**.

#### L'autre flux iOS, à ne pas confondre

`ios-ipa.yml` ne produit pas cela. Sans identifiant Apple, Expo n'a **rien à
signer** — et un IPA est par définition une archive *signée*. Ce flux-là compile
donc pour le **simulateur**, et livre une archive `tar.gz` contenant
`Quittances.app`. Mesuré sur le fichier réellement produit : son `Info.plist`
porte `DTPlatformName = iphonesimulator`, et ses tranches Mach-O déclarent
`platform = 7` (iOSSimulator).

Conséquence : ce fichier-là ne s'installe sur **aucun iPhone**, ni maintenant,
**ni après signature**. Une application compilée pour le simulateur reste une
application de simulateur, même signée. Il s'installe dans le simulateur iOS
d'un Mac (`xcrun simctl install`), et sert à archiver ou à vérifier que le
projet iOS compile.

Si vous préférez passer par votre compte Apple :

- **faire signer par Expo** — cochez `signer_avec_expo` au lancement du flux, ou
  lancez `npx eas-cli build --platform ios --profile apercu`. Expo gère le
  certificat et le profil à votre place. Sans compte Apple Developer (99 $/an),
  l'application cesse de fonctionner au bout de sept jours ;
- **compiler sur un Mac avec Xcode** — `npx expo run:ios --device`. Vous gardez
  la maîtrise complète de vos certificats, et rien ne transite par Expo.

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

Quatre contrôles, dans l'ordre : les flux de travail GitHub — y compris le nom
de profil de compilation, qui doit exister dans `eas.json` —, les messages que
les flux iOS publient à la fin, les types TypeScript, puis les tests de la couche
domaine. Les tests tournent en quelques secondes sous Node, sans émulateur ni
appareil, et **chaque commande annonce son propre total** — un chiffre écrit ici
vieillirait sans prévenir.

## Ce qui est vérifié, et ce qui reste à éprouver

Par honnêteté, la frontière est écrite ici.

**Vérifié avant chaque compilation** — l'installation des dépendances telle que la
fait le serveur de compilation, l'absence d'erreur de type, les tests du domaine,
et la validité des trois flux de travail. Un fichier publié est donc toujours un
fichier dont les types et les tests passaient.

**Vérifié à la main, sur les binaires livrés** — la signature et le contenu des
fichiers : paquet d'application réellement présent, aucune permission inutile,
`debuggable` absent, identifiant et étiquette conformes. Et l'absence de tout
secret dans le dépôt comme dans son historique.

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
- Les flux de travail refusent de produire une application dont les types ou les
  tests échouent. Le seul droit qu'ils demandent au jeton fourni par GitHub est
  `contents: write`, pour attacher un fichier à la publication d'une version.
  Le jeton Expo, lui, n'a aucun droit sur ce dépôt.

## Architecture

[`ARCHITECTURE.md`](ARCHITECTURE.md) décrit l'arborescence, la chaîne de
génération d'un document, les règles de calcul, et pourquoi certaines décisions
non évidentes ont été prises (dont le point d'entrée de l'application, qui a
déjà rendu tout le code mort une fois).

## Licence

MIT — voir [`LICENSE`](LICENSE).
