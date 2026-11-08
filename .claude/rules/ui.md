---
paths:
  - "src/app/**"
  - "src/backoffice/**"
  - "public/manifest.webmanifest"
  - "scripts/make-icons.ts"
---

# Interface : app mobile et backoffice

- Lire `DESIGN.md` avant de modifier une interface. N'utiliser que les variables de `src/app/styles/tokens.css` (couleurs, tailles de police, espacements, durées) ; une nouvelle valeur s'ajoute dans `tokens.css` et `DESIGN.md` ensemble.
<!-- Pourquoi : demande de l'utilisateur d'avoir un DESIGN.md qui structure le style (direction « carnet de comptes », thème clair et sombre selon le système). -->
- Tous les montants passent par `formatCents` (`src/app/format.ts`) : signe `−` typographique, couleur jamais seule, espace insécable U+00A0 pour les milliers.
<!-- Pourquoi : Fraunces n'a pas de glyphe pour l'espace fine U+202F produite par Intl ; le solde s'affichait « 1834,27 € » (constaté le 2026-11-08). -->
- Pas de boîte de dialogue du navigateur (`alert`, `confirm`) : confirmations en deux temps dans la page.
<!-- Pourquoi : choix d'implémentation (suppression d'une règle) ; ces boîtes bloquent aussi l'automatisation du navigateur utilisée pour vérifier l'interface. -->
- Vérifier visuellement à 360-390 px de large, dans les deux thèmes, avec des données fictives.
<!-- Pourquoi : app destinée au mobile ; données réelles exclues des captures (voir CLAUDE.md). -->
