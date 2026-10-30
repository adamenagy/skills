# APS Inventor AppBundle Skill

Create, deploy, and run Autodesk Inventor AppBundles on the [Automation API](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/overview/) (Design Automation v3) of Autodesk Platform Services. The agent scaffolds an Inventor add-in, packages and validates the `.bundle.zip`, registers the AppBundle and Activity with aliases, submits WorkItems, and reads the report to debug failures.

## What's included

| File | Purpose |
|------|---------|
| `SKILL.md` | Step-by-step workflow, from requirements to a working work item |
| `references/addin-authoring.md` | Entry-point contract, target frameworks per engine, headless restrictions, known API failures, iLogic-only alternative |
| `references/automation-api.md` | Nickname, IDs and aliases, REST sequence, parameter rules, error table |
| `scripts/new_addin.py` | Scaffold a project from the template with a fresh GUID and the right target framework |
| `scripts/verify_bundle.py` | Check the zip layout, `PackageContents.xml`, `.addin`, and GUIDs before upload |
| `scripts/da.mjs` | Zero-dependency CLI: engines, nickname, publish AppBundle/Activity, OSS upload/download, run a WorkItem |
| `assets/addin-template/` | Compiled-and-checked add-in template (csproj builds the bundle zip) |
| `assets/activity.json` | Activity definition to copy |

## Requirements

- An [APS app](https://aps.autodesk.com/myapps) with a client ID and secret. Export them as `APS_CLIENT_ID` and `APS_CLIENT_SECRET`. The scripts never print or store them.
- Node.js 20+ and Python 3 (bundled scripts)
- .NET SDK (8 for Inventor 2025/2026, 10 for 2027) and the Inventor interop assembly: either an Inventor install, or the community `Autodesk.Inventor.Sdk` NuGet package

## Installation

Recommended (project-level):

```bash
npx skills add autodesk-platform-services/skills --project --skill aps-inventor-appbundle
```

## Usage

Ask your AI agent:

> "Create an Inventor 2026 Automation add-in that changes the Width and Height parameters of a part and deploy it to Design Automation"
> "My Inventor work item succeeds but no output file is produced — help me debug"
> "Package this Inventor add-in as an AppBundle and publish a new version under the `prod` alias"

## Status

Script behavior was exercised against a local mock of the service, and the template was compiled with .NET 8. It hasn't been run against the live service or a real Inventor engine. Run it once with a real app and report anything that differs from the docs.
