---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "test/**/*.ts"
  - "scripts/**/*.ts"
  - "vite*.config.ts"
---

# TypeScript : Node 24 et Vite

- Les scripts de `src/build/`, `scripts/` et les tests sont exécutés directement par Node ≥ 24.12 (suppression des types, sans build). Imports locaux avec l'extension `.ts`/`.tsx`, `import type` pour les types, ni `enum`, ni `namespace` runtime, ni propriétés de paramètre de constructeur. `npm run typecheck` le contrôle (`erasableSyntaxOnly`, `verbatimModuleSyntax`).
<!-- Pourquoi : convention de connect-bank (doc Node v24 sur le type stripping) ; une syntaxe non effaçable fait planter le script à l'exécution. -->
- `src/core/` n'importe ni `node:*` ni le DOM : il tourne dans Node, le navigateur et les tests.
<!-- Pourquoi : le chiffrement et les calculs doivent être identiques au build et dans l'app (choix d'architecture du plan). -->
- Pas de nouvelle dépendance sans l'accord de l'utilisateur. Dépendances actuelles : `preact`, polices `@fontsource`, et en développement Vite, TypeScript, Biome.
<!-- Pourquoi : l'app manipule des données bancaires ; moins de dépendances, moins de surface d'attaque (même principe que connect-bank). -->
- Terminer avec `process.exitCode`, jamais `process.exit()`.
<!-- Pourquoi : sous Windows, `process.exit()` juste après `fetch()` a fait planter Node (constaté dans connect-bank). -->
- Après une modification de code, `npm run format` puis `npm run lint` doivent passer sans erreur. La mise en forme (largeur 80, 2 espaces, guillemets doubles, LF) est celle de Biome : ne pas la changer à la main. Pas de `any`.
<!-- Pourquoi : consigne de l'utilisateur pour la mise en place de Biome (2026-11-08). -->
- Nommage, vérifié par Biome :
  - fichiers en kebab-case (`rule-editor.tsx`) ;
  - variables (constantes comprises : `dayMs`, pas `DAY_MS`), paramètres, fonctions, membres de classe et propriétés de types en camelCase ;
  - classes, types et composants en PascalCase. Dans les `.tsx` seulement, une fonction peut être en PascalCase (override de `biome.json`), car un composant JSX en minuscule serait pris pour une balise HTML.
<!-- Pourquoi : conventions fixées par l'utilisateur. L'override `.tsx` existe parce que le correctif automatique de Biome a renommé le composant `LinkPanel` en `linkPanel`, ce qui cassait le JSX (2026-11-08). -->
- Messages affichés et commentaires en français, identifiants en anglais.
<!-- Pourquoi : convention de connect-bank et préférence de langue de l'utilisateur. -->
- Le backoffice ne doit avoir aucun module dont le chemin commence par `/api` (ex. `src/backoffice/api.ts`) : le middleware `/api` du serveur l'intercepterait.
<!-- Pourquoi : Connect accepte « . » comme fin de préfixe ; `/api.ts` renvoyait « Route inconnue » et la page restait blanche (2026-11-08, module renommé en `api-client.ts`). -->
