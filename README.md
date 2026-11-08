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
- **Fin de mois estimée** = solde + opérations prévues pas encore passées + dépense courante moyenne × jours restants. La dépense courante est la moyenne des débits **non rattachés à une règle** sur les 3 derniers mois complets (hors règles « à ignorer », comme les virements entre vos comptes).
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
- **Règles** : création, modification, activation, suppression. Le formulaire montre les opérations correspondantes et les échéances qui en découlent.
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
```

La charte visuelle est décrite dans [DESIGN.md](DESIGN.md) et implémentée uniquement dans `src/app/styles/tokens.css`.

| Dossier | Rôle |
|---|---|
| `src/core/` | logique pure partagée : calendrier, matching, historique, projection, chiffrement, payload |
| `src/build/` | scripts Node : lecture de connect-bank, règles, `build-data`, `deploy`, API du backoffice |
| `src/app/` | PWA Preact |
| `src/backoffice/` | backoffice Preact (serveur de dev Vite uniquement) |
| `scripts/` | traitement nocturne, tâche planifiée, génération des icônes |
