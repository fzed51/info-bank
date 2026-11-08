# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

PWA mobile (Preact, Vite) qui affiche le solde, l'évolution et une estimation de fin de mois des comptes LCL. Les données viennent de `../connect-bank`, sont chiffrées au build (`public/data.enc`) et publiées sur GitHub Pages (branche `gh-pages`). Un backoffice local gère les opérations récurrentes.

## Commandes

```powershell
npm test                 # tests hors ligne (node --test), données fictives
npm run typecheck        # tsc --noEmit
npm run lint             # Biome : lint + format + tri des imports (lecture seule)
npm run format           # Biome : applique les corrections sûres
npm run build:data       # connect-bank + règles → public/data.enc (lit des données réelles)
npm run backoffice       # backoffice sur http://127.0.0.1:5174
npm run dev / build / preview
npm run deploy           # publication réelle sur gh-pages
```

## Architecture

- `src/core/` : logique pure, sans DOM ni `node:*`, partagée par le build, l'app, le backoffice et les tests. `payload.ts` assemble ce qui est publié ; `crypto.ts` utilise seulement WebCrypto et les flux standard, donc le même code chiffre dans Node et déchiffre dans le navigateur.
- `src/build/` : `config.ts` est évalué à l'import (`.env`, chemins), `source.ts` lit `../connect-bank/out/<IBAN>/api/`, `rules-store.ts` lit/écrit `%APPDATA%\info-bank\rules.json` et `crypto.json`, `backoffice-api.ts` est un plugin Vite (`/api/data`, `/api/rules`).
- `src/app/` : PWA ; `vite.config.ts` génère `sw.js` depuis `sw-template.js` et ajoute la CSP au build. `src/backoffice/` : servi par `vite.backoffice.config.ts`, jamais construit.
- `scripts/nightly.ps1` : `connect-bank fetch` → `build:data` → `deploy` ; un échec de synchro est transmis par `IB_SYNC_ERROR` et affiché dans l'app.

## Règles essentielles

- Ne jamais afficher, copier ni commiter `.env`, `public/data.enc`, `dist/`, ni le contenu de `%APPDATA%\info-bank\` ou de `../connect-bank/out/`. Pour vérifier des données réelles, s'en tenir aux nombres, dates et empreintes ; pour vérifier l'interface, utiliser des données fictives (`IB_DATA_DIR` et `CONNECT_BANK_DIR` vers un dossier temporaire).
<!-- Pourquoi : le dépôt est public et `out/` contient les opérations réelles de l'utilisateur. Règle reprise de connect-bank ; les captures d'écran de l'app ont été faites sur un jeu fictif pour cette raison (2026-11-08). -->
- Ne jamais lire `state.json` ni la clé `.pem` de connect-bank, ne jamais lancer `eb:link`, et ne pas lancer de `fetch` réel sans l'accord de l'utilisateur.
<!-- Pourquoi : règles de connect-bank (accès bancaire de 180 jours, consentement interactif, un fetch de test y a déjà effacé des opérations en attente). -->
- Le payload publié ne contient que ce qui est affiché : pas d'IBAN complet ni d'identifiant d'opération. Le test « Payload » le vérifie ; le garder vert.
<!-- Pourquoi : `data.enc` est public. Le test a détecté le 2026-11-08 que les occurrences publiaient l'IBAN complet (`PayloadOccurrence` l'exclut depuis). -->
- Ne pas changer les paramètres de dérivation (sel, itérations, format de `data.enc`) sans le signaler : toutes les clés mémorisées sur les téléphones deviennent invalides.
<!-- Pourquoi : la clé AES dérivée est stockée sur l'appareil et comparée au sel du fichier publié. -->
- `npm run deploy`, la création du dépôt GitHub et l'activation de Pages sont des publications : uniquement sur demande explicite.
<!-- Pourquoi : action publique et visible de tous (consigne du plan validé). -->
- Commiter ou pousser uniquement sur demande explicite de l'utilisateur. Messages de commit en anglais, au format `type: résumé`.
<!-- Pourquoi : même consigne que connect-bank. -->

## Pour aller plus loin

Fichiers non chargés automatiquement, à lire selon le besoin :

- `README.md` : installation, mise en ligne, traitement nocturne, modèle de sécurité.
- `DESIGN.md` : charte visuelle (tokens, typographie, composants, vérifications).

Règles chargées automatiquement depuis `.claude/rules/` (chacune limitée aux fichiers concernés) :

- `typescript-node.md` : exécution directe du `.ts` par Node 24, Biome, conventions de nommage.
- `ui.md` : interface de l'app et du backoffice, liée à `DESIGN.md`.
- `tests.md` : isolation des tests hors ligne.

## Organisation des instructions

- Ne garder dans ce fichier que les règles essentielles. Le reste va dans `.claude/rules/` (de préférence avec un `paths:` qui limite la règle aux fichiers concernés) ou dans des fichiers référencés sans `@`, chacun accompagné d'une courte description.
<!-- Pourquoi : organisation demandée par l'utilisateur dans connect-bank, reprise ici. -->
- Chaque règle est suivie d'un commentaire `<!-- Pourquoi : … -->` qui explique son origine.
<!-- Pourquoi : demande de l'utilisateur, pour pouvoir juger plus tard s'il faut garder une règle. -->
- Ces règles d'organisation restent à la fin de ce fichier.
<!-- Pourquoi : demande de l'utilisateur. -->
