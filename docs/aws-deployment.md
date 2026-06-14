# Sentinel on AWS — Deployment Analysis

*Author: Adrien Luce · Paris IT · End User Services Europe*
*Status: proposal / for discussion — Sentinel is not yet hosted.*

---

## 0. TL;DR

- **The constraint:** Sentinel cannot be made available to the team without a **cloud account to host it**. It is a small, always-on server — not a static website — so there is nothing to "just upload". A **corporate AWS account** is the natural home.
- **Recommended (production):** `CloudFront + WAF → Application Load Balancer → ECS Fargate (1 task) → EFS`, with secrets in **Secrets Manager**, DNS in **Route 53**, TLS via **ACM**. ~**$40–80/month**.
- **Quickest win (pilot):** a single **Lightsail / EC2** VM running the Docker image with a small attached disk. ~**$10–25/month**.
- **Why not pure S3 + CloudFront:** that only serves static files. Sentinel needs **compute** (a running Node process), **persistent storage** (its config), and **WebSocket** support (its live updates). CloudFront is still useful — as the TLS/CDN/WAF front door **in front of** the compute.

---

## 1. What Sentinel actually needs from its host

These four properties shape every option below:

| Requirement | Detail | Implication |
|---|---|---|
| **Long-running process** | Nitro server (`.output/server/index.mjs`) runs a background scheduler that polls each source on a timer. | Needs **compute that stays up**, not a function that runs per-request. (A Lambda would be killed between requests and lose its timers + in-memory snapshots.) |
| **WebSocket** | `server/routes/_ws.ts` keeps a persistent connection open to every browser and pushes snapshots. | The ingress must support **WebSocket upgrade** (ALB and CloudFront do; some PaaS don't). |
| **Persistent filesystem** | Nitro `fs` storage writes config to `./data` (services, composites, levels, access control…). | Needs a **durable volume** (EFS/EBS) **or** a swap to an S3/DynamoDB storage driver. Container-local disk is ephemeral and would lose config on every redeploy. |
| **Outbound HTTPS egress** | Polls public vendor status APIs (GitHub, AWS, Cloudflare, Salesforce…). | The task needs a clean **egress path** (NAT gateway, or a public subnet). On AWS there is no corporate TLS-inspection problem, so the `STATUS_*` env workarounds are not needed. |

> **Single-instance by design.** Snapshots and WebSocket peers live in memory *per process*. One small container easily handles an internal dashboard, and a single instance keeps the "one outbound call per source regardless of viewers" guarantee intact. Running >1 instance naively would double the outbound polling **and** split clients across instances that don't share state. Horizontal scaling is possible but needs shared pub/sub — see §8. For this workload, **don't**; run one task and let the orchestrator restart it on failure.

---

## 2. Why "S3 + CloudFront" alone doesn't work (and where CloudFront fits)

S3 + CloudFront is the canonical pattern for a **static** single-page app: you upload built HTML/JS/CSS, CloudFront caches and serves it globally. Sentinel's *client bundle* is static and could indeed be served that way — but the **server half** (scheduler, `/api/*`, `/_ws`) has nowhere to run, and the browser would have no WebSocket to connect to.

So CloudFront stays in the design, but as the **front door to compute**, doing what it's good at:

- Global **TLS termination** (ACM cert) and HTTP/2/3.
- **Caching** the immutable static assets (`/_nuxt/*`) so the container only serves the dynamic paths and the WebSocket.
- **AWS WAF** attachment (managed rule sets, IP allow-listing, rate limiting) — valuable for a finance-firm app.
- **WebSocket pass-through** to the origin (CloudFront supports it).

The origin behind CloudFront is an **Application Load Balancer**, and behind that is the actual server.

---

## 3. Compute options compared

| Option | WebSocket | Persistent storage | Ops effort | ~Cost/mo | Verdict |
|---|---|---|---|---|---|
| **Lightsail instance (VPS)** | ✅ (plain VM) | Attached block disk | Low | $10–20 | **Best pilot** — Docker + Caddy/Nginx, done in an afternoon |
| **EC2 (t4g.small, ARM)** | ✅ | EBS | Low–Med | $15–40 | Good lift-and-shift; you patch the OS |
| **ECS on Fargate + ALB** | ✅ (via ALB) | EFS | Medium | $40–80 | **Recommended for production** — no servers to patch, IAM-native, fits corporate governance |
| **App Runner** | ❌ **no WebSocket** | ❌ ephemeral only | Low | $25+ | **Ruled out** unless we drop WebSocket for polling + an external store |
| **Lambda + API Gateway** | ⚠️ only via API GW *WebSocket API* (re-architecture) | ❌ (needs Dynamo/S3) | High | low | Wrong shape — the background scheduler needs an always-on process; would require EventBridge + a connection table. Not worth it here |
| **EKS (Kubernetes)** | ✅ | EFS/EBS | High | $$$ (control plane + nodes) | Overkill for one internal dashboard |

**Takeaways:** App Runner is the tempting "easy button" but its lack of WebSocket support disqualifies it. Fargate is the right managed target for production; Lightsail/EC2 are the fastest way to get a pilot in front of people.

---

## 4. Recommended architecture (production)

```
            Corporate network  (VPN / Direct Connect / Transit Gateway)
                                     │
                              Route 53  (DNS: sentinel.<corp>)
                                     │
                   ┌─────────────────▼──────────────────┐
                   │      CloudFront  +  AWS WAF         │   ACM TLS (us-east-1)
                   │  caches /_nuxt/*, WS pass-through   │   managed rules + IP allow-list
                   └─────────────────┬──────────────────┘
                                     │  HTTPS + WSS
                   ┌─────────────────▼──────────────────┐
                   │   Application Load Balancer (ALB)   │   ACM TLS (regional)
                   │   WebSocket upgrade · health checks │   optional authenticate-oidc (Entra ID)
                   └─────────────────┬──────────────────┘
                                     │  HTTP + WS  :3000
                   ┌─────────────────▼──────────────────┐
                   │      ECS Fargate service — 1 task   │   image from Amazon ECR
                   │      private subnet, 0.25 vCPU/0.5GB │
                   │        ├─ EFS mount  → /app/.data    │   persistent config
                   │        └─ Secrets Manager → env      │   per-source API tokens
                   └─────────────────┬──────────────────┘
                                     │  443 egress  (NAT GW, or public subnet to save cost)
                                     ▼
                Public vendor status APIs (GitHub, AWS, Cloudflare, Salesforce, ICE…)

   Cross-cutting:  CloudWatch Logs/alarms · ECR image scanning · IAM least-privilege task role
```

**Component roles**

- **ECR** — registry for the Docker image (the repo already ships a `Dockerfile` in the README).
- **ECS Fargate** — runs exactly **one** task (serverless containers; no EC2 to manage). 0.25 vCPU / 0.5 GB is ample. Auto-restart on failure; rolling redeploys.
- **EFS** — mounted at `/app/.data` so configuration survives task restarts and redeploys (the alternative is an S3/Dynamo storage driver — see §7).
- **ALB** — TLS termination (ACM), native **WebSocket** upgrade, health check on `/`. Can additionally gate the app at the edge with **authenticate-oidc** (Entra ID) so requests are authenticated *before* reaching the container.
- **CloudFront + WAF** — public TLS/CDN/WAF front door (only if internet-facing; see §9).
- **Secrets Manager** — holds per-source API tokens (Graph, LSEG…), injected as env vars; upgrades the app's "secrets stay server-side" property to "secrets never on disk".
- **Route 53 + ACM** — DNS + managed certs (one cert in `us-east-1` for CloudFront, one regional for the ALB).
- **CloudWatch** — container logs, plus an alarm on task health / 5xx.

---

## 5. Simplest viable option (pilot / quick win)

To get it in front of the team this week, skip ECS:

1. **Lightsail instance** (or `t4g.small` EC2), Amazon Linux 2023, ~$10–20/mo.
2. Install Docker. `docker build` the repo (or pull from ECR).
3. Run the container with a host volume for `./data` and a restart policy:
   ```bash
   docker run -d --restart unless-stopped -p 3000:3000 \
     -v /srv/sentinel-data:/app/.data --name sentinel sentinel
   ```
4. Put **Caddy** (or Nginx) in front for automatic Let's Encrypt TLS and WebSocket proxying, or a Lightsail load balancer.
5. Point a DNS record at it; restrict access to the corporate IP range / VPN.

This is a legitimate place to *start*; the Fargate design in §4 is where it *lands* once it's adopted. The Dockerfile is identical, so the pilot → production move is just "push the image to ECR and create the ECS service".

> ⚠️ Lightsail's **container service** has WebSocket caveats; use a Lightsail **instance** (a plain VM) for the pilot, where WebSocket simply works.

---

## 6. Persistence: EFS vs swapping the storage driver

Sentinel uses Nitro's `fs` storage driver. Two clean ways to make that durable on AWS:

| Approach | Change required | Pros | Cons |
|---|---|---|---|
| **EFS volume** (mount `/app/.data`) | None (infra only) | Zero code change; behaves exactly like local disk; shared if we ever scale | EFS adds a little latency + setup; another resource to manage |
| **S3 storage driver** (`unstorage` S3 driver) | Small change in `nuxt.config.ts` | Serverless-friendly; no EFS; cheap; durable | A code change; config writes become S3 PUTs |
| **DynamoDB storage driver** | Small change in `nuxt.config.ts` | Durable, cheap, scales to multi-instance cleanly | A code change; mild overkill for a handful of config keys |

Config is tiny and writes are infrequent, so **EFS** is the lowest-friction choice for the first deployment; **S3/Dynamo** become attractive if we later go multi-instance (§8) or want to drop EFS.

---

## 7. WebSocket & scaling

- **Today (recommended):** one Fargate task. Clean, cheap, and preserves the single-poller guarantee. Availability is "ECS restarts the task" — an RTO of a couple of minutes, which is fine for an internal status board.
- **If HA / multi-AZ is ever required:** move shared state out of process —
  - **ElastiCache (Redis) pub/sub** so every task receives and re-broadcasts snapshots to its own WebSocket peers;
  - a **single poller** (one task, or a leader-elected task, or an EventBridge-scheduled poller) writing to Redis/Dynamo so we don't multiply outbound calls;
  - **DynamoDB/S3** for config (already an option in §6).
  - ALB sticky sessions for the WebSocket connections.
- Verdict: not needed now. Documented so the path exists.

---

## 8. Networking & exposure — pick one

Because Sentinel is an **internal** tool for a finance firm, exposure is a real decision:

- **Option A — Internal only (preferred for a finance firm).** An **internal** ALB, reachable only from the corporate network over VPN / Direct Connect / Transit Gateway. **No CloudFront, no public internet.** Smallest attack surface; simplest compliance story. Authentication via the app's SSO or ALB `authenticate-oidc`.
- **Option B — Internet-facing, locked down.** **CloudFront + WAF** with an **IP allow-list** (corporate egress ranges) and OIDC/SSO. Use this only if people need it off-VPN; it adds a global edge but also an internet footprint to defend.

Recommendation: **start internal-only (Option A)**; add the CloudFront front door later only if off-network access is genuinely needed.

---

## 9. Security & governance (finance-grade)

- **Secrets** in Secrets Manager (or SSM Parameter Store), never baked into the image or written to disk.
- **Network:** task in a private subnet; security groups least-privilege (ALB SG → task SG on `:3000` only; task egress `443` only).
- **Identity:** IAM task role scoped to exactly the secrets/EFS it needs; no long-lived keys.
- **Edge:** WAF managed rule sets + rate limiting (if internet-facing); ALB `authenticate-oidc` to Entra ID to gate the whole app at the load balancer.
- **TLS:** ACM-managed certs, TLS 1.2+ enforced; auto-renew.
- **Supply chain:** ECR image scanning on push; pinned base image; routine `pnpm` updates.
- **Observability:** CloudWatch Logs + alarms; optionally GuardDuty / AWS Config at the account level.
- **The app already helps:** per-source tokens are server-side, the proxy blocks SSRF, and access is gated by password/SSO — AWS hardens the perimeter around those.

---

## 10. CI/CD

Minimal, GitHub-Actions-based:

```
git push  →  GitHub Actions
                ├─ pnpm install && pnpm build
                ├─ docker build  →  push :sha to Amazon ECR
                └─ aws ecs update-service --force-new-deployment   (rolling)
```

Fully-in-AWS alternative: CodePipeline + CodeBuild + ECR + ECS deploy. For a one-container app, GitHub Actions is plenty.

---

## 11. Cost estimate (production / §4)

| Item | Notes | ~$/mo |
|---|---|---|
| Fargate task | 0.25 vCPU / 0.5 GB, 24×7 | ~9 |
| Application Load Balancer | base + low LCU | ~17 |
| **NAT Gateway** | **the sneaky line item** — base ~$32 + data | ~32 |
| EFS | a few MB of config | <1 |
| CloudFront + WAF | low internal traffic | ~5–10 |
| Route 53 | 1 hosted zone | ~1 |
| Secrets Manager | per secret | ~1 |
| CloudWatch | logs + a couple of alarms | ~2–5 |
| **Total** | with NAT, internet-facing | **~$70–80** |
| **Total** | internal-only, **no NAT** (public subnet for the task, or skip CloudFront) | **~$35–45** |

> **Cost tip:** the **NAT Gateway** often costs more than everything else combined. For a single task you can place it in a **public subnet with a public IP** (no NAT) and lock egress with security groups, or use a tiny NAT *instance*. Internal-only (Option A) also lets you drop CloudFront.

**Pilot (§5):** a single Lightsail/EC2 VM is **~$10–25/mo** all-in.

---

## 12. Migration checklist

1. Build the image from the existing `Dockerfile`; push to **ECR**.
2. VPC: use an existing corporate VPC, or create one with public + private subnets across 2 AZs.
3. Create **EFS** (or choose the S3/Dynamo driver, §6).
4. Move per-source tokens into **Secrets Manager**.
5. **ECS cluster** → task definition (mount EFS, env from Secrets) → **service** (1 task) behind an **ALB**.
6. **ACM** cert + **Route 53** record; health check on `/`.
7. (Internet-facing only) add **CloudFront + WAF** in front of the ALB.
8. Wire **SSO** (app-level or ALB `authenticate-oidc`).
9. **CloudWatch** logs + a task-health alarm.
10. Smoke test: dashboard loads, two tabs receive a live update (WebSocket OK), config change persists across a forced redeploy (EFS OK), an unreachable source shows grey not red.

---

### One-line ask for the reporting line

> To take Sentinel from a local prototype to something the whole desk can use, the single blocker is a **hosting home — a corporate AWS account**. The footprint is tiny (one small container behind a load balancer, ~$35–80/month) and it puts the tool under firm ownership, IT security and governance.
