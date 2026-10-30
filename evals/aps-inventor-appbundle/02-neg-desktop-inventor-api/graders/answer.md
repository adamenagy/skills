---
type: llm
focus: last_message
weight: 1
---
Score PASS only if it shows C# code that gets the active document from the Inventor application (for example `InventorApplication.ActiveDocument`), casts it to `PartDocument`, and reads `ComponentDefinition.MassProperties.Mass`.
FAIL otherwise.
