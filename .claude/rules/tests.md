---
paths:
  - "test/**/*.ts"
---

# Tests hors ligne

- Aucune donnée bancaire réelle ni appel réseau dans les tests : opérations et comptes fabriqués (IBAN fictifs).
<!-- Pourquoi : `npm test` doit tourner sans connect-bank et sans exposer de données réelles (même règle que connect-bank). -->
- Les modules de `src/core/` s'importent directement. Pour un module de `src/build/` qui lit `config.ts`, fixer `IB_DATA_DIR` et `CONNECT_BANK_DIR` sur des dossiers temporaires puis l'importer dynamiquement (`await import(...)`).
<!-- Pourquoi : `src/build/config.ts` est évalué à l'import ; un import statique figerait les chemins réels (%APPDATA%\info-bank). -->
- Pour le chiffrement, réduire les itérations PBKDF2 dans les tests (ex. 1 000) ; ne jamais les réduire dans le code.
<!-- Pourquoi : 600 000 itérations rendent chaque dérivation lente ; la valeur de production protège les données publiques. -->
