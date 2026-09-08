"""
Deterministic AI-edit engine.
Parses natural-language commands into structured operations and applies them to
the AEDOM document without requiring an external LLM.

Supported commands (case-insensitive):
  change <A> to <B>                   → find text elements containing A, replace with B
  make * bold / italic / normal       → style selected/all text elements
  make * color <hex|name>             → set fill color
  set font size to <N>                → set fontSize
  delete (selected element)           → remove selected element by id
  move * (left|right|up|down) [Npx]  → translate bounds
  make * larger / smaller             → scale bounds ±20%
  change heading to <color>           → recolor heading-level text
  translate * hindi                   → simple word replacements (offline)
"""
from __future__ import annotations
import copy, re
from typing import Any


# ── colour lookup ─────────────────────────────────────────────────────────────
_COLOURS: dict[str, str] = {
    'red': '#dc2626', 'green': '#16a34a', 'blue': '#2563eb',
    'yellow': '#ca8a04', 'orange': '#ea580c', 'purple': '#9333ea',
    'pink': '#db2777', 'black': '#111827', 'white': '#ffffff',
    'gray': '#6b7280', 'grey': '#6b7280', 'navy': '#1e3a8a',
    'teal': '#0d9488', 'cyan': '#0891b2', 'brown': '#92400e',
}

def _resolve_color(token: str) -> str | None:
    t = token.strip().lower()
    if re.match(r'^#[0-9a-fA-F]{3,6}$', t):
        return t
    return _COLOURS.get(t)


# ── helpers ───────────────────────────────────────────────────────────────────

def _all_text(doc: dict) -> list[dict]:
    return [e for p in doc['pages'] for e in p['elements'] if e['type'] == 'text']

def _is_heading(e: dict) -> bool:
    """Heuristic: large font or bold = heading."""
    s = e.get('style', {})
    return s.get('fontWeight', 400) >= 700 or s.get('fontSize', 12) >= 20

def _text_contains(e: dict, needle: str) -> bool:
    return needle.lower() in e.get('text', '').lower()

def _ensure_style(e: dict) -> dict:
    e.setdefault('style', {
        'fontFamily': 'Arial', 'fontSize': 14,
        'fontWeight': 400, 'fontStyle': 'normal',
        'color': '#111827', 'align': 'left', 'lineHeight': 1.2,
    })
    return e


# ── operation builders ────────────────────────────────────────────────────────

def _update_style(doc: dict, pred, changes: dict) -> dict:
    """Apply style changes to all elements matching pred."""
    modified = 0
    for p in doc['pages']:
        for e in p['elements']:
            if pred(e):
                _ensure_style(e)
                e['style'].update(changes)
                modified += 1
    print(f'[ai_edit] _update_style modified={modified} changes={changes}')
    return doc


def _replace_text(doc: dict, old: str, new: str) -> dict:
    """Case-insensitive text replacement across all text elements."""
    modified = 0
    pattern = re.compile(re.escape(old), re.IGNORECASE)
    for p in doc['pages']:
        for e in p['elements']:
            if e['type'] == 'text':
                replaced = pattern.sub(new, e.get('text', ''))
                if replaced != e.get('text', ''):
                    e['text'] = replaced
                    modified += 1
    print(f'[ai_edit] replace_text "{old}"→"{new}" modified={modified}')
    return doc


def _delete_by_id(doc: dict, element_id: str) -> dict:
    for p in doc['pages']:
        before = len(p['elements'])
        p['elements'] = [e for e in p['elements'] if e['id'] != element_id]
        if len(p['elements']) < before:
            print(f'[ai_edit] deleted element id={element_id}')
    return doc


def _move_elements(doc: dict, pred, dx: float, dy: float) -> dict:
    modified = 0
    for p in doc['pages']:
        for e in p['elements']:
            if pred(e):
                e['bounds']['x'] = max(0, e['bounds']['x'] + dx)
                e['bounds']['y'] = max(0, e['bounds']['y'] + dy)
                modified += 1
    print(f'[ai_edit] move dx={dx} dy={dy} modified={modified}')
    return doc


def _scale_elements(doc: dict, pred, factor: float) -> dict:
    modified = 0
    for p in doc['pages']:
        for e in p['elements']:
            if pred(e):
                e['bounds']['width'] = max(10, e['bounds']['width'] * factor)
                e['bounds']['height'] = max(10, e['bounds']['height'] * factor)
                modified += 1
    print(f'[ai_edit] scale factor={factor} modified={modified}')
    return doc


# ── main dispatcher ───────────────────────────────────────────────────────────

def apply_command(doc: dict[str, Any], command: str, selected_id: str | None = None) -> dict[str, Any]:
    out = copy.deepcopy(doc)
    c = command.strip()
    cl = c.lower()
    print(f'[ai_edit] command="{c}" selected_id={selected_id}')

    # ── 0. colour commands (checked before the generic change…to rule) ───────
    # "change color to red", "set color to blue", "make color green"
    color_to_m = re.search(r'(?:change|set|make)\s+colou?r\s+to\s+(\S+)', cl) or \
                 re.search(r'colou?r\s+(?:to\s+)?(\S+)', cl)
    if color_to_m:
        color = _resolve_color(color_to_m.group(1))
        if color:
            if selected_id:
                pred = lambda e: e['id'] == selected_id
            elif 'heading' in cl:
                pred = lambda e: e['type'] == 'text' and _is_heading(e)
            else:
                pred = lambda e: e['type'] == 'text'
            return _update_style(out, pred, {'color': color})

    # ── 1. change <A> to <B> ──────────────────────────────────────────────────
    # Handles: "change ₹10,000 to ₹15,000", "change Total to Grand Total", etc.
    # Guard: skip if the "old" value looks like a colour keyword or hex
    m = re.search(
        r"change\s+[₹$€£]?\s*([\w,\.\s'\"₹$€£]+?)\s+to\s+[₹$€£]?\s*([\w,\.\s'\"₹$€£]+)",
        cl, re.IGNORECASE,
    )
    if m:
        old_raw = re.sub(r'^[₹$€£\s]+|[₹$€£\s]+$', '', m.group(1)).strip()
        new_raw = re.sub(r'^[₹$€£\s]+|[₹$€£\s]+$', '', m.group(2)).strip()
        # Also try with the currency symbol stripped from original command
        old_orig = re.search(r'change\s+([^t]+?)\s+to\s+', c, re.IGNORECASE)
        new_orig = re.search(r'\bto\s+(.+)$', c, re.IGNORECASE)
        old_str = old_orig.group(1).strip() if old_orig else old_raw
        new_str = new_orig.group(1).strip() if new_orig else new_raw
        return _replace_text(out, old_str, new_str)

    # ── 2. make * bold / italic / normal ─────────────────────────────────────
    if re.search(r'\bbold\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] == 'text')
        return _update_style(out, pred, {'fontWeight': 700})

    if re.search(r'\bitalic\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] == 'text')
        return _update_style(out, pred, {'fontStyle': 'italic'})

    if re.search(r'\bnormal\b|\bregular\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] == 'text')
        return _update_style(out, pred, {'fontWeight': 400, 'fontStyle': 'normal'})

    # ── 3. set font size to N ────────────────────────────────────────────────
    m = re.search(r'font\s*size\s+(?:to\s+)?(\d+)', cl)
    if m:
        size = max(6, min(200, int(m.group(1))))
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] == 'text')
        return _update_style(out, pred, {'fontSize': float(size)})

    # ── 4. heading-specific shortcuts ─────────────────────────────────────────
    if 'heading' in cl:
        color_token = re.search(
            r'(red|green|blue|yellow|orange|purple|pink|black|white|gray|grey|navy|teal|cyan|brown|#[0-9a-fA-F]{3,6})', cl
        )
        changes: dict = {}
        if color_token:
            c2 = _resolve_color(color_token.group(1))
            if c2:
                changes['color'] = c2
        if 'bold' in cl:
            changes['fontWeight'] = 700
        if changes:
            return _update_style(out, lambda e: e['type'] == 'text' and _is_heading(e), changes)

    # ── 4b. "make * <colour>" pattern (e.g. "make headings blue") ────────────
    colour_word_m = re.search(
        r'(?:make|set|turn)\s+\S+\s+(red|green|blue|yellow|orange|purple|pink|black|white|gray|grey|navy|teal|cyan|brown|#[0-9a-fA-F]{3,6})',
        cl,
    )
    if colour_word_m:
        color = _resolve_color(colour_word_m.group(1))
        if color:
            if selected_id:
                pred = lambda e: e['id'] == selected_id
            else:
                pred = lambda e: e['type'] == 'text'
            return _update_style(out, pred, {'color': color})

    # ── 6. delete selected element ────────────────────────────────────────────
    if re.search(r'\bdelete\b|\bremove\b', cl):
        if selected_id:
            return _delete_by_id(out, selected_id)
        # "delete all images"
        if 'image' in cl:
            for p in out['pages']:
                p['elements'] = [e for e in p['elements'] if e['type'] != 'image']
            return out

    # ── 7. move element ───────────────────────────────────────────────────────
    dist_m = re.search(r'(\d+)\s*px', cl)
    dist = float(dist_m.group(1)) if dist_m else 20.0
    if re.search(r'\bright\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: True)
        return _move_elements(out, pred, dist, 0)
    if re.search(r'\bleft\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: True)
        return _move_elements(out, pred, -dist, 0)
    if re.search(r'\bdown\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: True)
        return _move_elements(out, pred, 0, dist)
    if re.search(r'\bup\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: True)
        return _move_elements(out, pred, 0, -dist)

    # ── 8. resize ────────────────────────────────────────────────────────────
    if re.search(r'\blarger\b|\bbigger\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] != 'image' or not e.get('locked'))
        return _scale_elements(out, pred, 1.2)
    if re.search(r'\bsmaller\b', cl):
        pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] != 'image' or not e.get('locked'))
        return _scale_elements(out, pred, 0.8)

    # ── 9. translate to Hindi (offline word substitution) ────────────────────
    if re.search(r'\bhindi\b', cl):
        replacements = {
            'invoice': 'चालान', 'total': 'कुल', 'subtotal': 'उप-योग',
            'name': 'नाम', 'address': 'पता', 'date': 'दिनांक',
            'phone': 'फ़ोन', 'email': 'ईमेल', 'amount': 'राशि',
            'tax': 'कर', 'discount': 'छूट', 'price': 'मूल्य',
        }
        for p in out['pages']:
            for e in p['elements']:
                if e['type'] == 'text':
                    for a, b in replacements.items():
                        e['text'] = re.sub(rf'\b{re.escape(a)}\b', b, e['text'], flags=re.IGNORECASE)
        return out

    # ── 10. align ─────────────────────────────────────────────────────────────
    for align in ('left', 'center', 'right'):
        if re.search(rf'\b{align}\b', cl) and 'align' in cl:
            pred = (lambda e: e['id'] == selected_id) if selected_id else (lambda e: e['type'] == 'text')
            return _update_style(out, pred, {'align': align})

    print(f'[ai_edit] no rule matched command="{c}" — returning doc unchanged')
    return out
