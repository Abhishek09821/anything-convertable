'use client';
import {Stage,Layer,Text,Rect} from 'react-konva';

type El = any;
type Page = any;

export default function KonvaCanvas({
  page,
  scale,
  selected,
  onClearSelection,
  onSelect,
  onCommit
}:{
  page: Page;
  scale: number;
  selected: string|null;
  onClearSelection:()=>void;
  onSelect:(id:string)=>void;
  onCommit:(element:El)=>void;
}){
  return <Stage
    width={page.width*scale}
    height={page.height*scale}
    scaleX={scale}
    scaleY={scale}
    onMouseDown={e=>{if(e.target===e.target.getStage()) onClearSelection();}}
  >
    <Layer>
      {page.elements.map((e:El)=><CanvasElement key={e.id} e={e} selected={e.id===selected} onSelect={()=>onSelect(e.id)} onCommit={onCommit}/>) }
    </Layer>
  </Stage>
}

function CanvasElement({e,onSelect,onCommit}:{e:El;selected:boolean;onSelect:()=>void;onCommit:(e:El)=>void}){
  if(e.type==='text') return <Text
    x={e.bounds.x} y={e.bounds.y} text={e.text}
    fontSize={e.style?.fontSize||14}
    fontFamily={e.style?.fontFamily||'Arial'}
    fontStyle={e.style?.fontStyle||'normal'}
    fontVariant={e.style?.fontWeight>=700 ? 'bold' : 'normal'}
    fill={e.style?.color||'#111827'}
    width={e.bounds.width} height={e.bounds.height}
    draggable onClick={onSelect} onDblClick={onSelect}
    onDragEnd={ev=>onCommit({...e,bounds:{...e.bounds,x:ev.target.x(),y:ev.target.y()}})}
  />;
  if(e.type==='shape') return <Rect
    x={e.bounds.x} y={e.bounds.y} width={e.bounds.width} height={e.bounds.height}
    fill={e.fill} stroke={e.stroke} strokeWidth={e.strokeWidth}
    cornerRadius={e.shape==='roundRect'?12:0}
    draggable onClick={onSelect}
    onDragEnd={ev=>onCommit({...e,bounds:{...e.bounds,x:ev.target.x(),y:ev.target.y()}})}
  />;
  return null;
}
