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
    _layout.tsx             # barre d'onglets : Accueil, Logements, Quittances, Plus
    index.tsx               # ACCUEIL : tableau de bord + cartes logements
    logements.tsx           # LOGEMENTS : liste et gestion des biens
    quittances.tsx          # QUITTANCES : documents + génération groupée
    plus.tsx                # PLUS : propriétaires, modèles, sauvegarde, réglages
  logement/
    nouveau.tsx             # assistant de création en 4 étapes
    [id].tsx                # détail d'un logement
    [id]/historique.tsx     # grille mensuelle des quittances
    [id]/modifier.tsx       # édition, changement de locataire
  paiement/
    [propertyId].tsx        # enregistrement rapide d'un paiement
  quittance/
    apercu.tsx              # aperçu PDF
    succes.tsx              # écran de confirmation et partage
    groupee.tsx             # génération groupée
  proprietaire/
    index.tsx               # liste
    [id].tsx                # fiche

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

```
bouton « Générer la quittance »
  -> lecture du contexte du mois (logement, bail, loyer dû, paiements cumulés)
  -> décision : quittance | reçu | avis d'échéance | enregistrer le paiement
  -> rendu HTML à partir du modèle choisi dans les réglages
  -> impression PDF locale (expo-print)
  -> écriture du fichier dans le stockage de l'application
  -> enregistrement du document en base (numéro unique, période, montant, chemin)
  -> écran de succès : voir, partager, terminer
```

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
- **Une modification de loyer ne remonte jamais dans le passé** : les périodes d'effet
  sont historisées et figées.

## Où sont garanties les promesses du projet

Trois règles portent la fiabilité de l'application. Chacune vit dans **une seule
fonction pure**, pour être éprouvable sans base de données et sans téléphone.

| Promesse | Où elle vit | Comment on la vérifie |
| --- | --- | --- |
| Jamais de quittance sans paiement intégral enregistré | `documentAutorise` et `peutEmettreQuittance` dans `src/domain/payments.ts`, doublées du garde-fou de `emettreDocument` dans `src/pdf/render.ts` | `tests/coherence.test.ts` |
| Un changement de loyer ne modifie aucun mois passé | `planifierChangementLoyer` dans `src/domain/rent.ts` | `tests/rent.test.ts` |
| Aucune règle de calcul n'est dupliquée entre l'écran et le document | `contexteDuMois` dans `src/domain/payments.ts`, seul point d'assemblage | `tests/payments.test.ts` |

Le dépôt en base de `ajouterPeriodeLoyer` ne fait qu'**appliquer** le plan
calculé par le domaine : la décision est prise ailleurs, et la transaction
n'écrit que ce que le domaine a décidé. C'est ce qui permet de prouver la règle
anti-rétroactivité par un test, sans monter une base.

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

- `.github/workflows/android-apk.yml` produit un APK installable.
- `.github/workflows/ios-ipa.yml` produit un IPA, signé ou non.
- `.github/COMPILATION.md` explique, pas à pas, comment récupérer les fichiers.

Aucun certificat ni mot de passe n'est présent dans le dépôt : le seul élément
sensible est le secret `EXPO_TOKEN`, stocké dans les secrets GitHub. Les
compilations refusent de produire une application dont les types ou les tests
échouent, pour qu'un artefact publié soit toujours un artefact vérifié.

## Vérifications disponibles

```bash
npm run verifier:tout   # les trois contrôles, dans l'ordre
npm run verifier:flux   # 62 contrôles sur les flux de travail
npm run verifier        # types TypeScript
npm run test:domaine    # 116 tests sur la couche domaine
```

Les tests portent sur le domaine pur — arithmétique monétaire, périodes,
loyers, paiements, encodage, cryptographie. Ils tournent en quelques secondes
sous Node, sans appareil ni émulateur, et ce sont eux qui gardent les promesses
du tableau ci-dessus.

`scripts/check-workflows.mjs` valide les flux GitHub avant de pousser : YAML
analysé, chaque script `run:` passé à `bash -n`, actions épinglées, permissions
déclarées et suffisantes. Il est **le seul lecteur** de `.github/workflows`, donc
sa liste de flux attendus est **fermée dans les deux sens** : un flux manquant
échoue, un flux ajouté sans être déclaré échoue aussi. C'est le seul contrôle du
projet dont un sujet absent produirait un vert.

Sa portée est écrite dans son en-tête, et elle mérite d'être connue :
`bash -n` analyse sans évaluer, donc une expansion fautive (`${CHEMIN}` mal
orthographié) lui échappe. C'est un défaut d'exécution, pas de syntaxe.

