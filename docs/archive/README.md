# Archive documentaire (historique)

Ces documents sont **historiques** : ils retracent l'évolution du projet (notes de
conception, expérimentations, correctifs des générations V2 → V5). Ils sont conservés
pour mémoire mais **ne décrivent pas l'état actuel**.

Pour l'état courant, voir :
- [`README.md`](../../README.md) — présentation et démarrage
- [`VERSIONS.md`](../../VERSIONS.md) — philosophie et caractéristiques des versions V2 → V6
- [`CHANGELOG.md`](../../CHANGELOG.md) — journal des changements

## Organisation

- **`llava/`** — modèle LLaVA (vision locale, ère V2/V3) : comparaisons de modèles,
  sélecteur, parsing, fonds, GPU OVH.
- **`gemini/`** — intégration Google Gemini et mémoire (descriptions local/global).
- **`prompts/`** — itérations des prompts (simplification, formats, intent-first, RVB9).
- **`simplicity-theory/`** — analyses et notes liées à la Théorie de la Simplicité.
- **`architecture/`** — notes d'architecture et restructurations (V2, formats de données,
  adaptateurs LLM).
- **`ops/`** — mémos d'exploitation (viewers, URLs des services, analyses de timeout).
- **`changelogs/`** — changelogs spécifiques à une version (ex. V5).

> Note : les manuels destinés aux agents restent dans `public/` (servis par l'application,
> ex. `public/MANUEL_*.md`) et ne sont pas archivés ici.
