# Obtenir l'application sur votre téléphone

Ce document est écrit pour quelqu'un qui n'a jamais utilisé GitHub Actions.
Vous n'avez pas besoin de comprendre le fonctionnement : suivez les étapes.

Deux choses à savoir avant de commencer :

- **Android est simple.** Vous obtiendrez un fichier `.apk` à installer
  directement. Aucun compte payant n'est nécessaire.
- **iPhone demande un compte Apple.** Sans lui, le flux iOS compile pour le
  simulateur et ne produit **pas** d'IPA : le fichier obtenu ne s'installe sur
  aucun iPhone. Ce n'est pas une limite de ce projet, c'est iOS. Les
  explications sont plus bas, à la section « Pour un iPhone ».

---

## Ce qu'il faut déposer dans le dépôt, et ce qu'il ne faut jamais y déposer

**Jamais dans le dépôt, jamais dans le code :**

- mots de passe ;
- fichiers de certificat (`.p12`, `.p8`, `.mobileprovision`, `.jks`, `.keystore`) ;
- jetons d'accès ;
- profils de signature.

Le fichier `.gitignore` refuse déjà ces extensions, mais la meilleure
protection reste de ne pas les déposer du tout.

**À déposer dans les secrets GitHub :**

- un jeton Expo, nommé `EXPO_TOKEN`. C'est la seule chose à faire avant que la
  compilation Android fonctionne.

Un secret GitHub n'apparaît dans aucun fichier : GitHub l'injecte dans la
compilation au moment où elle tourne, et il n'est jamais écrit sur le disque du
dépôt. C'est exactement pour cela que les compilations passent par les secrets.

---

## Étape 1 — Créer un compte Expo et récupérer un jeton

Expo est le service qui construit l'application à votre place. Il est gratuit
pour un usage personnel.

1. Allez sur **expo.dev** et créez un compte. Notez le **nom d'utilisateur**,
   il servira plus loin.
2. Une fois connecté, ouvrez la page **Access tokens** :
   `expo.dev/settings/access-tokens`.
3. Cliquez sur **Create token**, donnez-lui un nom (par exemple
   `github-quittances`), et validez.
4. **Copiez le jeton tout de suite.** Expo ne l'affichera plus jamais. Il
   ressemble à une longue suite de caractères.

> Si vous perdez ce jeton, ce n'est pas grave : supprimez-le et créez-en un
> autre. Ce n'est pas un mot de passe que l'on choisit.

---

## Étape 2 — Déposer le jeton dans GitHub

1. Ouvrez votre dépôt sur **github.com**.
2. Cliquez sur **Settings** (en haut, dans la barre du dépôt — pas le Settings
   de votre compte).
3. Dans la colonne de gauche : **Secrets and variables**, puis **Actions**.
4. Cliquez sur le bouton vert **New repository secret**.
5. Dans **Name**, écrivez exactement : `EXPO_TOKEN`
   (en majuscules, avec le tiret bas. Le nom compte.)
6. Dans **Secret**, collez le jeton copié à l'étape précédente.
7. Cliquez sur **Add secret**.

Vous devez maintenant voir `EXPO_TOKEN` dans la liste. Le contenu reste
invisible, même pour vous : c'est normal.

---

## Étape 3 — Relier le projet à votre compte Expo

Cette étape se fait **une seule fois**, sur votre ordinateur, dans le dossier
du projet. Elle écrit un identifiant de projet dans `app.json` — un identifiant,
pas un secret, et il peut être publié sans risque.

Ouvrez un terminal dans le dossier du projet et lancez :

```bash
npx eas-cli init
```

Répondez `yes` quand il propose de créer un projet. Connectez-vous avec le
compte Expo de l'étape 1.

Ensuite, validez la configuration :

```bash
npx eas-cli build:configure
```

Cette commande complète le fichier `eas.json` si besoin. S'il vous demande de
créer un profil, acceptez celui proposé par défaut.

Vérifiez que `app.json` contient bien un bloc ressemblant à ceci :

```json
"extra": {
  "eas": {
    "projectId": "un-identifiant-ici"
  }
}
```

**Commitez et poussez ce changement.** Sans lui, les compilations GitHub
échoueront en disant qu'aucun projet n'est lié.

---

## Étape 4 — Lancer la compilation Android

1. Sur GitHub, ouvrez l'onglet **Actions** de votre dépôt.
2. Dans la colonne de gauche, cliquez sur **APK Android** (`android-apk.yml`).
3. À droite, cliquez sur **Run workflow**, puis sur le bouton vert
   **Run workflow** qui apparaît.
4. Actualisez la page. Une ligne apparaît avec un rond orange : la compilation
   a commencé. Elle dure généralement entre 10 et 25 minutes.

Vous pouvez fermer la page et revenir plus tard : la compilation continue.

---

## Étape 5 — Récupérer le fichier

1. Revenez dans l'onglet **Actions**.
2. Cliquez sur la ligne de la compilation terminée (rond vert).
3. Faites défiler jusqu'au bas de la page, section **Artifacts**.
4. Cliquez sur **apk-quittances**. Un fichier `.zip` se télécharge.
5. Décompressez-le : vous obtenez `app-release.apk`.

GitHub conserve ces fichiers 90 jours. Passé ce délai, il suffit de relancer la
compilation.

---

## Étape 6 — Installer sur le téléphone Android

1. Transférez `app-release.apk` vers le téléphone — par câble, par courriel, ou
   par un lien de transfert de fichiers. À vous de choisir.
2. Sur le téléphone, ouvrez le fichier. Android affiche un avertissement du type
   « Pour votre sécurité, votre téléphone n'est pas autorisé à installer des
   applications inconnues provenant de cette source ».
3. Appuyez sur **Paramètres** dans cet avertissement, activez l'autorisation
   pour l'application qui sert à ouvrir le fichier (votre navigateur ou votre
   gestionnaire de fichiers), puis revenez en arrière.
4. Appuyez de nouveau sur le fichier, puis sur **Installer**.
5. L'icône **Quittances** apparaît sur votre écran d'accueil.

Cet avertissement est normal : il apparaît pour toute application installée
hors du magasin Play. Vous pouvez désactiver l'autorisation après l'installation.

---

## Pour un iPhone

Il y a **trois façons** d'arriver à une application qui s'installe sur votre
iPhone. La première ne demande **aucun compte Apple** et aucun Mac : vous signez
vous-même, sur le téléphone. Les deux autres passent par un identifiant Apple.

Un mot d'abord, car c'est le point où l'on perd du temps à tort — et où l'on
croit souvent qu'il suffirait de faire signer le fichier. **« Signé » et
« compilé pour un appareil » sont deux questions distinctes.** Un fichier compilé
pour le *simulateur* reste un fichier de simulateur, quoi qu'on signe dessus :
un outil de signature re-signe un binaire, il ne le recompile pas.

Le flux **iOS** (`ios-ipa.yml`) de ce dépôt produit un fichier de simulateur, et il le dit. Nous
l'avons mesuré plutôt que de le supposer : son `Info.plist` porte
`DTPlatformName = iphonesimulator`, et ses deux tranches Mach-O (`x86_64`,
`arm64`) déclarent `platform = 7`, c'est-à-dire iOSSimulator.

La conséquence est plus sévère qu'un simple défaut de signature : **ce
fichier-là ne s'installe sur aucun iPhone, ni maintenant, ni après signature.**
Il s'installe dans le simulateur iOS d'un Mac :

```bash
tar -xzf Quittances-1.0.0-ios-simulateur.tar.gz
xcrun simctl install booted Quittances.app
```

Il sert donc à archiver, et à vérifier que le projet iOS compile. Pour un
téléphone, prenez l'un des trois chemins ci-dessous.

### Chemin A — signer vous-même avec eSign (aucun compte Apple)

C'est le chemin le plus direct, et le seul qui ne demande ni compte Apple
Developer, ni Apple ID, ni Mac. Le dépôt compile pour vous un IPA **non signé**
mais **compilé pour l'appareil** — c'est exactement ce qu'attend eSign.

1. Onglet **Actions** → flux **« IPA appareil »** (`ios-ipa-appareil.yml`) → *Run workflow*. Comptez une
   quinzaine de minutes.
2. À la fin, téléchargez l'artefact **`ipa-appareil-non-signe`** : il contient
   `Quittances-1.0.0-appareil-non-signe.ipa`.
3. Transférez le fichier sur votre iPhone (AirDrop, l'app Fichiers, ou un lien
   de partage), ouvrez-le dans **eSign**, puis signez-le avec votre certificat.
   eSign installe alors l'application sur l'appareil.

Deux choses à savoir avant de vous y fier :

- **Votre certificat a une durée de vie** — sept jours pour un certificat
  gratuit, un an pour un compte Apple Developer. À l'expiration, l'application
  cesse de se lancer : il faut resigner le même IPA.
- **Signer crée une identité nouvelle pour iOS.** Le conteneur de l'application
  peut être recréé, et les données locales avec lui. **Exportez une sauvegarde
  depuis l'application, et gardez son mot de passe**, avant de vous appuyer sur
  cette installation.

### Chemin B — confier la signature à Expo (le plus simple, compte Apple requis)

Expo peut gérer le certificat et le profil à votre place. Il vous faudra :

- un **compte Apple Developer** (environ 99 € par an). Sans lui, une
  application signée par Expo cesse de fonctionner au bout de sept jours ;
- votre **Apple ID** que vous renseignerez chez Expo, jamais dans ce dépôt.

Sur votre ordinateur :

```bash
npx eas-cli build --platform ios --profile apercu
```

Expo vous guide : il vous demande vos identifiants Apple, crée le certificat et
le profil, et produit un lien d'installation. Ce lien s'ouvre sur l'iPhone, et
l'application s'installe.

Si vous préférez passer par GitHub, lancez le flux **iOS** en cochant
l'option `signer_avec_expo`. Les identifiants Apple devront alors être
enregistrés chez Expo, pas dans GitHub.

### Chemin C — compiler sur un Mac avec Xcode

Si vous avez accès à un Mac, c'est le chemin où vous gardez la maîtrise
complète de vos certificats :

```bash
npx expo run:ios --device
```

Xcode gère la signature avec votre compte Apple, et installe directement sur
l'iPhone branché. Rien ne transite par Expo ni par GitHub.

---

## Si quelque chose ne marche pas

**La compilation échoue avec « Le secret EXPO_TOKEN n'est pas défini ».**
L'étape 2 n'a pas été faite, ou le nom du secret est mal orthographié. Il faut
exactement `EXPO_TOKEN`.

**La compilation échoue avec « no project linked » ou une erreur de projet.**
L'étape 3 n'a pas été poussée sur GitHub. Vérifiez que `app.json` contient bien
`extra.eas.projectId` dans la version du dépôt en ligne.

**La compilation échoue sur `npm ci` avec « Missing: … from lock file ».**
Le fichier `package-lock.json` n'est plus d'accord avec `package.json` : une
dépendance a été ajoutée ou retirée sans régénérer le verrouillage. Sur votre
ordinateur, lancez `npm install`, committez le `package-lock.json` modifié, et
poussez. Le fichier `.npmrc` du dépôt fait le reste : c'est lui qui indique à
npm d'ignorer les pairs en conflit, aussi bien chez vous que sur les serveurs
de compilation.

Pour reproduire **exactement** l'installation faite par les serveurs Expo, sans
attendre une compilation :

```bash
npm ci --include=dev --dry-run
```

Cette commande ne télécharge rien : elle vérifie seulement que le verrouillage
et `package.json` sont d'accord. Si elle ne dit rien, la compilation passera
cette étape.

**La compilation échoue sur les types ou les tests.**
C'est le comportement voulu : la compilation refuse de produire une application
dont le code ne passe pas ses propres contrôles. Sur votre ordinateur, lancez :

```bash
npx tsc --noEmit
npm run verifier:tests
npm run test:domaine
```

Les messages indiquent le fichier et la ligne à corriger.

`npx tsc --noEmit` ne regarde que `app/` et `src/` : le fichier `tsconfig.json`
exclut `tests/` et `.verif/`. Une erreur de type écrite dans un test y échappe
donc complètement, et `npm run test:domaine` ne la voit pas non plus — Node
efface les types au passage. C'est le rôle de `npm run verifier:tests`, qui
relit les tests avec `tsconfig.tests.json`. Les deux commandes sont nécessaires.

**Le téléphone refuse d'installer l'APK.**
Vous avez probablement une version antérieure installée avec une signature
différente. Désinstallez l'ancienne application, puis réinstallez.

---

## Rappel des commandes utiles, sur votre ordinateur

```bash
npm ci                           # installer les dépendances
npx tsc --noEmit                 # vérifier les types de l'application
npm run verifier:tests           # vérifier les types des tests et des bancs
npm run test:domaine             # lancer les tests
npm run verifier:tout            # tout d'un coup
npx expo start                   # ouvrir l'application en développement
```

Le fichier `.npmrc` à la racine n'est pas un détail : Expo 57 épingle `react`
en 19.2.3 alors que `react-dom` réclame 19.3.0. `react-dom` ne sert qu'au rendu
dans un navigateur, jamais sur un téléphone. Sans ce fichier, npm tente quand
même d'installer `react-dom`, détecte le conflit, puis déclare le verrouillage
désynchronisé — et la compilation s'arrête avant même de commencer. C'est
exactement ce qui s'est produit une fois ; la cause exacte est consignée dans
`ARCHITECTURE.md`, section « Dépendances ».
