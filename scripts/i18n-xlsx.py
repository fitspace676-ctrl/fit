#!/usr/bin/env python3
"""Export / import the admin + member i18n strings as an XLSX for manual translation.

  export:  python3 scripts/i18n-xlsx.py export [out.xlsx] [--portal admin|member|all]
  import:  python3 scripts/i18n-xlsx.py import <in.xlsx>

The sheet carries one row per leaf key with the English source, the current
Georgian value and the ICU placeholders that must survive translation. Sheets
are one-per-page: `A01 · Members` for the admin console, `M01 · Membership` for
the member portal. Importing writes column D (or column C when D is empty) back
into `packages/i18n/locales/ka.json`, preserving key order and file formatting.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "packages" / "i18n" / "locales"
EN = LOCALES / "en.json"
KA = LOCALES / "ka.json"

# Matches the variable name that opens an ICU argument — `{name}`, `{name, plural, …}`.
# Deliberately ignores the branch text inside a plural/select, which is prose and
# is *supposed* to differ between locales.
PLACEHOLDER = re.compile(r"\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]")

HEADERS = ["Key", "Section", "English (en)", "ქართული (ka)", "Placeholders"]

# ── Portals ──────────────────────────────────────────────────────────────────
# A portal owns a set of top-level namespaces. `page_of` maps a flat key to the
# bucket it is shown under; the chrome (nav, tab strips, the profile menu) is not
# a page of its own, so it collapses into one "Shell & nav" sheet per portal.

ADMIN_SHELL = {
    "common",
    "nav",
    "navGroups",
    "profile",
    "system",
    "classesTabs",
    "paymentsTabs",
    "invoicesHub",
    "ptHub",
}

# Namespaces the member portal shares across every screen.
MEMBER_SHELL_NS = {"common", "errors", "footer", "notifications"}
# `member.*` sub-namespaces that are chrome rather than a screen.
MEMBER_SHELL_SUB = {"nav", "shell", "actions"}

ADMIN_PAGE_TITLES = {
    "dashboard": "Dashboard",
    "members": "Members",
    "staff": "Staff",
    "trainers": "Trainers",
    "schedule": "Schedule",
    "pos": "POS",
    "checkin": "Check-in",
    "marketing": "Marketing",
    "loyalty": "Loyalty",
    "automation": "Automation",
    "settings": "Settings",
    "locations": "Locations",
    "billingPlans": "Billing plans",
    "analytics": "Analytics",
    "reports": "Reports",
    "activity": "Activity log",
    "agent": "AI agent",
}

MEMBER_PAGE_TITLES = {
    # member.* screens
    "home": "Home (portal)",
    "classes": "Classes (portal)",
    "membership": "Membership",
    "profile": "Profile",
    "cart": "Cart",
    "goals": "Goals",
    "trainers": "Trainers (portal)",
    "shop": "Shop (portal)",
    # standalone namespaces
    "ns:account": "Account · bookings",
    "ns:auth": "Auth",
    "ns:billing": "Billing",
    "ns:checkout": "Checkout & join",
    "ns:classes": "Classes",
    "ns:home": "Marketing home",
    "ns:onboarding": "Onboarding",
    "ns:qr": "QR check-in",
    "ns:settings": "Settings",
    "ns:shop": "Shop",
    "ns:trainers": "Trainers",
    "ns:training": "Training",
}


def admin_page(key: str) -> str:
    # admin.members.table.title -> "members"
    page = key.split(".")[1] if key.count(".") >= 1 else key
    return "__shell__" if page in ADMIN_SHELL else page


def member_page(key: str) -> str:
    parts = key.split(".")
    ns = parts[0]
    if ns in MEMBER_SHELL_NS:
        return "__shell__"
    if ns == "member":
        sub = parts[1] if len(parts) > 1 else "misc"
        return "__shell__" if sub in MEMBER_SHELL_SUB else sub
    # Every other namespace is a screen in its own right.
    return f"ns:{ns}"


PORTALS = {
    "admin": {
        "label": "Admin console",
        "prefix": "A",
        "namespaces": ["admin"],
        "page_of": admin_page,
        "titles": ADMIN_PAGE_TITLES,
    },
    "member": {
        "label": "Member portal",
        "prefix": "M",
        # Everything that is not the admin console.
        "namespaces": None,
        "page_of": member_page,
        "titles": MEMBER_PAGE_TITLES,
    },
}


def flatten(node, prefix=""):
    for key, value in node.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            yield from flatten(value, path)
        else:
            yield path, value


def portal_namespaces(en: dict, portal: str) -> list[str]:
    declared = PORTALS[portal]["namespaces"]
    if declared is not None:
        return [ns for ns in declared if ns in en]
    owned = {ns for name, spec in PORTALS.items() if spec["namespaces"] for ns in spec["namespaces"]}
    return [ns for ns in en if ns not in owned]


def style_sheet(ws) -> None:
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F2937")
    for col in range(1, len(HEADERS) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center")

    for col, width in {"A": 52, "B": 26, "C": 60, "D": 60, "E": 22}.items():
        ws.column_dimensions[col].width = width

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{ws.max_row}"


def export(out_path: Path, portals: list[str]) -> None:
    en = json.loads(EN.read_text(encoding="utf-8"))
    ka = json.loads(KA.read_text(encoding="utf-8"))

    wrap = Alignment(wrap_text=True, vertical="top")
    mono = Font(name="Menlo", size=10)

    wb = Workbook()
    index = wb.active
    index.title = "Index"
    index.append(["Sheet", "Portal", "Namespace", "Keys", "Missing ka"])

    grand_total = 0
    grand_missing = 0

    for portal in portals:
        spec = PORTALS[portal]
        namespaces = portal_namespaces(en, portal)

        en_flat: dict[str, str] = {}
        ka_flat: dict[str, str] = {}
        for ns in namespaces:
            en_flat.update(flatten(en[ns], ns))
            ka_flat.update(flatten(ka.get(ns, {}), ns))

        # Bucket every key by page, keeping en.json's original key order.
        pages: dict[str, list[str]] = {}
        for key in en_flat:
            pages.setdefault(spec["page_of"](key), []).append(key)

        shell = pages.pop("__shell__", [])
        ordered = [("__shell__", shell)] if shell else []
        # Biggest pages first, so the bulk of the work is up front.
        ordered += sorted(pages.items(), key=lambda item: -len(item[1]))

        position = 0
        for page, keys in ordered:
            if page == "__shell__":
                title = f"{spec['prefix']}00 · Shell & nav"
                namespace_label = "—"
            else:
                position += 1
                name = spec["titles"].get(page, page.removeprefix("ns:"))
                title = f"{spec['prefix']}{position:02d} · {name}"
                namespace_label = page.removeprefix("ns:") if page.startswith("ns:") else f"member.{page}"
                if portal == "admin":
                    namespace_label = f"admin.{page}"

            ws = wb.create_sheet(title[:31])
            ws.append(HEADERS)

            missing = 0
            for key in keys:
                value = en_flat[key]
                # admin.classes.form.title -> "classes / form"
                parts = key.split(".")
                section = " / ".join(parts[1:-1]) if len(parts) > 2 else parts[0]
                names = dict.fromkeys(PLACEHOLDER.findall(str(value)))
                georgian = ka_flat.get(key, "")
                if not georgian:
                    missing += 1
                ws.append(
                    [
                        key,
                        section,
                        value,
                        georgian,
                        ", ".join(f"{{{name}}}" for name in names),
                    ]
                )
                row = ws.max_row
                ws.cell(row=row, column=1).font = mono
                for col in (3, 4):
                    ws.cell(row=row, column=col).alignment = wrap
                ws.cell(row=row, column=5).font = mono

            style_sheet(ws)
            index.append([ws.title, spec["label"], namespace_label, len(keys), missing])
            grand_total += len(keys)
            grand_missing += missing

    for col in range(1, len(HEADERS) + 1):
        index.cell(row=1, column=col).font = Font(bold=True, color="FFFFFF")
        index.cell(row=1, column=col).fill = PatternFill("solid", fgColor="1F2937")
    index.append(["TOTAL", "", "", grand_total, grand_missing])
    for col in (1, 4, 5):
        index.cell(row=index.max_row, column=col).font = Font(bold=True)
    for col, width in {"A": 30, "B": 18, "C": 26, "D": 10, "E": 12}.items():
        index.column_dimensions[col].width = width
    index.freeze_panes = "A2"
    index.auto_filter.ref = f"A1:E{index.max_row}"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)

    print(
        f"wrote {out_path}  ({grand_total} keys across {len(wb.worksheets) - 1} sheets, "
        f"{grand_missing} with no Georgian value)"
    )


def set_path(node: dict, key: str, value: str) -> None:
    parts = key.split(".")
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def do_import(in_path: Path) -> None:
    en = json.loads(EN.read_text(encoding="utf-8"))
    ka = json.loads(KA.read_text(encoding="utf-8"))
    en_flat = dict(flatten(en))

    wb = load_workbook(in_path, read_only=True)

    translated: dict[str, str] = {}
    unknown: list[str] = []
    for ws in wb.worksheets:
        # Skip the Index sheet (and anything else without the key/value layout).
        header = [cell.value for cell in next(ws.iter_rows(max_row=1), [])]
        if not header or header[0] != HEADERS[0] or len(header) < 4:
            continue
        for row in ws.iter_rows(min_row=2, values_only=True):
            key = (row[0] or "").strip()
            if not key:
                continue
            value = row[3] if len(row) > 3 and row[3] not in (None, "") else row[2]
            if value in (None, ""):
                continue
            if key not in en_flat:
                unknown.append(key)
                continue
            translated[key] = str(value)

    # Rebuild each touched namespace in en.json's key order so the diff stays clean.
    touched = {key.split(".")[0] for key in translated}
    ka_flat = dict(flatten(ka))
    missing: list[str] = []
    for ns in touched:
        rebuilt: dict = {}
        for key in en_flat:
            if key.split(".")[0] != ns:
                continue
            value = translated.get(key) or ka_flat.get(key)
            if value is None:
                missing.append(key)
                continue
            set_path(rebuilt, key, value)
        ka[ns] = rebuilt[ns]

    KA.write_text(json.dumps(ka, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"updated {KA} ({len(translated)} values from the sheet, {len(touched)} namespaces)")
    if missing:
        print(f"  ! {len(missing)} keys had no value at all: {missing[:5]}")
    if unknown:
        print(f"  ! {len(unknown)} rows are not keys in en.json: {unknown[:5]}")

    # Cheap placeholder sanity check.
    broken = [
        k
        for k, v in translated.items()
        if set(PLACEHOLDER.findall(str(en_flat[k]))) != set(PLACEHOLDER.findall(v))
    ]
    if broken:
        print(f"  ! {len(broken)} values changed their ICU placeholders: {broken[:10]}")


if __name__ == "__main__":
    argv = sys.argv[1:]
    portals = ["admin", "member"]
    if "--portal" in argv:
        at = argv.index("--portal")
        choice = argv[at + 1]
        portals = list(PORTALS) if choice == "all" else choice.split(",")
        unknown_portal = [p for p in portals if p not in PORTALS]
        if unknown_portal:
            sys.exit(f"unknown portal: {', '.join(unknown_portal)}")
        del argv[at : at + 2]

    mode = argv[0] if argv else "export"
    if mode == "export":
        target = Path(argv[1]) if len(argv) > 1 else ROOT / "i18n-en-ka.xlsx"
        export(target, portals)
    elif mode == "import":
        do_import(Path(argv[1]))
    else:
        sys.exit(f"unknown mode: {mode}")
