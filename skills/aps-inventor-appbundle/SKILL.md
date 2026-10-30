---
name: aps-inventor-appbundle
description: >
  Create, deploy, and run Autodesk Inventor AppBundles on the APS Automation API (Design Automation v3).
  Use when the user wants to run Inventor headlessly in the cloud: write an Inventor add-in/plugin for
  Automation, package it as a .bundle zip (PackageContents.xml, .addin), register the AppBundle, publish an
  Activity with aliases, submit WorkItems, and debug failed work items. Covers InventorCoreConsole,
  engine versions (.NET Framework, .NET 8, .NET 10), parameter-driven part/assembly changes, and exports.
metadata:
  author: Developer Advocates @ Autodesk
  version: "0.1"
  products: "Inventor, Design Automation"
  technologies: ".NET, C#, REST, OAuth"
  industries: "Manufacturing"
compatibility: Requires Node.js 20+ and Python 3 for the bundled scripts, the .NET SDK and Inventor interop (Windows with Inventor, or the community Autodesk.Inventor.Sdk NuGet) to build, and an APS app with client credentials.
---

# Inventor AppBundles on the APS Automation API

Take an Inventor add-in from nothing to a running cloud job: **author → build/zip → verify → register AppBundle → publish Activity → run WorkItem → read report**. Work through the checklist in order; each step has a script or reference.

- [ ] 1. Gather requirements
- [ ] 2. Scaffold the add-in (`scripts/new_addin.py`)
- [ ] 3. Implement the logic ([`references/addin-authoring.md`](references/addin-authoring.md))
- [ ] 4. Build, then verify the zip (`scripts/verify_bundle.py`)
- [ ] 5. Deploy: nickname, AppBundle, Activity (`scripts/da.mjs`)
- [ ] 6. Run a WorkItem and read the report
- [ ] 7. Iterate: new version, repoint alias, re-run

## Step 1: Gather requirements

Ask all at once, skipping what the request already answers:

1. **What should the job do** to the Inventor file(s) — change parameters, export (PDF/STEP/DWG/…), generate drawings, extract data? Inputs and outputs: part (`.ipt`), assembly (`.iam` + its folder), drawing?
2. **Target Inventor version.** Default: the newest engine that `node scripts/da.mjs engines Inventor` lists as available. Needs credentials (step 5), so if none are set yet, default to 2026 and say so.
3. **Is a plugin really needed?** If the job is only "run an iLogic rule", an iLogic Activity needs no AppBundle; see "When you don't need a plugin" in [`references/addin-authoring.md`](references/addin-authoring.md). Use that route when it fits, and stop following this checklist.
4. **Where do files live?** Default: an OSS transient bucket via `da.mjs oss-put`/`oss-get`.

Never ask for a client secret in chat. Tell the user to export `APS_CLIENT_ID` and `APS_CLIENT_SECRET` in their shell; the scripts read them from the environment and never print them or tokens. Never write them into source files, `.env` files in the repo, or logs.

## Step 2: Scaffold

```bash
python3 -I <skill>/scripts/new_addin.py --name <BundleName> --inventor <year> --out ./<BundleName> --author "<Company>"
```

`<BundleName>` becomes the AppBundle id, the assembly name, and the namespace. Letters, digits, `_`, at most 40 characters. The script picks the target framework from the year (≥2027 `net10.0`, 2025–2026 `net8.0`, older `net48`) and generates a fresh GUID shared by the class, `.addin`, and `PackageContents.xml`.

## Step 3: Implement

Edit `Automation.cs`: `RunWithArguments(Document doc, NameValueMap map)` is where the work goes. Load [`references/addin-authoring.md`](references/addin-authoring.md) before writing code. It has the entry-point contract, the restrictions on what Inventor can do headlessly, and the known API failures. Rules that matter most:

- Inputs arrive as **file paths** (`map.Value["_1"]`), not content.
- Write outputs into the document's folder, named exactly like the Activity output `localName`.
- Log with `Trace.TraceInformation`/`TraceError`: that is the only thing visible in the report.
- Don't swallow an exception and let the work item look like a success. Log it, and prefer failing loudly when an output is missing.

## Step 4: Build and verify

```bash
dotnet build -c Release
python3 -I <skill>/scripts/verify_bundle.py bin/<BundleName>.bundle.zip
```

The template's csproj builds the zip (`bin/<BundleName>.bundle.zip`) after each build with `<BundleName>.bundle/` at the zip root. If `dotnet build` can't find `Autodesk.Inventor.Interop`, set `-p:InventorBinFolder="C:\Program Files\Autodesk\Inventor <year>\Bin"`. Don't continue until `verify_bundle.py` prints `ok`; a bad layout otherwise only surfaces as `Failed to prepare app package(s)` after a deployment.

## Step 5: Deploy

```bash
node <skill>/scripts/da.mjs nickname                 # shows the nickname, or a hint if none
node <skill>/scripts/da.mjs nickname set <name>      # only before the app owns any data!
node <skill>/scripts/da.mjs engines Inventor         # pick the engine id from this list
node <skill>/scripts/da.mjs publish-appbundle --id <BundleName> --zip bin/<BundleName>.bundle.zip --engine <engine> --alias dev
node <skill>/scripts/da.mjs publish-activity --spec activity.json --alias dev
```

Copy [`assets/activity.json`](assets/activity.json), rename the ids, and set `engine` to the same engine as the AppBundle. `publish-activity` qualifies the bare `appbundles` ids with `<nickname>.<id>+<bundle-alias>` for you. Both publish commands are idempotent: when the object exists they create a new version and repoint the alias.

Setting a nickname is a one-way door: it needs an app with no data, and the only way to change it afterwards is `DELETE /forgeapps/me`, which wipes bundles, activities, and buckets. Ask before setting one. If the app already has a nickname, use it.

Read [`references/automation-api.md`](references/automation-api.md) when a call fails or the user wants raw REST/SDK code instead of the script.

## Step 6: Run

```bash
node <skill>/scripts/da.mjs oss-put <bucket> input.ipt ./input.ipt     # prints the urn to use below
node <skill>/scripts/da.mjs run <nickname>.<ActivityId>+dev --args args.json --wait
node <skill>/scripts/da.mjs oss-get <bucket> result.ipt ./result.ipt
```

`args.json` holds the work item `arguments` (see the example in the reference); write `"Bearer $TOKEN"` for OSS auth headers and the script substitutes the live token. `--wait` polls until a terminal status and prints the report; the exit code is non-zero unless the status is `success`.

A `success` status isn't proof of correct output. Download the result and check that it exists and is what you expect; if not, read the printed report for `Trace` lines and swallowed exceptions.

## Step 7: Iterate

Change code → `dotnet build` → `verify_bundle.py` → `publish-appbundle` (new version, same alias) → `run`. If the Activity itself changed (command line, parameters), run `publish-activity` again. Versions are immutable, aliases are the moving pointers; keep `dev` for experiments and create `prod` only when the user asks.

## Gotchas

- **Zip root**: `<Name>.bundle/` is the root of the zip. Zipping its contents (`PackageContents.xml` at the root) makes the bundle silently unloadable.
- **`ModuleName` points at the `.addin`**, not the DLL, and `Platform` is `Inventor`.
- **GUID triple**: class `[Guid]`, `.addin` ClassId/ClientId, and `ProductCode` must match.
- **Utils package**: `Autodesk.Forge.DesignAutomation.Inventor.Utils` ≤ 2.0.0 does not load on 2025_Net8+ engines.
- **Engine ids**: copy from `GET /engines`; docs mix `+` and `.` spellings. Engines older than 2024 are deprecated for new bundles.
- **Nickname before data**, aliases required everywhere, `$LATEST` is not usable in work items.
- **Headless Inventor**: no UI, no Excel, writes only to the working directory. Full list in the authoring reference.
- **Region**: the scripts use `us-east`, the only DA region documented in these tutorials.
- Docs sample snippets contain typos (a stray `$` in `appbundles[...]`, a doubled quote in an alias body). Trust the scripts and templates over copy-pasted tutorial JSON.

## Where the facts come from

APS docs: Automation API developer guide, Inventor tutorial (tasks 1–7), restrictions, engine lifecycle, troubleshooting, Inventor release notes. Plugin structure follows the official `design.automation.inventor-csharp-basics` sample and the Inventor Automation API Visual Studio template. To look up anything else in the APS docs (endpoint reference, rate limits), use the `aps-docs-portal` skill if installed.
