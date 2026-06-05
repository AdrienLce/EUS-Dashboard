# CLAUDE.md — Référence technique pour assistants IA

## Vue d'ensemble du projet

`dashboard-concentrateur-status` est un tableau de bord de surveillance de statuts de services externes, développé avec Nuxt 3. Il interroge des APIs de statut tierces (GitHub, AWS, Azure DevOps, Atlassian/Notion, flux RSS, ou tout endpoint JSON personnalisé) via un proxy serveur, parse les réponses avec des adaptateurs dédiés, et affiche le résultat en temps réel sous forme de cartes colorées. La configuration est persistée côté serveur (Nitro fs driver) et partagée entre tous les utilisateurs du déploiement, avec migration automatique depuis localStorage.

---

## Stack technique

| Technologie | Version | Rôle |
|---|---|---|
| Nuxt 3 | ^3.13 | Framework full-stack (SSR désactivé côté client, Nitro côté serveur) |
| Tailwind CSS v4 | ^4.0 | Styles — plugin Vite, pas de fichier de config |
| TypeScript | intégré Nuxt | Typage complet |
| Nitro | intégré Nuxt | Serveur HTTP, API routes, storage fs |
| Vite | intégré Nuxt | Build client |

Dépendances npm : uniquement `nuxt`, `@tailwindcss/vite` et `tailwindcss`. Pas de librairie de composants, pas de Pinia, pas de Vue Router explicite (géré par Nuxt).

---

## Architecture et flux de données

```
API externe
    ↓  (HTTPS)
/api/proxy  [Nitro — server/api/proxy.post.ts]
    Reçoit { url, method, headers, body }
    Effectue le fetch depuis le serveur (contourne CORS)
    Retourne JSON ou { _raw: "<xml string>" } pour RSS/XML
    ↓
runAdapter(adapterKey, data, customMapping?)  [adapters/index.ts]
    Dispatche vers parseGithub / parseAtlassian / parseAws /
    parseAzureDevOps / parseRss / parseCustom
    Retourne AdapterResult { level, message, incidents, entries? }
    ↓
usePolling → pushSnapshot()  [composables/useStatusStore.ts]
    Stocke le snapshot courant dans currentStatus (ref global)
    Ajoute à l'historique si level ou message a changé (max 50)
    Persiste l'historique dans localStorage
    ↓
pages/index.vue → ServiceCard
    Lit currentStatus[svc.id] pour afficher niveau + message
    Composite : worstLevel() sur tous les enfants actifs
```

La configuration (liste des services) suit un autre chemin :

```
useServerConfig  →  GET /api/config  →  Nitro storage('config')
                 ←  POST /api/config ←  (sauvegarde partielle par clé)
```

---

## Structure des fichiers

```
/
├── nuxt.config.ts              Config Nuxt : Tailwind Vite plugin, Nitro fs storage (base ./data)
├── types/index.ts              Tous les types TypeScript + constantes partagées
├── adapters/
│   ├── index.ts                Registre des adaptateurs + PRESET_SERVICES + auto-détection
│   ├── github.ts               Parse l'API Statuspage GitHub
│   ├── atlassian.ts            Parse le format Atlassian Statuspage (GitHub, Notion…)
│   ├── aws.ts                  Parse le JSON feed AWS Health Dashboard
│   ├── azuredevops.ts          Parse l'API Azure DevOps Health
│   ├── rss.ts                  Parse RSS/Atom XML → structure navigable + AdapterResult
│   └── custom.ts               Adapter générique par chemin JSON + levelMap + wildcards
├── composables/
│   ├── useServerConfig.ts      État global : services/composites/order — sync serveur + localStorage
│   ├── useServices.ts          CRUD services simples (wrapping useServerConfig)
│   ├── useComposites.ts        CRUD composites + enfants
│   ├── useStatusStore.ts       État courant + historique des snapshots (localStorage)
│   ├── usePolling.ts           Orchestre les fetchs via useScheduler
│   ├── useScheduler.ts         Un seul setInterval global (tick 5s) pour N tâches
│   ├── useLevelConfig.ts       Personnalisation des niveaux (couleur hex + libellé)
│   ├── useDisplayMode.ts       Mode compact/normal (localStorage)
│   └── useOrdering.ts          Ordre drag-and-drop des services (sync serveur)
├── server/api/
│   ├── proxy.post.ts           Proxy HTTP serveur — bloque localhost/réseau privé
│   ├── config.get.ts           Lit { services, composites, order, levels } depuis Nitro storage
│   └── config.post.ts          Écrit partiellement (seules les clés présentes dans le body)
├── pages/
│   ├── index.vue               Dashboard principal : groupes, cartes, bannière globale
│   └── services.vue            Gestion des services : liste DnD, toggles, modales
├── components/
│   ├── ServiceCard.vue         Carte d'un service (normal/compact, composite/simple)
│   ├── ServiceForm.vue         Formulaire add/edit service : preset, test, JSON tree, mapping
│   ├── ServiceFormAuth.vue     Sous-composant : section authentification (Bearer/Basic/API Key)
│   ├── ServiceFormHeaders.vue  Sous-composant : headers supplémentaires
│   ├── ServiceFormCompositeNav.vue  Navigation entre sous-services dans ServiceForm
│   ├── CompositeForm.vue       Formulaire add/edit composite + liste enfants DnD
│   ├── CompositeDetailModal.vue  Modale détail composite : onglet Global + nav enfants
│   ├── HistoryModal.vue        Modale historique d'un service simple
│   ├── StatusBadge.vue         Badge de niveau — couleurs dynamiques hex via useLevelConfig
│   ├── JsonTree.vue            Arbre JSON interactif cliquable pour mapping custom
│   └── LevelConfigModal.vue    Modale de personnalisation des niveaux (couleur + libellé)
├── utils/
│   └── summarize.ts            Génère un résumé textuel rule-based à partir d'incidents/entries
└── data/                       Répertoire Nitro fs storage (créé automatiquement)
    ├── services                Fichier JSON des ServiceConfig[]
    ├── composites              Fichier JSON des CompositeServiceConfig[]
    ├── order                   Fichier JSON des ids ordonnés string[]
    └── levels                  Fichier JSON des LevelConfig[] personnalisés
```

---

## Types clés (`types/index.ts`)

### `StatusLevel`
```ts
type StatusLevel = "operational" | "leger" | "mineur" | "majeur" | "maintenance" | "information" | "inconnu"
```
Ordre de gravité croissant selon `LEVEL_ORDER` : `operational < inconnu < information < maintenance < leger < mineur < majeur`.

### `LevelConfig`
```ts
interface LevelConfig {
  id: StatusLevel
  label: string      // libellé affiché — personnalisable
  reference: string  // signification fixe — non modifiable dans l'UI
  color: string      // couleur hex ex: "#22c55e"
}
```

### `CustomMapping`
```ts
interface CustomMapping {
  statusPath: string                    // chemin JSON pointé, ex: "status.indicator"
  messagePath?: string                  // chemin JSON pour le message
  levelMap: Record<string, StatusLevel> // valeur API → niveau, supporte patterns (voir ci-dessous)
}
```

### `ServiceConfig`
Contient : `id`, `name`, `url`, `method` (GET|POST), `headers`, `body?`, `adapter`, `customMapping?`, `group?`, `pollInterval` (secondes, max 120), `enabled`, `createdAt`.

### `CompositeServiceConfig`
Contient : `id`, `type: "composite"`, `name`, `group?`, `enabled`, `createdAt`, `pollInterval`, `children: SubServiceConfig[]`.

### `SubServiceConfig`
Comme `ServiceConfig` sans `group`, `pollInterval`, `createdAt`.

### `StatusSnapshot`
```ts
interface StatusSnapshot {
  serviceId: string
  timestamp: string
  level: StatusLevel
  message: string
  incidents: Incident[]
  entries?: MessageEntry[]
}
```

### `AdapterResult`
Ce que retournent tous les adaptateurs : `{ level, message, incidents, entries? }`.

### `worstLevel(levels)`
Fonction utilitaire exportée depuis `types/index.ts`. Prend un tableau de `StatusLevel` et retourne le plus grave selon `LEVEL_ORDER`.

---

## Adaptateurs

### `github` (`adapters/github.ts`)
Lit `summary.status.indicator` → niveau, `summary.status.description` → message. Incidents depuis `summary.incidents[]` avec `impact` → niveau.
Mapping indicator : `none→operational`, `minor→leger`, `major→mineur`, `critical→majeur`, `maintenance→maintenance`.

### `atlassian` (`adapters/atlassian.ts`)
Même format que GitHub (format Atlassian Statuspage standard). Utilisé aussi pour `notion` (alias dans le registre). Lit `status.indicator` et `status.description`. Incidents depuis `incidents[].impact`.

### `aws` (`adapters/aws.ts`)
Lit `feed.current_events[]`. Chaque entrée a `service_name`, `summary`, `status`, `date`, `url`. Si `current_events` est vide → `operational`. Mapping via `mapAwsStatus()` qui inspecte la chaîne du champ `status`.

### `azuredevops` (`adapters/azuredevops.ts`)
Lit `response.status.health` pour le niveau global. Parcourt `services[].issues[]` pour les incidents explicites. Si une `geography` est dégradée sans issue explicite, crée un incident synthétique.
Mapping health : `healthy→operational`, `advisory→leger`, `degraded→mineur`, `unhealthy→majeur`.

### `rss` (`adapters/rss.ts`)
Parse le XML brut (passé dans `data._raw`). Extrait `<entry>` ou `<item>`. Retourne un `RssStructured` navigable avec `feed_title`, `feed_updated`, `entry_count`, `entries[]` (title, summary, updated, link). Le niveau est deviné par `guessLevel()` sur titre + résumé.

### `custom` (`adapters/custom.ts`)
Adaptateur générique. Résout le `statusPath` dans le JSON (ou dans le `RssStructured` si le payload est XML). Supporte :
- Chemins simples : `"status.indicator"`
- Wildcards : `"entries.*.title"` → niveau pire de tous les items, génère des incidents
- `getValueAtPath(obj, path)` : fonction exportée utilisée dans `ServiceForm` pour l'aperçu

#### Patterns `levelMap`
| Syntaxe | Exemple | Comportement |
|---|---|---|
| Exact | `"none"` | Correspondance exacte (insensible à la casse) |
| Wildcard `*` | `"healthy*"` ou `"*-ok"` | Pattern glob, `*` = n'importe quelle séquence |
| Contains `~` | `"~advisory"` | La valeur contient la chaîne |
| Regex `/pattern/flags` | `"/^healthy$/i"` | Regex JavaScript avec flags optionnels |

Si aucun pattern ne correspond, `autoDetectLevel()` tente une détection automatique par mots-clés.

#### Comportement wildcard sur statusPath vs messagePath
- `statusPath` avec `.*` → génère des **incidents** (avec niveau) + détermine le niveau global
- `messagePath` avec `.*` → extrait des **MessageEntry** (titre + résumé + date + url) sans niveau ni incidents

---

## Composables

Tous les composables maintiennent leur état dans des `ref` déclarées **en dehors** de la fonction exportée, ce qui crée un **singleton module-level** (état global partagé entre toutes les instances). C'est le pattern d'état global choisi à la place de Pinia.

### `useServerConfig`
- Refs globales : `services`, `composites`, `order`, `loaded`
- Au premier appel côté client : appel `GET /api/config`
- Si le serveur est vide et localStorage a des données → **migration automatique** vers le serveur
- `save(key)` : envoie uniquement la clé modifiée au serveur + met à jour localStorage
- Fallback localStorage si le serveur est inaccessible

### `useServices` / `useComposites`
Wrappers CRUD autour de `useServerConfig`. Appellent `save()` après chaque mutation. `useComposites` inclut aussi `addChild`, `updateChild`, `removeChild`, `toggleChild`.

### `useStatusStore`
- Refs globales : `currentStatus` (dernier snapshot par serviceId), `history` (50 entrées max par service)
- `pushSnapshot` : n'insère en historique que si le niveau ou le message a changé
- Historique persisté dans localStorage (clé `status-dashboard-history`)

### `useScheduler`
- **Un seul `setInterval` global** à 5 000 ms (tick)
- Chaque tâche a un `nextDue` calculé ; le tick vérifie toutes les tâches et exécute celles échues
- `schedule(id, intervalMs, fn)` : exécute immédiatement + programme
- `unschedulePrefix(prefix)` : supprime toutes les tâches dont l'id commence par `prefix` (utilisé pour les composites : clé `${compositeId}::${childId}`)
- Le master timer s'arrête quand il n'y a plus de tâches

### `usePolling`
Orchestre `useScheduler` + `fetchOne`. Les clés de tâche sont :
- Service simple : `service.id`
- Enfant de composite : `${composite.id}::${child.id}`

En cas d'erreur HTTP 401/403, le snapshot a `level: "inconnu"` (plutôt que `"majeur"`).

### `useLevelConfig`
- Charge depuis localStorage, puis tente de synchroniser depuis `/api/config`
- `getConfig(id)` : retourne la `LevelConfig` personnalisée ou le défaut
- `levelStyles(hex)` : calcule les styles CSS inline (fond 10% opacité, texte 70% sombre, bordure 25% opacité) depuis une couleur hex
- `save()` : persiste localStorage + POST `/api/config`

### `useDisplayMode`
Bascule entre mode normal et compact. Persiste dans localStorage (`status-display-compact = "1"`).

### `useOrdering`
Lit/écrit `order` depuis `useServerConfig`. `sortItems<T extends { id: string }>(items)` trie selon l'ordre stocké ; les items sans index vont en fin de liste.

---

## Serveur (Nitro)

### `server/api/proxy.post.ts`
- Reçoit `{ url, method, headers, body }`
- Sécurité : bloque `localhost`, `127.0.0.1`, `0.0.0.0`, `192.168.*`, `10.*`
- Ajoute `Accept: application/json` et `User-Agent: StatusDashboard/1.0`
- Si `Content-Type` de la réponse est JSON → retourne le JSON parsé
- Sinon → retourne `{ _raw: "<texte brut>" }` (pour RSS/XML)

### `server/api/config.get.ts`
Retourne `{ services, composites, order, levels }` depuis `useStorage('config')`. Valeurs par défaut : tableaux vides.

### `server/api/config.post.ts`
Accepte un body partiel : ne persiste que les clés présentes (`services`, `composites`, `order`, `levels`). Permet des sauvegardes partielles sans écraser les autres clés.

### Storage Nitro
Configuré dans `nuxt.config.ts` avec `driver: 'fs'` et `base: './data'`. Les fichiers sont nommés d'après la clé (`data/services`, `data/composites`, etc.) et contiennent du JSON sérialisé par Nitro.

---

## Composants

### `StatusBadge.vue`
Reçoit `level: StatusLevel` et `size?: 'sm' | 'md'`. Utilise `useLevelConfig().getConfig(level)` pour récupérer la couleur hex configurée, puis `levelStyles(hex)` pour calculer les styles inline. Le point pulse si le niveau n'est ni `operational` ni `inconnu`. **Ne plus utiliser les classes Tailwind de `LEVEL_COLORS` — tout passe par les styles inline dynamiques.**

### `ServiceCard.vue`
Props : `name`, `snapshot?`, `loading?`, `error?`, `subServices?` (présent → mode composite), `compact?`.

**Mode compact** : ligne horizontale dense avec point coloré + nom + heure. Grille 4 colonnes en XL.

**Mode normal** : carte avec header (nom + badge), message (2 lignes max), footer (incidents ou nb services). Bannière colorée en bas si niveau != operational.

`isComposite` = `!!props.subServices`. Le timestamp affiché est le plus récent parmi les enfants si composite.

### `ServiceForm.vue`
Formulaire en deux colonnes (gauche : config, droite : test + JSON tree). Sous-composants extraits :
- `ServiceFormAuth.vue` : section authentification (Bearer/Basic/API Key)
- `ServiceFormHeaders.vue` : headers additionnels
- `ServiceFormCompositeNav.vue` : panneau de navigation entre sous-services (visible quand `siblings` est fourni)

Fonctionnalités clés :
- **Presets** : GitHub, AWS, Azure DevOps (rempli automatiquement)
- **Test en direct** : appel via `/api/proxy`, affiche l'arbre JSON interactif ou une erreur
- **JSON Tree** (`JsonTree.vue`) : arbre cliquable. Clic sur une feuille → popup `mapPopup` proposant d'affecter le chemin à `statusPath` ou `messagePath`. Si le chemin est dans un tableau (`entries.0.title`), propose aussi le chemin wildcard (`entries.*.title`) et le chemin item complet (`entries.*`).
- **levelMap** : tableau éditable valeur→niveau. La clé peut être un pattern (exact, `*wildcard*`, `~contains`, `/regex/i`). Une entrée est auto-créée avec `autoDetectLevel()` lors du clic sur une feuille.
- **Aperçu** : onglet "Aperçu" montre une `ServiceCard` en temps réel avec le résultat parsé.

### `CompositeForm.vue`
Formulaire du groupe composite. Réutilise `ServiceForm` (via `:siblings`) pour l'édition des sous-services. Supporte le DnD pour réordonner les enfants. `Escape` ferme le formulaire parent seulement si `ServiceForm` enfant est fermé.

### `CompositeDetailModal.vue`
Modale en deux colonnes :
- **Colonne gauche (nav)** : onglet "Global" + liste des enfants triés par gravité décroissante. Point coloré selon niveau courant. Spinner si en chargement.
- **Colonne droite (détail)** :
  - Vue **Global** : badge niveau global + résumé `buildSummary()` + mini-cartes cliquables de tous les enfants
  - Vue **enfant sélectionné** : badge + résumé (si >1 entrée) + incidents (avec StatusBadge) ou entries (sans badge) ou message multiline. Historique en bas.

**Raccourcis clavier** : `ArrowDown`/`ArrowUp` naviguent entre les enfants dans la liste.

### `HistoryModal.vue`
Affiche l'historique d'un service simple. Snapshots triés du plus récent. Incidents avec `StatusBadge`, entries et messages sans badge. Limite 3 items par snapshot avec bouton "voir plus".

### `JsonTree.vue`
Composant récursif. Auto-expand jusqu'à profondeur 2. Highlight des chemins contenus dans `highlightPaths`. Les feuilles primitives sont cliquables. Émet `select({ path, value })`.

### `LevelConfigModal.vue`
Grille 4 colonnes : color picker → aperçu badge live → référence (lecture seule) → libellé éditable. Travaille sur un `draft` local, applique sur "Enregistrer".

---

## `utils/summarize.ts`

`buildSummary(items: (Incident | MessageEntry)[])` : génère un résumé textuel par catégories. Catégories : `incident`, `advisory`, `maintenance urgence`, `maintenance fournisseur`, `maintenance planifiée`, `maintenance`, `résolu`, `autre`. Retourne `{ text, dateRange, total }` ou `null` si vide.

---

## Conventions de code observées

- **État global** : refs déclarées au niveau module (hors fonction), pas de Pinia
- **Typage** : `interface` pour les objets de données, `type` pour les unions
- **Composables** : pattern "appel en dehors du setup" possible car les refs sont module-level ; le `if (import.meta.client && !loaded.value) load()` dans le corps protège contre les appels serveur
- **Modales** : toutes utilisées via `<Teleport to="body">` + `<Transition>`, fermeture par `Escape` avec listener `document.addEventListener` monté/démonté
- **DnD** : HTML5 natif (`draggable`, `dragstart`, `dragover`, `drop`), pas de librairie externe
- **Sauvegardes partielles** : `save('services')`, `save('composites')`, `save('order')` — seule la clé concernée est envoyée au serveur
- **Sécurité proxy** : le proxy bloque les IPs privées pour éviter le SSRF
- **Intervalle de poll** : plafonné à `Math.min(interval, 120)` côté `usePolling`, valeur UI 10–120s
- **Tailwind v4** : pas de `tailwind.config.js` — plugin Vite uniquement, classes utilitaires standard
- **Pas de test** : aucun fichier de test dans le projet
- **Commits** : projet sans git initialisé dans le répertoire courant
