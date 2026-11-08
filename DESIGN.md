# DESIGN.md — charte visuelle d'info-bank

Ce fichier décrit le style de l'app mobile et du backoffice. Sa seule implémentation est `src/app/styles/tokens.css` (variables CSS), importée par les deux interfaces. Les composants n'utilisent que ces variables : aucune couleur, taille de police, marge ou durée écrite en dur ailleurs.

## 1. Intention

Un **livre de comptes tenu à la main** : papier crème, encre, filets fins, chiffres alignés comme dans une colonne de registre. L'écran doit se lire d'un coup d'œil sur un téléphone : d'abord le solde, ensuite la fin du mois, puis le détail.

- Calme : peu de couleurs, pas d'ombres portées, pas de dégradés décoratifs.
- Matière : filets de registre, marge rouge, traits de total, chiffres en police à chasse fixe.
- Hiérarchie par la typographie (taille, graisse, police) plutôt que par des boîtes.

Le thème sombre est un « carnet de nuit » : même structure, papier brun-noir et encre crème. Le thème suit `prefers-color-scheme`, sans bouton.

## 2. Couleurs

Tokens sémantiques ; les composants n'emploient jamais une valeur hexadécimale.

| Token | Rôle | Clair | Sombre |
|---|---|---|---|
| `--paper` | fond de page | `#F4EEDF` | `#1D1B17` |
| `--paper-raised` | cartes, champs | `#FBF7EC` | `#26231E` |
| `--paper-sunken` | zones en retrait, barre d'onglets | `#EAE2CE` | `#161410` |
| `--rule` | filets, lignes de registre | `#D6CAB0` | `#3A352D` |
| `--rule-strong` | bordures de champs, trait de total | `#8F7F62` | `#7A6F5E` |
| `--margin` | marge rouge (décor uniquement) | `#D99A8C` | `#6B3A32` |
| `--ink` | texte principal | `#2A241E` | `#ECE3CE` |
| `--ink-muted` | texte secondaire, dates | `#6A5E50` | `#A89C86` |
| `--ink-credit` | montants positifs | `#2F6332` | `#8CC08A` |
| `--ink-debit` | montants négatifs | `#9E2F24` | `#E88A7C` |
| `--ink-accent` | liens, onglet actif, focus | `#2A4A7F` | `#93B2E6` |
| `--ink-warning` | en retard, données anciennes | `#8A5A12` | `#D9A754` |

Contrastes mesurés (WCAG 2.x) : tout texte ≥ 4,5:1 sur `--paper`, `--paper-raised` et `--paper-sunken`, dans les deux thèmes (minimum : `--ink-warning` sur `--paper-sunken` clair, 4,58:1). `--rule-strong` ≥ 3:1 sur `--paper` (bordures de champs). `--rule` et `--margin` sont décoratifs : ils ne portent jamais d'information seuls.

## 3. Typographie

Polices auto-hébergées (paquets `@fontsource`, licence OFL) : compatibles avec la CSP `'self'` et disponibles hors ligne.

| Token | Police | Usage |
|---|---|---|
| `--font-display` | Fraunces (variable, axe `opsz`) | titres, solde principal |
| `--font-text` | Source Serif 4 (variable, axe `opsz`) | texte courant, libellés |
| `--font-figures` | IBM Plex Mono 400/500 | tous les montants et les dates en colonne |

Échelle (`--text-xs` → `--text-3xl`) : 12 / 14 / 16 / 20 / 28 / 40 px. Interlignage 1,45 pour le texte, 1,1 pour les grands chiffres. Les montants utilisent `font-variant-numeric: tabular-nums`. Pas de texte sous 12 px ; corps par défaut 16 px (évite le zoom automatique d'iOS sur les champs).

## 4. Espacements, rayons, filets

- Grille de 4 px : `--space-1` (4) `--space-2` (8) `--space-3` (12) `--space-4` (16) `--space-5` (24) `--space-6` (32) `--space-7` (48) `--space-8` (64).
- Rayons faibles, effet papier : `--radius-1` (2 px) pour les pastilles, `--radius-2` (4 px) pour les cartes et champs.
- Pas d'ombre portée. La séparation se fait par un filet `1px solid var(--rule)`.
- Listes en **lignes de registre** : chaque ligne d'opération est séparée par un filet `--rule` ; les cartes peuvent porter la marge rouge à gauche (`--margin`, 2 px).
- Trait de total : double filet `--rule-strong` (3 px `double`) au-dessus d'un résultat.

## 5. Montants

- Format `fr-FR` : `1 234,56 €`, produit par `Intl.NumberFormat` ; l'espace fine insécable (U+202F) des milliers est remplacée par une espace insécable (U+00A0), car Fraunces n'a pas de glyphe pour la première.
- Signe toujours affiché pour les opérations : `+` ou `−` (U+2212, signe moins typographique, pas le tiret). Le solde n'affiche que le `−` s'il est négatif.
- Couleur `--ink-credit` / `--ink-debit` **en plus** du signe, jamais à sa place.
- Alignés à droite, police `--font-figures`. Une seule fonction de formatage : `src/app/format.ts`.

## 6. Composants

- **Onglets de compte** : barre défilante horizontalement sur `--paper-sunken` ; onglet actif souligné par un trait `--ink-accent` de 2 px et texte `--ink`. Le dernier onglet est « Total ».
- **Carte solde** : libellé du compte et IBAN masqué en `--text-sm` `--ink-muted`, solde en `--font-display` `--text-3xl`, date des données dessous. Bandeau `--ink-warning` si la synchro a échoué ou si les données ont plus de 36 h.
- **Carte projection** : addition posée, une ligne par composante (solde actuel, opérations prévues restantes, estimation des dépenses courantes), montants alignés à droite, trait de total, puis « Fin de mois estimée » en `--text-2xl`. Un bouton « ? » (rond `--ink-accent` de 24 px dans une cible de 44 px) déplie sous « Dépenses courantes » le calcul de la moyenne journalière : fond `--paper-sunken`, `--text-sm`, petite addition (période, débits retenus, moyenne par jour, total jusqu'à la fin du mois) aux chiffres en `--font-figures` alignés à droite, puis les exclusions en `--ink-muted`.
- **Graphique d'évolution** : SVG, trait d'encre `--ink` 1,5 px, aire sous la courbe en hachures légères `--rule`, lignes horizontales de registre `--rule`, ligne de zéro `--ink-debit` pointillée si la courbe passe sous 0, projection jusqu'à la fin du mois (opérations prévues et dépenses courantes) en tirets `--ink-accent`, et solde avec les seules opérations prévues encore attendues en escalier, pointillés ronds `--ink-muted` (une marche à la date de chaque opération ; une opération en retard compte aujourd'hui). Légende : « solde », « opérations prévues seules », « avec dépenses courantes ». Sélecteur de période 1 / 3 / 6 / 12 mois en boutons segmentés. Résumé textuel pour les lecteurs d'écran.
- **Opérations prévues** : d'abord celles encore attendues (`à venir`, `en retard`), par date ; les `passée` et `ignorée` s'affichent sous la liste avec le bouton secondaire « Afficher les opérations passées (N) ».
- **Dernières opérations** : au départ, les opérations en cours et la dernière comptabilisée ; « Afficher plus (N) » ajoute les suivantes par 30.
- **Ligne d'opération** : date courte en `--font-figures` `--ink-muted`, libellé tronqué sur une ligne, montant à droite ; « en cours » en italique pour les opérations en attente.
- **Pastilles de statut** (opérations prévues) : texte + symbole, jamais la couleur seule — `✓ passée` (`--ink-credit`), `○ à venir` (`--ink-muted`), `! en retard` (`--ink-warning`), `— ignorée` (`--ink-muted`, barré). Backoffice, colonne « Correspondance » des règles : `✓ N op.` (`--ink-credit`) suivi de la date de la dernière, ou `! jamais` (`--ink-warning`).
- **Écran de déverrouillage** : centré, titre en `--font-display`, champ de clé pleine largeur, case « mémoriser sur cet appareil », bouton principal. Message d'erreur en `--ink-debit` sous le champ.
- **Champs et boutons** : fond `--paper-raised`, bordure `1px solid var(--rule-strong)`, rayon `--radius-2`, hauteur ≥ 44 px. Bouton principal : fond `--ink`, texte `--paper`. Bouton secondaire : contour seul.
- **Backoffice** : mêmes tokens ; tableaux en lignes de registre, en-têtes en `--text-sm` capitales espacées. Actions de ligne (« ✎ Modifier », « × Supprimer ») : boutons secondaires l'un sous l'autre, de même largeur, hauteur `--control-compact` (36 px, backoffice utilisé à la souris), texte `--text-sm`, fond `--paper-sunken` au survol ; « Supprimer » en `--ink-debit`, et sa confirmation (« ! Confirmer ») pleine, fond `--ink-debit` et texte `--paper`.

## 6 bis. Logo et icônes

Une page de registre sur un carreau `--paper` : marge `--margin`, trois lignes `--rule`, double trait de total `--rule-strong`, courbe d'encre `--ink` qui monte vers un point `--ink-accent` détaché par un liseré papier. Une seule source, `scripts/make-icons.ts` (`npm run icons`), produit tout `public/icons/` :

- `logo.svg` : carreau aux coins arrondis (rayon 112/512) ; aussi déclaré dans le manifeste (`sizes: any`).
- `favicon.svg` et `favicon-32.png` : version simplifiée lisible à 16 px (marge, courbe et point plus épais, sans lignes ni trait de total). Le backoffice l'utilise aussi.
- `icon-192.png`, `icon-512.png` : carreau arrondi, coins transparents (`purpose: any`).
- `icon-maskable-512.png` : fond plein, dessin réduit à 80 % (zone sûre des icônes masquables).
- `apple-touch-icon.png` (180 px) : fond plein et opaque, iOS arrondit lui-même.

## 7. Mise en page

- Mobile d'abord, conçu pour 360 px de large ; contenu limité à `--content-max` (520 px) et centré au-delà.
- Gouttière latérale 16 px (`--space-4`), plus `env(safe-area-inset-*)` (encoche, barre d'accueil).
- Cibles tactiles ≥ 44 × 44 px (`--touch-min`) ; seule exception, les actions de ligne des tableaux du backoffice (`--control-compact`, 36 px). Aucun défilement horizontal de page (seule la barre d'onglets défile).
- Backoffice : mise en page large (jusqu'à 1200 px), tableaux à défilement interne si besoin.

## 8. Mouvement et accessibilité

- Transitions ≤ 150 ms (`--duration-fast`), uniquement sur couleur et opacité ; aucune sous `prefers-reduced-motion: reduce`.
- Focus visible : contour 2 px `--ink-accent`, décalé de 2 px.
- Langue `fr` déclarée, libellés explicites sur tous les champs et boutons d'icône.
- Le graphique a un `role="img"` et un `aria-label` qui résume la période, le minimum, le maximum et la valeur actuelle.

## Vérifier un changement de style

1. Les contrastes de toute nouvelle paire texte/fond (≥ 4,5:1 pour le texte, ≥ 3:1 pour les bordures de champs), dans les deux thèmes.
2. Une capture à 360 px de large en thème clair et en thème sombre.
3. Aucune couleur en dur hors de `tokens.css` : `rg -n "#[0-9a-fA-F]{3,8}\b" src --glob "*.{css,tsx}" --glob "!**/tokens.css"` ne doit rien trouver. Les `theme-color` de `src/app/index.html` et de `public/manifest.webmanifest`, ainsi que les couleurs de `scripts/make-icons.ts`, reprennent les tokens du thème clair : les mettre à jour avec eux.
