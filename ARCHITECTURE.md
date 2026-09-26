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
    _layout.tsx             # barre d'onglets : Accueil, Documents, Logements, Réglages
    index.tsx               # ACCUEIL : tableau de bord + cartes logements
    documents.tsx           # DOCUMENTS : quittances, baux, états des lieux,
                            #   inventaires, autres documents
    logements.tsx           # LOGEMENTS : ajouter, modifier, supprimer
    plus.tsx                # RÉGLAGES : thème, propriétaire, modèles, sauvegarde
  document/
    ajouter.tsx             # ranger dans un dossier un fichier déjà sur le téléphone
  bail/
    choisir.tsx             # désigner le logement dont on veut le bail
    nouveau.tsx             # formulaire guidé en neuf étapes
    verification.tsx        # relecture avant génération
    succes.tsx              # confirmation, partage
  etat-des-lieux/
    choisir.tsx             # désigner le logement, et la nature : entrée ou sortie
    nouveau.tsx             # formulaire guidé en six étapes, photos et signatures
    verification.tsx        # relecture avant établissement, comparaison comprise
    succes.tsx              # confirmation, partage, exemplaires à remettre
  inventaire/
    choisir.tsx             # désigner le logement, et la nature : entrée ou sortie
    nouveau.tsx             # formulaire guidé en cinq étapes, comptage et photos
    verification.tsx        # relecture avant établissement, mobilier obligatoire compris
    succes.tsx              # confirmation, partage, annexion au bail
  logement/
    nouveau.tsx             # assistant de création en 4 étapes
    [id].tsx                # détail d'un logement
    [id]/dossier.tsx        # dossier documentaire, par locataire
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
  reinitialiser.tsx         # remise à zéro complète, confirmée par un mot
  sauvegarde/
    export.tsx              # création d'une sauvegarde chiffrée
    import.tsx              # restauration d'une sauvegarde

src/
  domain/                   # moteur métier pur, testable sans téléphone
    types.ts                # types du domaine, y compris les pièces du dossier
    money.ts                # arithmétique en centimes (jamais de flottants)
    period.ts               # mois, années, comparaisons, clés de période
    rent.ts                 # loyer dû pour un mois, selon date d'effet et bail
    payments.ts             # cumul des paiements, solde, statut, action contextuelle
    dossier.ts              # ordre du dossier, rattachement des pièces, saisie
    bail.ts                 # règles du bail : catégories, durée, dépôt, annexes
    etat-des-lieux.ts       # pièces, éléments, états, compteurs, clés, contrôle, comparaison
    signature.ts            # une seule forme de signature, partagée
    numbering.ts            # numérotation unique et stable des documents
    rappels.ts              # texte des rappels, sans mois figé
    reinitialisation.ts     # le mot qui confirme un effacement, règle pure
  documents/
    stockage.ts             # copie d'un fichier choisi dans le dossier des documents
    bail-contexte.ts        # ce que la location porte déjà, lu en une fois
    photos.ts               # prise, choix, compression et rangement des photos
  db/
    schema.ts               # schéma SQL, migrations versionnées, tables à vider
    database.ts             # ouverture, pragmas, migration au démarrage
    reinitialisation.ts     # effacement de toutes les données et des PDF
    repositories/           # owners, properties, payments, documents, pieces,
                            #   brouillons, settings
  pdf/
    styles.ts               # styles partagés par tous les modèles
    styles-colore.ts        # palette du modèle coloré, qui ne suit pas le thème
    models.ts               # les trois modèles de document, en HTML
    page.ts                 # format de page demandé à l'impression
    render.ts               # assemblage HTML puis impression PDF
    chargement.ts           # écriture et lecture des fichiers PDF
    groupee.ts              # génération en série
    partage.ts              # partage d'un document
    encodage.ts             # échappement du texte inséré dans le HTML
    trace.ts                # tracé de signature en URI, dimensions de photo
    bail.ts                 # rendu du bail
    etat-des-lieux.ts       # rendu paginé, photos sous leur élément, paires avant/après
    emettre-bail.ts         # contrôle, assemblage, impression, rangement du bail
    emettre-etat-des-lieux.ts # idem pour l'état des lieux
    legal.ts                # mentions légales françaises obligatoires
  backup/
    crypto.ts               # chiffrement authentifié (AES-GCM) + dérivation de clé
    export.ts               # constitution et écriture de la sauvegarde
    import.ts               # lecture, vérification, restauration
  ui/
    tokens.ts               # couleurs, espacements, rayons, typographie
    palette.ts              # les quatre accents, les deux modes, leurs défauts
    components/             # Carte, Bouton, PastilleStatut, Segments, EnTeteEcran…
    ecrans/                 # panneaux d'écran réemployés par plusieurs routes
      PanneauQuittances.tsx #   le contenu de la catégorie Quittances
  hooks/                    # hooks de données (chargement, rafraîchissement)
  state/                    # contexte applicatif (mois sélectionné, réglages)

tests/                      # tests du moteur métier avec node:test
.verif/                     # contrôleurs de binaire, mesure des témoins, falsificateurs
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

La génération se fait **en un appui**, sans écran intermédiaire : la catégorie
Quittances de l'onglet DOCUMENTS produit la quittance directement, et l'aperçu
n'est plus qu'un chemin de vérification, atteint en touchant le nom du logement.

### Consulter un document n'est pas l'imprimer

Signalé depuis le téléphone le 26 septembre 2026 : « lorsque je génère un bail
ou une quittance et je clique sur voir le pdf ça m'ouvre une fenêtre
d'impression comme si je voulais imprimer ».

Le défaut tenait à **un seul appel**. `ouvrirDocument` (`src/pdf/partage.ts`)
confiait le fichier à `Print.printAsync` d'`expo-print` — qui ne montre jamais un
document, mais demande au système de l'**imprimer**. Le nom de la fonction disait
« ouvrir », le comportement disait « imprimer », et rien ne le relevait : **aucun
test ne couvrait `ouvrirDocument`**. C'est la leçon de cette passe — un nom juste
sur un appel faux ne se voit qu'en lisant l'appel.

Les deux systèmes n'offrent pas la même chose, et il faut le dire :

- **Android** sait ouvrir un PDF dans le lecteur installé. L'ouverture passe par
  une intention `ACTION_VIEW` portant une **URI de contenu**
  (`FileSystem.getContentUriAsync`) et le drapeau `FLAG_GRANT_READ_URI_PERMISSION`
  (`flags: 1`). Sans ce drapeau, le lecteur n'a pas le droit de lire le fichier et
  Android refuse l'ouverture. Faute de lecteur, l'ouverture **retombe sur la
  feuille de partage** plutôt que d'échouer.
- **iOS n'expose aucune API** pour ouvrir un fichier dans une application tierce.
  La feuille de partage est le seul chemin, et c'est elle qui porte « Ouvrir
  dans… » et les lecteurs PDF installés. Sur iPhone, « Voir le PDF » demande donc
  un appui de plus qu'on ne le souhaiterait — ce n'est pas un choix, c'est iOS.

**`Linking.openURL` ne peut pas servir ici, et c'est mesuré.** Le module
d'intention de React Native construit bien une intention `ACTION_VIEW`
(`IntentModule.kt`), mais n'ajoute que `FLAG_ACTIVITY_NEW_TASK` — jamais
`FLAG_GRANT_READ_URI_PERMISSION`. Un `content://` de notre propre fournisseur
serait donc refusé par l'application qui le reçoit. D'où `expo-intent-launcher`,
qui laisse poser le drapeau.

**`imprimerDocument` a été retirée.** Cette fonction n'avait **aucun appelant** :
son seul effet visible était le défaut signalé, atteint par accident. Imprimer
reste possible — la feuille de partage porte « Imprimer » sur les deux systèmes,
et un lecteur PDF imprime aussi — mais l'application ne l'annonce plus comme une
façon de voir un document.

`tests/ouverture-document.test.ts` garde la règle, et
`.verif/falsifier-ouverture-document.py` lui remet **sept** fautes une à une, la
première étant **le défaut tel qu'il a été signalé**. Les écrans y sont
**découverts par balayage** plutôt que listés : un écran ajouté demain qui
propose « Voir le PDF » entre dans le contrôle tout seul. L'accord est exigé
**dans les deux sens** — vérifier seulement que chaque écran qui annonce
« Voir le PDF » ouvre bien le document laisserait passer le cas où l'annonce
disparaît, l'écran sortant alors du contrôle.

**Le correctif a été cherché dans le binaire livré, et le contrôle s'y est
trompé une fois.** Quatre fragments comptent **0** dans le bundle Android du
1.1.3 et **1** dans celui du 1.1.4 : `android.intent.action.VIEW`,
`IntentLauncher`, `startActivityAsync`, `Ouvrir le PDF`. Ils distinguent donc
réellement. Mais quatre autres — `printAsync`, `IntentLauncher`,
`startActivityAsync`, `getContentUriAsync` — comptent **1 des deux côtés** : ce
sont les noms des fonctions **internes aux modules importés**, présents parce
qu'on importe le module, même quand notre appel n'y est plus. Hermes les range
en `anon_0_printAsync`. Chercher `printAsync` pour prouver que l'impression est
partie donne 1 avant comme après — un témoin vert quoi qu'on livre. **Un témoin
ne s'adopte qu'après avoir été mesuré dans les deux binaires.**

**Un témoin propre à une plateforme ne se réclame pas de l'autre.** La branche
`Platform.OS === 'android'` est **retirée du bundle iOS** à l'empaquetage :
`android.intent.action.VIEW` y compte 0, et `android.intent`, `intent.action`,
`action.VIEW` comptent aussi 0 — la chaîne est absente, pas coupée. Le contrôle
de l'IPA réclamait donc un fragment que ce binaire **ne peut pas** contenir, et
échouait sur un fichier conforme. D'où `TEMOINS_ANDROID` dans `.verif/temoins.py`
et une plateforme déclarée à la lecture : les témoins non jugés sont **annoncés
hors plateforme**, jamais tus — les taire les ferait passer pour vérifiés.

## Les modèles de document

Le papier ne suit pas le thème de l'écran : les couleurs du document sont
déclarées à part (`COULEURS_DOCUMENT`), et deux modèles partagent `STYLES_BASE`.

- **`colore` (défaut)** vit dans `styles-colore.ts` et ses couleurs dans
  `COULEURS_COLORE`. Pour le faire tenir sur une feuille, on touche aux **marges
  et aux tailles, jamais au texte**. L'onglet et le tampon suivent
  `resteAPercevoir` ; le libellé du montant suit `contenu.type`.
- `classique` et `moderne` partagent `STYLES_BASE` avec `colore`.

`src/pdf/` importe en `.ts` — le rendu tourne donc sous `node --test`
(`tests/modele-colore.test.ts`) — et le format se demande dans `pdf/page.ts`.

**Tenue en page.** Une quittance tient sur une seule feuille dans les marges A4
(6,35 mm mesurés à l'impression), et `tests/tenue-en-page.test.ts` le garde.
**Un contenu très long déborde** des trois modèles : c'est une limite de
`STYLES_BASE`, commune et préexistante.

**Les bancs de mesure** lisent `modeles.json`, produit par `rendre-modeles.ts` :
`mesurer-pages.py`, `mesurer-marges-impression.py`, `eprouver-paiements.py`.

## Les baux de location

Un bail n'est pas une quittance. La quittance **atteste un paiement** et se
numérote ; le bail **établit un accord** et se range. Les deux ne partagent donc
pas la même table (voir « Le dossier documentaire »), et le bail se rend par son
propre module.

**`src/domain/bail.ts`** porte les six catégories — vide, meublée, étudiant,
mobilité, colocation, stationnement — et, pour chacune, sa durée légale, son
plafond de dépôt de garantie, ses préavis, ses annexes obligatoires et ses points
de vigilance. Le module est **pur** : ni SQLite, ni React.

**Aucune clause n'est inventée.** Chaque règle chiffrée est adossée à une entrée
de `SOURCES_BAIL`, qui porte ce qu'elle établit, sa référence exacte et sa **date
de consultation**. Une règle qu'on n'a pas pu lire dans un texte officiel se
déclare `aVerifier` au lieu d'être devinée. Le document imprime ses fondements en
dernière page.

Ce que le domaine **corrige** au lieu de l'informer : le dépôt de garantie. Un
dépôt au-dessus du plafond — ou un dépôt quelconque dans un bail mobilité, où il
est interdit — **bloque** l'établissement du bail. Les annexes manquantes, elles,
n'empêchent rien : elles sont signalées, parce que le bailleur peut les joindre
après.

**Le droit change, et l'architecture doit suivre.** `CONTRATS_TYPES` porte la
date du **1er octobre 2026**, à partir de laquelle les nouveaux contrats types
réglementaires s'appliquent aux baux vides, meublés et aux colocations à bail
unique — avec la clause résolutoire pour impayés de loyer, de charges ou de dépôt
de garantie. Un bail conclu à cette date ou après le rappelle. Le modèle meublé
ne s'applique **ni** au bail mobilité **ni** aux locations saisonnières.

Le formulaire guidé compte **neuf étapes** (`ETAPES_BAIL`). Les deux premières ne
demandent aucune saisie : elles rappellent le logement et ses locataires, déjà
enregistrés. C'est la promesse « ne jamais ressaisir une information déjà
donnée », tenue par la forme du parcours et non par une consigne.

**`src/pdf/bail.ts`** rend le document — module pur, éprouvé par `node --test`.
Il échappe tout texte saisi, imprime les annexes jointes et **non jointes**, et
rappelle le plafond du dépôt à côté du montant. `finDuBail` ramène le jour au
dernier jour du mois d'arrivée : sans ce ramenage, un bail d'un mois commencé le
31 janvier finirait le 2 mars.

**Ce que le document dit de ses signatures.** Elles sont tracées au doigt sur
l'écran, puis figées. Le document l'écrit, et écrit aussi qu'elles **ne
constituent pas** une signature électronique qualifiée au sens du règlement (UE)
n° 910/2014 — l'application ne délivre ni certificat, ni horodatage, ni cachet de
tiers de confiance. `MENTION_SIGNATURE` est vérifiée par un test, et le banc
`falsifier-bail-rendu.py` refuse de laisser cette phrase être retournée.

**De la saisie au fichier rangé.** Le parcours traverse quatre modules, et
chacun a une raison d'être distincte :

```
app/bail/nouveau.tsx   le formulaire guidé — il ne calcule rien
  -> brouillons         (table, migration 3 : un brouillon survit à la fermeture)
  -> emettreBail        contrôle, assemble, imprime, range
  -> pieces             (document établi, rattaché au logement et au bail)
  -> documents/         (le fichier PDF, nommé par cheminPourPiece)
```

**`src/db/repositories/brouillons.ts`** garde les formulaires inachevés, dans
**leur propre table** et non dans `pieces` : y déposer un brouillon ferait
apparaître, dans le dossier du logement, un bail qui n'existe pas. La clé est
`(logement_id, type)` — un seul brouillon de bail par logement, qu'on reprend ou
qu'on écrase. `src/domain/brouillon.ts` (pur) décide de ce qui est **reprenable** :
un brouillon de plus de `JOURS_BROUILLON_RECENT` jours est proposé sans être
imposé, et une étape qui n'existe plus rend `null` au lieu de ramener l'utilisateur
sur un écran disparu.

**`src/pdf/emettre-bail.ts`** est le seul chemin qui écrit un bail. Il re-vérifie
`manquesDuBail` **côté émission** — un écran peut mentir, une fonction pure non —
puis reprend le loyer de `periodeLoyerApplicable` et non du formulaire : deux
implémentations du même calcul finiraient par ne plus s'accorder. Il ne réécrit en
base que les champs que le formulaire a le droit de corriger (dépôt, jour
d'échéance), afin qu'un dépôt imprimé et un dépôt enregistré ne puissent pas
différer.

**Les écrans** vivent sous `app/bail/` : `choisir.tsx` (point d'entrée depuis la
catégorie « Baux de location », qui **sépare** les logements pourvus d'un locataire
de ceux qui n'en ont pas, au lieu de filtrer en silence), `nouveau.tsx` (les neuf
étapes), `verification.tsx` (relecture section par section, génération **désactivée**
tant qu'il manque quelque chose) et `succes.tsx`. La vérification n'affiche pas
d'aperçu HTML : aucun moteur de rendu web n'est embarqué, et l'ajouter pour montrer
deux pages A4 sur un téléphone — c'est-à-dire mal — serait payer cher pour mentir.

Les bancs : `.verif/falsifier-bail.py` (**vingt** mutations du domaine),
`.verif/falsifier-bail-rendu.py` (**quatorze** du rendu) et
`.verif/falsifier-brouillon.py` (**six** de la reprise de brouillon).

**Un banc à la fois, jamais deux en parallèle.** Les deux bancs du bail mutent le
même `src/domain/bail.ts` et partagent le même fichier de sauvegarde : lancés
ensemble, l'un restaure pendant que l'autre croit avoir muté, et une mutation
**vivante** est alors comptée **muette** — le banc accuse les tests d'un défaut qui
n'existe pas. Mesuré : `20/0` en série contre `19/1` en parallèle, sur les mêmes
octets de départ. Le compteur d'un banc n'est lisible que si rien d'autre n'écrit
dans ses sources.

## Le dossier documentaire

Un logement ne porte pas « des documents » en vrac : il porte une **succession de
locations**, et chacune a ses pièces. L'ordre de lecture est la donnée :

```
bail → état des lieux d'entrée → état des lieux de sortie → inventaire
     → quittances → autres documents
```

Cet ordre vit dans `SECTIONS_DU_DOSSIER` (`src/domain/dossier.ts`), pas dans un
écran : le changer change ce que le bailleur lit en premier, et cela se vérifie
par un test.

**Deux tables, et non une.** `documents` porte les documents **émis** — les
quittances, numérotées par année, qui attestent un règlement. `pieces` porte les
documents **établis** — baux, états des lieux, inventaires, autres pièces. Les
mêler obligerait à rendre nulles la moitié des colonnes de `documents` (numéro,
mois, montants), et une colonne nulle finit par être lue comme un zéro. Le
dossier les réunit à l'affichage, sous une forme commune (`ElementDossier`).

**Le rattachement est ce qui compte.** Une pièce porte `logement_id` et,
facultativement, `bail_id`. Trois règles en découlent :

- une pièce rattachée à un bail apparaît sous **ce locataire**, même si la
  location est terminée depuis des années ;
- une pièce sans bail — un diagnostic, une facture de travaux — est rangée sous
  **le bien**, parce que la rattacher à un locataire ferait croire qu'elle lui
  est propre ;
- une pièce dont le bail n'existe plus, ce qu'une sauvegarde restaurée peut
  produire, est rangée sous le bien **plutôt qu'écartée** : un document qu'on ne
  sait plus rattacher doit rester visible, sinon il devient introuvable sans que
  personne ne s'en aperçoive.

**Aucun document ne disparaît parce qu'un locataire part.** Clôturer un bail
renseigne une date de sortie ; il ne supprime rien. Les quittances, le bail et
les états des lieux de ce locataire restent dans son dossier, et l'écran les
présente repliés, sous son nom.

**Les fichiers vivent dans `documents/`**, le même dossier que les quittances
émises — celui que la remise à zéro efface en entier. Un second dossier aurait
demandé de penser à l'effacer aussi, et c'est exactement l'oubli qui laisse des
documents personnels sur le téléphone après que l'écran a annoncé « tout a été
effacé ». Le nom du dossier est déclaré **une seule fois**, dans
`src/db/reinitialisation.ts`, et importé par `src/documents/stockage.ts` ; deux
contrôles tiennent l'accord : l'un vérifie que c'est bien le dossier où
`pdf/render.ts` écrit, l'autre que la remise à zéro le nomme.

**Ranger un fichier existant.** `app/document/ajouter.tsx` prend un PDF ou une
photo déjà sur le téléphone et le **copie** dans l'application : le fichier
d'origine peut vivre dans un cache que le système efface, ou sur une carte qu'on
retire. Le titre d'origine est conservé comme titre du document, et le fichier
reçoit un nom fabriqué par `src/documents/stockage.ts` — accents et espaces
retirés, comme pour les quittances. Si l'enregistrement en base échoue après la
copie, le fichier copié est retiré : un fichier que rien ne référence serait
invisible, et personne ne saurait qu'il existe.

## Les états des lieux

Un état des lieux décrit un logement **pièce par pièce, élément par élément**.
C'est le seul document du projet dont la longueur ne se maîtrise pas : une
quittance tient sur une feuille, un état des lieux en ouvre six.

### Le domaine (`src/domain/etat-des-lieux.ts`)

**Sept états, et non cinq.** `non_verifie` et `non_applicable` ne décrivent pas
le logement : le premier dit qu'on n'a pas regardé, le second que l'élément
n'existe pas dans cette pièce. Les mêler aux cinq autres ferait dire au document
« douze éléments en bon état » là où deux n'ont jamais été regardés.
`etatConstate` porte cette distinction, et la synthèse sépare `constates` de
`aRenseigner`.

**Un élément sans état bloque.** Un état par défaut serait un constat inventé ;
c'est précisément pour pouvoir terminer **sans mentir** que le septième état
existe. `manquesDeLEdl` refuse donc d'établir le document.

**Un index de compteur est une chaîne, jamais un nombre.** Il porte des zéros de
tête (`007412`) qui sont l'information : les parser en nombre les ferait
disparaître. La reprise d'un brouillon enregistré accepte un nombre et le
convertit ; elle n'accepte jamais de transformer une chaîne en nombre.

**Les identifiants sont déterministes** (`p1`, `e1`, `ph1`, `c1`, `k1`), dérivés
du rang par `premierLibre`. Deux raisons, et la seconde est la vraie :
`nouvelId()` passe par `expo-crypto`, que `node --test` ne charge pas — et un
état des lieux de sortie construit depuis celui d'entrée **réutilise les mêmes
identifiants**, ce qui rend la comparaison entrée/sortie exacte au lieu
d'heuristique. `identifiantRepris` refuse un identifiant dupliqué lu d'une
sauvegarde abîmée : deux pièces qui partageraient `p1` feraient comparer la
mauvaise pièce à la mauvaise.

**Une seule liste de règles, marquée par étape.** `exigencesDeLEdl` alimente à la
fois `manquesDeLEdl` (le contrôle final) et `manquesDeLEtapeEdl` (le bouton
« suivant »). Un test structurel vérifie l'égalité des deux sur treize
brouillons : le formulaire et le contrôle final ne peuvent pas diverger.

**Douze sections, quinze à la sortie.** `SECTIONS_EDL` porte les douze ;
`SECTIONS_EDL_SORTIE` en ajoute trois, et `sectionsEdl(type)` les **insère à
leur place** — après `bail`, avant `synthese` — pour que les sections communes ne
puissent pas diverger.

### Les signatures

`src/domain/signature.ts` porte une seule forme, partagée par le bail, l'état
des lieux et l'inventaire : `signatureValide` exige une date civile réelle **et
un tracé** — une signature sans tracé n'est pas une signature.

**L'appariement se fait par identifiant, jamais par rang.** La première version
de `pdf/etat-des-lieux.ts` assignait les signatures par position : dès qu'une
signature manquait, celle d'un colocataire se retrouvait sous le nom de l'autre.
`contenuEdlDepuis` construit une liste `SignataireImprime[]` avec les
identifiants des titulaires, et `corpsSignatures` apparie dessus. Un signataire
attendu qui n'a pas signé figure quand même, avec « Non signé » : c'est une
information, pas un oubli.

**Qui doit signer vient du domaine.** `signatairesAttendusDeLEdl` vivait dans le
module d'émission, et le formulaire en refabriquait une. Elle est remontée dans
le domaine parce que **deux endroits** en dépendent : le formulaire, qui refuse
d'avancer, et l'émission, qui réimprime. Deux constructions séparées finissent
par ne plus désigner les mêmes personnes.

**Ce que la signature vaut est dit dans le document.** Un tracé au doigt
matérialise l'accord comme un exemplaire signé à la main puis numérisé. Ce n'est
pas une signature électronique qualifiée, et le document l'écrit lui-même, sous
les signatures.

### Le rendu (`src/pdf/etat-des-lieux.ts`)

`STYLES_EDL` reprend la classe `.page` de `STYLES_BASE` — celle de la quittance
est une **colonne flex** à hauteur minimale de 285 mm, dessinée pour tenir sur
une feuille, et une colonne flex se pagine mal. L'état des lieux repasse en bloc
et laisse le contenu décider du nombre de feuilles.

Les ruptures de page sont tenues par des règles explicites : un titre ne reste
pas seul en bas de page (`break-after: avoid-page` sur les `h2` et les `h3` de
pièce), un élément **et ses photos** ne se séparent pas (`break-inside:
avoid-page` sur `.e-element`), et les deux listes du document — réserves et
sources — se lisent d'un bloc.

**Les photos s'impriment sous leur élément**, jamais regroupées à la fin : la
légende suit l'image, l'ensemble vit dans `.e-element`. Une photo en portrait est
plafonnée en hauteur (`HAUTEUR_PHOTO_MAX_MM`) et sa largeur **recalculée pour
conserver le rapport** — une photo étirée ne prouverait plus rien. Une photo dont
le fichier est illisible imprime « Photo illisible » : l'omettre ferait croire
qu'il n'y avait pas de photo.

**Toute valeur écrite dans un attribut HTML est échappée.** Le tracé de signature
du bail l'était ; l'URI de données de la photo et celle de la signature de l'état
des lieux ne l'étaient pas. Une URI contenant un guillemet fermait donc
l'attribut `src`, et Chromium imprimait le texte de remplacement **plus le
balisage restant** à la place de l'image. Défaut trouvé par le banc de
pagination, corrigé aux deux endroits, et tenu par deux tests.

### L'état des lieux de sortie, et la comparaison

Une sortie **se compare** à une entrée : c'est ce que l'article 3 du décret
demande à la forme du document. Trois pièces s'y emploient.

**`sortieDepuisLEntree`** reprend de l'entrée trois listes, et les traite
différemment — c'est là que se joue la vérité du document :

| Ce qui est repris | Ce qui est gardé | Ce qui est vidé |
| --- | --- | --- |
| Pièces et éléments | identifiants, noms | états, commentaires, photos |
| Compteurs | type, précision | **l'index** |
| Clés | libellé, destination, quantité | — |

Les **identifiants** sont la raison d'être de la reprise : c'est par eux que
l'appariement se fait, sans deviner quelles « Chambre » se correspondent. Les
**états** sont vidés parce qu'une sortie constate à nouveau : recopier le constat
d'entrée ferait signer au locataire un document décrivant une visite qu'il n'a
pas faite. L'**index** d'un compteur est vidé pour la même raison, en plus
radicale : un index recopié est un relevé inventé, et le domaine refuse
d'établir le document tant qu'il est vide. Les clés sont une **proposition** —
le cas courant est que les mêmes reviennent — que l'écran montre remplie et
modifiable.

**`comparerEdl(entree, sortie)`** met les deux constats en regard. Deux règles y
comptent plus que les autres :

- **`evolution` n'est vrai que si les deux états sont *constatés* et diffèrent.**
  Un élément « non vérifié » à l'entrée puis « bon » à la sortie n'a pas évolué :
  personne ne l'avait regardé. C'est `etatConstate` qui tranche, et
  `incomparables` compte ces éléments à part pour que le document puisse le dire
  au lieu de les annoncer comme inchangés.
- **Rien ne qualifie l'écart.** Ni dégradation, ni responsabilité : le tableau
  porte deux constats et pas une colonne de plus, et la phrase qui suit rappelle
  que le document n'impute rien au locataire. Elle est répétée **dans la section
  des évolutions**, et pas seulement dans celle sur la vétusté : c'est là que le
  lecteur voit les écarts.

Un élément présent d'un seul côté est **listé quand même**, avec « Non décrit à
l'entrée » ou « Non décrit à la sortie ». Le taire ferait croire que le logement
a été regardé là, et le confondre avec « non renseigné » ferait lire un oubli de
saisie là où il n'y en a pas.

**Deux index de photos, jamais un.** Les deux documents numérotent leurs photos à
partir de `ph1` ; `contenuEdlDepuis` reçoit donc `photos` (la sortie) **et**
`photosEntree`, et `paireEnHtml` lit chacune de son côté. Un index unique ferait
dessiner deux fois la photo de l'entrée, et la colonne « Sortie » montrerait le
logement d'avant — un document faux que **rien dans le texte ne signalerait**. Le
banc de pagination le prouve par les pixels, avec deux teintes témoins distinctes.

**`emettreEtatDesLieux` relit l'entrée, il ne la reçoit pas.** Pour une sortie, il
retrouve la pièce nommée par `brouillon.entreeId` et relit son contenu structuré.
Trois refus explicites, plutôt qu'un repli silencieux : la pièce a disparu, la
pièce n'est pas une entrée, ou sa date ne correspond pas à celle que le brouillon
annonce. Se rabattre sur un autre état des lieux d'entrée ferait comparer la
sortie d'un locataire à l'entrée d'un autre. Si le contenu structuré n'existe pas
— un état des lieux rangé par une version antérieure n'a qu'un PDF — la
comparaison reste **absente**, et la section le dit au lieu d'imprimer un tableau
vide.

**Un état des lieux d'entrée et un état des lieux de sortie ont deux brouillons
distincts.** La clé primaire de `brouillons` est le couple (logement, type) :
avec une seule clé, commencer une sortie pendant qu'une entrée est en cours
écraserait l'entrée, en silence. `brouillonDeLEdl(type)` donne la clé, et le nom
`etat_des_lieux` reste celui de **l'entrée** — le renommer en
`etat_des_lieux_entree` serait plus symétrique et rendrait orphelin tout
brouillon déjà enregistré sur un téléphone.

**Les identifiants de photos sont uniques dans tout le document.** Ils ne
l'étaient que dans l'élément : `ajouterPhoto` cherchait un identifiant libre dans
la seule liste de l'élément, et l'écran empilait les vues d'ensemble **sans leur
en donner un**. L'impression indexant les images par identifiant, deux `ph1` — ou
deux chaînes vides — n'en faisaient dessiner qu'une, et la seconde disparaissait
sans que rien ne le signale. `identifiantsDePhotos` fournit la liste
documentaire, `ajouterPhotoDePiece` donne un identifiant aux vues d'ensemble, et
`reprendreBrouillonEdl` rend uniques ceux lus d'une sauvegarde abîmée.

### Le parcours

`app/etat-des-lieux/choisir.tsx` désigne le logement **et la nature** du document
— un `Segments` entrée / sortie. Pour une entrée, seuls les logements dont la
location est en cours sont proposés ; pour une sortie, il faut en plus qu'un
état des lieux d'entrée existe, puisque c'est à lui que la sortie se compare. Les
logements écartés ne disparaissent pas en silence : ils sont listés à part, avec
la raison et le geste qui débloque.

`app/etat-des-lieux/nouveau.tsx` est le formulaire guidé en six étapes
(logement, pièces, compteurs et clés, visite, observations, signatures). Il
n'enregistre pas à la fermeture mais **pendant** : un brouillon est écrit dans la
table `brouillons` après 500 ms d'inactivité, et au démontage. Le délai est plus
court que celui du bail parce qu'un état des lieux se remplit avec des photos, et
qu'un appareil photo qui revient au premier plan ne laisse pas toujours le temps
d'un délai long.

**Une photo est rangée avant d'être rattachée.** Le fichier est compressé
(`src/documents/photos.ts` : redimensionnement à 1280 px par `expo-image-manipulator`,
puis JPEG à 0,6) et déplacé dans `documents/photos/` **avant** que son chemin
n'entre dans le brouillon : si le rangement échoue, rien n'est rattaché, et
l'erreur est montrée. Le brouillon ne porte que des chemins ; les fichiers sont
lus au dernier moment par l'émission, et une photo disparue entre-temps donne une
entrée vide plutôt qu'une absence d'entrée.

`app/etat-des-lieux/verification.tsx` relit ce qui sera imprimé, section par
section, et **bloque** tant que `manquesDeLEdl` n'est pas vide. Les réserves du
domaine y sont montrées avant l'émission, parce qu'elles seront imprimées dans le
document. `app/etat-des-lieux/succes.tsx` rappelle le nombre d'exemplaires
(`exemplairesNecessaires` : un pour le bailleur, un par locataire, conformément à
l'article 3-2) et ce que vaut la signature.

### Les fondements

`SOURCES_EDL` porte sept entrées, chacune avec ce qu'elle **établit**, sa
référence et la date de consultation. Chaque section du document nomme son
`fondement`, et un test exige que tout `fondement` renvoie à une source
déclarée : un fondement qui ne renvoie à aucune source lue est une clause
inventée, même quand elle est vraie.

### Les marges d'impression, et les pages maigres

**Le blanc haut et bas est porté par le `@page`, jamais par `.page`.** C'est la
règle née d'un défaut signalé depuis un téléphone : *« pour l'état des lieux je
veux que toutes les pages laissent une marge pour l'impression et pas que la
1re »*. `STYLES_BASE` pose `@page { margin: 0 }` et met les blancs dans `.page` —
or un rembourrage de **bloc** ne protège que la **première** feuille. Mesure du
24 septembre 2026 avant correction : le premier texte de la page 2 s'imprimait à
**2,3 mm** du bord haut, et le dernier de la page 5 à **1,4 mm** du bord bas,
sous le quart de pouce (6,35 mm) que beaucoup d'imprimantes ne savent pas
imprimer. `@page` est la seule règle que le moteur applique à **chaque** page.
`STYLES_EDL` porte donc `@page { size: A4; margin: 14mm 0 }`, et `.page` garde le
seul rembourrage latéral (`0 18mm`), parce que le `@page` sert aussi au modèle de
quittance dont la tenue sur une feuille repose sur un calcul en millimètres.

La valeur est **mesurée**, pas choisie : 12 mm donne 15,2 mm au pire ; 14 mm donne
15,2 mm sur les pages 2 et suivantes ; 20 mm fait passer l'état des lieux complet
de 6 à 7 feuilles et la sortie de 5 à 6 ; 30 mm, comme le bail, en ferait 8 et 9.
Aucune valeur de 12 à 18 mm ne change la pagination.

**Un banc qui ne mesure que la page 1 reste vert sur ce défaut.** C'est
exactement ce qui s'était produit : `.verif/mesurer-marges-impression.py` lit
`page = document[0]`. Les deux bancs des constats portent donc une mesure qui
**boucle sur toutes les pages** (`marge_haut_bas`), et une page entièrement
blanche rend `None` — elle ne porte pas d'encre, il n'y a pas de marge à y
mesurer, et la compter comme un zéro ferait échouer le document sur une
séparation légitime. `.verif/mesurer-marges-pages.py` est l'outil de diagnostic
qui imprime, page par page, la marge des quatre bords.

**Une page maigre vient d'un bloc insécable, pas d'un manque de place.** Le même
document se terminait sur une septième feuille de **108 caractères** — les deux
réserves seules. La cause n'est pas le volume : resserrer les blocs de section
(6 → 4 mm), les blocs de pièce (5 → 3,5 mm) ou les lignes d'élément (1,8 → 1,2 mm)
ne change **ni le nombre de pages ni le nombre de pages maigres**. La cause est un
bloc qui **saute en entier** plutôt que de se couper : `.e-element` porte
`break-inside: avoid-page` — et c'est justifié, une photo détachée de sa ligne ne
montre plus ce qu'elle illustre — mais un bloc « élément + photos » peut alors
atteindre 130 mm et ne plus tenir en bas de page.

**Le levier est donc la hauteur des photos, et elle a été mesurée.**
`HAUTEUR_PHOTO_MAX_MM` (`src/pdf/constats.ts`) est passée de 105 à **60 mm** :

| plafond | état des lieux complet | inventaire complet | inventaire de sortie |
|---|---|---|---|
| 105 mm (avant) | 6 p. | 7 p., page orpheline | 6 p. |
| 75 mm | 6 p. | 7 p., page orpheline | 6 p. |
| **60 mm (retenu)** | **5 p.** | **6 p.** | 6 p. |
| 45 mm | 5 p. | 6 p. | 6 p., aucune page maigre |

45 mm a été écarté : à 85 mm de large, il donne à un portrait un rapport de 0,53,
où l'on ne distingue plus un objet debout — ce qui dessert un constat. 75 mm ne
gagne rien et fait revenir la page orpheline. Le plafond est **lu dans la source**
par les deux bancs, qui le comparent à la hauteur réellement dessinée (57,9 mm et
57,5 mm mesurés) : deux plafonds qui divergeraient, c'est un document coupé en
deux.

**`break-inside` sur une liste entière est un piège, mais pas celui qu'on
croyait.** Le commentaire qui portait `.e-liste { break-inside: avoid-page }`
affirmait que le moteur l'ignore quand la liste dépasse une page. C'est faux :
la liste **saute en bloc**. La consigne a néanmoins été retirée pour ce qu'elle
coûtait vraiment — la page orpheline des réserves — et la mesure avant/après dit
honnêtement ce qu'elle ne réglait pas : même nombre de pages, même nombre de
pages maigres, la page maigre s'étant seulement déplacée. Ce qui reste est gardé :
**la puce ne se coupe pas** (`break-inside: avoid-page` sur `li`), **la liste,
oui**.

**Le nombre de pages est borné par le haut dans les deux bancs.** Un plancher
seul — « au moins cinq pages » — resterait vert sur un document qui s'étire.
`MAXIMUM_DE_PAGES_COMPLET` vaut 5 pour l'état des lieux et 6 pour l'inventaire,
et c'est ce qui donne un témoin au plafond de photo : le remonter à 105 mm fait
**tomber** le banc au lieu de le laisser vert.

## L'inventaire du mobilier

C'est le constat d'une location **meublée** : ce que le logement contient, en
quel nombre et dans quel état. Le parcours est celui de l'état des lieux — choisir,
remplir, vérifier, établir — parce que c'est le même geste, et il ne justifiait
pas un second parcours avec ses propres conventions de retour.

### Ce qui est partagé, et non recopié

Un meuble se constate dans les mêmes termes qu'un mur, et « Photo illisible » ne
se dit pas de deux façons. Les sept états (`src/domain/etats.ts`), la pastille,
le plafond de hauteur d'une photo (`src/pdf/constats.ts`), le squelette des
sections d'un constat (`src/pdf/sections-constat.ts`), la règle des signataires
(`src/domain/signature.ts`) et le vocabulaire des pièces sont **une seule**
implémentation. Un inventaire reprend `STYLES_EDL` et n'ajoute que ce qu'il est
seul à imprimer : la liste légale du mobilier obligatoire, le mobilier pièce par
pièce, la mise en regard de deux constats, et sa synthèse.

### Deux décisions de fond

**Une quantité non comptée n'est pas un compte.** Le nombre d'exemplaires d'un
meuble est facultatif, et son absence **bloque** l'établissement du document. Un
défaut de `1` compterait un meuble que personne n'a compté ; un défaut d'état
serait un constat inventé. Mais `0` a un sens, et un sens utile : « il n'y en a
plus ». C'est ainsi qu'un inventaire de sortie signale qu'une chaise a disparu,
sans aucun vocabulaire d'accusation.

**Un inventaire de sortie ne recopie pas le constat d'entrée.**
`sortieInventaireDepuisLEntree` reprend les pièces, les meubles, leurs
identifiants et leurs noms — c'est ce qui permet à `comparerInventaire`
d'apparier **par identifiant**, jamais par nom ni par rang — et rien d'autre. La
quantité d'entrée est rendue **à part**, dans `quantitesEntree`, pour que l'écran
l'affiche à côté d'un champ vide : un rappel se lit, il ne se valide pas. L'état,
les observations et les photos sont vidés, parce qu'un inventaire de sortie
constate à nouveau.

`quantitesEntree` est indexé par `cleDeRappel(pieceId, meubleId)`, et non par
l'identifiant du meuble : les identifiants sont déterministes et **propres à leur
pièce** (`m1`, `m2`… par pièce), si bien qu'une carte indexée par le seul
identifiant gardait la dernière quantité lue et l'affichait partout. Mesuré sur
la liste par défaut d'un appartement : **60 meubles comptés n'en laissaient que
11**, et le séjour aurait rappelé le compte de la chambre.

### Les deux index de photos

Les deux documents numérotent leurs photos à partir de `ph1`. La mise en regard
résout donc chaque côté contre **son propre** index (`CoteDePaire` porte le
sien) : un index commun ferait imprimer la photo de l'entrée dans la colonne
« Sortie », et le document montrerait le logement d'avant en prétendant montrer
celui d'après. Rien dans le texte ne le dirait ; seul un banc qui compte les
pixels peut le voir — `.verif/mesurer-inventaire.py` exige deux teintes
distinctes, et `.verif/falsifier-inventaire.py` prouve que ce contrôle tombe
quand on résout le côté entrée contre l'index de la sortie.

### Le mobilier obligatoire

`ELEMENTS_MEUBLE_OBLIGATOIRES` reproduit les onze éléments que la loi énumère
pour un logement meublé, **y compris leur orthographe** : c'est une citation, et
le Journal officiel écrit « Etagères » sans accent. `presenceDesElementsObligatoires`
cherche leurs mots dans les noms de meubles et dit ce que l'inventaire en trouve.
Un élément non trouvé **ne bloque pas** — le logement n'est peut-être pas loué
meublé, ou le meuble est rangé ailleurs — mais il est signalé dans le document.

La déclaration « loué meublé » est faite par le bailleur, jamais supposée. Pour un
inventaire de sortie, c'est celle de l'entrée qui fait foi : c'est elle qui a été
signée. Une déclaration contraire dans le brouillon de sortie ne se tranche pas en
silence — l'émission s'arrête et le dit, parce qu'un des deux documents se
tromperait, et que le choix appartient au bailleur.

### Où il se range

Les deux natures se rangent sous le **même** type de pièce, `inventaire` : c'est
le champ `type` enregistré dans `donnees` qui dit de laquelle il s'agit, et c'est
lui que lisent la fiche du logement, l'écran de choix et l'émission d'une sortie.
Le titre, lui, diffère (`titreDeLInventaire`), si bien que les deux documents
d'une même location restent distincts dans le dossier.

## La sauvegarde et la restauration

Une sauvegarde est un fichier **chiffré**, protégé par un mot de passe dérivé par
PBKDF2 (`src/backup/pbkdf2.ts`). Une simple copie de la base SQLite n'en serait
pas une : elle serait lisible par quiconque met la main sur le téléphone.

Elle contient les données de gestion, les réglages — signature comprise, sans quoi
les documents suivants ne ressembleraient plus aux précédents — **et les fichiers
du dossier documentaire**, chiffrés avec le reste : des photos de logement sont
des données personnelles.

**Le changement de version 1 à 2 est purement additif.** Une sauvegarde ancienne
se restaure sans fichiers, ce qui est exactement ce qu'elle contenait ; la refuser
priverait l'utilisateur de ses propres sauvegardes. Le champ `fichiers` est donc
facultatif, et le contrôle de forme porte sur sa **forme quand il est là**, jamais
sur sa présence.

Trois décisions valent d'être dites :

- **Le chemin enregistré est relatif** au dossier de l'application. Un chemin
  absolu change à chaque installation : le restaurer sur un autre téléphone
  désignerait un dossier qui n'existe pas, et toutes les photos seraient perdues
  sans que rien ne le dise. La restauration le reconstruit.
- **Les fichiers sont réécrits après la transaction.** Les écrire avant poserait
  les fichiers de la sauvegarde dans le dossier de l'installation **actuelle** :
  si la transaction échouait ensuite, l'utilisateur garderait ses données
  d'aujourd'hui avec les fichiers d'hier. Dans cet ordre-ci, un échec laisse des
  lignes sans fichier — ce que `documentsSansFichier` et `piecesSansFichier`
  savent nommer, et que l'écran affiche.
- **Un plafond de 64 Mo, et il se dit.** Au-delà, la sauvegarde refuse et
  l'explique, plutôt que de laisser le téléphone manquer de mémoire au milieu du
  chiffrement. Un refus annoncé vaut mieux qu'un échec silencieux.

Le comptage des fichiers manquants couvre **les documents et les pièces** : un
bail signé, un état des lieux ou un inventaire porte lui aussi un `cheminFichier`,
et un écran qui n'aurait compté que les quittances aurait annoncé une restauration
complète en laissant des constats sans PDF.

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
| Aucun autre document ne se crée, mais tout document déjà émis reste lisible | `DocumentEmissible` et `documentAutorise` (`null` hors règlement intégral) dans `src/domain/payments.ts` ; le rendu garde ses branches `recu` / `avis_echeance` | `tests/payments.test.ts`, `tests/modele-colore.test.ts` |
| Une quittance oubliée reste rattrapable, sans parcourir les mois un par un | `quittancesARattraper` dans `src/domain/payments.ts` | `tests/payments.test.ts` |
| Un changement de loyer ne modifie aucun mois passé | `planifierChangementLoyer` dans `src/domain/rent.ts` | `tests/rent.test.ts` |
| Aucune règle de calcul n'est dupliquée entre l'écran et le document | `contexteDuMois` dans `src/domain/payments.ts`, seul point d'assemblage | `tests/payments.test.ts` |
| Le rappel de loyers ne peut pas annoncer un mois faux | `texteRappel` dans `src/domain/rappels.ts` — le message ne nomme jamais de mois, parce qu'il est figé une fois pour toutes | `tests/rappels.test.ts` |
| Une remise à zéro n'oublie aucune table, et son ordre respecte les clés étrangères | `TABLES_A_VIDER` dans `src/db/schema.ts`, dont l'ordre est **dérivé** des `REFERENCES` de `MIGRATIONS` | `tests/reinitialisation.test.ts` |
| Rien ne survit à l'effacement : ni les lignes, ni les PDF, ni le rappel programmé | `effacerToutesLesDonnees` (`src/db/reinitialisation.ts`), `annulerRappel`, `rechargerReglages` | `tests/reinitialisation-fichiers.test.ts` |
| Le mot qui confirme un effacement est celui que le domaine définit | `confirmationValide` dans `src/domain/reinitialisation.ts` | `tests/reinitialisation.test.ts` |
| Un document reste rattaché au locataire qui l'a signé, jamais au suivant | `construireDossier` dans `src/domain/dossier.ts` — le rattachement se fait par `bailId`, et une pièce orpheline va sous le bien plutôt que d'être écartée | `tests/dossier.test.ts`, falsifié par `.verif/falsifier-dossier.py` |
| L'ordre du dossier est la vie de la location, et il est le même partout | `SECTIONS_DU_DOSSIER` dans `src/domain/dossier.ts` | `tests/dossier.test.ts` |
| Le thème affiché à l'ouverture est celui des réglages par défaut | `COULEUR_PAR_DEFAUT` / `MODE_PAR_DEFAUT` dans `src/ui/palette.ts`, d'où `REGLAGES_PAR_DEFAUT` les tire | `tests/theme.test.ts` |
| Un meuble décrit sans son état, ou sans son nombre, bloque l'établissement du document | `manquesDeLInventaire` dans `src/domain/inventaire.ts` — relu à l'**émission**, et pas seulement dans le formulaire, pour qu'un brouillon restauré d'une sauvegarde ne passe pas | `tests/inventaire.test.ts` |
| Un inventaire de sortie ne recopie aucun constat d'entrée | `sortieInventaireDepuisLEntree` dans `src/domain/inventaire.ts` — identifiants et noms repris, quantité rendue **à part**, états et photos vidés | `tests/inventaire.test.ts` |
| Le rappel d'une quantité désigne un meuble **dans sa pièce**, jamais dans le document | `cleDeRappel` et `quantiteRappelee` dans `src/domain/inventaire.ts` — les identifiants de meubles sont propres à leur pièce | `tests/inventaire.test.ts`, falsifié par `.verif/falsifier-rappel-quantite.py` |
| Les deux colonnes d'une paire avant / après portent **deux** images, et non deux fois la même | `CoteDePaire` porte son propre index, résolu par `paireEnHtml` dans `src/pdf/sections-constat.ts` | `tests/inventaire-rendu.test.ts`, et la mesure des pixels par `.verif/mesurer-inventaire.py` — falsifié par `.verif/falsifier-inventaire.py` |
| Une sauvegarde emporte les fichiers eux-mêmes, et se relit sans eux | `VERSION_CONTENU` porté à 2, `rassemblerFichiers` (`src/backup/export.ts`) et `restaurerFichiers` (`src/backup/import.ts`) — champ **facultatif**, chemin **relatif** | `tests/promesses-sauvegarde.test.ts` |
| Aucun écran de sauvegarde ne promet une régénération que l'application ne fait pas | `app/sauvegarde/export.tsx` et `import.tsx` — l'ancienne phrase « les PDF peuvent être régénérés » est interdite par le contrôle | `tests/promesses-sauvegarde.test.ts` |
| « Voir le PDF » ouvre le document, et ne le fait pas imprimer | `ouvrirDocument` dans `src/pdf/partage.ts` — intention de consultation sur Android, feuille de partage sur iOS ; l'impression n'y est plus importée | `tests/ouverture-document.test.ts`, falsifié par `.verif/falsifier-ouverture-document.py` |

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

## La remise à zéro

L'écran `app/reinitialiser.tsx`, atteint depuis les réglages, remet l'application
dans son état d'installation : logements, baux, titulaires, périodes de loyer,
paiements, documents, pièces du dossier, fichiers PDF et réglages. **Il n'y a ni
corbeille, ni annulation** : le bouton destructeur n'est actif qu'après recopie
du mot défini par `MOT_CONFIRMATION` (`src/domain/reinitialisation.ts`), et la
règle `confirmationValide` est pure, donc éprouvable sans téléphone.

Trois décisions portent la sûreté de cette opération :

- **L'ordre de suppression est dérivé du schéma.** `TABLES_A_VIDER`
  (`src/db/schema.ts`) vide chaque table **enfant avant son parent**. Ce n'est pas
  une commodité : `PRAGMA foreign_keys = ON` est actif et
  `logements.proprietaire_id` est déclaré `ON DELETE RESTRICT`, si bien qu'un
  propriétaire supprimé avant ses logements ferait échouer la transaction — et
  laisserait l'application **à moitié effacée**, le pire des états puisque le
  bailleur croirait avoir tout supprimé. `tests/reinitialisation.test.ts` **relit
  les `REFERENCES` de `MIGRATIONS`** et exige que la liste en soit un ordre
  topologique : une table ajoutée demain sans être mise dans la liste, ou mise au
  mauvais rang, tombe là plutôt que sur le téléphone.
- **L'effacement suit la liste du schéma, il ne la recopie pas.**
  `effacerToutesLesDonnees` (`src/db/reinitialisation.ts`) parcourt
  `TABLES_A_VIDER` dans une seule transaction, puis supprime le dossier
  `documents/` — celui-là même où `src/pdf/render.ts` écrit les quittances, et
  celui où `src/documents/stockage.ts` range les pièces du dossier. Le
  dossier entier, et non les chemins un par un : c'est ce qui attrape aussi les
  PDF qu'une ligne perdue avait déjà rendus orphelins.
  `tests/reinitialisation-fichiers.test.ts` **dérive** le nom du dossier du
  moteur de rendu : renommé d'un seul côté, le contrôle tombe. C'est aussi
  pourquoi `DOSSIER_DOCUMENTS` n'est déclaré **qu'une fois**, dans
  `src/db/reinitialisation.ts`, et importé ailleurs.
- **Deux choses ne sont pas dans la base** et doivent être défaites par l'écran :
  le **rappel programmé**, que le système détient et qui survivrait à
  l'effacement (`annulerRappel`), et les **réglages en mémoire**, que
  `rafraichir` ne relit pas (`rechargerReglages`). Sans le second, le thème et la
  signature resteraient affichés alors que la base ne les porte plus.

L'écran efface d'abord les lignes, puis les fichiers. L'ordre inverse serait
pire : effacer les PDF d'abord laisserait des documents listés mais illisibles,
c'est-à-dire des quittances que l'application prétendrait encore pouvoir ouvrir.

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

**`expo-intent-launcher` ouvre les PDF sur Android**, épinglé à `~57.0.1` — la
version que le SDK 57 attend, **lue** dans
`node_modules/expo/bundledNativeModules.json` et non devinée. C'est un module
**natif** : il ne prend effet qu'à la compilation suivante. React Native ne peut
pas le remplacer, son `Linking.openURL` ne posant pas le drapeau de lecture (voir
« Consulter un document n'est pas l'imprimer »).

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

## La mémoire du projet

Le fichier `.workbuddy-ai/memory/MEMORY.md`, **hors du dépôt** (un cran au-dessus,
aux côtés de ce document), porte les seuls faits qu'un agent doit retrouver sans
relire 66 000 octets d'architecture. Il a **deux façons d'échouer**, et une seule
se voit dans sa taille :

- **tronqué** — au-delà de son budget, la fin disparaît au chargement. Mesuré :
  l'injection s'arrête à **8 133 octets**, et la coupe emporte alors précisément
  la section qui annonce ce budget ;
- **appauvri** — resserré pour tenir sous ce budget, jusqu'à ce que des faits
  n'existent plus nulle part. C'est le défaut le plus coûteux, et il ne se voit
  pas : le fichier est plus court, plus propre, et **faux**.

D'où deux bancs, et ils se lisent ensemble :

```bash
python .verif/verifier-memoire.py <chemin de MEMORY.md>
python .verif/diagnostiquer-memoire.py <chemin de MEMORY.md>
```

`verifier-memoire.py` porte la liste des faits à ne pas perdre — 43 témoins
nommés — et exige **que chacun vive quelque part** : dans la mémoire, ou hors
d'elle. Il distingue trois verdicts, et un seul fait échouer :

| verdict | sens | défaut ? |
| --- | --- | --- |
| dans la mémoire | le fait y est | non |
| **déplacé** | le fait vit ailleurs, et le nom du porteur est imprimé | non |
| **perdu** | le fait ne vit nulle part | **oui** |

Cette distinction est le point du banc, et elle a coûté cher à apprendre. Écrit
d'abord pour exiger les 43 témoins **dans le fichier**, il contredisait la
dernière ligne de la mémoire elle-même — « ce qui n'est pas ici vit dans les
skills nommées et dans `ARCHITECTURE.md` » — et forçait à payer deux fois le même
fait. Le 24 septembre 2026, une passe de resserrement a donc mené la mémoire de
8 614 à **8 127 octets** sans perdre un seul fait, et le banc l'a déclarée
**appauvrie** : **19 témoins sur 43**. La mesure a montré que **23** d'entre eux
étaient simplement **déplacés** — 18 dans ce document, 5 dans des skills, 1 dans
`.github/COMPILATION.md` — et que **un seul** était réellement perdu
(`falsifier-reinitialisation`, le banc qui garde la remise à zéro). Ce fait a été
remis dans la mémoire ; le banc a été corrigé.

**Un témoin ne se retire donc que si le fait vit ailleurs — et cela se mesure.**
Le réflexe d'attribuer un fait à une skill au nom plausible est ce que la mesure
interrompt : `createClient` et `SECURITY DEFINER` ont ainsi été déclarés absents
d'une skill où on les croyait rangés, 0 occurrence, et la règle est restée en
clair. `diagnostiquer-memoire.py` sert à cela : il **relit la liste des témoins
dans le banc** — la recopier la ferait diverger de celle qui juge — et imprime,
témoin par témoin, où le fait vit quand il a quitté la mémoire.

Le seuil de marge est de **50 octets**, et non les plusieurs centaines héritées :
exiger davantage forcerait à supprimer des faits, ce que ce banc existe
précisément pour empêcher. Le raisonnement complet, les passe précédentes et les
mesures de budget des deux mémoires (projet et utilisateur) sont dans la skill
`resserrer-une-memoire-tronquee`.

## Vérifications disponibles

```bash
npm run verifier:tout    # les quatre contrôles, dans l'ordre
npm run verifier:flux    # contrôles sur les flux de travail
npm run verifier:resume  # ce que le flux iOS annonce à la fin
npm run verifier         # types TypeScript
npm run test:domaine     # tests de la couche domaine
```

Les tests portent sur le domaine pur — arithmétique monétaire, périodes,
loyers, paiements, dossier documentaire, encodage, cryptographie. Ils tournent en
quelques secondes sous Node, sans appareil ni émulateur, et ce sont eux qui
gardent les promesses du tableau ci-dessus.

Un module du domaine importe en **chemin relatif avec l'extension `.ts`** : Node
ne résout ni l'alias `@/`, ni un chemin sans extension. Un module testé qui
importerait `from './period'` ne se chargerait pas, et le test échouerait à
l'import — pas sur ce qu'il vérifie.

`npm run verifier:tests` type les tests à part, avec `tsconfig.tests.json` :
`tsconfig.json` exclut `tests/` et `.verif/`, donc sans ce second passage les
tests ne seraient pas typés du tout.

`.verif/falsifier-dossier.py` **mute** la source du domaine, relance
`tests/dossier.test.ts` et exige qu'il tombe — sept mutations, sept règles. Un
test vert qu'aucune mutation ne fait tomber ne prouve rien : il ne mesure peut-être
rien. Chaque mutation part des octets d'origine, et la source est restaurée dans
un `finally` : une mutation oubliée accuserait ensuite le code pour un défaut qui
n'existe plus.

**Un banc à la fois, jamais deux en parallèle.** Deux bancs qui mutent le même
fichier se neutralisent : l'un restaure pendant que l'autre croit avoir muté, et
une mutation **vivante** est comptée muette. Mesuré sur les bancs du bail :
`20/0` en série contre `19/1` en parallèle, sur les mêmes octets de départ.

`.verif/falsifier-bail.py` (vingt mutations du domaine),
`.verif/falsifier-bail-rendu.py` (quatorze du rendu),
`.verif/falsifier-brouillon.py` (six de la reprise de brouillon),
`.verif/falsifier-etat-des-lieux.py` (vingt-huit, domaine et rendu),
`.verif/falsifier-rappel-quantite.py` (une : le rappel indexé par le seul
identifiant du meuble) et
`.verif/falsifier-edl-pagination.py` / `.verif/falsifier-edl-sortie.py` (neuf sur
les pages réellement imprimées) suivent la même méthode. Chacun écrit sa
sauvegarde dans `.verif/sauvegardes/` — jamais **à côté de sa source**, où elle
apparaîtrait dans `git status` comme si elle faisait partie du projet — et
**prouve la restauration sur les octets**, jamais sur la couleur des tests : une
source laissée mutée peut rendre les tests verts par chance.

**Les fins de ligne sont réglées par un `.gitattributes`, et il en fallait un.**
Mesuré le 24 septembre 2026 : `src/pdf/etat-des-lieux.ts` et `src/pdf/styles.ts`
revenaient en **CRLF** après une édition, alors que les objets Git portent des
LF — `git ls-files --eol` les montrait en `i/lf w/crlf`. Git ne signalait aucun
changement de contenu, mais les **octets** différaient, et les automates dont les
ancres sont écrites avec `\n` échouaient alors sur un fichier juste. La racine
est que `core.autocrlf=true` reconvertissait à chaque passage, faute de règle.
`.gitattributes` pose donc `* text=auto eol=lf`, marque les binaires (`*.png`,
`*.jpg`, `*.ipa`, `*.apk`, `*.aab`, `*.pdf`) et force `eol=lf` sur les sources et
les documents. `git add --renormalize .` aligne l'index ; `styles.ts` rend alors
une empreinte **identique** à son objet `HEAD`, donc son contenu était intact.

**Mais la copie de travail restait en CRLF, et rien ne le disait.** Mesure du
26 septembre 2026 : **40 fichiers** étaient encore en `i/lf w/crlf` — l'objet Git
sans aucun retour chariot, la copie de travail avec un par ligne. Git ne le
signale pas, puisqu'il normalise à la lecture comme à l'écriture.
`.verif/normaliser-fins-de-ligne.py` les ramène au blob, et **prouve la
conversion sur l'objet que Git stockerait** (`git hash-object --path=…`), jamais
sur `git status` : après conversion, les fichiers non modifiés apparaissaient
` M` alors qu'aucun octet de contenu n'avait bougé — un cache de statistiques
périmé, que `git add` rafraîchit. **Un témoin qui crie au loup sur un arbre juste
ne vaut rien.**

`.verif/pages-maigres.py` imprime le nombre de caractères de **chaque** page d'un
PDF rendu, et signale celles qui en portent moins de 600 : un bloc insécable qui
a sauté laisse une feuille maigre derrière lui, et cela ne se voit ni au nombre
de pages ni à l'œil. `.verif/mesurer-marges-pages.py` fait de même pour les
quatre bords de chaque page. Les deux **impriment** ; ils ne jugent pas.

`tests/lecture-avant-declaration.test.ts` garde une faute de **forme**, celle
qu'aucun autre contrôle ne pouvait voir : un écran qui lit une variable de
contexte **avant** de l'avoir déstructurée. Mesuré le 24 septembre 2026,
« Créer le bail » échouait à tous les coups — le chargement lisait
`lireBrouillon(logement.id, 'bail')` alors que `logement` est déstructuré plus
bas, après le retour anticipé, et vaut donc `undefined` à cet endroit. `tsc` ne
le voit pas : la déclaration existe bien dans la fonction, et l'usage est dans
une fermeture. Le contrôle lit donc les sources — la **fenêtre du chargement**
seulement, privée des chaînes et des commentaires, et sans les clés d'objet : la
première version regardait le fichier entier et accusait trente-trois fois du
code juste. `.verif/falsifier-lecture-avant-declaration.py` remet la faute pour
exiger qu'il tombe, sur la ligne exacte, et sans laisser la source mutée.

`tests/signature-montree.test.ts` garde la même famille de faute, sur la
**signature** : la donnée était bien recueillie, bien enregistrée, bien insérée
dans le PDF — et l'écran de relecture la résumait par le mot « Signé ». Le
bailleur signait, relisait, et voyait un cadre blanc ; il en a conclu le
24 septembre 2026 que la signature n'était pas prise. Aucun contrôle de données
ne voit ce défaut, puisque la donnée existe. Ce test exige donc que le tracé
soit **montré**, des deux côtés : `<img src="data:image/svg+xml;…">` dans un
`div.b-cadre` pour le document, un `Image` de React Native dans un cadre blanc
pour l'écran d'aperçu, la mention « Non signé » quand le tracé manque, et un
pavé qui affiche le tracé qu'on lui passe au lieu de rester blanc.
`.verif/falsifier-signature-montree.py` lui remet six fautes, une à une, et
exige que chacune tombe **en nommant son test** — `node --test` sort en 0 quand
un motif ne désigne aucun test, si bien qu'un nom mal orthographié ferait passer
une faute pour un succès.

`tests/ouverture-document.test.ts` garde la même famille, sur l'**ouverture**
d'un document : `ouvrirDocument` confiait le PDF à l'appel d'impression, si bien
que « Voir le PDF » ouvrait la boîte d'impression — signalé depuis le téléphone
le 26 septembre 2026. Le contrôle exige que l'impression ne soit plus ni appelée
ni importée, que l'ouverture Android porte une URI de contenu et le drapeau de
lecture, qu'un repli existe vers la feuille de partage, et que les écrans qui
ouvrent un document soient **exactement** ceux qui annoncent « Voir le PDF » —
accord vérifié **dans les deux sens**, et écrans **découverts par balayage**
plutôt que listés, pour qu'un écran ajouté demain entre dans le contrôle tout
seul. `.verif/falsifier-ouverture-document.py` lui remet sept fautes, la première
étant le défaut tel qu'il a été signalé.

Le même correctif est cherché dans le **binaire livré** par `.verif/temoins.py`,
que les contrôleurs de l'APK et de l'IPA partagent. Quatre fragments y comptent 0
dans le 1.1.3 et 1 dans le 1.1.4 — `android.intent.action.VIEW`,
`IntentLauncher`, `startActivityAsync`, `Ouvrir le PDF`. Les témoins propres à
Android y sont déclarés **à part** (`TEMOINS_ANDROID`) et la plateforme est
déclarée à la lecture : la branche `Platform.OS === 'android'` est retirée du
bundle iOS, et l'exiger de l'IPA faisait échouer le contrôle sur un binaire
conforme. Les témoins non jugés sont annoncés **hors plateforme**.

`.verif/mesurer-marges-bail.py` mesure la marge réellement **imprimée** sur
chaque page du bail, et non celle écrite dans le CSS. La règle de page de
`STYLES_BASE` pose `margin: 0` et met les blancs dans `.page` : cela convient à
une quittance — une feuille, un bloc — mais pas à un bail, qui change de page.
Un rembourrage de bloc ne protège pas la deuxième feuille, et le bail
s'imprimait à **12 mm** du haut et du bas. Les 30 mm demandés sont donc portés
par le `@page` de `STYLES_BAIL`, seule règle que le moteur applique à *chaque*
page : mesuré 30,2 mm en haut et jamais moins de 38,5 mm en bas, sur les trois
feuilles.

`.verif/falsifier-inventaire.py` va plus loin sur un point : il **imprime** le
banc deux fois — une fois sur la source saine, une fois sous mutation — et exige
de la première qu'elle passe, sans quoi « le banc tombe » se confondrait avec
« le banc ne tourne pas ». Il relit aussi le compte des mesures annoncées :
`node --test` sort en `0` quand aucun test ne correspond au motif, et un banc qui
n'a rien mesuré ne doit pas être pris pour un banc qui a tout validé.

### Ce que seule une page imprimée peut dire

`.verif/mesurer-edl.py` ne lit ni sources ni constantes : il **imprime**. Le banc
de rendu `.verif/rendre-etat-des-lieux.ts` produit trois témoins — un court, un
complet de cinq pièces, vingt-huit éléments et quatre photos, et une **sortie**
avec sa comparaison et ses paires avant / après — puis Chromium
`--headless=new --print-to-pdf` les imprime et `pypdfium2` compte les pages.
Quinze mesures, dont celles qu'aucun test unitaire ne peut porter :

- le document complet **ouvre plus d'une feuille**, et le court en ouvre
  strictement moins — sans ce témoin négatif, « au moins trois pages » pourrait
  être satisfait par un rendu qui répète son contenu ;
- les douze sections s'impriment dans l'ordre du domaine, et les **quinze** de la
  sortie dans l'ordre de lecture ;
- une photo s'imprime **entre son élément et le suivant**, dans sa pièce ;
- l'image est **réellement dessinée** — et c'est un compte de pixels de la teinte
  témoin, pas une lecture de texte, qui le dit : quand une URI casse l'attribut
  `src`, Chromium dessine le texte de remplacement, qui porte la légende, et
  l'ordre des mots reste bon alors qu'aucune photo n'est imprimée ;
- la photo en portrait **tient sur une seule page**, sous le plafond de hauteur ;
- les sources ne se coupent pas entre deux feuilles ;
- la fin du document est imprimée — dernier élément, dernière signature,
  dernière source ;
- le tableau comparatif imprime ses trois colonnes, et la section des évolutions
  rappelle qu'elle n'impute rien au locataire ;
- **les deux colonnes d'une paire portent deux images distinctes** : les deux
  documents numérotant leurs photos à partir de `ph1`, un index unique
  dessinerait deux fois la photo de l'entrée. Le banc compte les pixels des
  **deux** teintes — un contrôle qui n'en regarderait qu'une serait vert dans les
  deux cas ;
- **les deux colonnes sont côte à côte**, et non l'une sous l'autre : la boîte de
  chaque teinte est mesurée **page par page**, et l'entrée doit être entièrement à
  gauche de la sortie, dans la même bande verticale.

`.verif/falsifier-edl-pagination.py` éprouve ce banc : quatre mutations, une par
mesure, et aucune muette. Deux d'entre elles ont d'abord été **muettes**, ce qui
a révélé deux vrais trous : la mesure de hauteur mélangeait les systèmes de
coordonnées de deux pages, et le contrôle d'ordre ne distinguait pas une section
absente d'une section déplacée.

`.verif/falsifier-edl-sortie.py` éprouve les cinq mesures propres à la sortie :
cinq mutations, aucune muette. L'une d'elles — intervertir les deux sections de
sortie dans `sectionsEdl` — ne touche **pas** les douze sections communes, si
bien que le contrôle des douze reste vert pendant que celui des quinze tombe :
c'est ce qui prouve que le second ne double pas le premier.

`.verif/mesurer-inventaire.py` fait le même travail pour l'inventaire du mobilier,
sur trois témoins — un court, un complet de six pièces et trente-sept meubles, et
un de sortie. Quatorze mesures : le plancher de pages du cas complet, le témoin
négatif du cas court, l'ordre des onze sections d'une entrée **et** des treize
d'une sortie, la photo qui reste sous son meuble, le portrait sous le plafond de
hauteur — plafond **lu dans la source**, et non cité de mémoire —, le dernier
meuble, la dernière signature sur la même feuille que les sources, les réserves,
les deux teintes distinctes de la paire avant / après, la **place** de chaque
colonne, la mention de la mise en regard, la phrase qui n'impute rien au
locataire, et l'en-tête du tableau comparatif.

**Trois de ces mesures manquaient, et c'est la falsification qui l'a dit.** Le
banc comptait dix `OK` sur la source saine — dont **deux mesures sans mutation**
et **une mesure sans objet** :

- l'ordre des colonnes n'était vérifié par rien. Compter les pixels ne dit pas de
  quel côté chaque image se trouve : sous une inversion, les deux teintes restent
  dessinées, et les dix mesures restaient vertes. C'est la **boîte** de chaque
  teinte, page par page, qui le dit ;
- la mention « Ce tableau met deux constats en regard » et l'en-tête
  « Meuble / Entrée / Sortie » étaient **imprimés et lus par personne**. Une
  mention que rien ne lit est une mention qu'on peut retirer sans qu'un contrôle
  tombe ;
- et le contrôle des sections ne cherchait que des **titres**. Mesuré : quand le
  rendu ne répond plus à la section des évolutions, la section s'imprime avec son
  titre, **vide**, et le contrôle restait vert sur un document qui ne constatait
  plus rien. Un titre imprimé ne dit pas qu'une section porte quelque chose.

La mesure « section vide » a demandé trois écritures, et les deux échecs valent
d'être connus. La première définissait `communes` dans la branche `else` d'une
autre mesure, si bien que le banc plantait en `UnboundLocalError` au lieu de
signaler un échec lisible — **un banc qui plante cache les mesures qu'il n'a pas
encore faites**. Les deux suivantes butaient sur la **numérotation** : entre
« Évolutions depuis l'entrée » et « Synthèse », le texte plat porte `11.`, et un
contrôle qui l'ignorait déclarait la section pleine. Le contrôle retire donc la
numérotation avant de conclure, et **ne conclut rien** quand aucun titre suivant
n'est trouvé sur la même page : une section peut légitimement commencer en bas
d'une feuille. Cette limite est écrite dans la fonction, pas cachée.

`.verif/falsifier-inventaire-sortie.py` éprouve les cinq mesures propres à la
sortie : cinq mutations, aucune muette, chacune nommant son test. **La première
est spécifique à la sortie** — intervertir les deux sections de sortie ne touche
aucune des onze sections communes, si bien que le contrôle des onze reste vert
pendant que celui des treize tombe : c'est ce qui prouve que le second ne double
pas le premier.

`.verif/falsifier-inventaire.py` l'éprouve : la mutation fait résoudre le côté
entrée contre l'index de la sortie, et le banc tombe — **0 pixel** de la teinte
« avant », 242 788 de la teinte « après ». Le fichier est restauré **à l'octet**,
empreinte SHA-256 avant et après, et c'est une leçon : une première version lisait
et écrivait en texte, si bien que Python traduisait les fins de ligne au retour
(`\n` → `\r\n`). Le fichier restauré portait 636 retours chariot de plus,
l'empreinte avait changé, et rien dans le dépôt ne le disait — le fichier étant
nouveau, `git status` ne voyait qu'un ajout.

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

