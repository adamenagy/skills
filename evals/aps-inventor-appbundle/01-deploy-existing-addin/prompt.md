---
max_turns: 10
timeout_seconds: 300
runs: 3
allowed_tools: [Skill, Read]
plugins: [../../../skills/aps-inventor-appbundle]
---
I have a finished Inventor 2026 add-in that resizes a part from a params.json. It works on my desktop. Walk me through getting it running on Autodesk's cloud Automation API: how to package it, which API calls register it, and how I then submit a job. I haven't set up anything on the APS side yet except creating an app.
