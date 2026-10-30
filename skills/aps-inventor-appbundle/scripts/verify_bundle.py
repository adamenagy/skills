#!/usr/bin/env python3
"""Validate an Inventor AppBundle zip before uploading it to the Automation API.

Usage: python3 -I verify_bundle.py path/to/Name.bundle.zip
Exit code 0 = OK, 1 = problems found (listed on stderr).
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET


def main(path: str) -> int:
    errors = []
    with zipfile.ZipFile(path) as z:
        names = [n.replace("\\", "/") for n in z.namelist()]
        tops = {n.split("/")[0] for n in names if n.strip("/")}
        bundles = [t for t in tops if t.endswith(".bundle")]
        if len(tops) != 1 or len(bundles) != 1:
            errors.append(f"zip root must be exactly one <Name>.bundle folder, found: {sorted(tops)}")
            return report(errors)
        root = bundles[0]
        pc_path = f"{root}/PackageContents.xml"
        if pc_path not in names:
            errors.append(f"{pc_path} missing (must sit next to Contents/, not inside it)")
            return report(errors)

        pc = ET.fromstring(z.read(pc_path))
        product_code = (pc.get("ProductCode") or "").strip("{}").upper()
        rr = pc.find("./Components/RuntimeRequirements")
        if rr is None or rr.get("Platform") != "Inventor":
            errors.append('Components/RuntimeRequirements Platform must be "Inventor"')
        entry = pc.find("./Components/ComponentEntry")
        module = entry.get("ModuleName") if entry is not None else None
        if not module:
            errors.append("ComponentEntry/@ModuleName missing")
        else:
            addin_path = f"{root}/{module[2:] if module.startswith('./') else module}"
            if not module.endswith(".addin"):
                errors.append(f"ModuleName must point at the .addin manifest, not {module}")
            if addin_path not in names:
                errors.append(f"ModuleName target {addin_path} not in zip")
            else:
                text = z.read(addin_path).decode("utf-8-sig")
                addin = ET.fromstring(text)
                class_id = (addin.findtext("ClassId") or "").strip("{}").upper()
                client_id = (addin.findtext("ClientId") or "").strip("{}").upper()
                assembly = addin.findtext("Assembly")
                if addin.get("Type") != "Plugin":
                    errors.append('.addin Type must be "Plugin"')
                if class_id != client_id:
                    errors.append(f".addin ClassId ({class_id}) != ClientId ({client_id})")
                if product_code and class_id and product_code != class_id:
                    errors.append(f"PackageContents ProductCode ({product_code}) != .addin ClassId ({class_id})")
                if not assembly or f"{root}/Contents/{assembly}" not in names:
                    errors.append(f".addin Assembly {assembly!r} not found in Contents/")
        long_paths = [n for n in names if len(n) > 120]
        if long_paths:
            errors.append(f"{len(long_paths)} very long path(s); Windows limit is 260 once unzipped, e.g. {long_paths[0]}")
        if any(n.lower().endswith(".pdb") for n in names):
            print("note: .pdb files present (harmless, but they enlarge the upload)", file=sys.stderr)
        if not any(re.search(r"Autodesk\.Forge\.DesignAutomation\.Inventor\.Utils\.dll$", n) for n in names):
            print("note: Inventor.Utils.dll not in Contents/ (fine unless the code uses HeartBeat/OnDemand)", file=sys.stderr)
    return report(errors)


def report(errors):
    if errors:
        print("\n".join(f"x {e}" for e in errors), file=sys.stderr)
        return 1
    print("ok: bundle structure looks valid")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
