from __future__ import annotations
import io, html
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from docx import Document
from docx.shared import Pt

def to_pdf(doc):
    buf=io.BytesIO(); c=canvas.Canvas(buf)
    for p in doc['pages']:
        c.setPageSize((p['width'],p['height']))
        for e in sorted(p['elements'],key=lambda x:x.get('zIndex',0)):
            b=e['bounds']
            if e['type']=='text':
                s=e.get('style',{}); c.setFillColor(HexColor(s.get('color','#111111'))); c.setFont(s.get('fontFamily','Helvetica'),float(s.get('fontSize',12)))
                c.drawString(b['x'],p['height']-b['y']-float(s.get('fontSize',12)),e.get('text',''))
            elif e['type']=='shape':
                c.setFillColor(HexColor(e.get('fill','#ffffff'))); c.rect(b['x'],p['height']-b['y']-b['height'],b['width'],b['height'],fill=1,stroke=0)
        c.showPage()
    c.save(); return buf.getvalue(), 'application/pdf'

def to_docx(doc):
    d=Document()
    for pi,p in enumerate(doc['pages']):
        if pi: d.add_page_break()
        for e in sorted(p['elements'],key=lambda x:(x['bounds']['y'],x['bounds']['x'])):
            if e['type']=='text':
                r=d.add_paragraph().add_run(e.get('text','')); r.bold=e.get('style',{}).get('fontWeight',400)>=700; r.font.size=Pt(e.get('style',{}).get('fontSize',12))
    buf=io.BytesIO(); d.save(buf); return buf.getvalue(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

def to_html(doc):
    pages=[]
    for p in doc['pages']:
        es=[]
        for e in p['elements']:
            b=e['bounds']; st=f"position:absolute;left:{b['x']}px;top:{b['y']}px;width:{b['width']}px;height:{b['height']}px;"
            if e['type']=='text':
                s=e.get('style',{}); st+=f"font-family:{s.get('fontFamily','Arial')};font-size:{s.get('fontSize',12)}px;font-weight:{s.get('fontWeight',400)};color:{s.get('color','#111827')};"
                es.append(f'<div style="{st}">{html.escape(e.get("text", ""))}</div>')
        pages.append(f'<section style="position:relative;width:{p["width"]}px;height:{p["height"]}px;background:{p.get("background","#fff")};margin:24px auto">{"".join(es)}</section>')
    return ('<!doctype html><html><body style="margin:0;background:#e5e7eb">'+''.join(pages)+'</body></html>').encode(), 'text/html'

def to_svg(doc):
    p=doc['pages'][0]; items=[]
    for e in p['elements']:
        b=e['bounds']
        if e['type']=='text':
            s=e.get('style',{}); items.append(f'<text x="{b["x"]}" y="{b["y"]+s.get("fontSize",12)}" font-family="{html.escape(s.get("fontFamily","Arial"))}" font-size="{s.get("fontSize",12)}" font-weight="{s.get("fontWeight",400)}" fill="{s.get("color","#111827")}">{html.escape(e.get("text",""))}</text>')
        elif e['type']=='shape': items.append(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["width"]}" height="{b["height"]}" fill="{e.get("fill","#fff")}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{p["width"]}" height="{p["height"]}">'+''.join(items)+'</svg>').encode(),'image/svg+xml'
