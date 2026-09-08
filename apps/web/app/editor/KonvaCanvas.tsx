'use client';
/**
 * KonvaCanvas — AEDOM-backed canvas renderer + editor.
 *
 * Responsibilities:
 *  - Render every AEDOM element type: image, text, shape, line, background
 *  - Show Konva Transformer handles on the selected element
 *  - Sync every drag / resize / text-edit back to the AEDOM via onCommit
 *  - Async image loading with grey placeholder → real image swap
 *  - Inline text editing via Konva's textarea trick
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Stage,
  Layer,
  Text,
  Rect,
  Ellipse,
  Line,
  Image as KonvaImage,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';

// ── Types ─────────────────────────────────────────────────────────────────────
export type AedomElement = {
  id: string;
  type: 'text' | 'image' | 'shape' | 'line' | 'background';
  bounds: { x: number; y: number; width: number; height: number; rotation?: number };
  zIndex: number;
  opacity?: number;
  locked?: boolean;
  confidence?: number;
  // text
  text?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: string;
    color?: string;
    align?: string;
    lineHeight?: number;
  };
  // image
  src?: string;
  alt?: string;
  objectFit?: string;
  // shape
  shape?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // line
  points?: number[];
};

export type AedomPage = {
  id: string;
  width: number;
  height: number;
  background: string;
  elements: AedomElement[];
};

type Props = {
  page: AedomPage;
  scale: number;
  selected: string | null;
  onClearSelection: () => void;
  onSelect: (id: string) => void;
  onCommit: (element: AedomElement) => void;
};

// ── Main canvas ───────────────────────────────────────────────────────────────
export default function KonvaCanvas({
  page,
  scale,
  selected,
  onClearSelection,
  onSelect,
  onCommit,
}: Props) {
  console.log(
    `[KonvaCanvas] page=${page.id} ${page.width}×${page.height} elements=${page.elements.length}`,
    page.elements.map((e) => `${e.type}[${e.id.slice(0, 6)}]`),
  );

  // Sort by zIndex so lower elements render first (behind)
  const sorted = [...page.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <Stage
      width={page.width * scale}
      height={page.height * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onClearSelection();
      }}
    >
      {/* Background fill layer */}
      <Layer>
        <Rect
          x={0}
          y={0}
          width={page.width}
          height={page.height}
          fill={page.background || '#ffffff'}
          listening={false}
        />
      </Layer>

      {/* Elements layer */}
      <Layer>
        {sorted.map((el) => (
          <CanvasElement
            key={el.id}
            el={el}
            isSelected={el.id === selected}
            onSelect={() => onSelect(el.id)}
            onCommit={onCommit}
            stageScale={scale}
          />
        ))}
      </Layer>
    </Stage>
  );
}

// ── Per-element wrapper with Transformer ─────────────────────────────────────
function CanvasElement({
  el,
  isSelected,
  onSelect,
  onCommit,
  stageScale,
}: {
  el: AedomElement;
  isSelected: boolean;
  onSelect: () => void;
  onCommit: (e: AedomElement) => void;
  stageScale: number;
}) {
  const shapeRef = useRef<Konva.Node>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onCommit({
        ...el,
        bounds: {
          ...el.bounds,
          x: e.target.x(),
          y: e.target.y(),
        },
      });
    },
    [el, onCommit],
  );

  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      const node = shapeRef.current!;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // Reset scale, absorb into width/height
      node.scaleX(1);
      node.scaleY(1);
      onCommit({
        ...el,
        bounds: {
          x: node.x(),
          y: node.y(),
          width: Math.max(10, el.bounds.width * scaleX),
          height: Math.max(10, el.bounds.height * scaleY),
          rotation: node.rotation(),
        },
      });
    },
    [el, onCommit],
  );

  const draggable = !el.locked;

  const commonProps = {
    ref: shapeRef as React.Ref<any>,
    x: el.bounds.x,
    y: el.bounds.y,
    width: el.bounds.width,
    height: el.bounds.height,
    rotation: el.bounds.rotation ?? 0,
    opacity: el.opacity ?? 1,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
  };

  let shape: React.ReactNode = null;

  if (el.type === 'image') {
    shape = (
      <ImageElement
        el={el}
        commonProps={commonProps}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    );
  } else if (el.type === 'text') {
    shape = (
      <TextElement
        el={el}
        commonProps={commonProps}
        isSelected={isSelected}
        onSelect={onSelect}
        onCommit={onCommit}
        stageScale={stageScale}
      />
    );
  } else if (el.type === 'shape') {
    if (el.shape === 'ellipse') {
      shape = (
        <Ellipse
          {...commonProps}
          x={el.bounds.x + el.bounds.width / 2}
          y={el.bounds.y + el.bounds.height / 2}
          radiusX={el.bounds.width / 2}
          radiusY={el.bounds.height / 2}
          fill={el.fill ?? '#cccccc'}
          stroke={el.stroke ?? '#000000'}
          strokeWidth={el.strokeWidth ?? 1}
        />
      );
    } else {
      shape = (
        <Rect
          {...commonProps}
          fill={el.fill ?? '#cccccc'}
          stroke={el.stroke ?? '#000000'}
          strokeWidth={el.strokeWidth ?? 1}
          cornerRadius={el.shape === 'roundRect' ? 12 : 0}
        />
      );
    }
  } else if (el.type === 'line') {
    shape = (
      <Line
        ref={shapeRef as React.Ref<Konva.Line>}
        points={el.points ?? [0, 0, el.bounds.width, 0]}
        x={el.bounds.x}
        y={el.bounds.y}
        stroke={el.stroke ?? '#000000'}
        strokeWidth={el.strokeWidth ?? 2}
        opacity={el.opacity ?? 1}
        draggable={draggable}
        onClick={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
    );
  } else if (el.type === 'background') {
    shape = (
      <Rect
        x={el.bounds.x}
        y={el.bounds.y}
        width={el.bounds.width}
        height={el.bounds.height}
        fill={el.fill ?? '#ffffff'}
        listening={false}
      />
    );
  }

  if (!shape) return null;

  return (
    <>
      {shape}
      {isSelected && !el.locked && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) return oldBox;
            return newBox;
          }}
          rotateEnabled
          keepRatio={false}
        />
      )}
    </>
  );
}

// ── Image element with async loading ─────────────────────────────────────────
function ImageElement({
  el,
  commonProps,
  isSelected,
  onSelect,
}: {
  el: AedomElement;
  commonProps: Record<string, unknown>;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [errored, setErrored] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setImg(null);
    setErrored(false);

    if (!el.src) {
      console.warn(`[KonvaCanvas] image ${el.id} has no src`);
      setErrored(true);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      if (!mounted.current) return;
      console.log(`[KonvaCanvas] image loaded id=${el.id} ${image.naturalWidth}×${image.naturalHeight}`);
      setImg(image);
    };
    image.onerror = (err) => {
      if (!mounted.current) return;
      console.error(`[KonvaCanvas] image load FAILED id=${el.id}`, err);
      setErrored(true);
    };
    image.src = el.src;

    return () => {
      mounted.current = false;
    };
  }, [el.src, el.id]);

  if (errored) {
    return (
      <Rect
        {...(commonProps as any)}
        fill="#fee2e2"
        stroke="#ef4444"
        strokeWidth={2}
      />
    );
  }

  if (!img) {
    // Grey shimmer placeholder while loading
    return (
      <Rect
        {...(commonProps as any)}
        fill="#f1f5f9"
        stroke="#e2e8f0"
        strokeWidth={1}
      />
    );
  }

  return (
    <KonvaImage
      {...(commonProps as any)}
      image={img}
    />
  );
}

// ── Text element with inline editing ─────────────────────────────────────────
function TextElement({
  el,
  commonProps,
  isSelected,
  onSelect,
  onCommit,
  stageScale,
}: {
  el: AedomElement;
  commonProps: Record<string, unknown>;
  isSelected: boolean;
  onSelect: () => void;
  onCommit: (e: AedomElement) => void;
  stageScale: number;
}) {
  const textRef = useRef<Konva.Text>(null);
  const [editing, setEditing] = useState(false);

  const s = el.style ?? {};
  const fontSize = s.fontSize ?? 14;
  const fontFamily = s.fontFamily ?? 'Arial';
  const fontStyle = s.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontVariant = (s.fontWeight ?? 400) >= 700 ? 'bold' : 'normal';
  const fill = s.color ?? '#111827';
  const align = (s.align as 'left' | 'center' | 'right' | 'justify') ?? 'left';

  const startEditing = useCallback(() => {
    const node = textRef.current;
    if (!node) return;
    setEditing(true);

    const stage = node.getStage()!;
    const stageContainer = stage.container();
    const stageBox = stageContainer.getBoundingClientRect();
    const absPos = node.getAbsolutePosition();

    const textarea = document.createElement('textarea');
    stageContainer.appendChild(textarea);

    const scaledFontSize = fontSize * stageScale;
    const paddingPx = 2;

    Object.assign(textarea.style, {
      position: 'absolute',
      top: `${stageBox.top + absPos.y * stageScale - paddingPx}px`,
      left: `${stageBox.left + absPos.x * stageScale - paddingPx}px`,
      width: `${el.bounds.width * stageScale + paddingPx * 2}px`,
      minHeight: `${el.bounds.height * stageScale}px`,
      fontSize: `${scaledFontSize}px`,
      fontFamily,
      fontStyle,
      fontWeight: fontVariant,
      lineHeight: String(s.lineHeight ?? 1.2),
      color: fill,
      border: '2px solid #3b82f6',
      padding: `${paddingPx}px`,
      margin: '0',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.95)',
      outline: 'none',
      resize: 'none',
      zIndex: '9999',
      boxSizing: 'border-box',
      borderRadius: '3px',
      transform: `rotate(${el.bounds.rotation ?? 0}deg)`,
      transformOrigin: 'top left',
    });

    textarea.value = el.text ?? '';
    textarea.focus();
    textarea.select();

    node.hide();

    const cleanup = () => {
      node.show();
      const newText = textarea.value;
      stageContainer.removeChild(textarea);
      setEditing(false);
      if (newText !== el.text) {
        onCommit({ ...el, text: newText });
      }
    };

    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        cleanup();
      }
      if (ev.key === 'Escape') {
        textarea.value = el.text ?? '';
        cleanup();
      }
    });
    textarea.addEventListener('blur', cleanup, { once: true });
  }, [el, fontSize, fontFamily, fontStyle, fontVariant, fill, s.lineHeight, stageScale, onCommit]);

  return (
    <Text
      {...(commonProps as any)}
      ref={textRef}
      text={el.text ?? ''}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontStyle={fontStyle}
      fontVariant={fontVariant}
      fill={fill}
      align={align}
      lineHeight={s.lineHeight ?? 1.2}
      wrap="word"
      onDblClick={startEditing}
      onDblTap={startEditing}
    />
  );
}
