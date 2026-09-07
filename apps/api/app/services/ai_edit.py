import re, copy
from typing import Any

def apply_command(doc:dict[str,Any], command:str)->dict[str,Any]:
    out=copy.deepcopy(doc); c=command.strip(); cl=c.lower()
    # Style commands
    if 'heading' in cl and ('blue' in cl or 'bold' in cl):
        for p in out['pages']:
            for e in p['elements']:
                if e['type']=='text' and (e.get('style',{}).get('fontWeight',400)>=700 or e['bounds']['y']<e['bounds']['height']*2):
                    if 'blue' in cl: e['style']['color']='#2563eb'
                    if 'bold' in cl: e['style']['fontWeight']=700
        return out
    m=re.search(r'change\s+(?:₹|rs\.?\s*)?([0-9][0-9,]*)\s+to\s+(?:₹|rs\.?\s*)?([0-9][0-9,]*)',cl)
    if m:
        a,b=m.group(1),m.group(2)
        for p in out['pages']:
            for e in p['elements']:
                if e['type']=='text' and re.sub(r'\D','',e['text'])==a.replace(',',''):
                    e['text']=e['text'].replace(a,b)
        return out
    if cl.startswith('translate') and 'hindi' in cl:
        # Deterministic fallback; real translation requires a model/provider.
        replacements={'invoice':'चालान','total':'कुल','subtotal':'उप-योग','name':'नाम','address':'पता','date':'दिनांक'}
        for p in out['pages']:
            for e in p['elements']:
                if e['type']=='text':
                    for a,b in replacements.items(): e['text']=re.sub(rf'\b{re.escape(a)}\b',b,e['text'],flags=re.I)
        return out
    return out
