"""Native Office layout rendering, with isolated profiles for concurrent jobs."""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

import fitz
from lxml import etree

from .quality import note

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def _render_environment(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    # Headless macOS builds using fontconfig may otherwise see only bundled fonts.
    # Keep the caller's explicit configuration; never modify global font settings.
    if sys.platform == "darwin" and not env.get("FONTCONFIG_FILE"):
        config = etree.Element("fontconfig")
        for directory in (
            Path("/System/Library/Fonts"), Path("/Library/Fonts"),
            Path.home() / "Library/Fonts", Path(__file__).resolve().parents[2] / "fonts",
            Path("/Applications/LibreOffice.app/Contents/Resources/fonts/truetype"),
        ):
            if directory.is_dir():
                etree.SubElement(config, "dir").text = str(directory)
        etree.SubElement(config, "cachedir").text = str(root / "font-cache")
        path = root / "fonts.conf"
        path.write_bytes(etree.tostring(config, xml_declaration=True, encoding="UTF-8"))
        env["FONTCONFIG_FILE"] = str(path)
    return env


def office_binary() -> str | None:
    configured = os.getenv("LIBREOFFICE_PATH")
    if configured:
        return configured if Path(configured).is_file() else shutil.which(configured)
    return (shutil.which("soffice") or shutil.which("libreoffice") or
            ("/Applications/LibreOffice.app/Contents/MacOS/soffice"
             if Path("/Applications/LibreOffice.app/Contents/MacOS/soffice").exists() else None))


def apply_office_font(data: bytes, font: str) -> bytes:
    """Change family only; retain sizes, emphasis, images and complex-script fonts."""
    if font in ("original", "keep_original", ""):
        return data
    out = io.BytesIO()
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dest:
        for entry in source.infolist():
            content = source.read(entry)
            if entry.filename.endswith(".xml") and entry.filename.startswith(("word/", "ppt/")):
                root = etree.fromstring(content, parser)
                for run in root.iter(f"{{{W}}}r"):
                    props = run.find(f"{{{W}}}rPr")
                    if props is None:
                        props = etree.Element(f"{{{W}}}rPr")
                        run.insert(0, props)
                    fonts = props.find(f"{{{W}}}rFonts")
                    if fonts is None:
                        fonts = etree.SubElement(props, f"{{{W}}}rFonts")
                    for attr in ("ascii", "hAnsi"):
                        fonts.set(f"{{{W}}}{attr}", font)
                        fonts.attrib.pop(f"{{{W}}}{attr}Theme", None)
                for run in root.iter(f"{{{A}}}r"):
                    props = run.find(f"{{{A}}}rPr")
                    if props is None:
                        props = etree.Element(f"{{{A}}}rPr")
                        run.insert(0, props)
                    latin = props.find(f"{{{A}}}latin")
                    if latin is None:
                        latin = etree.SubElement(props, f"{{{A}}}latin")
                    latin.set("typeface", font)
                # Include empty paragraphs, style defaults, and theme defaults.
                for fonts in root.iter(f"{{{W}}}rFonts"):
                    for attr in ("ascii", "hAnsi"):
                        fonts.set(f"{{{W}}}{attr}", font)
                        fonts.attrib.pop(f"{{{W}}}{attr}Theme", None)
                for latin in root.iter(f"{{{A}}}latin"):
                    latin.set("typeface", font)
                content = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            dest.writestr(entry, content)
    return out.getvalue()


def render_office(data: bytes, extension: str, font: str = "original") -> bytes | None:
    binary = office_binary()
    if not binary:
        note("Basic Office renderer used: complex layouts and fonts may differ. Install LibreOffice on the server for higher fidelity.")
        return None
    if font != "original":
        note("Changing the font can change line breaks and pagination.")
    # Missing fonts are never equivalent to preserving the source typography.
    note("Office font fidelity depends on the source fonts being installed on the conversion server.")
    with tempfile.TemporaryDirectory(prefix="convert-office-") as tmp:
        root = Path(tmp)
        source = root / f"document.{extension}"
        source.write_bytes(apply_office_font(data, font))
        options = json.dumps({
            "UseLosslessCompression": {"type": "boolean", "value": "true"},
            "ReduceImageResolution": {"type": "boolean", "value": "false"},
            "ExportBookmarks": {"type": "boolean", "value": "true"},
        })
        engine = "writer_pdf_Export" if extension == "docx" else "impress_pdf_Export"
        try:
            proc = subprocess.run([
                binary, f"-env:UserInstallation={(root / 'profile').as_uri()}",
                "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
                "--convert-to", f"pdf:{engine}:{options}", "--outdir", tmp, str(source),
            ], capture_output=True, timeout=180, check=False, env=_render_environment(root))
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Office conversion timed out. Try a smaller document.") from exc
        target = root / "document.pdf"
        if proc.returncode or not target.exists():
            raise ValueError("Office could not render this file. Check that it opens correctly and is not password protected.")
        result = target.read_bytes()
        with fitz.open(stream=result, filetype="pdf") as pdf:
            if not len(pdf):
                raise ValueError("Office returned an empty PDF.")
            if font not in ("original", "keep_original", ""):
                names = {entry[3].split("+")[-1] for page in pdf for entry in page.get_fonts()}
                normalize = lambda value: "".join(c.lower() for c in value if c.isalnum())
                if names and not any(normalize(font) in normalize(name) for name in names):
                    note(f"The renderer substituted {font}. Output fonts: {', '.join(sorted(names))}.")
        return result
