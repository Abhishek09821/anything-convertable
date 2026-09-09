'use client';
/**
 * KonvaCanvas — fully functional AEDOM-backed canvas.
 *
 * Bug-fixes in this version vs previous:
 *  1. Transformer is in its own top Layer so it always renders above content.
 *  2. shapeRef is forwarded correctly through ImageElement via React.forwardRef.
 *  3. Transformer re-attaches whenever the node identity changes (image load swap).
 *  4. Textarea position uses node.getClientRect() not absPos * scale (no double-scale).
 *  5. Text element height auto-expands after inline edit to fit new content.
 *  6. commitElement uses the element from the onCommit argument, not stale state.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Ellipse,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import type Konva from 'konva';

// ─────────────────────────────────────────────────────────────────────────────
// AEDOM types (mirrors packages/aedom — duplicated here to avoid SSR issues)
// ─────────────────────────────────────────────────────────────────────────────
export type AedomBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type AedomTextStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: string;
  color?: string;
  align?: string;
  lineHeight?: number;
};

export type AedomElement = {
  id: string;
  type: 'text' | 'image' | 'shape' | 'line' | 'background';
  bounds: AedomBounds;
  zIndex: number;
  opacity?: number;
  locked?: boolean;
  confidence?: number;
  // text
  text?: string;
  style?: AedomTextStyle;
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

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────
type CanvasProps = {
  page: AedomPage;
  scale: number;
  selected: string | null;
  onClearSelection: () => void;
  onSelect: (id: string) => void;
  onCommit: (element: AedomElement) => void;
};

export default function KonvaCanvas({
  page,
  scale,
  selected,
  onClearSelection,
  onSelect,
  onCommit,
}: CanvasProps) {
  console.log(
    `[KonvaCanvas] page=${page.id} ${page.width}×${page.height}`,
    `elements=${page.elements.length}`,
    page.elements.map((e) => `${e.type}[z${e.zIndex}]`).join(' '),
  );

  const sorted = [...page.elements].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0),
  );

  // One shared transformer ref for the whole canvas
  const transformerRef = useRef<Konva.Transformer>(null);

  return (
    <Stage
      width={page.width * scale}
      height={page.height * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) {
          onClearSelection();
        }
      }}
    >
      {/* Layer 1 — page background */}
      <Layer listening={false}>
        <Rect
          x={0}
          y={0}
          width={page.width}
          height={page.height}
          fill={page.background || '#ffffff'}
        />
      </Layer>

      {/* Layer 2 — all document elements */}
      <Layer>
        {sorted.map((el) => (
          <CanvasElement
            key={el.id}
            el={el}
            isSelected={el.id === selected}
            transformerRef={transformerRef}
            onSelect={() => onSelect(el.id)}
            onCommit={onCommit}
            stageScale={scale}
          />
        ))}
      </Layer>

      {/* Layer 3 — transformer handles (always on top) */}
      <Layer>
        <Transformer
          ref={transformerRef}
          keepRatio={false}
          rotateEnabled={true}
          enabledAnchors={[
            'top-left','top-center','top-right',
            'middle-right','middle-left',
            'bottom-left','bottom-center','bottom-right',
          ]}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
          }
        />
      </Layer>
    </Stage>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-element wrapper — owns the Konva node ref and wires it to the transformer
// ─────────────────────────────────────────────────────────────────────────────
type ElementProps = {
  el: AedomElement;
  isSelected: boolean;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  onSelect: () => void;
  onCommit: (e: AedomElement) => void;
  stageScale: number;
};

function CanvasElement({
  el,
  isSelected,
  transformerRef,
  onSelect,
  onCommit,
  stageScale,
}: ElementProps) {
  // nodeRef holds whichever Konva node is currently rendered for this element
  const nodeRef = useRef<Konva.Node>(null);

  // Re-attach transformer whenever selection changes OR after image load
  // (image load replaces the placeholder Rect with the real KonvaImage node)
  const attachTransformer = useCallback(() => {
    const tr = transformerRef.current;
    const node = nodeRef.current;
    if (!tr || !node) return;
    if (isSelected && !el.locked) {
      tr.nodes([node]);
    } else {
      // Only clear if this element was the one attached
      if (tr.nodes().includes(node)) {
        tr.nodes([]);
      }
    }
    tr.getLayer()?.batchDraw();
  }, [isSelected, el.locked, transformerRef]);

  // Attach/detach when selection state changes
  useEffect(() => {
    attachTransformer();
  }, [attachTransformer]);

  // ── Shared drag/transform handlers ──────────────────────────────────────
  const handleDragEnd = useCallback(
    (evt: Konva.KonvaEventObject<DragEvent>) => {
      const node = evt.target;
      onCommit({
        ...el,
        bounds: {
          ...el.bounds,
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        },
      });
    },
    [el, onCommit],
  );

  const handleTransformEnd = useCallback(
    (evt: Konva.KonvaEventObject<Event>) => {
      const node = evt.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // absorb scale into bounds, reset node scale to 1
      node.scaleX(1);
      node.scaleY(1);
      onCommit({
        ...el,
        bounds: {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: Math.round(Math.max(10, el.bounds.width * scaleX)),
          height: Math.round(Math.max(10, el.bounds.height * scaleY)),
          rotation: Math.round(node.rotation()),
        },
      });
    },
    [el, onCommit],
  );

  const draggable = !el.locked;

  // Shared Konva props for every node type
  const sharedProps = {
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

  // ── Dispatch by type ────────────────────────────────────────────────────
  if (el.type === 'image') {
    return (
      <ImageNode
        ref={nodeRef as React.Ref<Konva.Node>}
        el={el}
        sharedProps={sharedProps}
        onAttach={attachTransformer}
      />
    );
  }

  if (el.type === 'text') {
    return (
      <TextNode
        ref={nodeRef as React.Ref<Konva.Node>}
        el={el}
        sharedProps={sharedProps}
        onCommit={onCommit}
        stageScale={stageScale}
      />
    );
  }

  if (el.type === 'shape') {
    if (el.shape === 'ellipse') {
      return (
        <Ellipse
          ref={nodeRef as React.Ref<Konva.Ellipse>}
          {...sharedProps}
          x={el.bounds.x + el.bounds.width / 2}
          y={el.bounds.y + el.bounds.height / 2}
          radiusX={Math.max(1, el.bounds.width / 2)}
          radiusY={Math.max(1, el.bounds.height / 2)}
          fill={el.fill ?? '#cccccc'}
          stroke={el.stroke ?? '#000000'}
          strokeWidth={el.strokeWidth ?? 1}
        />
      );
    }
    return (
      <Rect
        ref={nodeRef as React.Ref<Konva.Rect>}
        {...sharedProps}
        fill={el.fill ?? '#cccccc'}
        stroke={el.stroke ?? '#000000'}
        strokeWidth={el.strokeWidth ?? 1}
        cornerRadius={el.shape === 'roundRect' ? 12 : 0}
      />
    );
  }

  if (el.type === 'line') {
    return (
      <Line
        ref={nodeRef as React.Ref<Konva.Line>}
        x={el.bounds.x}
        y={el.bounds.y}
        points={el.points ?? [0, 0, el.bounds.width, 0]}
        stroke={el.stroke ?? '#000000'}
        strokeWidth={el.strokeWidth ?? 2}
        opacity={el.opacity ?? 1}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
    );
  }

  if (el.type === 'background') {
    return (
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

  console.warn('[KonvaCanvas] unknown element type:', el.type, el.id);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageNode — async load, placeholder while loading, re-attaches transformer
// ─────────────────────────────────────────────────────────────────────────────
type ImageNodeProps = {
  el: AedomElement;
  sharedProps: Record<string, unknown>;
  onAttach: () => void;
};

const ImageNode = forwardRef<Konva.Node, ImageNodeProps>(function ImageNode(
  { el, sharedProps, onAttach },
  ref,
) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setImg(null);
    setErrored(false);

    if (!el.src) {
      console.warn(`[KonvaCanvas] image element ${el.id} has no src`);
      setErrored(true);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      if (!mountedRef.current) return;
      console.log(
        `[KonvaCanvas] ✓ image loaded id=${el.id.slice(0, 8)}`,
        `${image.naturalWidth}×${image.naturalHeight}`,
      );
      setImg(image);
    };
    image.onerror = (err) => {
      if (!mountedRef.current) return;
      console.error(`[KonvaCanvas] ✗ image failed id=${el.id.slice(0, 8)}`, err);
      setErrored(true);
    };
    image.src = el.src;

    return () => {
      mountedRef.current = false;
    };
  }, [el.src, el.id]);

  // Re-attach transformer after image transitions from placeholder to real node
  useEffect(() => {
    if (img) onAttach();
  }, [img, onAttach]);

  if (errored) {
    return (
      <Rect
        ref={ref as React.Ref<Konva.Rect>}
        {...(sharedProps as any)}
        fill="#fee2e2"
        stroke="#ef4444"
        strokeWidth={2}
      />
    );
  }

  if (!img) {
    return (
      <Rect
        ref={ref as React.Ref<Konva.Rect>}
        {...(sharedProps as any)}
        fill="#f1f5f9"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
    );
  }

  return (
    <KonvaImage
      ref={ref as React.Ref<Konva.Image>}
      {...(sharedProps as any)}
      image={img}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TextNode — inline editing via overlay textarea
// ─────────────────────────────────────────────────────────────────────────────
type TextNodeProps = {
  el: AedomElement;
  sharedProps: Record<string, unknown>;
  onCommit: (e: AedomElement) => void;
  stageScale: number;
};

const TextNode = forwardRef<Konva.Node, TextNodeProps>(function TextNode(
  { el, sharedProps, onCommit, stageScale },
  ref,
) {
  const textRef = useRef<Konva.Text>(null);

  // Expose the inner textRef through the forwarded ref
  useEffect(() => {
    if (typeof ref === 'function') {
      ref(textRef.current);
    } else if (ref) {
      (ref as React.MutableRefObject<Konva.Node | null>).current = textRef.current;
    }
  });

  const s = el.style ?? {};
  const fontSize = s.fontSize ?? 14;
  const fontFamily = s.fontFamily ?? 'Arial';
  const fontStyle: string = s.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontVariant: string = (s.fontWeight ?? 400) >= 700 ? 'bold' : 'normal';
  const textColor = s.color ?? '#111827';
  const align = (s.align as 'left' | 'center' | 'right' | 'justify') ?? 'left';

  const startEditing = useCallback(() => {
    const node = textRef.current;
    if (!node) return;

    // BUG FIX: use getClientRect on the stage container to get the real
    // screen-space bounding box of this text node — avoids the double-scale
    // error caused by multiplying absPos (already in screen px) by scale again.
    const stage = node.getStage();
    if (!stage) return;

    const stageContainer = stage.container();

    // getClientRect returns bbox in the stage's scaled coordinate system
    // then we need to translate to screen space
    const containerRect = stageContainer.getBoundingClientRect();
    const nodeBox = node.getClientRect(); // in stage pixel coords (scaled)

    // Position the textarea exactly over the node
    const textarea = document.createElement('textarea');
    // Use fixed positioning relative to viewport for reliability
    Object.assign(textarea.style, {
      position: 'fixed',
      left: `${containerRect.left + nodeBox.x}px`,
      top: `${containerRect.top + nodeBox.y}px`,
      width: `${nodeBox.width}px`,
      minHeight: `${nodeBox.height}px`,
      fontSize: `${fontSize * stageScale}px`,
      fontFamily,
      fontStyle,
      fontWeight: fontVariant,
      lineHeight: String(s.lineHeight ?? 1.2),
      color: textColor,
      border: '2px solid #3b82f6',
      padding: '2px',
      margin: '0',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.97)',
      outline: 'none',
      resize: 'none',
      zIndex: '99999',
      boxSizing: 'border-box',
      borderRadius: '2px',
      boxShadow: '0 0 0 2px rgba(59,130,246,0.3)',
      transform: `rotate(${el.bounds.rotation ?? 0}deg)`,
      transformOrigin: 'top left',
      wordWrap: 'break-word',
    });

    textarea.value = el.text ?? '';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // Hide Konva text while editing
    node.hide();
    node.getLayer()?.batchDraw();

    const finish = (save: boolean) => {
      node.show();
      node.getLayer()?.batchDraw();

      const newText = textarea.value;
      if (document.body.contains(textarea)) {
        document.body.removeChild(textarea);
      }

      if (save && newText !== el.text) {
        // Measure new natural height using the Konva text measurement
        // so bounds.height expands to fit the new content
        const tempNode = node.clone({ text: newText }) as Konva.Text;
        const newHeight = Math.max(
          el.bounds.height,
          tempNode.height(),
        );
        tempNode.destroy();

        onCommit({
          ...el,
          text: newText,
          bounds: { ...el.bounds, height: newHeight },
        });
      }
    };

    textarea.addEventListener('keydown', (evt) => {
      // Enter without Shift → save
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        finish(true);
      }
      // Escape → cancel
      if (evt.key === 'Escape') {
        finish(false);
      }
    });

    textarea.addEventListener('blur', () => finish(true), { once: true });
  }, [el, fontSize, fontFamily, fontStyle, fontVariant, s.lineHeight, textColor, stageScale, onCommit]);

  return (
    <Text
      ref={textRef}
      {...(sharedProps as any)}
      text={el.text ?? ''}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontStyle={fontStyle}
      fontVariant={fontVariant}
      fill={textColor}
      align={align}
      lineHeight={s.lineHeight ?? 1.2}
      wrap="word"
      onDblClick={startEditing}
      onDblTap={startEditing}
    />
  );
});
