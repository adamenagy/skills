---
type: llm
focus: last_message
weight: 3
---
Score PASS only if ALL of these hold:
1. It says the zip root must be a `<Name>.bundle` folder containing `PackageContents.xml` and a `Contents/` folder (PackageContents.xml is not inside Contents and not loose at the zip root).
2. It says PackageContents.xml's ModuleName points at the `.addin` manifest (not the DLL) and that Platform is `Inventor`.
3. It says to create a nickname for the app BEFORE creating any bundles/activities/buckets (or otherwise flags that a nickname cannot be set once the app has data).
4. It lists the sequence: register AppBundle (POST /appbundles), upload the zip to the returned signed URL with all form fields, create an alias, create an Activity (POST /activities) with an alias, then POST /workitems referencing the fully qualified `<nickname>.<Activity>+<alias>` id.
5. It says aliases are required (an Activity/AppBundle cannot be referenced by bare version or id), and that a new version plus alias re-point is used for updates, not re-POSTing the same id (409).
6. It says to target a 2026 engine id obtained from the engines list (GET /engines), and that the plugin must target .NET 8 with Autodesk.Forge.DesignAutomation.Inventor.Utils newer than 2.0.0.
FAIL if any item is missing or wrong.
