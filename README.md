# info-bank

PWA mobile qui affiche, pour chaque compte LCL, le **solde**, son **évolution** et une **estimation de fin de mois**. Hébergée sur GitHub Pages, elle ne publie que des données **chiffrées** : la clé de connexion saisie dans l'app sert à les déchiffrer sur le téléphone.

Les opérations viennent du projet voisin [connect-bank](../connect-bank) (API DSP2 Enable Banking). Un traitement nocturne local les adapte, les chiffre et republie le site. Un backoffice local, jamais publié, sert à déclarer les opérations qui reviennent (loyer, abonnements, salaire…) ; le traitement détecte chaque jour si elles sont passées.

## Fonctionnement

```
connect-bank fetch ──► ../connect-bank/out/<IBAN>/api/{transactions,balances}.json   (en clair, local)
                                   │
   %APPDATA%\info-bank\rules.json ─┤  npm run build:data : échéances, historique, projection
                                   ▼
                          public/data.enc   (gzip + AES-256-GCM, clé PBKDF2 de la phrase)
                                   │  npm run deploy
                                   ▼
                 branche gh-pages (un seul commit, réécrit à chaque publication)
```

- **Solde** : dernier solde provisoire (`XPCD`, qui inclut les opérations en cours), à défaut le solde comptable.
- **Évolution** : solde quotidien reconstruit à rebours depuis ce solde (12 mois au plus, limité à l'historique de connect-bank).
- **Fin de mois estimée** = solde + opérations prévues pas encore passées + dépenses courantes jusqu'à la fin du mois. Les dépenses courantes ne comptent que les débits **non rattachés à une règle** (ni aux règles « à ignorer », comme les virements entre vos comptes). Elles sont la moyenne de quatre estimations pour les jours restants :
  1. moyenne journalière des 90 derniers jours glissants ;
  2. moyenne journalière du même mois de l'année précédente, s'il est couvert en entier ;
  3. par jour de la semaine : pour chaque jour restant, moyenne des débits de ce jour de la semaine sur les 12 derniers mois (2 lundis restants → 2 × moyenne des lundis) ;
  4. par jour du mois : pour chaque jour restant, moyenne des débits de ce numéro de jour sur les 12 derniers mois (restent le 29 et le 30 → moyenne des 29 + moyenne des 30).

  Une fenêtre plus longue que l'historique commence à la première opération connue ; une méthode sans assez d'historique est écartée de la moyenne. Les périodes s'arrêtent la veille de la date du solde, et ce jour compte parmi les jours restants : la synchro tourne la nuit et les paiements sont comptabilisés au plus tôt le lendemain, donc ses dépenses ne sont pas encore dans le solde. Le bouton « ? » de l'app détaille chaque méthode.
- **Opérations prévues** : une règle décrit un libellé, un montant (fixe ± tolérance, ou variable avec bornes) et un calendrier (jour ± tolérance ; tous les mois, un mois sur N, d'un mois à un autre, mois choisis, avec début et fin facultatifs). Statuts : passée, à venir, en retard, ignorée.

## Prérequis

- Node.js ≥ 24.12 (exécute directement les `.ts` du build)
- connect-bank installé dans `../connect-bank` et autorisé (`eb:link`)
- Git, avec un accès en écriture au dépôt GitHub (Git Credential Manager)

## Installation

```powershell
npm install
copy .env.example .env      # puis renseigner IB_PASSPHRASE
```

`IB_PASSPHRASE` est la clé de connexion de l'app : 16 caractères minimum. Le dépôt étant public, `data.enc` est téléchargeable par tous : seule la phrase le protège. Préférez une phrase de plusieurs mots, et ne la réutilisez nulle part ailleurs.

## Utilisation

```powershell
npm run backoffice     # backoffice local sur http://127.0.0.1:5174 (règles récurrentes)
npm run build:data     # données de connect-bank + règles → public/data.enc
npm run dev            # PWA en développement (lit public/data.enc)
npm run deploy         # build de la PWA et publication sur gh-pages
```

### Backoffice

- **Suggestions** : opérations au même libellé présentes au moins 3 mois sur les 6 derniers ; « Créer une règle » préremplit le formulaire.
- **Dépenses** : dépenses courantes cumulées jour par jour pour les deux mois précédents (chaque courbe repart de 0) et pour le mois en cours, réel jusqu'à la veille puis projection de l'app. Les ronds creux en fin de mois sont l'estimation de chaque méthode ; le survol et un tableau dépliable donnent les valeurs. Même périmètre que la projection : débits non rattachés à une règle ni ignorés.
- **Règles** : création, modification, activation, suppression. Un clic sur « Nom », « Montant » ou « Calendrier » trie la liste (un second clic inverse le sens) ; le montant se trie signé, débits avant crédits, et les règles « ignorer » restent en fin de liste. Le formulaire montre les opérations correspondantes et les échéances qui en découlent.
- **Suivi** : grille règle × mois ; un clic sur une case permet de lier une autre opération, de marquer « pas ce mois-ci », ou de revenir à la détection automatique.
- **Comptes** : nom affiché, ordre des onglets (flèches ↑ ↓, appliqué aussi au menu « Compte » du backoffice) et visibilité. Un compte masqué n'est pas publié : ni onglet, ni « Total », ni opérations dans `data.enc`.

Chaque modification est enregistrée aussitôt dans `%APPDATA%\info-bank\rules.json` ; elle apparaît dans l'app au prochain `build:data` + `deploy`.

### Traitement nocturne

`scripts/nightly.ps1` enchaîne `connect-bank fetch`, `build:data` et `deploy`, et journalise dans `%APPDATA%\info-bank\logs\`. Si la synchro bancaire échoue (consentement expiré : relancer `eb:link` dans connect-bank), les données précédentes sont republiées et l'app affiche un avertissement.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\nightly.ps1          # essai manuel
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1    # tâche quotidienne à 04:00
```

Codes de sortie : `0` tout s'est bien passé, `2` publié mais synchro en échec, autre valeur : échec du build ou de la publication.

Chaque échec (synchro, données, publication, erreur inattendue) est aussi signalé par mail via `scripts/notify.ps1`, si `NOTIFY_FROM`, `NOTIFY_TO` et `NOTIFY_SMTP_PASSWORD` sont renseignés dans `.env` (voir `.env.example`). Le mail ne contient que l'étape, le motif et le chemin du journal. Un échec d'envoi est journalisé sans changer le code de sortie. Par défaut, l'envoi passe par le serveur MX Plan d'OVHcloud (`ssl0.ovh.net`, port 587 en STARTTLS) : `SmtpClient` ne gère pas le TLS implicite du port 465.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\notify.ps1 -Subject "Test" -Body "Essai"   # mail d'essai
```

### Version

La version affichée en bas de l'app (« info-bank v0.1.0 · 94f74e1 ») est le champ `version` de `package.json` suivi du commit git du build. Un « + » après le commit signale des modifications non commitées au moment du build : commiter avant `npm run deploy` pour publier une version propre. Pour changer le numéro (semver) :

```powershell
npm version patch --no-git-tag-version   # ou minor / major ; puis commiter package.json
```

Pas de date de build : le service worker dérive sa version du contenu du build, et une date le ferait changer à chaque publication nocturne.

### Version de démonstration

`npm run build:demo` construit dans `dist-demo/` une copie de l'app dont les données sont entièrement fictives : deux comptes sur 13 mois, des échéances, un virement d'épargne ignoré, des opérations en cours. Une bannière « Version de démonstration » s'affiche dans l'app et la version porte le suffixe « · démo ». `npm run preview:demo` la sert sur http://127.0.0.1:4180.

- **Clé de connexion** : `galoche-buisson-sablier-clairiere-grenier` (`demoPassphrase` dans `src/build/demo-data.ts`). Elle ne protège que des données fictives et peut être publiée ; le sel est fixe, donc une clé mémorisée reste valable d'un build à l'autre.
- **Aucun lien avec les données réelles** : le build ne lit ni `.env`, ni connect-bank, ni `%APPDATA%info-bank` ; le `data.enc` réel que Vite copie depuis `public/` est écrasé par celui de la démo, puis le script le redéchiffre pour contrôle.
- **Dates relatives** : les données sont générées autour du jour du build (mêmes dépenses à chaque fois) ; relancer `build:demo` pour une démo « à jour ».
- **Hébergement** : `dist-demo/` est un site statique, à servir sur une origine distincte de l'app réelle (service worker et clé mémorisée y sont propres à l'origine). Rien n'est publié par ce script.

### Mise en ligne (une fois)

1. Créer un dépôt GitHub public et l'ajouter en remote `origin` (ou renseigner `DEPLOY_REMOTE`).
2. Lancer `npm run build:data` puis `npm run deploy`.
3. Dans *Settings → Pages* du dépôt : source « Deploy from a branch », branche `gh-pages`, dossier `/`.
4. Ouvrir l'URL sur le téléphone, saisir la clé, puis « Ajouter à l'écran d'accueil ».

## Sécurité

- Aucune donnée en clair n'est publiée : `data.enc` contient le JSON compressé puis chiffré (AES-256-GCM, IV aléatoire à chaque build, clé dérivée par PBKDF2-SHA256, 600 000 itérations). Les IBAN y sont masqués (`FR76 •••• X35`) et les identifiants d'opération absents.
- La branche `gh-pages` est réécrite à chaque publication : pas d'historique des anciennes versions chiffrées dans git (GitHub peut toutefois en garder des copies en cache).
- « Mémoriser sur cet appareil » conserve dans IndexedDB la clé AES **non extractible**, jamais la phrase. « Verrouiller » l'efface.
- Le sel PBKDF2 est stable (`%APPDATA%\info-bank\crypto.json`) pour que la clé mémorisée reste valable d'une nuit à l'autre. Pour changer de phrase : modifier `IB_PASSPHRASE`, supprimer `crypto.json`, republier ; chaque appareil redemandera la clé.
- Le backoffice n'écoute que sur `127.0.0.1` et refuse les requêtes d'un autre hôte ou d'une autre origine.
- Hors du dépôt : `.env`, `%APPDATA%\info-bank\` (règles, sel, journaux), `public/data.enc`, `dist/`.

## Développement

```powershell
npm test            # tests hors ligne, données fictives
npm run typecheck   # tsc --noEmit
npm run lint        # Biome : lint, mise en forme, tri des imports (lecture seule)
npm run format      # Biome : applique les corrections sûres
npm run icons       # régénère le logo, la favicon et les icônes de public/icons (SVG et PNG)
npm run backtest    # rejoue l'estimation des dépenses sur les mois complets (lit des données réelles, n'affiche que des %)
```

`npm run backtest` compare les méthodes seules, la moyenne à poids égaux utilisée par l'app et des poids ajustés. Chaque mois est aussi laissé de côté à tour de rôle, pour voir si les poids ajustés tiennent sur un mois qu'ils n'ont pas vu. À relancer quand l'historique s'allonge, avant de changer les poids.

La charte visuelle est décrite dans [DESIGN.md](DESIGN.md) et implémentée uniquement dans `src/app/styles/tokens.css`.

| Dossier | Rôle |
|---|---|
| `src/core/` | logique pure partagée : calendrier, matching, historique, projection, chiffrement, payload |
| `src/build/` | scripts Node : lecture de connect-bank, règles, `build-data`, `deploy`, API du backoffice |
| `src/app/` | PWA Preact |
| `src/backoffice/` | backoffice Preact (serveur de dev Vite uniquement) |
| `scripts/` | traitement nocturne, notification d'échec par mail, tâche planifiée, génération des icônes |
