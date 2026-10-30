using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Autodesk.Forge.DesignAutomation.Inventor.Utils;
using Inventor;

// Inventor defines its own File and Path types; alias the System.IO ones to avoid CS0104.
using File = System.IO.File;
using Path = System.IO.Path;

namespace __NAME__
{
    [ComVisible(true)]
    public class Automation
    {
        readonly InventorServer m_server;

        public Automation(InventorServer server) { m_server = server; }

        // Called when the command line has /i <doc> but no extra arguments.
        public void Run(Document doc)
        {
            Trace.TraceInformation("Run: " + doc.DisplayName);
        }

        // Called when the command line has extra arguments after /al <bundle>.
        // Each argument arrives as map["_1"], map["_2"], ... and is the *file path* of the
        // Activity parameter (e.g. the downloaded params.json), not its content.
        public void RunWithArguments(Document doc, NameValueMap map)
        {
            try
            {
                var paramsPath = (string)map.Value["_1"];
                var json = File.ReadAllText(paramsPath);
                var values = JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, string>>(json);

                var parameters = GetParameters(doc);
                foreach (var kv in values)
                {
                    Trace.TraceInformation("Set {0} = {1}", kv.Key, kv.Value);
                    parameters[kv.Key].Expression = kv.Value;
                }

                using (new HeartBeat())   // keeps the work item alive during long COM calls
                {
                    doc.Update();
                }

                // Outputs: write to the folder of the input document, using the exact
                // localName declared for the output in the Activity.
                var outPath = Path.Combine(Path.GetDirectoryName(doc.FullFileName), "result" + Path.GetExtension(doc.FullFileName));
                doc.SaveAs(outPath, false);
                Trace.TraceInformation("Saved " + outPath);
            }
            catch (Exception e)
            {
                // Anything written via Trace shows up in the work item report.
                Trace.TraceError("Processing failed: " + e);
            }
        }

        static Parameters GetParameters(Document doc)
        {
            switch (doc.DocumentType)
            {
                case DocumentTypeEnum.kPartDocumentObject:
                    return ((PartDocument)doc).ComponentDefinition.Parameters;
                case DocumentTypeEnum.kAssemblyDocumentObject:
                    return ((AssemblyDocument)doc).ComponentDefinition.Parameters;
                default:
                    throw new ApplicationException("Unsupported document type " + doc.DocumentType);
            }
        }
    }
}
