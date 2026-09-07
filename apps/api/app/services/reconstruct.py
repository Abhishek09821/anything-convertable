from __future__ import annotations
import io, os, re, uuid
from datetime import datetime, timezone
from typing import Any
import fitz
from PIL import Image


def uid(): return str(uuid.uuid4())

def classify(name:str, text:str)->str:
    s=(name+' '+text[:5000]).lower()
    if any(k in s for k in ['invoice','gstin','subtotal','tax invoice']): return 'invoice'
    if any(k in s for k in ['resume','curriculum vitae','experience','education','skills']): return 'resume'
    if any(k in s for k in ['sale','offer','limited time','call now','www.']): return 'poster'
    return 'document'

def guess_style(size:float, text:str):
    upper=text.strip().isupper(); weight=700 if upper or size>=20 else 400
    return {'fontFamily':'Arial','fontSize':round(max(8,min(72,size)),1),'fontWeight':weight,'color':'#111827','align':'left','lineHeight':1.2}

def page_from_words(page, page_num:int):
    rect=page.rect
    blocks=page.get_text('dict')['blocks']
    els=[]
    for b in blocks:
        if 'lines' not in b: continue
        for line in b['lines']:
            text=''.join(span.get('text','') for span in line['spans']).strip()
            if not text: continue
            bb=line['bbox']; max_size=max((span.get('size',12) for span in line['spans']),default=12)
            els.append({'id':uid(),'type':'text','bounds':{'x':bb[0],'y':bb[1],'width':bb[2]-bb[0],'height':bb[3]-bb[1]},'zIndex':10,'confidence':0.98,'text':text,'style':guess_style(max_size,text)})
    els.sort(key=lambda e:(e['bounds']['y'],e['bounds']['x']))
    return {'id':uid(),'width':rect.width,'height':rect.height,'background':'#ffffff','elements':els,'source':{'page':page_num}}

def image_to_aedom(data:bytes,name:str)->tuple[dict[str,Any],bytes|None]:
    im=Image.open(io.BytesIO(data)).convert('RGB')
    page={'id':uid(),'width':im.width,'height':im.height,'background':'#ffffff','elements':[]}
    # Optional OCR using pytesseract when present. Keep import lazy.
    try:
        import pytesseract
        d=pytesseract.image_to_data(im,output_type=pytesseract.Output.DICT)
        n=len(d['text'])
        for i in range(n):
            text=d['text'][i].strip()
            try: conf=float(d['conf'][i])/100
            except: conf=0.5
            if not text: continue
            x,y,w,h=map(int,[d['left'][i],d['top'][i],d['width'][i],d['height'][i]])
            page['elements'].append({'id':uid(),'type':'text','bounds':{'x':x,'y':y,'width':w,'height':h},'zIndex':10,'confidence':max(0,min(1,conf)),'text':text,'style':guess_style(max(10,h*.8),text)})
    except Exception:
        pass
    page['elements'].sort(key=lambda e:(e['bounds']['y'],e['bounds']['x']))
    return make_doc(name,'image',classify(name,' '.join(e.get('text','') for e in page['elements'])),[page]), data

def make_doc(title,source_type,doc_type,pages):
    return {'schemaVersion':'0.1','id':uid(),'title':os.path.splitext(title)[0] or 'Untitled','width':pages[0]['width'],'height':pages[0]['height'],'pages':pages,'metadata':{'sourceType':source_type,'documentType':doc_type,'createdAt':datetime.now(timezone.utc).isoformat()}}

def reconstruct(data:bytes,name:str,content_type:str):
    if content_type=='application/pdf' or name.lower().endswith('.pdf'):
        pdf=fitz.open(stream=data,filetype='pdf')
        pages=[page_from_words(p,i) for i,p in enumerate(pdf)]
        text=' '.join(e['text'] for pg in pages for e in pg['elements'])
        return make_doc(name,'pdf',classify(name,text),pages), None
    return image_to_aedom(data,name)

def score(doc:dict[str,Any])->dict[str,Any]:
    els=[e for p in doc.get('pages',[]) for e in p.get('elements',[])]
    if not els: return {'overall':0.25,'textAccuracy':0.0,'layoutAccuracy':0.35,'elementAccuracy':0.25,'visualSimilarity':0.3,'lowConfidenceElementIds':[],'notes':['No text elements were detected; run with a vision-capable provider for image-heavy inputs.']}
    avg=sum(float(e.get('confidence',.75)) for e in els)/len(els)
    low=[e['id'] for e in els if float(e.get('confidence',.75))<.7]
    text_acc=avg; layout=.85 if len(els)<200 else .75; elem=.8 if els else .2; visual=.78
    overall=round(.35*text_acc+.25*layout+.2*elem+.2*visual,3)
    return {'overall':overall,'textAccuracy':round(text_acc,3),'layoutAccuracy':layout,'elementAccuracy':elem,'visualSimilarity':visual,'lowConfidenceElementIds':low,'notes':[]}
