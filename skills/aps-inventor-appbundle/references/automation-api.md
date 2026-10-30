# Automation API: deploy and run

Read this when publishing, versioning, or debugging calls. `scripts/da.mjs` implements every call below; read this to understand failures or to call the REST API directly.

Base URL: `https://developer.api.autodesk.com/da/us-east/v3`. Token: 2-legged, scopes `code:all bucket:create bucket:read data:create data:write data:read` (drop the bucket/data scopes if inputs and outputs live elsewhere).

## Object model

```
nickname ──owns──> AppBundle (versions 1..n, aliases) ──referenced by──> Activity (versions, aliases) ──executed by──> WorkItem
```

- **Nickname**: maps the app's client id to a readable name (≤20 chars of `a-zA-Z0-9_`, globally unique). `PATCH /forgeapps/me {"nickname":"..."}` works **only while the app has no data** (no bundles, activities, buckets); after that the only way is `DELETE /forgeapps/me`, which erases everything. Decide the nickname first. 409 means taken, or the app already has data.
- **IDs**: unqualified = what you POSTed (`ChangeParamApp`). Fully qualified = `<nickname>.<id>+<alias>`. Use unqualified in URL paths and creation bodies; qualified in `activity.appbundles`, `workitem.activityId`, and `GET /appbundles/{id}` / `GET /activities/{id}`. Names and aliases: ≤40 chars, alphanumeric and `_`.
- **Aliases are mandatory.** An Activity or AppBundle can't be used by version number. `$LATEST` exists but only for listing and `GET .../aliases/$LATEST`. Don't use it in `activityId` or `appbundles`.
- **Immutable versions.** Re-POSTing an existing id gives 409. Create `POST .../versions` (body without `id`, or `"id": null`), then repoint the alias with `PATCH .../aliases/{alias} {"version": n}`. Typical aliases: `dev` / `prod`.

## Sequence

1. **Engine id**: `GET /engines`. Take the id from the response (`Autodesk.Inventor+2026` style). The docs spell it both `Autodesk.Inventor+2026` and `Autodesk.Inventor.2026`; the engine list is the source of truth. Deprecated engines can't be used for new bundles or activities (existing ones keep working until removal, 4 years + 2 after the desktop release).
2. **Register**: `POST /appbundles {"id","engine","description"}` returns `uploadParameters` (`endpointURL` + `formData`) and `version`. `formData` expires after 3600 s.
3. **Upload**: `multipart/form-data` POST to `endpointURL` with **all** `formData` fields in order, and `file` last. With Postman/curl the `file` field must be a real file, not text; otherwise the work item later fails with `Failed to prepare app package(s)`.
4. **Alias**: `POST /appbundles/{id}/aliases {"id":"dev","version":1}`.
5. **Activity**: `POST /activities` with `commandLine`, `parameters`, `engine`, `appbundles` (qualified), `settings`. Then `POST /activities/{id}/aliases`.
6. **Inputs/outputs**: any URL the service can reach: pre-signed S3/OSS URL, `urn:adsk.objects:os.object:<bucket>/<key>` (needs an `Authorization` header in the argument), or inline `data:application/json,{...}`. Prefer OSS with `signeds3upload` / `signeds3download`; `da.mjs oss-put` / `oss-get` do this.
7. **Work item**: `POST /workitems {"activityId":"<nick>.<Activity>+<alias>","arguments":{...}}`. Poll `GET /workitems/{id}` (`pending`, `inprogress`, `success`, `failed*`, `cancelled`) or, better in production, pass `onComplete` with a callback URL. Download `reportUrl` (pre-signed, no auth header).

## Activity parameter rules

```json
"InventorDoc": { "verb": "get",  "localName": "Input.ipt",  "zip": false },
"OutputIpt":   { "verb": "post", "localName": "result.ipt", "optional": true }
```

- Inputs use `verb: "get"`; outputs `post` (the docs' tutorials use `post`; the work item argument for the same output uses `"verb": "put"`).
- `localName` is the path the file occupies in the working directory. Fix it so the plugin can find files regardless of the uploaded name.
- Optional outputs may be omitted from the work item; required ones must be supplied.
- Assemblies: zip the whole folder, declare the input with `"zip": true`, and in the work item set `"pathInZip": "<top-assembly>.iam"` so `/i` opens the right file. A `zip: true` output uploads the localName folder zipped.
- The command line references appbundles and args **by name** (`$(appbundles[ChangeParamApp].path)`, `$(args[InventorDoc].path)`), not by qualified id.

## Work item argument example

```json
{
  "activityId": "mynick.ChangeParamActivity+dev",
  "arguments": {
    "InventorDoc":    { "url": "urn:adsk.objects:os.object:mybucket/box.ipt", "headers": { "Authorization": "Bearer <token>" } },
    "InventorParams": { "url": "data:application/json,{\"Height\":\"16 in\",\"Width\":\"10 in\"}" },
    "OutputIpt":      { "url": "urn:adsk.objects:os.object:mybucket/result.ipt", "verb": "put", "headers": { "Authorization": "Bearer <token>" } }
  }
}
```

With `da.mjs run`, write `"Bearer $TOKEN"` and the script substitutes the live token.

## Errors

| Symptom | Likely cause |
|---|---|
| `409` on create | Already exists: create a version instead. On nickname: taken, or app has data |
| `Cannot parse ID` on alias | Alias >40 chars or has characters outside `[A-Za-z0-9_]`, or wrong ID form (qualified vs not) |
| `Failed to prepare app package(s)` | Bad zip layout (`PackageContents.xml` must sit beside `Contents/` inside `<Name>.bundle/`), or upload sent `file` as text |
| `FailedExecution` | Plugin threw, input doesn't open in the Activity's Inventor version, or an iLogic rule failed. Read the report |
| `success` but no output | Plugin swallowed an exception or wrote to the wrong `localName`. Read the report |
| `504` | Retry |
| `413` on work item | Too many/long pre-signed URLs or a long inline argument: zip inputs into one file or pass a single JSON file by URL |
| Non-ASCII file names garbled | Zip with UTF-8 names (`7z -mcu`) or add an empty `<codepage>.codepage` file |

Callback behind a firewall (Inventor `onComplete`/`onProgress`): allow `52.20.163.163`, `18.210.124.48`, `3.90.98.123`. Work item time limit and memory (12 processor hours, 32 GB) have been raised before, so check the [Rate Limits and Quotas](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/rate-limits/da-rate-limits/) page for current numbers.
