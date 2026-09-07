export type UUID = string;
export type ElementKind = 'text' | 'image' | 'table' | 'shape' | 'line' | 'background';
export type Align = 'left' | 'center' | 'right' | 'justify';
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
}
export interface BaseElement {
    id: UUID;
    type: ElementKind;
    bounds: Rect;
    zIndex: number;
    opacity?: number;
    locked?: boolean;
    confidence?: number;
}
export interface TextStyle {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle?: 'normal' | 'italic';
    color: string;
    align?: Align;
    lineHeight?: number;
    letterSpacing?: number;
}
export interface TextElement extends BaseElement {
    type: 'text';
    text: string;
    style: TextStyle;
}
export interface ImageElement extends BaseElement {
    type: 'image';
    src: string;
    alt?: string;
    objectFit?: 'contain' | 'cover' | 'fill';
}
export interface TableCell {
    text: string;
    rowSpan?: number;
    colSpan?: number;
}
export interface TableElement extends BaseElement {
    type: 'table';
    rows: number;
    cols: number;
    cells: TableCell[];
    style: {
        borderColor: string;
        header?: TextStyle;
    };
}
export interface ShapeElement extends BaseElement {
    type: 'shape';
    shape: 'rect' | 'roundRect' | 'ellipse' | 'polygon';
    fill: string;
    stroke: string;
    strokeWidth: number;
}
export interface LineElement extends BaseElement {
    type: 'line';
    points: number[];
    stroke: string;
    strokeWidth: number;
}
export interface BackgroundElement extends BaseElement {
    type: 'background';
    fill: string;
}
export type Element = TextElement | ImageElement | TableElement | ShapeElement | LineElement | BackgroundElement;
export interface Page {
    id: UUID;
    width: number;
    height: number;
    background: string;
    elements: Element[];
    source?: {
        page: number;
        imageUrl?: string;
    };
}
export interface AedomDocument {
    schemaVersion: '0.1';
    id: UUID;
    title: string;
    width: number;
    height: number;
    pages: Page[];
    metadata: {
        sourceType: string;
        documentType: string;
        createdAt: string;
        quality?: QualityScore;
    };
}
export interface QualityScore {
    overall: number;
    textAccuracy: number;
    layoutAccuracy: number;
    elementAccuracy: number;
    visualSimilarity: number;
    lowConfidenceElementIds: UUID[];
    notes: string[];
}
export declare function cloneDocument(doc: AedomDocument): AedomDocument;
export declare function findElement(doc: AedomDocument, id: UUID): Element | undefined;
export declare function updateText(doc: AedomDocument, id: UUID, text: string): AedomDocument;
