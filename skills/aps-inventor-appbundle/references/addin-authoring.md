# Authoring the Inventor add-in

Read this when writing or fixing the plugin code. Scaffold with `scripts/new_addin.py`; the template in `assets/addin-template/` is a compiled-and-checked starting point.

## How the engine runs your code

The Activity command line runs `InventorCoreConsole.exe /i "<doc>" /al "<bundle>" "<arg1>" ...`. The engine unzips the AppBundle, reads `PackageContents.xml`, loads the `.addin` it names, activates your `ApplicationAddInServer`, then reads its **`Automation` property** and calls on it, by name:

| Command line | Method called on `Automation` |
|---|---|
| `/i doc` only | `Run(Document doc)` |
| `/i doc` + extra args after `/al` | `RunWithArguments(Document doc, NameValueMap map)` |

Extra args arrive as `map.Value["_1"]`, `["_2"]`, … in command-line order. Each one is the **file path** that the Activity parameter was downloaded to, not its content. Read the file yourself.

Three identifiers must agree, or the engine silently loads nothing: the `[Guid]` on the server class, `ClassId`/`ClientId` in the `.addin`, and (by convention, checked by `verify_bundle.py`) `ProductCode` in `PackageContents.xml`.

## Target framework by engine

| Engine | Plugin target | Notes |
|---|---|---|
| 2027 | `net10.0` | per the Inventor Automation VS template (.NET 10 for 2027 only) |
| 2026, 2025_Net8 | `net8.0` | |
| 2025 (legacy), ≤2024 | `net48` | .NET Framework; engines ≤2023 are deprecated for new bundles |

`Autodesk.Forge.DesignAutomation.Inventor.Utils` must be **> 2.0.0** (2.0.1 is current) for 2025_Net8 and newer; older bundles fail to load. Reference `Autodesk.Inventor.Interop.dll` with `Private=false` and no embedded interop types on .NET 8+. Compile-time source is `<InventorBinFolder>\Public Assemblies\`. On a build machine without Inventor, the community NuGet package `Autodesk.Inventor.Sdk` (third-party, not Autodesk-published) carries 2025–2027 interops; read its license first. Check the engine's runtime in the [Inventor release notes](https://aps.autodesk.com/en/docs/design-automation/v3/change_history/inventor_release_notes) before targeting a new engine.

## Restrictions that bite

- No UI. Only the `InventorServer` object exists, so there is no `ThisApplication.ActiveView`, and no command invocation that needs a window. Unavailable: iLogic `Measure.MinimumDistance` / `Measure.Angle`, `AssemblyComponentDefinition.FindUsingVector` / `FindUsingPoint`.
- Unsupported add-ins: 3D PDF, Cable & Harness, Content Center, Design Accelerator, Frame Generator, Mold Design, Tube & Pipe, USDz.
- No Excel: BOM export to `.xlsx`, weld bead report, import points, drawing table export, `Insert Object` all fail. CSV export works.
- Writes only inside the working directory. Use paths derived from `doc.FullFileName`'s folder, never `C:\temp`.
- Low privileges: no registry writes, sub-processes inherit that.
- Keep unzipped paths short (Windows 260-char limit).

## Gotchas

- `Inventor.File` and `Inventor.Path` collide with `System.IO`. Add `using File = System.IO.File; using Path = System.IO.Path;` or you get CS0104.
- IDW → DWG: `Document.SaveAs()` fails. Use `DrawingDocument.SaveAsInventorDWG(path, true)`.
- `ExportBuildingComponent*` (RFA/IFC) fails with `E_FAIL`.
- Don't call `ThisDoc.Save()` from an iLogic rule; save from the plugin.
- Output file names must match the Activity output `localName` exactly, in the working directory. The work item is `success` even when your code swallowed an exception and produced nothing, so check outputs as well as status.
- Wrap long COM calls (`Update`, `SaveAs`, `ZipFile.CreateFromDirectory`) in `using (new HeartBeat()) { ... }`; without it long calls can be treated as hung.
- Logging: `Trace.TraceInformation` / `Trace.TraceError` land in the work item report (`reportUrl`). It is the only debugger you have in the cloud, so log liberally at stage boundaries.
- On-demand inputs/outputs (large or lazily produced files): declare the Activity parameter with `"ondemand": true` and call `OnDemand.HttpOperation(parameterName, "", null, "file://<name>")` from `Autodesk.Forge.DesignAutomation.Inventor.Utils`.

## When you don't need a plugin: iLogic

If the job is "run this iLogic rule against a model", skip the AppBundle. Use an Activity whose command line is `$(engine.path)\InventorCoreConsole.exe /i "$(args[inputFile].path)" /s "$(args[inputCode].path)" /iLogicVerbosity Trace` (the pattern in the [aps-run-ilogic sample](https://github.com/autodesk-platform-services/aps-run-ilogic)), passing the rule as a script argument. Raise log detail inside a rule with `iLogicVb.Automation.LogControl.Level = LogLevel.Trace`; iLogic entries are prefixed `[iLogic]`.

## Testing locally

Only the Visual Studio **Inventor Automation API template** ("Debug Plugin Locally" project) is a documented way to run the plugin against desktop Inventor (silent mode). Running `InventorCoreConsole.exe /al` on a desktop install has not been verified for Inventor, so don't promise it. Otherwise iterate against the service: `scripts/da.mjs` redeploys a new version and re-runs in about a minute.
