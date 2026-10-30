using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Inventor;

namespace __NAME__
{
    // The GUID must equal ClassId/ClientId in the .addin file.
    [ComVisible(true)]
    [Guid("__GUID__")]
    public class PluginServer : ApplicationAddInServer
    {
        InventorServer m_inventorServer;
        Automation m_automation;

        // The engine looks up this property by name and calls Run / RunWithArguments on it.
        public dynamic Automation => m_automation;

        public void Activate(ApplicationAddInSite addInSite, bool firstTime)
        {
            Trace.TraceInformation("__NAME__: activating");
            m_inventorServer = addInSite.InventorServer;
            m_automation = new Automation(m_inventorServer);
        }

        public void Deactivate()
        {
            Trace.TraceInformation("__NAME__: deactivating");
            Marshal.ReleaseComObject(m_inventorServer);
            m_inventorServer = null;
            m_automation = null;
            GC.Collect();
            GC.WaitForPendingFinalizers();
        }

        public void ExecuteCommand(int commandId) { }
    }
}
