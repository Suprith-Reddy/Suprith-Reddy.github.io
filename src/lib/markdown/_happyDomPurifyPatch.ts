/**
 * TEST-ONLY shim — happy-dom + DOMPurify compatibility (T1.4).
 *
 * `render.ts` is correct in a real browser; these two patches only repair
 * happy-dom (v20) quirks that make DOMPurify (v3.4) silently misbehave under the
 * Vitest `happy-dom` environment. Production code NEVER imports this module, so
 * nothing here ships to users.
 *
 * Two independent happy-dom bugs break DOMPurify, and BOTH must be fixed:
 *
 *  1. `Node.prototype.nodeName` returns "" .
 *     happy-dom defines a working `nodeName` getter on each *subclass*
 *     (`Element.prototype`, `Text.prototype`, …) but leaves a stub on
 *     `Node.prototype` that returns "". DOMPurify caches the getter from
 *     `Node.prototype` (`lookupGetter(Node.prototype,'nodeName')`) and calls it
 *     on every node, so every element's tag name comes back "" — not in
 *     ALLOWED_TAGS — and DOMPurify removes *valid* tags (<h1>, <ul>, <b>, …)
 *     while its allow/forbid logic is effectively disabled. Fix: redefine the
 *     `Node.prototype.nodeName` getter to delegate to the nearest subclass getter
 *     (falling back to a computed name for text/comment/etc.).
 *
 *  2. happy-dom's live `NodeIterator` is not mutation-safe.
 *     DOMPurify removes disallowed nodes *during* iteration; happy-dom's iterator
 *     loses its place after a removal and skips the following sibling — so e.g.
 *     in `<object></object><embed>` the <object> is removed but the <embed>
 *     (next sibling) is never visited and survives. Fix: replace
 *     `createNodeIterator` with a snapshot-based iterator (collect matching nodes
 *     up front) that also skips nodes detached from the root mid-walk — matching
 *     the spec's "removed nodes are not yielded" behavior closely enough for
 *     DOMPurify.
 *
 * ORDER MATTERS: DOMPurify captures `document.createNodeIterator` and the
 * `Node.prototype.nodeName` getter when its factory binds to the window (at
 * `import 'dompurify'`). This module installs both patches at import time, so it
 * MUST be imported BEFORE `./render` (which imports dompurify). Static imports
 * execute top-down, so listing this import first in the test file is sufficient.
 */

const FILTER_ACCEPT = 1; // NodeFilter.FILTER_ACCEPT

function bitForNodeType(nodeType: number): number {
  return nodeType > 0 ? 1 << (nodeType - 1) : 0;
}

let nodeNamePatched = false;
let iteratorPatched = false;

/** Fix #1 — make `Node.prototype.nodeName` delegate to the real subclass getter. */
function patchNodeName(): void {
  if (nodeNamePatched) return;
  const NodeCtor = (globalThis as unknown as { Node?: { prototype: object } }).Node;
  if (!NodeCtor?.prototype) return;
  const nodeProto = NodeCtor.prototype as object;
  const brokenDesc = Object.getOwnPropertyDescriptor(nodeProto, 'nodeName');

  // Walk the instance's prototype chain (excluding Node.prototype itself) for a
  // `nodeName` getter that returns a non-empty value.
  function subclassNodeName(inst: object): string | undefined {
    let proto = Object.getPrototypeOf(inst);
    while (proto && proto !== nodeProto) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'nodeName');
      if (desc?.get) {
        const value = desc.get.call(inst) as unknown;
        if (typeof value === 'string' && value) return value;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return undefined;
  }

  Object.defineProperty(nodeProto, 'nodeName', {
    configurable: true,
    get(this: { nodeType?: number; tagName?: string }): string {
      const sub = subclassNodeName(this);
      if (sub) return sub;
      const native = brokenDesc?.get ? (brokenDesc.get.call(this) as string) : '';
      if (native) return native;
      switch (this.nodeType) {
        case 3:
          return '#text';
        case 8:
          return '#comment';
        case 9:
          return '#document';
        case 10:
          return '#document-type';
        case 11:
          return '#document-fragment';
        default:
          return this.tagName ?? native;
      }
    },
  });
  nodeNamePatched = true;
}

/** Fix #2 — install a mutation-safe snapshot `createNodeIterator`. */
function patchNodeIterator(): void {
  if (iteratorPatched) return;
  if (typeof document === 'undefined') return;
  const docProto = Object.getPrototypeOf(document) as {
    createNodeIterator?: unknown;
  };
  if (typeof docProto.createNodeIterator !== 'function') return;

  docProto.createNodeIterator = function patchedCreateNodeIterator(
    this: Document,
    root: Node,
    whatToShow: number = -1,
    filter: NodeFilter | ((node: Node) => number) | null = null,
  ): NodeIterator {
    const nodes: Node[] = [];
    (function collect(node: Node): void {
      const show = whatToShow === -1 || (whatToShow & bitForNodeType(node.nodeType)) !== 0;
      let accept = show;
      if (accept && filter) {
        const fn: ((node: Node) => number) | undefined =
          typeof filter === 'function'
            ? filter
            : filter.acceptNode
              ? (n: Node) => filter.acceptNode(n)
              : undefined;
        if (fn) accept = fn(node) === FILTER_ACCEPT;
      }
      if (accept) nodes.push(node);
      let child = node.firstChild;
      while (child) {
        collect(child);
        child = child.nextSibling;
      }
    })(root);

    // A snapshot node is still "live" only while it remains under `root`. After
    // DOMPurify removes an ancestor, detached descendants must not be yielded.
    function stillUnderRoot(node: Node): boolean {
      let cur: Node | null = node;
      while (cur) {
        if (cur === root) return true;
        cur = cur.parentNode;
      }
      return false;
    }

    let index = 0;
    return {
      root,
      whatToShow,
      filter: filter as NodeFilter,
      referenceNode: root,
      pointerBeforeReferenceNode: true,
      nextNode(): Node | null {
        while (index < nodes.length) {
          const node = nodes[index++];
          if (node && stillUnderRoot(node)) return node;
        }
        return null;
      },
      previousNode(): Node | null {
        while (index > 0) {
          const node = nodes[--index];
          if (node && stillUnderRoot(node)) return node;
        }
        return null;
      },
      detach(): void {
        /* no-op (legacy) */
      },
    } as unknown as NodeIterator;
  } as Document['createNodeIterator'];

  iteratorPatched = true;
}

/** Install both happy-dom DOMPurify compatibility patches (idempotent). */
export function installHappyDomPurifyPatch(): void {
  patchNodeName();
  patchNodeIterator();
}

// Install on import so that placing this import above `./render` is enough.
installHappyDomPurifyPatch();
