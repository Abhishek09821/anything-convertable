import base64, json
from typing import Any
import httpx
from ..core.config import settings

async def refine_with_vision(image_bytes:bytes, aedom:dict[str,Any]) -> dict[str,Any]:
    if not settings.openai_api_key:
        return {'document':aedom,'used_model':False,'notes':['Vision refinement disabled: OPENAI_API_KEY is not configured.']}
    b64=base64.b64encode(image_bytes).decode()
    prompt='''You are a document reconstruction engine. Improve the supplied AEDOM JSON using the source image. Preserve coordinates and only fix text, styles, element grouping, or missing elements you can infer confidently. Return strict JSON with key document. AEDOM schema: pages[].elements[] with types text,image,table,shape,line,background.'''
    body={'model':settings.vision_model,'messages':[{'role':'user','content':[{'type':'text','text':prompt+'\nCURRENT_AEDOM=\n'+json.dumps(aedom)},{'type':'image_url','image_url':{'url':f'data:image/png;base64,{b64}'}}]}],'temperature':0}
    headers={'Authorization':f'Bearer {settings.openai_api_key}','Content-Type':'application/json'}
    async with httpx.AsyncClient(timeout=90) as client:
        r=await client.post('https://api.openai.com/v1/chat/completions',headers=headers,json=body)
        r.raise_for_status()
        content=r.json()['choices'][0]['message']['content']
    content=content.strip()
    if content.startswith('```'):
        content=content.split('```',2)[1]
        content=content.removeprefix('json').strip()
    parsed=json.loads(content)
    return {'document':parsed.get('document',aedom),'used_model':True,'notes':[]}
