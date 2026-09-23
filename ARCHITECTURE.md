# Architecture du projet

Application de quittances de loyer, 100 % locale, hors ligne.

## Principes

1. **Aucun réseau obligatoire.** Aucun backend, aucun compte, aucun abonnement.
2. **Les données vivent sur le téléphone** (SQLite + système de fichiers).
3. **Couche d'accès isolée.** Tout passe par `src/db/repositories/`. Ajouter plus tard
   une synchronisation cloud consiste à écrire une seconde implémentation de ces
   dépôts, sans toucher aux écrans.
4. **Le moteur métier est pur.** `src/domain/` ne connaît ni React, ni SQLite, ni Expo.
   C'est ce qui permet de le tester avec `node:test` en local, sans téléphone.

## Arborescence

```
app/                        # routes Expo Router (une route = un fichier)
  _layout.tsx               # pile racine + verrou biométrique + base de données
  (tabs)/
    _layout.tsx             # barre d'onglets : Accueil, Quittance, Logement, Réglages
    index.tsx               # ACCUEIL : tableau de bord + cartes logements
    quittances.tsx          # QUITTANCE : générer, rattraper, consulter
    logements.tsx           # LOGEMENT : ajouter, modifier, supprimer
    plus.tsx                # RÉGLAGES : thème, propriétaire, modèles, sauvegarde
  logement/
    nouveau.tsx             # assistant de création en 4 étapes
    [id].tsx                # détail d'un logement
    [id]/historique.tsx     # grille mensuelle des quittances
    [id]/locataires.tsx     # modification des titulaires du bail
    [id]/modifier.tsx       # édition du logement et du bail
  paiement/
    [propertyId].tsx        # enregistrement rapide d'un paiement
  quittance/
    apercu.tsx              # vérification avant émission, consultation d'un document émis
    succes.tsx              # écran de confirmation et partage
  proprietaire/
    index.tsx               # liste
    [id].tsx                # fiche
  mentions.tsx              # mentions portées sur les documents
  signature.tsx             # signature du bailleur
  sauvegarde/
    export.tsx              # création d'une sauvegarde chiffrée
    import.tsx              # restauration d'une sauvegarde

src/
  domain/                   # moteur métier pur, testable sans téléphone
    types.ts                # types du domaine
    money.ts                # arithmétique en centimes (jamais de flottants)
    period.ts               # mois, années, comparaisons, clés de période
    rent.ts                 # loyer dû pour un mois, selon date d'effet et bail
    payments.ts             # cumul des paiements, solde, statut, action contextuelle
    numbering.ts            # numérotation unique et stable des documents
  db/
    schema.ts               # schéma SQL et migrations versionnées
    database.ts             # ouverture, pragmas, migration au démarrage
    repositories/           # owners, properties, tenancies, rentTerms, payments,
                            # documents, settings
    index.ts                # instantiation des dépôts
  pdf/
    styles.ts               # styles partagés par les modèles
    modelClassique.ts       # modèle 1 : classique et professionnel
    modelModerne.ts         # modèle 2 : moderne et épuré
    render.ts               # assemblage HTML puis impression PDF
    legal.ts                # mentions légales françaises obligatoires
  backup/
    crypto.ts               # chiffrement authentifié (AES-GCM) + dérivation de clé
    export.ts               # constitution et écriture de la sauvegarde
    import.ts               # lecture, vérification, restauration
  ui/
    tokens.ts               # couleurs, espacements, rayons, typographie
    components/             # Card, Button, StatusBadge, ProgressBar, EmptyState…
  hooks/                    # hooks de données (chargement, rafraîchissement)
  state/                    # contexte applicatif (mois sélectionné, réglages)
  utils/                    # formatage de dates, de montants, de noms de fichiers

tests/                      # tests du moteur métier avec node:test
.github/workflows/          # compilation APK et IPA
```

## Chaîne de génération d'un document

L'application ne **crée** qu'une quittance. Les reçus et les avis d'échéance
qu'une version antérieure a émis restent lisibles — la base et les sauvegardes
les portent — mais ils ne s'émettent plus.

```
bouton « Générer »
  -> lecture du contexte du mois (logement, bail, loyer dû, paiements cumulés)
  -> décision du domaine : quittance, ou rien du tout
       `documentAutorise` rend « quittance » si le mois est intégralement réglé,
       `null` sinon. Aucun document intermédiaire n'existe.
  -> si rien n'est permis : l'écran explique pourquoi et propose
     d'enregistrer le paiement manquant — le seul geste qui ouvre ce droit
  -> rendu HTML à partir du modèle choisi dans les réglages
  -> impression PDF locale (expo-print)
  -> écriture du fichier dans le stockage de l'application
  -> enregistrement du document en base (numéro unique, période, montant, chemin)
  -> écran de succès : voir, partager, terminer
```

La génération se fait **en un appui**, sans écran intermédiaire : l'onglet
Quittance produit la quittance directement, et l'aperçu n'est plus qu'un chemin
de vérification, atteint en touchant le nom du logement.

## Règles de calcul

- **Les montants sont stockés en centimes entiers.** Aucun flottant, donc aucun
  arrondi bancal dans les PDF.
- **Le loyer dû pour un mois** est déterminé par la période d'effet applicable
  (`rent_terms`), bornée par la date d'entrée et la date de sortie du bail.
- **Un loyer au prorata n'est jamais inventé.** Si le bail commence au milieu du
  mois, le loyer du mois est dû en entier, comme le veut l'usage du bail
  d'habitation pour un mois commencé. Voir `src/domain/rent.ts`.
- **Une quittance exige un règlement intégral enregistré.** Le statut « payé » n'est
  jamais modifiable directement : il découle mécaniquement de la somme des paiements.
- **Aucun autre document ne se crée.** Un mois partiellement payé, impayé ou hors
  bail ne donne aucun document : `documentAutorise` rend `null`. La lecture, elle,
  reste ouverte aux reçus et avis d'échéance déjà émis, pour qu'une mise à jour ne
  rende pas illisibles des documents que le bailleur a déjà chez lui. Le type de
  création est `DocumentEmissible`, dérivé de `TypeDocument` par `Extract` : si
  `'quittance'` quittait un jour l'union des types lisibles, le compilateur le
  dirait.
- **Une quittance oubliée reste rattrapable.** `quittancesARattraper` parcourt tous
  les mois du bail et nomme ceux qui sont intégralement réglés sans quittance : un
  mois d'il y a sept mois se retrouve sans faire défiler les mois un par un.
- **Une modification de loyer ne remonte jamais dans le passé** : les périodes d'effet
  sont historisées et figées.

## Où sont garanties les promesses du projet

Chacune de ces règles porte la fiabilité de l'application. Chacune vit dans **une
seule fonction pure**, pour être éprouvable sans base de données et sans téléphone.

| Promesse | Où elle vit | Comment on la vérifie |
| --- | --- | --- |
| Jamais de quittance sans paiement intégral enregistré | `documentAutorise` et `peutEmettreQuittance` dans `src/domain/payments.ts`, doublées du garde-fou de `emettreDocument` dans `src/pdf/render.ts` | `tests/coherence.test.ts` |
| Aucun autre document ne se crée, mais tout document déjà émis reste lisible | `DocumentEmissible` et `documentAutorise` (`null` hors règlement intégral) dans `src/domain/payments.ts` ; le rendu garde ses branches `recu` / `avis_echeance` | `tests/payments.test.ts`, `tests/modele-officiel.test.ts` |
| Une quittance oubliée reste rattrapable, sans parcourir les mois un par un | `quittancesARattraper` dans `src/domain/payments.ts` | `tests/payments.test.ts` |
| Un changement de loyer ne modifie aucun mois passé | `planifierChangementLoyer` dans `src/domain/rent.ts` | `tests/rent.test.ts` |
| Aucune règle de calcul n'est dupliquée entre l'écran et le document | `contexteDuMois` dans `src/domain/payments.ts`, seul point d'assemblage | `tests/payments.test.ts` |
| Le rappel de loyers ne peut pas annoncer un mois faux | `texteRappel` dans `src/domain/rappels.ts` — le message ne nomme jamais de mois, parce qu'il est figé une fois pour toutes | `tests/rappels.test.ts` |

Le dépôt en base de `ajouterPeriodeLoyer` ne fait qu'**appliquer** le plan
calculé par le domaine : la décision est prise ailleurs, et la transaction
n'écrit que ce que le domaine a décidé. C'est ce qui permet de prouver la règle
anti-rétroactivité par un test, sans monter une base.

## Les rappels de loyers

Le rappel est une notification **locale** : elle est programmée par le système du
téléphone, sans serveur ni connexion. Elle survit aux redémarrages.

- `src/domain/rappels.ts` décide **quand** (`prochainRappel`) et **quoi dire**
  (`texteRappel`). Rien d'autre.
- `src/notifications/rappels.ts` est le **seul** fichier qui parle au système.
  Il crée le canal Android, demande l'autorisation, programme un déclencheur
  **mensuel répétitif**, et annule l'ancien avant d'en poser un nouveau.

Deux décisions qui méritent d'être dites :

- **Le texte ne nomme jamais le mois.** Un déclencheur répétitif fige son contenu
  au moment où il est programmé : « les loyers de septembre » deviendrait faux
  dès octobre. Le rappel renvoie donc vers l'application, qui seule sait ce qui
  reste dû. Un test le vérifie, mois par mois et année comprise.
- **Le jour est borné à 28.** C'est le seul jour présent dans tous les mois : la
  borne ne demande alors aucun cas particulier pour février.

L'interrupteur de l'écran PLUS **programme avant d'enregistrer** : si le
téléphone refuse les notifications, le réglage reste éteint et le motif est
affiché. Un interrupteur allumé qui ne déclenche rien serait pire qu'un
interrupteur absent.

Au lancement, `RappelsDeLoyers` dans `app/_layout.tsx` reprogramme le rappel si
le réglage est actif : une réinstallation efface la programmation sans prévenir,
et ce réarmement rend l'état auto-réparateur.

## Le point d'entrée

`package.json` porte `"main": "expo-router/entry"`. **Ce n'est pas un détail de
configuration : c'est ce qui fait exister l'application.**

Le projet a été créé depuis le modèle vide d'Expo, qui laisse à la racine un
`index.ts` montant un `App.tsx` — « Open up App.tsx to start working on your
app! ». Les écrans ont été ajoutés ensuite dans `app/`, mais le point d'entrée
est resté celui du modèle : **le routeur n'était jamais chargé, et tout le
dossier `app/` était du code mort.**

Le défaut était silencieux de bout en bout : les types passaient, les tests du
domaine passaient, la compilation réussissait, l'APK était signé et installable.
Il aurait affiché le message du modèle vide, et rien d'autre.

Deux choses le rendaient invisible :

- `App.tsx` **existait**, donc l'import `./App` se résolvait sans erreur — un
  point d'entrée fautif ne peut pas se signaler quand sa cible existe ;
- `expo export` **ne valide pas le source** : une faute de syntaxe volontaire
  dans `app/_layout.tsx` ne fait pas échouer l'empaquetage. Le seul symptôme
  était un compte de modules trop bas — **580 au lieu de 1946**.

Les fichiers `App.tsx` et `index.ts` ont donc été **supprimés**, et non laissés
inertes : leur seule présence suffirait à rendre le même défaut muet une seconde
fois. `tests/entree-application.test.ts` les refuse, refuse un `main` différent,
et exige la présence de `app/_layout.tsx`.

### Le contrôle qui voit vraiment ce qui est empaqueté

Le compte de modules ne dit pas **lesquels**. La carte des sources, si :

```bash
npx expo export --platform android --output-dir .verif/export --dump-sourcemap --clear
```

Le fichier `.hbc.map` produit contient un tableau `sources` : y chercher
`/app/_layout.tsx` et les modules de `src/`. Avant correction, ce tableau ne
contenait **aucun** fichier du projet — 576 entrées, toutes dans `node_modules`.

## Dépendances

Deux contraintes non évidentes, écrites ici parce qu'elles ont déjà cassé une
compilation.

**`.npmrc` à la racine impose `legacy-peer-deps=true`.** Expo 57 épingle
`react@19.2.3`, tandis que `react-dom` — pair *facultatif* d'`expo`, utile au
seul rendu web — réclame `react@^19.3.0`. Sans ce réglage, npm tente
d'installer `react-dom@19.3.0`, constate le conflit, puis déclare
`package-lock.json` désynchronisé avec `package.json` :

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: react-dom@19.3.0 from lock file
```

EAS Build lance `npm ci --include=dev` sans drapeau : le fichier `.npmrc` est
donc le **seul** endroit qui décide, et il vaut pour la machine locale comme
pour les serveurs de compilation.

**`react-native-worklets` est déclaré en dépendance explicite**, épinglé à la
version qu'Expo SDK 57 recommande (`0.10.1`). `react-native-reanimated@4.5.1`
le réclame en pair **obligatoire** — son greffon Babel le charge — mais un pair
n'est pas installé automatiquement lorsqu'on ignore les pairs. Sans cette ligne,
le greffon échoue et l'application ne démarre pas.

Pour reproduire l'installation des serveurs Expo sans attendre une compilation :

```bash
npm ci --include=dev --dry-run
```

## Compilation et publication

- `.github/workflows/ios-ipa-appareil.yml` produit l'IPA **installable sur un
  iPhone**. Il compile lui-même, sans passer par EAS : `xcodebuild -sdk
  iphoneos` avec `CODE_SIGNING_ALLOWED=NO`, donc un binaire qui **vise
  l'appareil** (`DTPlatformName = iphoneos`, `platform = 2` dans les
  `LC_BUILD_VERSION` du Mach-O) et qui n'est **pas signé**. C'est exactement ce
  qu'attend eSign, qui re-signe sur le téléphone. Aucun compte Apple, aucun
  certificat, aucun mot de passe n'intervient nulle part — et le dépôt public
  n'en contient donc aucun. Il exige **Xcode 26** (`runs-on: macos-26`) : deux
  paquets Swift d'Expo SDK 57 déclarent `swift-tools-version: 6.2`.
- `.github/workflows/android-apk.yml` produit un APK installable, signé par Expo.
- `.github/workflows/ios-ipa.yml` produit un fichier iOS, signé par Expo si
  `signer_avec_expo` est coché. **Sans identifiant Apple, ce n'est pas un IPA** :
  un IPA est une archive *signée*, et Expo n'a alors rien à signer. Le profil
  `apercu-simulateur` (`ios.simulator: true`) compile donc pour le **simulateur**
  et livre une archive `tar.gz` de `Quittances.app`. Mesuré sur le fichier livré :
  `DTPlatformName = iphonesimulator`, et `platform = 7` dans les deux tranches
  Mach-O. **Ce fichier-là** ne s'installe sur aucun iPhone, même après
  signature — une application de simulateur reste une application de
  simulateur, et eSign re-signe un binaire sans le recompiler. Il s'installe
  dans le simulateur d'un Mac ; pour l'appareil, c'est le premier flux qu'il
  faut lancer. La question à poser à un fichier iOS n'est donc pas « est-il
  signé ? » mais **« pour quel appareil a-t-il été compilé ? »**.
  Le flux lit l'extension sur l'adresse fournie par Expo et la transmet aux
  étapes suivantes, plutôt que de la forcer : un nom de fichier ne doit pas
  mentir sur son contenu. Le nom du profil et celui de l'artefact obéissent à la
  même règle — `apercu-simulateur`, `ios-quittances` — et `npm run verifier:flux`
  refuse désormais un `--profile` absent de `eas.json`.
- **Sur une étiquette `v*`**, les deux flux pilotés par EAS attachent leur
  fichier à la publication du dépôt. C'est le canal qui compte : un artefact
  expire en 90 jours et son téléchargement exige un compte GitHub, alors qu'une
  publication reste et se télécharge sans compte. Le flux appareil, lui, ne se
  déclenche qu'à la main et ne publie qu'un artefact.
- `.github/COMPILATION.md` explique, pas à pas, comment récupérer les fichiers.

Aucun certificat ni mot de passe n'est présent dans le dépôt : le seul élément
sensible est le secret `EXPO_TOKEN`, stocké dans les secrets GitHub. Les
compilations refusent de produire une application dont les types ou les tests
échouent, pour qu'un artefact publié soit toujours un artefact vérifié.

## Vérifications disponibles

```bash
npm run verifier:tout    # les quatre contrôles, dans l'ordre
npm run verifier:flux    # contrôles sur les flux de travail
npm run verifier:resume  # ce que le flux iOS annonce à la fin
npm run verifier         # types TypeScript
npm run test:domaine     # tests de la couche domaine
```

Les tests portent sur le domaine pur — arithmétique monétaire, périodes,
loyers, paiements, encodage, cryptographie. Ils tournent en quelques secondes
sous Node, sans appareil ni émulateur, et ce sont eux qui gardent les promesses
du tableau ci-dessus.

`scripts/check-workflows.mjs` valide les flux GitHub avant de pousser : YAML
analysé, chaque script `run:` passé à `bash -n`, actions épinglées, permissions
déclarées et suffisantes, et tout `--profile` cité doit exister dans `eas.json`.
Il est **le seul à énumérer** `.github/workflows`, donc sa liste de flux attendus
est **fermée dans les deux sens** : un flux manquant échoue, un flux ajouté sans
être déclaré échoue aussi. C'est le seul contrôle du projet dont un sujet absent
produirait un vert.

Sa portée est écrite dans son en-tête, et elle mérite d'être connue :
`bash -n` analyse sans évaluer, donc une expansion fautive (`${CHEMIN}` mal
orthographié) lui échappe. C'est un défaut d'exécution, pas de syntaxe.

`scripts/verifier-resume-ios.mjs` **exécute** le bloc qui écrit le résumé de fin
de compilation iOS, dans les deux branches (`signer_avec_expo` à `false` et à
`true`), et relit le résumé produit. `scripts/verifier-resume-ipa-appareil.mjs`
fait de même pour le flux appareil. C'est une réponse à un défaut réel : le bloc
iOS a annoncé qu'un binaire de simulateur s'installerait après signature, ce qui
est faux. Ces contrôles vérifient donc ce que les flux **disent**, pas ce que les
binaires **sont** — la plateforme se mesure sur le binaire, par `DTPlatformName`
et `LC_BUILD_VERSION`, et c'est le rôle de `.verif/verifier-ipa-appareil.py`.

