# CLAUDE.md — Référence technique pour assistants IA

## Vue d'ensemble du projet

`dashboard-concentrateur-status` est un tableau de bord de surveillance de statuts de services externes, développé avec Nuxt 3. Il interroge des APIs de statut tierces (GitHub, AWS, Azure DevOps, Atlassian/Notion, flux RSS, ping HTTP, ou tout endpoint JSON personnalisé) via un scheduler **côté serveur**, et diffuse les résultats en temps réel à tous les navigateurs connectés via **WebSocket**. La configuration est persistée côté serveur (Nitro fs driver) et partagée entre tous les utilisateurs du déploiement.

---

## Stack technique

| Technologie | Version | Rôle |
|---|---|---|
| Nuxt 3 | ^3.13 | Framework full-stack (SSR désactivé côté client, Nitro côté serveur) |
| Tailwind CSS v4 | ^4.0 | Styles — plugin Vite, pas de fichier de config |
| TypeScript | intégré Nuxt | Typage complet |
| Nitro | intégré Nuxt | Serveur HTTP, API routes, storage fs, WebSocket |
| Vite | intégré Nuxt | Build client |

Dépendances npm : `nuxt`, `@tailwindcss/vite`, `tailwindcss`, `fb-watchman` (dev). Pas de librairie de composants, pas de Pinia, pas de Vue Router explicite (géré par Nuxt).

---

## Architecture et flux de données

### Temps réel (chemin principal)

```
server/plugins/scheduler.ts
    setInterval par service (1–20 min configurable)
    serverFetch(url) — appel direct côté serveur (pas via /api/proxy)
    ↓
runAdapter(adapterKey, data, customMapping?)  [adapters/index.ts]
    Retourne AdapterResult { level, message, incidents, entries? }
    ↓
lastSnapshots.set(svc.id, snapshot)  — état courant en mémoire serveur
broadcast({ type: 'snapshot', data: snapshot })
    ↓
server/routes/_ws.ts  →  peers Set<WebSocketPeer>
    Envoie à tous les clients connectés
    ↓
composables/useRealtimeStatus.ts  (navigateur)
    ws.onmessage → pushSnapshot()  [useStatusStore]
    ↓
pages/index.vue → ServiceCard
    Lit currentStatus[svc.id] pour afficher niveau + message
```

### Connexion d'un nouveau client

```
WS open → scheduler.lastSnapshots.values() → tous les snapshots connus
         → useStorage('config') → { services, composites, order }
         → peer.send({ type: 'config', data: full })
```

### Mise à jour de configuration

```
POST /api/config  →  storage.setItem(...)
                  →  reloadSchedulers()   (démarre/arrête timers)
                  →  broadcast({ type: 'config', data: full })
```

### Test manuel depuis l'UI (ServiceForm)

```
$fetch('/api/proxy', { body: { url, method, headers, isPing? } })
    ↓
runAdapter(adapterKey, data, mapping?)  — côté client, même fonction
    ↓
Aperçu ServiceCard en temps réel
```

### Configuration

```
useServerConfig  →  GET /api/config  →  Nitro storage('config')
                 ←  POST /api/config ←  (sauvegarde partielle par clé)
```

---

## Structure des fichiers

```
/
├── nuxt.config.ts              Config Nuxt : Tailwind Vite plugin, Nitro fs storage (base ./data), WebSocket experimental
├── package.json                pnpm.onlyBuiltDependencies: [@parcel/watcher, esbuild] — requis pour éviter EMFILE
├── types/index.ts              Tous les types TypeScript + constantes partagées
├── adapters/
│   ├── index.ts                Registre + PRESET_SERVICES + ADAPTER_META + AdapterKey
│   ├── github.ts               Parse l'API Statuspage GitHub
│   ├── atlassian.ts            Parse le format Atlassian Statuspage
│   ├── aws.ts                  Parse le JSON feed AWS Health Dashboard
│   ├── azuredevops.ts          Parse l'API Azure DevOps Health
│   ├── bloomberg.ts            Parse le format Bloomberg (alias Atlassian)
│   ├── rss.ts                  Parse RSS/Atom XML → RssStructured + AdapterResult
│   ├── ping.ts                 Ping HTTP — mappe code HTTP → niveau
│   └── custom.ts               Adapter générique chemin JSON + levelMap + wildcards
├── composables/
│   ├── useServerConfig.ts      État global : services/composites/order/theme/levels — sync serveur + localStorage
│   ├── useServices.ts          CRUD services simples
│   ├── useComposites.ts        CRUD composites + enfants
│   ├── useStatusStore.ts       État courant + historique snapshots (localStorage)
│   ├── useRealtimeStatus.ts    WebSocket client — connect/disconnect/requestRefresh
│   ├── useLevelConfig.ts       Personnalisation niveaux (couleur hex + libellé)
│   ├── useDisplayMode.ts       Mode compact/normal + pageStyle (localStorage)
│   ├── useOrdering.ts          Ordre drag-and-drop (sync serveur)
│   ├── useTheme.ts             Thème light/dark (localStorage + data-theme sur html)
│   ├── useAccessControl.ts     Contrôle d'accès : password/SSO OIDC PKCE
│   └── useToast.ts             Toasts — singleton module-level, auto-dismiss 3s
├── server/
│   ├── plugins/scheduler.ts    Plugin Nitro — scheduler serveur, lastSnapshots Map, reloadSchedulers/triggerRefresh
│   ├── routes/_ws.ts           WebSocket handler — peers Set, broadcast(), lastSnapshots → nouveaux clients
│   └── api/
│       ├── proxy.post.ts       Proxy HTTP serveur — cache 120s, SSRF protection, mode isPing
│       ├── config.get.ts       Lit { services, composites, order, levels, theme, pageStyle, accessControl }
│       └── config.post.ts      Écriture partielle + reloadSchedulers() + broadcast config
├── middleware/
│   └── auth.ts                 Protège /services et /settings — vérifie sessionStorage ou token OIDC
├── pages/
│   ├── index.vue               Dashboard : groupes, cartes, bannière, useRealtimeStatus
│   ├── services.vue            Gestion : liste DnD, toggles, modales, moveToComposite
│   ├── settings.vue            Paramètres : apparence, niveaux, sécurité (password/SSO)
│   └── auth/
│       ├── login.vue           Page login : password ou bouton SSO
│       └── callback.vue        Callback OIDC PKCE — échange code → token
├── components/
│   ├── ServiceCard.vue         Carte service (normal/compact, composite/simple)
│   ├── ServiceForm.vue         Formulaire add/edit — 2 colonnes, boutons "Enregistrer" / "Enregistrer et Fermer"
│   ├── ServiceFormAuth.vue     Section authentification (Bearer/Basic/API Key)
│   ├── ServiceFormHeaders.vue  Headers supplémentaires
│   ├── ServiceFormCompositeNav.vue  Navigation entre sous-services dans ServiceForm
│   ├── CompositeForm.vue       Formulaire groupe — 2 colonnes (config | liste enfants), levelMap éditable
│   ├── CompositeDetailModal.vue  Modale détail composite — onglet Global + nav enfants
│   ├── HistoryModal.vue        Modale historique service simple
│   ├── StatusBadge.vue         Badge niveau — styles inline depuis useLevelConfig
│   ├── JsonTree.vue            Arbre JSON interactif cliquable pour mapping custom
│   ├── LevelConfigModal.vue    Modale personnalisation niveaux
│   └── ToastContainer.vue      Toasts bas-droite — succès/erreur/info, auto-dismiss 3s
├── utils/
│   └── summarize.ts            Résumé textuel rule-based depuis incidents/entries
└── data/                       Répertoire Nitro fs storage (créé automatiquement)
    ├── services                ServiceConfig[]
    ├── composites              CompositeServiceConfig[]
    ├── order                   string[] (IDs ordonnés)
    ├── levels                  LevelConfig[]
    ├── theme                   string ('light'|'dark')
    ├── pageStyle               string ('box'|'large')
    └── accessControl           { mode, passwordHash?, ssoDiscoveryUrl?, ssoClientId?, ssoRedirectUri? }
```

---

## Types clés (`types/index.ts`)

### `StatusLevel`
```ts
type StatusLevel = "operational" | "leger" | "mineur" | "majeur" | "critique" | "maintenance" | "information" | "inconnu"
```
Ordre de gravité croissant selon `LEVEL_ORDER` :
`operational < inconnu < information < maintenance < leger < mineur < majeur < critique`

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
  statusPath: string
  messagePath?: string
  levelMap: Record<string, StatusLevel>
}
```

### `ServiceConfig`
`id`, `name`, `url`, `method`, `headers`, `body?`, `adapter`, `customMapping?`, `group?`, `pollInterval` (secondes, 60–1200), `enabled`, `createdAt`.

### `CompositeServiceConfig`
`id`, `type: "composite"`, `name`, `group?`, `enabled`, `createdAt`, `pollInterval`, `children: SubServiceConfig[]`, `defaultAdapter?`, `defaultMapping?`.

### `SubServiceConfig`
Comme `ServiceConfig` sans `group`, `pollInterval`, `createdAt`.

### `StatusSnapshot`
`serviceId`, `timestamp`, `level`, `message`, `incidents`, `entries?`.

### `AdapterResult`
Ce que retournent tous les adaptateurs : `{ level, message, incidents, entries? }`.

### `worstLevel(levels)`
Exportée depuis `types/index.ts`. Retourne le niveau le plus grave selon `LEVEL_ORDER`.

---

## Adaptateurs

### `github` (`adapters/github.ts`)
Lit `summary.status.indicator` → niveau, `summary.status.description` → message.
Mapping indicator : `none→operational`, `minor→mineur`, `major→majeur`, `critical→critique`, `maintenance→maintenance`.

### `atlassian` (`adapters/atlassian.ts`)
Format Atlassian Statuspage standard. Même mapping que github. Utilisé aussi pour `notion` et `bloomberg`.
Mapping : `none→operational`, `minor→mineur`, `major→majeur`, `critical→critique`, `maintenance→maintenance`.

### `aws` (`adapters/aws.ts`)
Lit `feed.current_events[]`. Si vide → `operational`. Mapping via `mapAwsStatus()` sur le champ `status` texte libre.

### `azuredevops` (`adapters/azuredevops.ts`)
Lit `response.status.health`. Parcourt `services[].issues[]` + géographies dégradées sans issue.
Mapping health : `healthy→operational`, `advisory→leger`, `degraded→mineur`, `unhealthy→majeur`.

### `rss` (`adapters/rss.ts`)
Parse XML brut (`data._raw`). Retourne `RssStructured` avec `feed_title`, `entries[]`. Niveau deviné par mots-clés.
CDATA extrait avant stripping des balises HTML. Exporte `rssToStructured()`.

### `ping` (`adapters/ping.ts`)
Reçoit `{ _statusCode: number, _ok: boolean }`. Mappe :
- 2xx → `operational`
- 401/403 → `inconnu`
- 429/502/503/504 → `mineur`
- 5xx → `majeur`
- 4xx → `mineur`
- 0 (timeout) → `majeur`

### `custom` (`adapters/custom.ts`)
Adapter générique. Résout `statusPath` dans le JSON ou `RssStructured`. Supporte wildcards `*`, `~contains`, `/regex/flags`.
`getValueAtPath(obj, path)` exportée pour l'aperçu dans ServiceForm.

#### Patterns `levelMap`
| Syntaxe | Comportement |
|---|---|
| Exact | Correspondance exacte insensible à la casse |
| `healthy*` | Wildcard glob |
| `~advisory` | La valeur contient la chaîne |
| `/^healthy$/i` | Regex JS avec flags |

---

## Composables

Tous les composables maintiennent leur état dans des `ref` **au niveau module** (singleton global). Pattern d'état global sans Pinia.

### `useServerConfig`
- Refs globales : `services`, `composites`, `order`, `theme`, `pageStyle`, `accessControl`, `loaded`
- Dédup `loadPromise` pour éviter les appels concurrents à `load()`
- Migration automatique localStorage → serveur si serveur vide au premier boot
- `save(key)` : envoie seulement la clé modifiée
- Fallback localStorage si serveur inaccessible

### `useServices` / `useComposites`
CRUD autour de `useServerConfig`. `useComposites` inclut `addChild`, `updateChild`, `removeChild`, `toggleChild`.

### `useStatusStore`
- `currentStatus` (dernier snapshot par serviceId), `history` (50 max par service)
- `pushSnapshot` : n'insère en historique que si level ou message a changé
- Historique persisté dans localStorage

### `useRealtimeStatus`
WebSocket client (module-level singleton). Gère `connect()`, `disconnect()`, `requestRefresh(serviceId)`.
- `msg.type = 'snapshot'` → `pushSnapshot()`
- `msg.type = 'config'` → met à jour `services`, `composites`, `order` dans `useServerConfig`
- Auto-reconnexion 3s sur fermeture

### `useLevelConfig`
- Charge depuis localStorage puis `/api/config`
- `getConfig(id)` → `LevelConfig` personnalisée ou défaut
- `levelStyles(hex)` → styles CSS inline (fond 10%, texte 70%, bordure 25%)
- `save()` → localStorage + POST `/api/config`

### `useToast`
- Singleton module-level : `toasts` ref, `add(message, type, duration)`, `remove(id)`
- Auto-dismiss après `duration` ms (défaut 3000)
- Types : `'success'` | `'error'` | `'info'`
- `ToastContainer.vue` monté dans `app.vue` via Teleport

### `useAccessControl`
- `accessConfig` chargé depuis `/api/config`
- `checkPassword(input)` → compare hash SHA-256
- `initiateSSO(returnTo)` → flow PKCE : génère `code_verifier`, `state`, redirect vers IdP
- `hasAccess()` → vérifie sessionStorage
- `testSSOConfig()` → fetch du `.well-known/openid-configuration`

### `useTheme`
- Thèmes disponibles : `light`, `dark`
- Applique `data-theme` sur `document.documentElement`
- Sauvegarde dans localStorage (pas dans le serveur — par utilisateur)

### `useDisplayMode`
Mode compact/normal + pageStyle. Persisté localStorage.

### `useOrdering`
Lit/écrit `order` depuis `useServerConfig`. `sortItems<T>()` trie selon l'ordre stocké.

---

## Serveur (Nitro)

### `server/plugins/scheduler.ts`
Plugin Nitro exécuté au démarrage serveur.
- `timers` Map : serviceId → `NodeJS.Timeout`
- `refreshCallbacks` Map : serviceId → `() => void`
- `lastSnapshots` Map : serviceId → dernier `StatusSnapshot` — envoyé aux nouveaux clients WS
- `serverFetch(url, method, headers, body, isPing)` : si `isPing = true`, retourne `{ _statusCode, _ok }` sans jeter d'erreur sur non-2xx
- `reloadSchedulers()` : lit la config, démarre/arrête les timers selon les services actifs
- `triggerRefresh(serviceId)` : exécute immédiatement le callback d'un service (depuis WS message)

### `server/routes/_ws.ts`
- `peers` Set — une entrée par connexion navigateur
- `broadcast(payload)` — envoie à tous les peers
- Sur `open` : envoie `lastSnapshots` + config complète au nouveau client
- Sur `message` type `'refresh'` : appelle `triggerRefresh(serviceId)`

### `server/api/proxy.post.ts`
- Cache mémoire 120s (TTL configurable, `forceRefresh` bypass)
- Protection SSRF : bloque localhost, 127.0.0.1, 0.0.0.0, 192.168.*, 10.*
- Mode `isPing: true` : retourne `{ _statusCode, _ok }` sans parser le body, sans throw sur non-2xx
- JSON → retourné tel quel ; XML/HTML → `{ _raw: string }`

### `server/api/config.get.ts`
Retourne `{ services, composites, order, levels, theme, pageStyle, accessControl }`.

### `server/api/config.post.ts`
Écriture partielle par clé. Si `services` ou `composites` changent : `reloadSchedulers()` + `broadcast({ type: 'config' })`.

---

## Composants

### `ServiceForm.vue`
Formulaire 2 colonnes (gauche config, droite test + JSON tree).
- **Deux boutons** : "Enregistrer" (émet `save`, reste ouvert) et "Enregistrer et Fermer" (émet `save-and-close`)
- Props : `open`, `editing`, `siblings?`, `inComposite?`, `inheritedAdapter?`, `inheritedMapping?`
- Events : `close`, `save`, `save-and-close`, `select-sibling`, `set-as-default`
- Sous-composants : `ServiceFormAuth`, `ServiceFormHeaders`, `ServiceFormCompositeNav`
- Test en direct via `/api/proxy` avec `isPing: true` si adapter = ping
- Explorateur JSON interactif : clic feuille → popup statusPath/messagePath

### `CompositeForm.vue`
Formulaire 2 colonnes (`max-w-4xl`) :
- **Gauche** : Nom, Section, Intervalle, bloc Mapping global (adapter + toggle + chemins + table levelMap éditable)
- **Droite** : liste sous-services DnD, toggle, adapter badge, édition/suppression
- Events `close`, `save`
- Réutilise `ServiceForm` (via `childFormOpen`) pour add/edit enfants
- `onChildSave` (reste ouvert), `onChildSaveAndClose` (ferme)

### `ServiceCard.vue`
Props : `name`, `snapshot?`, `loading?`, `error?`, `subServices?`, `compact?`.
Mode compact : ligne horizontale dense. Mode normal : carte avec header, message, footer.

### `StatusBadge.vue`
Utilise `useLevelConfig().getConfig(level)` → `levelStyles(hex)` → styles inline. Ne jamais utiliser les classes Tailwind de `LEVEL_COLORS`.

### `ToastContainer.vue`
`Teleport to="body"`, bas-droite. `TransitionGroup` pour entrée/sortie. Icône selon type. Cliquable pour fermer.

### `CompositeDetailModal.vue`
`h-[80vh]`. Gauche : nav (onglet Global + enfants triés par sévérité). Droite : détail. Raccourcis ↑↓.

### `HistoryModal.vue`
Snapshots triés par date. Limite 3 items par snapshot avec "voir plus".

### `JsonTree.vue`
Récursif. Auto-expand profondeur 2. Highlight des chemins dans `highlightPaths`. Émet `select({ path, value })`.

---

## `utils/summarize.ts`

`buildSummary(items)` → `{ text, dateRange, total }` ou `null` si vide.
Catégories : `incident`, `advisory`, `maintenance urgence`, `maintenance fournisseur`, `maintenance planifiée`, `maintenance`, `résolu`, `autre`.

---

## Conventions de code

- **État global** : refs déclarées au niveau module (hors fonction), pas de Pinia
- **Typage** : `interface` pour objets de données, `type` pour unions
- **Modales** : `<Teleport to="body">` + `<Transition>`, fermeture par `Escape` avec listener monté/démonté
- **DnD** : HTML5 natif (`draggable`, `dragstart`, `dragover`, `drop`)
- **Sauvegardes partielles** : `save('services')`, `save('composites')`, etc. — seule la clé concernée est envoyée
- **Sécurité proxy** : bloque les IPs privées (SSRF)
- **Intervalle poll** : plafonné à 1200s (20 min) côté scheduler
- **Tailwind v4** : pas de `tailwind.config.js` — plugin Vite uniquement
- **Pas de tests** : pas de fichier de test dans le projet
- **EMFILE macOS** : `pnpm.onlyBuiltDependencies` dans `package.json` compile `@parcel/watcher` — nécessaire pour que Nitro utilise son watcher natif plutôt que Node FSWatcher
- **Toasts** : appeler `const { add: toast } = useToast()` dans le composant/page, puis `toast('message')` après chaque opération de sauvegarde
- **Deux boutons save** : `emit('save')` garde la modale ouverte ; `emit('save-and-close')` ferme — les parents doivent gérer les deux events
