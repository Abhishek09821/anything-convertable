from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from .core.config import settings
from .models.schemas import EditCommand, ExportRequest
from .services.reconstruct import reconstruct, score
from .services.ai_edit import apply_command
from .services.vision import refine_with_vision
from .services.exporter import to_pdf,to_docx,to_html,to_svg

app=FastAPI(title=settings.app_name,version='0.1.0')
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])

@app.get('/health')
def health(): return {'ok':True,'service':'anything-editable-api'}

@app.post('/v1/reconstruct')
async def reconstruct_endpoint(file:UploadFile=File(...)):
    data=await file.read()
    if len(data)>settings.max_upload_mb*1024*1024: raise HTTPException(413,'File too large')
    doc, preview=reconstruct(data,file.filename or 'document',file.content_type or '')
    if preview is not None and len(data)<8*1024*1024:
        try:
            refined=await refine_with_vision(preview,doc); doc=refined['document']
        except Exception as exc:
            doc.setdefault('metadata',{})['visionError']=str(exc)
    q=score(doc); doc['metadata']['quality']=q
    return {'document':doc,'quality':q,'warnings':q['notes']}

@app.post('/v1/edit')
def edit(req:EditCommand):
    doc=apply_command(req.document,req.command)
    q=score(doc); doc.setdefault('metadata',{})['quality']=q
    return {'document':doc,'quality':q}

@app.post('/v1/export')
def export(req:ExportRequest):
    fn={'pdf':to_pdf,'docx':to_docx,'html':to_html,'svg':to_svg}[req.format]
    data,mime=fn(req.document)
    ext='docx' if req.format=='docx' else req.format
    return Response(content=data,media_type=mime,headers={'Content-Disposition':f'attachment; filename="{req.document.get("title","document")}.{ext}"'})
