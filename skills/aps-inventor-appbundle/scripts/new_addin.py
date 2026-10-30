#!/usr/bin/env python3
"""Scaffold an Inventor Automation add-in project from assets/addin-template.

Usage: python3 -I new_addin.py --name ChangeParamApp --inventor 2026 --out ./ChangeParamApp [--author "Me"]
"""
import argparse
import re
import sys
import uuid
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "addin-template"


def target_framework(inventor: int) -> str:
    # 2025_Net8 and 2026 engines run .NET 8; 2027 runs .NET 10; older engines are .NET Framework.
    if inventor >= 2027:
        return "net10.0"
    if inventor >= 2025:
        return "net8.0"
    return "net48"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="C# identifier; also the AppBundle id")
    ap.add_argument("--inventor", type=int, required=True, help="Target Inventor/engine year, e.g. 2026")
    ap.add_argument("--out", required=True, help="Output folder (must not exist or be empty)")
    ap.add_argument("--author", default="Your Company")
    a = ap.parse_args()

    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,39}", a.name):
        sys.exit("--name must be a C# identifier of at most 40 characters (letters, digits, underscore)")
    out = Path(a.out)
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} is not empty")

    subs = {
        "__NAME__": a.name,
        "__GUID__": str(uuid.uuid4()).upper(),
        "__TFM__": target_framework(a.inventor),
        "__INVENTOR_VERSION__": str(a.inventor),
        "__AUTHOR__": a.author,
    }
    out.mkdir(parents=True, exist_ok=True)
    for src in TEMPLATE.iterdir():
        text = src.read_text(encoding="utf-8")
        for k, v in subs.items():
            text = text.replace(k, v)
        (out / src.name.replace("__NAME__", a.name)).write_text(text, encoding="utf-8")

    print(f"Created {out} (TFM {subs['__TFM__']}, GUID {subs['__GUID__']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
