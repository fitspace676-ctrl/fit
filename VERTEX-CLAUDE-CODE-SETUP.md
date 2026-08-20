# Claude Code → Vertex AI (Claude Opus 5) — setup

Project: `conciergia-backend`
Account: `n.shabashvili@conciergia.ge`
Model: `claude-opus-5`

---

## ⚠️ Blocker — quota is 0, increase requested and pending

Access to Opus 5 **is granted** (Model Garden questionnaire approved), but the
quota is `0`, so every request fails:

```
HTTP 429 RESOURCE_EXHAUSTED
Quota exceeded for aiplatform.googleapis.com/global_online_prediction_requests_per_base_model
with base model: anthropic-claude-opus
```

Verified 429 on `global`, `us-east5`, `europe-west1`, `us-central1` — changing
region does not help.

**Quota increase request submitted — awaiting approval:**

|           |                                                             |
| --------- | ----------------------------------------------------------- |
| Case ID   | `57829e5d-eceb-4188-8e2e-3e7ee5b3aebf`                      |
| Quota     | Global online prediction requests per base model per minute |
| Dimension | `base_model : anthropic-claude-opus`                        |
| Change    | `0` → `60` requests/min                                     |

Track it → https://console.cloud.google.com/iam-admin/quotas?project=conciergia-backend
(**Increase Requests** tab)

Until Google/Anthropic approve, Claude Code connects but every prompt errors.
Use a normal Anthropic account in the meantime (`/login` → Anthropic account).

Check whether it has landed:

```bash
gcloud auth application-default print-access-token | { read T; curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://aiplatform.googleapis.com/v1/projects/conciergia-backend/locations/global/publishers/anthropic/models/claude-opus-5:rawPredict" \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"anthropic_version":"vertex-2023-10-16","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}'; }
# 429 = still pending   200 = approved, ready to use
```

### Note on regional quota

Only the **global** quota could be requested. The regional row
(`anthropic-claude-opus-5` under _Online prediction input tokens per minute per
base model_) does not exist in the quota table yet — the console shows
_"Values for quotas are being updated. This may take 2-3 weeks to complete."_

Per the Model Garden card, _"Opus 5's quota is included in the shared Opus-family
quota"_, which is why the global row is `anthropic-claude-opus` (unversioned).

**Therefore keep `CLOUD_ML_REGION=global`.**

---

## Already done (project-side, no need to repeat)

- `aiplatform.googleapis.com` enabled on `conciergia-backend`
- Claude Opus 5 enabled in Model Garden (Anthropic approval granted)
- `n.shabashvili@conciergia.ge` has `roles/owner` + `roles/aiplatform.user`

Everything below is **per-laptop** and must be repeated on each machine.

---

## Steps on the new laptop

### 1. Install gcloud

https://cloud.google.com/sdk/docs/install — or `brew install --cask google-cloud-sdk`

### 2. Authenticate

```bash
gcloud auth login n.shabashvili@conciergia.ge
gcloud config set project conciergia-backend

# ADC — this is the one Claude Code actually reads. Do not skip.
gcloud auth application-default login --project=conciergia-backend
```

Verify:

```bash
gcloud auth list                 # n.shabashvili@conciergia.ge must be ACTIVE (*)
ls ~/.config/gcloud/application_default_credentials.json
```

### 3. Install Claude Code

https://code.claude.com/docs — needs v2.1.207+ (this setup was verified on 2.1.221).

### 4. Connect Claude Code — pick one

**Option A — wizard (easiest):**

```
claude
/login  →  3rd-party platform  →  Google Vertex AI
```

It auto-detects project + region, checks which models the project can invoke,
and writes the result into `~/.claude/settings.json`.
Re-run later with `/setup-vertex`.

**Option B — manual env vars:**

```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_PROJECT_ID=conciergia-backend
export ANTHROPIC_MODEL='claude-opus-5'
```

Or in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_USE_VERTEX": "1",
    "CLOUD_ML_REGION": "global",
    "ANTHROPIC_VERTEX_PROJECT_ID": "conciergia-backend",
    "ANTHROPIC_MODEL": "claude-opus-5"
  }
}
```

### 5. Verify

```
/status
```

Expect `API provider: Google Vertex AI`, plus the project, region and model.
If the provider line is missing, the env vars aren't reaching the process.

---

## Important: set ANTHROPIC_MODEL, don't leave it unset

Only **Opus 5** is enabled in this project. Sonnet 4.5, Haiku 4.5 and Opus 4.8
all return `404 — model not found or your project does not have access`.

On Vertex, Claude Code's default small/fast model (used for background work such
as session titles) is `claude-sonnet-4-5@20250929` — which would 404 here.

Setting `ANTHROPIC_MODEL='claude-opus-5'` makes background tasks use that model
too, avoiding the 404. Note this bills background work at Opus rates.

To use a cheaper background model instead, first enable it in Model Garden
(separate questionnaire per model), then set:

```bash
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5@20251001'
```

---

## Troubleshooting

| Symptom                                  | Cause / fix                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `429 RESOURCE_EXHAUSTED`                 | Quota still 0 — see the blocker section above                                        |
| `404 model not found`                    | That model isn't enabled in Model Garden (per-model questionnaire)                   |
| `Could not load the default credentials` | `gcloud auth application-default login` not run on this machine                      |
| `/status` shows no provider line         | env vars not exported in the shell that launched `claude`, or not in `settings.json` |

Note: the Model Garden questionnaire is **console-only**. Vertex's own API returns
`requestAccess` as a console URL, and `gcloud ai model-garden models` only offers
`deploy` / `list` / `list-deployment-config` — there is no CLI enable command.
