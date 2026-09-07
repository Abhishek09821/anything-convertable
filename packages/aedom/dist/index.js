export function cloneDocument(doc) { return structuredClone(doc); }
export function findElement(doc, id) { for (const p of doc.pages) {
    const e = p.elements.find(x => x.id === id);
    if (e)
        return e;
} return undefined; }
export function updateText(doc, id, text) { const out = cloneDocument(doc); const e = findElement(out, id); if (e?.type === 'text')
    e.text = text; return out; }
