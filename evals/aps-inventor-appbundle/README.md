# aps-inventor-appbundle evals

| Case | Purpose | Key checks |
|---|---|---|
| `01-deploy-existing-addin` | Skill fires; accurate workflow | Bundle zip layout, `.addin` ModuleName, nickname-before-data, register/upload/alias/activity/workitem sequence, aliases and versions, engine id from `/engines`, .NET 8 + Utils > 2.0.0; no legacy hosts |
| `02-neg-desktop-inventor-api` | Trigger precision | A desktop Inventor API question (no cloud, no Automation API) must not fire the skill |

Ground truth comes from the APS Automation API docs (Inventor tutorial, aliases and IDs, troubleshooting, release notes), checked on 2026-10-29. If a case fails in both arms, re-check the docs before changing the skill.

## Running

From the repo root, in a terminal outside Claude Code:

```bash
ANTHROPIC_API_KEY="..." claude plugin eval . --eval-dir evals/aps-inventor-appbundle --allow-tools Skill Read
```
