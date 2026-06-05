# Dashboard Concentrateur de Statuts

Tableau de bord de surveillance centralisé pour les services cloud. Agrège les pages de statut de GitHub, AWS, Azure DevOps, Notion/Atlassian et tout endpoint JSON ou flux RSS personnalisé. La configuration est partagée côté serveur : tous les utilisateurs qui accèdent au même déploiement voient et modifient la même liste de services.

---

## Fonctionnalités

- **Surveillance en temps réel** avec polling configurable (10–120 secondes par service)
- **7 niveaux de statut** : Opérationnel, Information, Légère perturbation, Incident mineur, Incident majeur, Maintenance, Action requise
- **Adaptateurs prêts à l'emploi** : GitHub Status, AWS Health Dashboard, Azure DevOps Health, Atlassian Statuspage, Notion, flux RSS/Atom
- **Adaptateur personnalisé** : n'importe quel endpoint JSON ou XML avec mapping par chemin (dot-notation), patterns de correspondance (exact, wildcard, contains, regex)
- **Services composites** : agrège plusieurs sous-services sous une seule carte avec niveau le plus grave
- **Test en direct** dans le formulaire avec prévisualisation de la réponse en arbre JSON interactif et aperçu de la carte résultante
- **Groupes** : organise les services par section (ex. Infrastructure, Cloud, Trading)
- **Drag-and-drop** pour réordonner les services et les sous-services
- **Mode compact** : vue dense multi-colonnes pour surveiller de nombreux services en un coup d'oeil
- **Personnalisation des niveaux** : couleur hex et libellé modifiables par niveau
- **Historique des statuts** : 50 entrées par service, persisté dans le navigateur, accessible en un clic
- **Authentification HTTP** : Bearer Token, Basic Auth, API Key (header personnalisé)
- **Résumé automatique** : synthèse textuelle des incidents (nb incidents, maintenances, plage de dates)
- **Stockage serveur partagé** : configuration persistée via Nitro fs driver, migration automatique depuis localStorage
- **Sécurité proxy** : les appels vers localhost et réseaux privés sont bloqués côté serveur

---

## Prérequis

- Node.js >= 18
- pnpm (ou npm / yarn)

---

## Installation

```bash
git clone <repo>
cd dashboard-concentrateur-status
pnpm install
```

---

## Lancer le serveur de développement

Sur macOS, un problème connu avec Nitro nécessite de redéfinir `TMPDIR` :

```bash
TMPDIR=/tmp pnpm dev
```

Le script `dev` dans `package.json` inclut déjà ce préfixe. Il suffit donc de :

```bash
pnpm dev
```

Le dashboard est accessible sur [http://localhost:3000](http://localhost:3000).

---

## Répertoire `data/`

Nitro crée automatiquement le répertoire `data/` à la racine du projet lors du premier démarrage. Il contient la configuration persistée :

```
data/
├── services      # liste des services simples (JSON)
├── composites    # liste des groupes de services (JSON)
├── order         # ordre d'affichage des cartes (JSON)
└── levels        # personnalisation des niveaux (JSON, optionnel)
```

Ce répertoire doit être inclus dans les volumes persistants si vous déployez dans Docker.

---

## Configuration des services

### Accéder à la gestion des services

Cliquez sur l'icône engrenage en haut à droite du dashboard, ou accédez directement à `/services`.

### Ajouter un service

Cliquez sur **Ajouter**, puis choisissez entre **Service unique** et **Groupe de services**.

#### Préconfigurations disponibles

Sur le formulaire d'ajout (service unique), des boutons de préconfiguration sont disponibles :

| Bouton | URL préconfigurée | Adaptateur |
|---|---|---|
| GitHub | `https://www.githubstatus.com/api/v2/summary.json` | github |
| AWS | `https://health.aws.amazon.com/health/status` | aws |
| Azure DevOps (Europe) | `https://status.dev.azure.com/_apis/status/health?geographies=EU&api-version=7.0-preview.1` | azuredevops |

Un clic sur un bouton de préconfiguration remplit automatiquement l'URL, l'adaptateur, et efface les champs d'authentification.

---

## Référence des adaptateurs

| Clé | Nom affiché | Format attendu | Champs clés |
|---|---|---|---|
| `github` | GitHub Status | JSON Atlassian (GitHub) | `status.indicator`, `status.description`, `incidents[].impact` |
| `atlassian` | Atlassian / Statuspage | JSON Atlassian standard | `status.indicator`, `status.description`, `incidents[].impact` |
| `notion` | Notion | JSON Atlassian (alias atlassian) | Idem atlassian |
| `aws` | AWS Health | JSON AWS Health Dashboard | `current_events[].service_name/summary/status/date/url` |
| `azuredevops` | Azure DevOps | JSON Azure DevOps Health API | `status.health`, `services[].geographies[].health`, `services[].issues[]` |
| `rss` | RSS / Atom | XML RSS ou Atom | `<entry>` ou `<item>` → title, summary/description, updated/pubDate, link |
| `custom` | Personnalisé | N'importe quel JSON ou XML | Configuré manuellement (voir section suivante) |
| `auto` | Auto-détection | JSON avec `status.indicator` | Tente la détection Atlassian en fallback |

---

## Guide du mapping personnalisé (adaptateur `custom`)

L'adaptateur `custom` permet de surveiller n'importe quel endpoint JSON ou flux RSS/Atom sans code. Il suffit de configurer trois éléments :

### `statusPath`

Chemin dans le JSON (notation pointée) vers la valeur de statut. Exemples :

```
status.indicator          → valeur simple
health.overall.status     → chemin imbriqué
entries.0.title           → premier élément d'un tableau (valeur unique)
entries.*.title           → TOUS les titres → niveau = pire niveau de tous → génère des incidents
```

### `messagePath`

Chemin vers le message descriptif. Peut aussi utiliser `.*` :

```
status.description          → message simple
entries.*.summary           → tous les résumés affichés comme liste (sans créer d'incidents)
entries.*                   → items complets (titre + résumé + date + lien) affichés dans le détail
```

**Différence importante** : `statusPath` avec `.*` génère des **incidents** (avec niveau de gravité). `messagePath` avec `.*` génère des **entrées de message** (textes informatifs, sans niveau).

### `levelMap`

Table de correspondance entre les valeurs retournées par l'API et les niveaux du dashboard. Supporte quatre syntaxes de pattern :

| Syntaxe | Exemple | Comportement |
|---|---|---|
| Exact | `"none"` | La valeur doit être exactement `none` (insensible à la casse) |
| Wildcard `*` | `"healthy*"` | La valeur commence par `healthy` (le `*` représente n'importe quelle suite de caractères) |
| Contains `~` | `"~advisory"` | La valeur contient `advisory` |
| Regex `/pattern/flags` | `"/^healthy$/i"` | Correspondance regex JavaScript |

Si aucun pattern ne correspond, le dashboard tente une détection automatique par mots-clés anglais et français.

### Exemple complet pour un endpoint personnalisé

Endpoint retournant :
```json
{
  "global": { "status": "degraded", "message": "Partial outage on zone EU-West" }
}
```

Configuration :
- URL : `https://api.monservice.com/health`
- Adaptateur : Personnalisé
- Chemin statut : `global.status`
- Chemin message : `global.message`
- Correspondances :
  - `healthy` → Opérationnel
  - `~degraded` → Incident mineur
  - `~outage` → Incident majeur

### Utiliser l'arbre JSON interactif

Après avoir renseigné l'URL, cliquez sur **Tester**. La réponse s'affiche sous forme d'arbre navigable. Cliquer sur n'importe quelle **valeur feuille** (texte, nombre, booléen) affiche un popup proposant :

- **Statut** : utilise ce chemin comme `statusPath` et ajoute automatiquement la valeur dans `levelMap`
- **Message** : utilise ce chemin comme `messagePath`
- Si la valeur est dans un tableau (ex. `entries.0.title`) : propose aussi le chemin wildcard (`entries.*.title`) et le chemin item complet (`entries.*`)

---

## Services composites (groupes)

Un service composite agrège plusieurs sous-services sous une seule carte. Le niveau affiché est toujours le **niveau le plus grave** parmi les sous-services actifs.

### Créer un groupe

1. Sur `/services`, cliquer sur **Ajouter** → **Groupe de services**
2. Donner un nom et optionnellement une section
3. Cliquer sur **Ajouter** dans la liste des sous-services pour configurer chaque endpoint individuellement (même formulaire que les services simples, avec test en direct)
4. Les sous-services peuvent être réordonnés par drag-and-drop
5. Chaque sous-service peut être activé/désactivé indépendamment

### Voir le détail d'un composite

Cliquer sur la carte d'un composite ouvre la **modale de détail** :

- **Onglet Global** : niveau global, résumé automatique, mini-cartes de tous les sous-services (cliquables)
- **Onglets enfants** (colonne gauche) : triés par niveau de gravité décroissant. Affiche les incidents, entries ou le message, puis l'historique de changements
- Navigation clavier : les touches **Flèche haut** / **Flèche bas** permettent de passer d'un sous-service à l'autre

---

## Personnalisation des niveaux

Sur la page `/services`, cliquer sur le bouton **Niveaux** (en haut à droite) pour ouvrir la modale de personnalisation.

Pour chaque niveau, vous pouvez modifier :
- La **couleur** (sélecteur de couleur natif — valeur hex)
- Le **libellé** affiché dans les badges et bannières

La **référence** (signification sémantique du niveau) est affichée en lecture seule et ne peut pas être modifiée.

Les couleurs sont utilisées pour calculer dynamiquement le fond (10% d'opacité), le texte (70% plus sombre) et la bordure (25% d'opacité) des badges. Les modifications sont sauvegardées côté serveur et s'appliquent à tous les utilisateurs.

Le bouton **Réinitialiser** restaure les couleurs et libellés par défaut.

---

## Déploiement

### VPS / Serveur dédié

```bash
pnpm build
node .output/server/index.mjs
```

La configuration est stockée dans `data/` à la racine du projet. Assurez-vous que le processus a les droits d'écriture sur ce répertoire.

Pour un démarrage automatique, utilisez PM2 ou systemd :

```bash
# Exemple PM2
pm2 start .output/server/index.mjs --name status-dashboard
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install && pnpm build

VOLUME /app/data

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

```bash
docker build -t status-dashboard .
docker run -d -p 3000:3000 -v ./data:/app/data status-dashboard
```

Le volume `/app/data` est essentiel pour conserver la configuration entre les redémarrages du conteneur.

> **Important** : ce projet **n'est pas compatible avec Vercel ou les déploiements serverless** car le stockage Nitro repose sur le système de fichiers (`driver: 'fs'`), qui n'est pas persistant sur ces plateformes.

---

## Stockage multi-utilisateurs et migration

La configuration est stockée côté serveur (fichiers dans `data/`) et partagée entre tous les navigateurs accédant au même déploiement. Il n'y a pas de gestion d'utilisateurs : tout le monde voit et peut modifier la même configuration.

### Migration automatique depuis localStorage

Si le serveur ne contient aucune configuration (première installation, nouveau déploiement) mais que le navigateur a des services configurés dans son localStorage (version précédente de l'outil), la migration s'effectue automatiquement au premier chargement : les données du localStorage sont envoyées au serveur et une confirmation est affichée dans la console.

### Fallback hors-ligne

Si le serveur est inaccessible (timeout réseau), le dashboard bascule automatiquement sur les données du localStorage. Les modifications effectuées hors-ligne sont perdues au prochain rechargement.

---

## Mode compact

Cliquer sur l'icône de grille en haut à droite du dashboard bascule entre le mode normal et le mode compact.

- **Mode normal** : cartes avec titre, badge de statut, message et pied de carte
- **Mode compact** : lignes horizontales denses (point coloré + nom + heure), grille jusqu'à 4 colonnes

Le mode est sauvegardé dans le localStorage du navigateur (par navigateur, pas partagé).

---

## Raccourcis clavier

| Touche | Contexte | Action |
|---|---|---|
| `Escape` | N'importe quelle modale | Fermer la modale |
| `ArrowDown` | Modale composite (enfant sélectionné) | Passer au sous-service suivant |
| `ArrowUp` | Modale composite (enfant sélectionné) | Passer au sous-service précédent |
