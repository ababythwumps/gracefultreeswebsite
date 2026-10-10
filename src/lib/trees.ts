import { mulberry32, numAt } from "~/lib/graceful-labeling";
export interface TreeNode {
  id: number;
  x: number;
  y: number;
}
export interface TreeEdge {
  id: number;
  a: number;
  b: number;
}
export interface TreeGraph {
  nodes: TreeNode[];
  edges: TreeEdge[];
}
export const CANVAS_W = 900;
export const CANVAS_H = 600;
export function toAdjList(graph: TreeGraph): {
  adj: number[][];
  indexOf: Map<number, number>;
  nodeIds: number[];
} {
  const nodeIds = graph.nodes.map((n) => n.id);
  const indexOf = new Map<number, number>();
  nodeIds.forEach((id, i) => indexOf.set(id, i));
  const adj: number[][] = nodeIds.map(() => []);
  for (const e of graph.edges) {
    const a = indexOf.get(e.a);
    const b = indexOf.get(e.b);
    if (a === undefined || b === undefined) continue;
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  for (const nb of adj) nb.sort((x, y) => x - y);
  return { adj, indexOf, nodeIds };
}
function emptyGraph(): TreeGraph {
  return { nodes: [], edges: [] };
}
function link(
  graph: TreeGraph,
  nextEdgeId: {
    v: number;
  },
  a: number,
  b: number,
) {
  graph.edges.push({ id: nextEdgeId.v++, a, b });
}
export function layoutTree(
  graph: TreeGraph,
  rootId?: number,
  width = CANVAS_W,
  height = CANVAS_H,
): TreeGraph {
  const nodes = graph.nodes;
  if (nodes.length === 0) return graph;
  const adj = new Map<number, number[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  const root =
    rootId !== undefined && adj.has(rootId) ? rootId : pickRoot(graph, adj);
  const parent = new Map<number, number | null>([[root, null]]);
  const depth = new Map<number, number>([[root, 0]]);
  const order: number[] = [root];
  const queue = [root];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const w of adj.get(u) ?? []) {
      if (!parent.has(w)) {
        parent.set(w, u);
        depth.set(w, depth.get(u)! + 1);
        queue.push(w);
        order.push(w);
      }
    }
  }
  for (const n of nodes) {
    if (!parent.has(n.id)) {
      parent.set(n.id, root);
      depth.set(n.id, 1);
      order.push(n.id);
    }
  }
  const maxDepth = Math.max(...depth.values());
  const children = new Map<number, number[]>();
  for (const n of nodes) children.set(n.id, []);
  for (const [child, p] of parent) {
    if (p !== null) children.get(p)?.push(child);
  }
  const widthOf = new Map<number, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i]!;
    const kids = children.get(u) ?? [];
    if (kids.length === 0) widthOf.set(u, 1);
    else
      widthOf.set(
        u,
        kids.reduce((s, k) => s + widthOf.get(k)!, 0),
      );
  }
  const total = widthOf.get(root)!;
  const padX = 60;
  const padTop = 60;
  const padBottom = 60;
  const spanX = Math.max(width - padX * 2, 50);
  const spanY = maxDepth === 0 ? 0 : (height - padTop - padBottom) / maxDepth;
  const pos = new Map<
    number,
    {
      x: number;
      y: number;
    }
  >();
  const place = (u: number, left: number) => {
    const w = widthOf.get(u)!;
    const cx = padX + ((left + w / 2) / total) * spanX;
    pos.set(u, { x: cx, y: padTop + depth.get(u)! * spanY });
    let cursor = left;
    for (const k of children.get(u) ?? []) {
      place(k, cursor);
      cursor += widthOf.get(k)!;
    }
  };
  place(root, 0);
  return {
    nodes: nodes.map((n) => ({
      ...n,
      ...(pos.get(n.id) ?? { x: n.x, y: n.y }),
    })),
    edges: graph.edges.map((e) => ({ ...e })),
  };
}
function pickRoot(graph: TreeGraph, adj: Map<number, number[]>): number {
  let best = graph.nodes[0]!;
  let bestDeg = -1;
  for (const n of graph.nodes) {
    const d = adj.get(n.id)?.length ?? 0;
    if (d > bestDeg) {
      bestDeg = d;
      best = n;
    }
  }
  return best.id;
}
export function childPosition(
  parent: TreeNode,
  siblingCount: number,
  existing: TreeNode[],
): {
  x: number;
  y: number;
} {
  const R = 110;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = -Math.PI / 2 + (siblingCount + attempt) * golden;
    const r = R + attempt * 9;
    const x = Math.min(
      Math.max(parent.x + r * Math.cos(angle), 36),
      CANVAS_W - 36,
    );
    const y = Math.min(
      Math.max(parent.y + r * Math.sin(angle), 36),
      CANVAS_H - 36,
    );
    const clash = existing.some((n) => Math.hypot(n.x - x, n.y - y) < 52);
    if (!clash || attempt === 23) return { x, y };
  }
  return { x: parent.x, y: Math.min(parent.y + 110, CANVAS_H - 36) };
}
function finalize(raw: TreeGraph): TreeGraph {
  return layoutTree(raw, raw.nodes[0]?.id);
}
export function makeSingleNode(): TreeGraph {
  return { nodes: [{ id: 0, x: CANVAS_W / 2, y: CANVAS_H / 2 }], edges: [] };
}
export function makePath(m: number): TreeGraph {
  const g = emptyGraph();
  const eid = { v: 0 };
  for (let i = 0; i < m; i++) g.nodes.push({ id: i, x: 0, y: 0 });
  for (let i = 0; i + 1 < m; i++) link(g, eid, i, i + 1);
  return finalize(g);
}
export function makeStar(m: number): TreeGraph {
  const g = emptyGraph();
  const eid = { v: 0 };
  for (let i = 0; i < m; i++) g.nodes.push({ id: i, x: 0, y: 0 });
  for (let i = 1; i < m; i++) link(g, eid, 0, i);
  return finalize(g);
}
export function makeBinaryTree(levels: number): TreeGraph {
  const m = 2 ** levels - 1;
  const g = emptyGraph();
  const eid = { v: 0 };
  for (let i = 0; i < m; i++) g.nodes.push({ id: i, x: 0, y: 0 });
  for (let i = 0; i < m; i++) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < m) link(g, eid, i, l);
    if (r < m) link(g, eid, i, r);
  }
  return finalize(g);
}
export function makeCaterpillar(spine: number, leaves: number): TreeGraph {
  const g = emptyGraph();
  const eid = { v: 0 };
  let next = 0;
  const spineIds: number[] = [];
  for (let i = 0; i < spine; i++) {
    spineIds.push(next);
    g.nodes.push({ id: next++, x: 0, y: 0 });
  }
  for (let i = 0; i + 1 < spine; i++)
    link(g, eid, spineIds[i]!, spineIds[i + 1]!);
  for (const s of spineIds) {
    for (let k = 0; k < leaves; k++) {
      g.nodes.push({ id: next, x: 0, y: 0 });
      link(g, eid, s, next);
      next++;
    }
  }
  return finalize(g);
}
export function makeRandomTree(m: number, seed?: number): TreeGraph {
  const g = emptyGraph();
  const eid = { v: 0 };
  for (let i = 0; i < m; i++) g.nodes.push({ id: i, x: 0, y: 0 });
  if (m <= 2) {
    if (m === 2) link(g, eid, 0, 1);
    return finalize(g);
  }
  const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0);
  const seq = Array.from({ length: m - 2 }, () => Math.floor(rng() * m));
  const deg = new Array<number>(m).fill(1);
  for (const s of seq) deg[s] = numAt(deg, s) + 1;
  const remaining = new Set<number>(Array.from({ length: m }, (_, i) => i));
  const degCopy = deg.slice();
  for (const s of seq) {
    let leaf = -1;
    for (const c of remaining) {
      if (degCopy[c] === 1) {
        leaf = c;
        break;
      }
    }
    if (leaf < 0) break;
    link(g, eid, leaf, s);
    remaining.delete(leaf);
    degCopy[leaf] = numAt(degCopy, leaf) - 1;
    degCopy[s] = numAt(degCopy, s) - 1;
  }
  const rest = [...remaining];
  if (rest.length === 2) link(g, eid, rest[0]!, rest[1]!);
  return finalize(g);
}
export const EXAMPLES: {
  label: string;
  hint: string;
  make: () => TreeGraph;
}[] = [
  { label: "Path · 12", hint: "P₁₂", make: () => makePath(12) },
  { label: "Star · 13", hint: "K₁,₁₂", make: () => makeStar(13) },
  { label: "Binary · 15", hint: "3 levels", make: () => makeBinaryTree(4) },
  {
    label: "Caterpillar · 21",
    hint: "spine 7 × 2",
    make: () => makeCaterpillar(7, 2),
  },
  { label: "Random · 20", hint: "Prüfer", make: () => makeRandomTree(20) },
  { label: "Random · 40", hint: "Prüfer", make: () => makeRandomTree(40) },
];
