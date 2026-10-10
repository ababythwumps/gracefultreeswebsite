export type AdjList = number[][];
export type Edge = [number, number];
export type AlgorithmId =
  "backtracking-mrv" | "ac3-cp" | "stochastic-local-search";
export interface SolveOptions {
  timeLimitMs?: number;
  algorithm?: AlgorithmId;
  seed?: number;
  onTick?: (iterations: number) => void;
  fallback?: boolean;
  fallbackBudgetMs?: number;
  onStage?: (stage: "primary" | "stochastic-fallback") => void;
  initialLabels?: number[];
  signal?: AbortSignal;
}
export interface GracefulResult {
  labeling: number[] | null;
  edgeLabels: number[] | null;
  edges: Edge[];
  graceful: boolean;
  algorithm: AlgorithmId;
  timeMs: number;
  iterations: number;
  bestCost?: number;
  complete: boolean;
  message: string;
}
export const DEFAULT_TIME_LIMIT_MS = 15000;
export function selectAlgorithm(m: number): AlgorithmId {
  if (m <= 30) return "backtracking-mrv";
  if (m <= 100) return "ac3-cp";
  return "stochastic-local-search";
}
export function edgeListFromAdj(adj: AdjList): Edge[] {
  const edges: Edge[] = [];
  adj.forEach((neighbors, u) => {
    for (const v of neighbors) {
      if (v > u) edges.push([u, v]);
    }
  });
  return edges;
}
export function validateTree(adj: AdjList): {
  valid: boolean;
  reason?: string;
} {
  const m = adj.length;
  if (m === 0) return { valid: false, reason: "The graph is empty." };
  const edges = edgeListFromAdj(adj);
  if (edges.length !== m - 1) {
    return {
      valid: false,
      reason: `A tree with ${m} vertices needs exactly ${m - 1} edges, found ${edges.length}.`,
    };
  }
  const seen = new Array<boolean>(m).fill(false);
  for (let u = 0; u < m; u++) {
    for (const v of adj[u] ?? []) {
      if (v < 0 || v >= m)
        return { valid: false, reason: `Bad neighbor ${v}.` };
      if (!(adj[v] ?? []).includes(u))
        return { valid: false, reason: "Adjacency is not symmetric." };
    }
  }
  const stack = [0];
  seen[0] = true;
  let count = 0;
  while (stack.length > 0) {
    const u = stack.pop()!;
    count++;
    for (const v of adj[u] ?? []) {
      if (!seen[v]) {
        seen[v] = true;
        stack.push(v);
      }
    }
  }
  if (count !== m)
    return { valid: false, reason: "The graph is disconnected." };
  return { valid: true };
}
export interface Verification {
  graceful: boolean;
  reason: string;
  edgeLabels: number[];
}
export function verifyGraceful(adj: AdjList, labeling: number[]): Verification {
  const m = adj.length;
  const n = m - 1;
  if (labeling.length !== m)
    return {
      graceful: false,
      reason: "Labeling length mismatch.",
      edgeLabels: [],
    };
  const usedV = new Array<boolean>(n + 1).fill(false);
  for (let u = 0; u < m; u++) {
    const f = labeling[u]!;
    if (!Number.isInteger(f) || f < 0 || f > n)
      return {
        graceful: false,
        reason: `Vertex ${u} has label ${f}, outside 0..${n}.`,
        edgeLabels: [],
      };
    if (usedV[f])
      return {
        graceful: false,
        reason: `Label ${f} is used more than once (injectivity violated).`,
        edgeLabels: [],
      };
    usedV[f] = true;
  }
  const edges = edgeListFromAdj(adj);
  const seenD = new Array<boolean>(n + 1).fill(false);
  const edgeLabels: number[] = [];
  for (const [a, b] of edges) {
    const d = Math.abs(labeling[a]! - labeling[b]!);
    edgeLabels.push(d);
    if (d < 1 || d > n || seenD[d])
      return {
        graceful: false,
        reason: `Edge ${a}-${b} induces duplicate/out-of-range difference ${d}.`,
        edgeLabels,
      };
    seenD[d] = true;
  }
  return {
    graceful: true,
    reason: "All edge differences are exactly 1..n.",
    edgeLabels,
  };
}
export function numAt(
  arr: Record<number, number | undefined>,
  i: number,
): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds`);
  return v;
}
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
function stopped(deadline: number, signal?: AbortSignal): boolean {
  return Date.now() > deadline || (signal?.aborted ?? false);
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function endsFirstOrder(n: number): number[] {
  const order: number[] = [];
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    order.push(lo, hi);
    lo++;
    hi--;
  }
  if (lo === hi) order.push(lo);
  return order;
}
export function maxDegreeVertex(adj: AdjList): number {
  let best = 0;
  for (let u = 1; u < adj.length; u++) {
    if ((adj[u]?.length ?? 0) > (adj[best]?.length ?? 0)) best = u;
  }
  return best;
}
export function constrainedOrder(adj: AdjList): number[] {
  const m = adj.length;
  const inOrder = new Array<boolean>(m).fill(false);
  const order: number[] = [];
  let start = 0;
  for (let u = 1; u < m; u++) {
    if ((adj[u]?.length ?? 0) > (adj[start]?.length ?? 0)) start = u;
  }
  order.push(start);
  inOrder[start] = true;
  while (order.length < m) {
    let best = -1;
    let bestNb = -1;
    let bestDeg = -1;
    for (let u = 0; u < m; u++) {
      if (inOrder[u] === true) continue;
      let nb = 0;
      for (const w of adj[u] ?? []) if (inOrder[w] === true) nb++;
      const d = adj[u]?.length ?? 0;
      if (nb > bestNb || (nb === bestNb && d > bestDeg)) {
        best = u;
        bestNb = nb;
        bestDeg = d;
      }
    }
    order.push(best);
    inOrder[best] = true;
  }
  return order;
}
export function greedyAttempt(
  adj: AdjList,
  order: number[],
  anchor: number,
  anchorMax: number,
  rng: () => number,
): number[] | null {
  const m = adj.length;
  const n = m - 1;
  const assigned = new Array<number>(m).fill(-1);
  const usedV = new Array<boolean>(n + 1).fill(false);
  const usedD = new Array<boolean>(n + 1).fill(false);
  for (const u of order) {
    let bestV = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let v = 0; v <= n; v++) {
      if (usedV[v] === true) continue;
      if (u === anchor && v > anchorMax) continue;
      let fresh = 0;
      let freshSize = 0;
      let legal = true;
      for (const w of adj[u] ?? []) {
        const fw = numAt(assigned, w);
        if (fw < 0) continue;
        const d = Math.abs(v - fw);
        if (d === 0 || usedD[d] === true) {
          legal = false;
          break;
        }
        fresh++;
        freshSize += d;
      }
      if (!legal) continue;
      const extreme = Math.abs(v - n / 2);
      const score = fresh * 100000 + freshSize * 4 + extreme * 2 + rng() * 4;
      if (score > bestScore) {
        bestScore = score;
        bestV = v;
      }
    }
    if (bestV < 0) return null;
    assigned[u] = bestV;
    usedV[bestV] = true;
    for (const w of adj[u] ?? []) {
      const fw = numAt(assigned, w);
      if (fw >= 0) usedD[Math.abs(bestV - fw)] = true;
    }
  }
  return assigned;
}
export function validWarmStart(adj: AdjList, warm?: number[]): number[] | null {
  if (warm?.length !== adj.length) return null;
  const n = adj.length - 1;
  const seen = new Array<boolean>(n + 1).fill(false);
  for (const v of warm) {
    if (!Number.isInteger(v) || v < 0 || v > n || seen[v]) return null;
    seen[v] = true;
  }
  return warm.slice();
}
export async function runGreedyPhase(
  adj: AdjList,
  rng: () => number,
  budgetMs: number,
  signal?: AbortSignal,
): Promise<{
  labeling: number[] | null;
  attempts: number;
}> {
  if (adj.length <= 2) return { labeling: null, attempts: 0 };
  const order = constrainedOrder(adj);
  const anchor = maxDegreeVertex(adj);
  const anchorMax = Math.floor((adj.length - 1) / 2);
  const deadline = Date.now() + Math.max(budgetMs, 1);
  let attempts = 0;
  let lastYield = Date.now();
  while (attempts < 12000) {
    for (let i = 0; i < 100 && attempts < 12000; i++) {
      attempts++;
      const labeling = greedyAttempt(adj, order, anchor, anchorMax, rng);
      if (labeling) return { labeling, attempts };
    }
    const now = Date.now();
    if (now - lastYield > 25) {
      lastYield = now;
      await yieldToUI();
    }
    if (stopped(deadline, signal)) break;
  }
  return { labeling: null, attempts };
}
interface BacktrackStats {
  nodes: number;
  nodesThisAttempt: number;
  attemptCap: number;
  capped: boolean;
  deadline: number;
  timedOut: boolean;
  ticks: number;
  onTick?: (iterations: number) => void;
  signal?: AbortSignal;
}
async function maybeYield1(stats: BacktrackStats): Promise<boolean> {
  stats.nodes++;
  stats.nodesThisAttempt++;
  if (stats.nodesThisAttempt > stats.attemptCap) {
    stats.capped = true;
    return true;
  }
  if (stats.nodes % 2048 === 0) {
    stats.ticks++;
    stats.onTick?.(stats.nodes);
    await yieldToUI();
    if (stopped(stats.deadline, stats.signal)) {
      stats.timedOut = true;
      return true;
    }
  }
  return false;
}
function shuffledCopy<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}
async function solveBacktrackingMRV(
  adj: AdjList,
  edges: Edge[],
  timeLimitMs: number,
  seed: number | undefined,
  onTick?: (iterations: number) => void,
  signal?: AbortSignal,
): Promise<Omit<GracefulResult, "edges" | "algorithm" | "timeMs">> {
  const m = adj.length;
  const n = m - 1;
  if (m === 1)
    return {
      labeling: [0],
      edgeLabels: [],
      graceful: true,
      iterations: 1,
      complete: true,
      message: "Single vertex is trivially graceful.",
    };
  if (m === 2)
    return {
      labeling: [0, 1],
      edgeLabels: [1],
      graceful: true,
      iterations: 1,
      complete: true,
      message: "Single edge labeled 0-1.",
    };
  const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0);
  const greedy = await runGreedyPhase(
    adj,
    rng,
    Math.min(1200, Math.floor(timeLimitMs * 0.1)),
    signal,
  );
  if (greedy.labeling) {
    const found = greedy.labeling;
    return {
      labeling: found,
      edgeLabels: edges.map(([a, b]) =>
        Math.abs(numAt(found, a) - numAt(found, b)),
      ),
      graceful: true,
      iterations: greedy.attempts,
      complete: true,
      message: `Backtracking + MRV: randomized greedy construction found a graceful labeling on attempt ${greedy.attempts.toLocaleString()} (solution verified).`,
    };
  }
  const degree = adj.map((nb) => nb.length);
  let anchor = 0;
  for (let u = 1; u < m; u++) {
    if (degree[u]! > degree[anchor]!) anchor = u;
  }
  const anchorMax = Math.floor(n / 2);
  const assigned = new Array<number>(m).fill(-1);
  const usedV = new Array<boolean>(n + 1).fill(false);
  const usedD = new Array<boolean>(n + 1).fill(false);
  const valueOrder = endsFirstOrder(n);
  const stats: BacktrackStats = {
    nodes: 0,
    nodesThisAttempt: 0,
    attemptCap: 400000,
    capped: false,
    deadline: Date.now() + timeLimitMs,
    timedOut: false,
    ticks: 0,
    onTick,
    signal,
  };
  function legalValues(u: number): number[] {
    const out: number[] = [];
    const neighbors = adj[u] ?? [];
    for (const v of valueOrder) {
      if (usedV[v]) continue;
      if (u === anchor && v > anchorMax) continue;
      let ok = true;
      for (const w of neighbors) {
        const fw = assigned[w]!;
        if (fw < 0) continue;
        const d = Math.abs(v - fw);
        if (d === 0 || usedD[d]) {
          ok = false;
          break;
        }
      }
      if (ok) out.push(v);
    }
    return out;
  }
  function selectMRV(): {
    u: number;
    domain: number[];
  } | null {
    let best = -1;
    let bestDomain: number[] = [];
    let bestKey = Number.POSITIVE_INFINITY;
    for (let u = 0; u < m; u++) {
      if (numAt(assigned, u) !== -1) continue;
      const domain = legalValues(u);
      if (domain.length === 0) return { u, domain };
      let assignedNb = 0;
      for (const w of adj[u] ?? []) if (numAt(assigned, w) !== -1) assignedNb++;
      const key = domain.length * 1024 - assignedNb * 16 + degree[u]!;
      if (key < bestKey) {
        bestKey = key;
        best = u;
        bestDomain = domain;
      }
    }
    if (best < 0) return null;
    return { u: best, domain: bestDomain };
  }
  function orderCandidates(domain: number[], u: number): number[] {
    const scored = domain.map((v, i) => {
      let dmax = -1;
      for (const w of adj[u] ?? []) {
        const fw = numAt(assigned, w);
        if (fw < 0) continue;
        const d = Math.abs(v - fw);
        if (d > dmax) dmax = d;
      }
      const tie =
        dmax < 0 ? Math.abs(v - n / 2) : dmax * 1000 + Math.abs(v - n / 2);
      return { v, i, tie };
    });
    scored.sort((a, b) => b.tie - a.tie || a.i - b.i);
    return scored.map((s) => s.v);
  }
  let solution: number[] | null = null;
  async function dfs(
    placed: number,
    randomized: boolean,
    rng: () => number,
  ): Promise<boolean> {
    if (solution) return true;
    if (await maybeYield1(stats)) return true;
    if (placed === m) {
      solution = assigned.slice();
      return true;
    }
    const pick = selectMRV();
    if (!pick || pick.domain.length === 0) return false;
    const { u, domain } = pick;
    const neighbors = adj[u] ?? [];
    const values = orderCandidates(
      randomized ? shuffledCopy(domain, rng) : domain,
      u,
    );
    for (const v of values) {
      assigned[u] = v;
      usedV[v] = true;
      const touched: number[] = [];
      let conflict = false;
      for (const w of neighbors) {
        const fw = assigned[w]!;
        if (fw < 0) continue;
        const d = Math.abs(v - fw);
        if (usedD[d]) {
          conflict = true;
          break;
        }
        usedD[d] = true;
        touched.push(d);
      }
      if (!conflict) {
        const done = await dfs(placed + 1, randomized, rng);
        if (done && solution) return true;
        if (stats.timedOut || stats.capped) return true;
      }
      for (const d of touched) usedD[d] = false;
      usedV[v] = false;
      assigned[u] = -1;
    }
    return false;
  }
  let attempt = 0;
  let provedAbsent = false;
  while (!solution && !stats.timedOut && !provedAbsent) {
    attempt++;
    assigned.fill(-1);
    usedV.fill(false);
    usedD.fill(false);
    stats.nodesThisAttempt = 0;
    stats.capped = false;
    await dfs(0, attempt > 1, rng);
    if (solution || stats.timedOut) break;
    if (!stats.capped) provedAbsent = true;
  }
  if (solution) {
    const solved = solution;
    const edgeLabels = edges.map(([a, b]) =>
      Math.abs(numAt(solved, a) - numAt(solved, b)),
    );
    return {
      labeling: solution,
      edgeLabels,
      graceful: true,
      iterations: stats.nodes + greedy.attempts,
      complete: true,
      message: `Backtracking + MRV found a graceful labeling (search attempt ${attempt}, ${(stats.nodes + greedy.attempts).toLocaleString()} total steps including ${greedy.attempts.toLocaleString()} greedy attempts).`,
    };
  }
  return {
    labeling: null,
    edgeLabels: null,
    graceful: false,
    iterations: stats.nodes + greedy.attempts,
    complete: provedAbsent,
    message:
      (signal?.aborted ?? false)
        ? `Backtracking + MRV was cancelled after ${(stats.nodes + greedy.attempts).toLocaleString()} steps.`
        : stats.timedOut
          ? `Backtracking + MRV hit the ${timeLimitMs}ms budget after ${(stats.nodes + greedy.attempts).toLocaleString()} steps without proving anything. Try a longer budget or a smaller tree.`
          : `Backtracking + MRV exhaustively proved no graceful labeling exists (searched ${(stats.nodes + greedy.attempts).toLocaleString()} steps).`,
  };
}
async function solveCPAC3(
  adj: AdjList,
  edges: Edge[],
  timeLimitMs: number,
  seed: number | undefined,
  onTick?: (iterations: number) => void,
  signal?: AbortSignal,
): Promise<Omit<GracefulResult, "edges" | "algorithm" | "timeMs">> {
  const m = adj.length;
  const n = m - 1;
  if (m === 1)
    return {
      labeling: [0],
      edgeLabels: [],
      graceful: true,
      iterations: 1,
      complete: true,
      message: "Single vertex is trivially graceful.",
    };
  if (m === 2)
    return {
      labeling: [0, 1],
      edgeLabels: [1],
      graceful: true,
      iterations: 1,
      complete: true,
      message: "Single edge labeled 0-1.",
    };
  const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0);
  const greedy = await runGreedyPhase(
    adj,
    rng,
    Math.min(1500, Math.floor(timeLimitMs * 0.1)),
    signal,
  );
  if (greedy.labeling) {
    const found = greedy.labeling;
    return {
      labeling: found,
      edgeLabels: edges.map(([a, b]) =>
        Math.abs(numAt(found, a) - numAt(found, b)),
      ),
      graceful: true,
      iterations: greedy.attempts,
      complete: true,
      message: `Constraint programming · AC-3: randomized greedy construction found a graceful labeling on attempt ${greedy.attempts.toLocaleString()} (solution verified).`,
    };
  }
  const degree = adj.map((nb) => nb.length);
  let anchor = 0;
  for (let u = 1; u < m; u++) {
    if (degree[u]! > degree[anchor]!) anchor = u;
  }
  const anchorMax = Math.floor(n / 2);
  const deadline = Date.now() + timeLimitMs;
  const valueOrder = endsFirstOrder(n);
  let nodes = 0;
  let timedOut = false;
  const W = n + 1;
  const newDomains = (): Uint8Array => {
    const d = new Uint8Array(m * W).fill(1);
    for (let v = anchorMax + 1; v <= n; v++) d[anchor * W + v] = 0;
    return d;
  };
  const domainValues = (d: Uint8Array, u: number): number[] => {
    const base = u * W;
    const out: number[] = [];
    for (const v of valueOrder) if (d[base + v] === 1) out.push(v);
    return out;
  };
  const domainSize = (d: Uint8Array, u: number): number => {
    const base = u * W;
    let c = 0;
    for (let v = 0; v <= n; v++) if (d[base + v] === 1) c++;
    return c;
  };
  const singletonOf = (d: Uint8Array, u: number): number => {
    const base = u * W;
    let found = -1;
    for (let v = 0; v <= n; v++) {
      if (d[base + v] === 1) {
        if (found >= 0) return -1;
        found = v;
      }
    }
    return found;
  };
  function propagate(
    domains: Uint8Array,
    assignedVal: number[],
    usedV: boolean[],
    usedD: boolean[],
  ): boolean {
    const queue: number[] = [];
    const inQueue = new Array<boolean>(m).fill(false);
    for (let u = 0; u < m; u++) {
      if (singletonOf(domains, u) >= 0) {
        queue.push(u);
        inQueue[u] = true;
      }
    }
    while (queue.length > 0) {
      const u = queue.pop()!;
      inQueue[u] = false;
      const singleton = singletonOf(domains, u);
      if (singleton < 0) continue;
      if (numAt(assignedVal, u) !== singleton) {
        if (numAt(assignedVal, u) >= 0) return false;
        if (usedV[singleton]) return false;
        assignedVal[u] = singleton;
        usedV[singleton] = true;
        for (const w of adj[u] ?? []) {
          const fw = assignedVal[w]!;
          if (fw >= 0) {
            const d = Math.abs(singleton - fw);
            if (d === 0 || usedD[d]) return false;
            usedD[d] = true;
          }
        }
      }
      const val = numAt(assignedVal, u);
      for (let w = 0; w < m; w++) {
        if (w === u) continue;
        const cell = w * W + val;
        if (domains[cell] === 1) {
          if (numAt(assignedVal, w) === val) return false;
          domains[cell] = 0;
          if (domainSize(domains, w) === 0) return false;
          if (!inQueue[w]) {
            queue.push(w);
            inQueue[w] = true;
          }
        }
      }
      for (const w of adj[u] ?? []) {
        if (numAt(assignedVal, w) >= 0) continue;
        const base = w * W;
        let changed = false;
        for (let b = 0; b <= n; b++) {
          if (domains[base + b] !== 1) continue;
          const d = Math.abs(val - b);
          if (d === 0 || usedD[d]) {
            domains[base + b] = 0;
            changed = true;
          }
        }
        if (domainSize(domains, w) === 0) return false;
        if (changed && !inQueue[w]) {
          queue.push(w);
          inQueue[w] = true;
        }
      }
    }
    return true;
  }
  let solution: number[] | null = null;
  async function dfs(
    domains: Uint8Array,
    assignedVal: number[],
    usedV: boolean[],
    usedD: boolean[],
    placed: number,
  ): Promise<boolean> {
    if (solution ?? timedOut) return true;
    nodes++;
    if (nodes % 512 === 0) {
      onTick?.(nodes);
      await yieldToUI();
      if (stopped(deadline, signal)) {
        timedOut = true;
        return true;
      }
    }
    if (placed === m) {
      solution = assignedVal.slice();
      return true;
    }
    let pick = -1;
    let pickSize = Number.POSITIVE_INFINITY;
    let pickConstrained = -1;
    let pickDeg = Number.POSITIVE_INFINITY;
    for (let u = 0; u < m; u++) {
      if (numAt(assignedVal, u) >= 0) continue;
      const size = domainSize(domains, u);
      if (size === 0) return false;
      let decidedNb = 0;
      for (const w of adj[u] ?? []) if (numAt(assignedVal, w) >= 0) decidedNb++;
      const deg = degree[u]!;
      if (
        size < pickSize ||
        (size === pickSize && decidedNb > pickConstrained) ||
        (size === pickSize && decidedNb === pickConstrained && deg < pickDeg)
      ) {
        pickSize = size;
        pick = u;
        pickConstrained = decidedNb;
        pickDeg = deg;
      }
    }
    if (pick < 0) return false;
    const rawCandidates = domainValues(domains, pick);
    const scored = rawCandidates.map((v, i) => {
      let dmax = -1;
      for (const w of adj[pick] ?? []) {
        const fw = numAt(assignedVal, w);
        if (fw < 0) continue;
        const d = Math.abs(v - fw);
        if (d > dmax) dmax = d;
      }
      return {
        v,
        i,
        tie: dmax < 0 ? Math.abs(v - n / 2) : dmax * 1000 + Math.abs(v - n / 2),
      };
    });
    scored.sort((a, b) => b.tie - a.tie || a.i - b.i);
    const candidates = scored.map((s) => s.v);
    for (const v of candidates) {
      const d2 = domains.slice();
      d2.fill(0, pick * W, pick * W + W);
      d2[pick * W + v] = 1;
      const a2 = assignedVal.slice();
      const uv2 = usedV.slice();
      const ud2 = usedD.slice();
      if (!propagate(d2, a2, uv2, ud2)) continue;
      let placed2 = 0;
      for (let u = 0; u < m; u++) if (numAt(a2, u) !== -1) placed2++;
      const done = await dfs(d2, a2, uv2, ud2, placed2);
      if (done && solution) return true;
      if (timedOut) return true;
    }
    return false;
  }
  const domains = newDomains();
  const assignedVal = new Array<number>(m).fill(-1);
  const usedV0 = new Array<boolean>(n + 1).fill(false);
  const usedD0 = new Array<boolean>(n + 1).fill(false);
  if (!propagate(domains, assignedVal, usedV0, usedD0)) {
    return {
      labeling: null,
      edgeLabels: null,
      graceful: false,
      iterations: 1 + greedy.attempts,
      complete: true,
      message: "AC-3 propagation proved the instance inconsistent immediately.",
    };
  }
  let placed0 = 0;
  for (let u = 0; u < m; u++) if (numAt(assignedVal, u) >= 0) placed0++;
  await dfs(domains, assignedVal, usedV0, usedD0, placed0);
  if (solution) {
    const solved = solution;
    const edgeLabels = edges.map(([a, b]) =>
      Math.abs(numAt(solved, a) - numAt(solved, b)),
    );
    return {
      labeling: solution,
      edgeLabels,
      graceful: true,
      iterations: nodes + greedy.attempts,
      complete: true,
      message: `Constraint programming (AC-3 + MRV) found a graceful labeling after ${(nodes + greedy.attempts).toLocaleString()} steps (${greedy.attempts.toLocaleString()} greedy attempts + ${nodes.toLocaleString()} search nodes).`,
    };
  }
  return {
    labeling: null,
    edgeLabels: null,
    graceful: false,
    iterations: nodes + greedy.attempts,
    complete: !timedOut,
    message:
      (signal?.aborted ?? false)
        ? `AC-3 search was cancelled after ${(nodes + greedy.attempts).toLocaleString()} steps.`
        : timedOut
          ? `AC-3 search hit the ${timeLimitMs}ms budget after ${(nodes + greedy.attempts).toLocaleString()} steps. Try a longer budget.`
          : `AC-3 search exhausted the space (${(nodes + greedy.attempts).toLocaleString()} steps): no graceful labeling exists.`,
  };
}
async function solveStochasticLocalSearch(
  adj: AdjList,
  edges: Edge[],
  timeLimitMs: number,
  seed: number | undefined,
  onTick?: (iterations: number) => void,
  warmStart?: number[],
  signal?: AbortSignal,
): Promise<Omit<GracefulResult, "edges" | "algorithm" | "timeMs">> {
  const m = adj.length;
  const n = m - 1;
  if (m === 1)
    return {
      labeling: [0],
      edgeLabels: [],
      graceful: true,
      iterations: 1,
      bestCost: 0,
      complete: true,
      message: "Single vertex is trivially graceful.",
    };
  if (m === 2)
    return {
      labeling: [0, 1],
      edgeLabels: [1],
      graceful: true,
      iterations: 1,
      bestCost: 0,
      complete: true,
      message: "Single edge labeled 0-1.",
    };
  const deadline = Date.now() + timeLimitMs;
  const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0);
  const E = edges.length;
  const incident: number[][] = Array.from({ length: m }, () => []);
  edges.forEach(([a, b], i) => {
    incident[a]!.push(i);
    incident[b]!.push(i);
  });
  function bfsOrderFrom(start: number): number[] {
    const seen = new Array<boolean>(m).fill(false);
    const order: number[] = [];
    const q = [start];
    seen[start] = true;
    while (q.length > 0) {
      const u = q.shift()!;
      order.push(u);
      for (const w of adj[u] ?? []) {
        if (!seen[w]) {
          seen[w] = true;
          q.push(w);
        }
      }
    }
    return order;
  }
  const farFrom = (s: number): number => {
    const dist = new Array<number>(m).fill(-1);
    dist[s] = 0;
    const q = [s];
    let far = s;
    while (q.length > 0) {
      const u = q.shift()!;
      far = u;
      for (const w of adj[u] ?? []) {
        if (dist[w] === -1) {
          dist[w] = dist[u]! + 1;
          q.push(w);
        }
      }
    }
    return far;
  };
  const center = farFrom(farFrom(0));
  const greedyInit = (): number[] => {
    const order = bfsOrderFrom(center);
    const perm = new Array<number>(m);
    const ends = endsFirstOrder(n);
    order.forEach((u, i) => {
      perm[u] = ends[i]!;
    });
    return perm;
  };
  const randomInit = (): number[] => {
    const perm = Array.from({ length: m }, (_, i) => i);
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i]!;
      perm[i] = perm[j]!;
      perm[j] = tmp;
    }
    return perm;
  };
  let bestLabeling: number[] | null = null;
  let bestDiffs: number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let iterations = 0;
  let timedOut = false;
  let reheats = 0;
  let deepFixes = 0;
  let cycleFixes = 0;
  const greedy = await runGreedyPhase(
    adj,
    rng,
    Math.min(1500, Math.floor(timeLimitMs * 0.1)),
    signal,
  );
  if (greedy.labeling) {
    const found = greedy.labeling;
    return {
      labeling: found,
      edgeLabels: edges.map(([a, b]) =>
        Math.abs(numAt(found, a) - numAt(found, b)),
      ),
      graceful: true,
      iterations: greedy.attempts,
      complete: true,
      bestCost: 0,
      message: `Stochastic local search: randomized greedy construction found a graceful labeling on attempt ${greedy.attempts.toLocaleString()} (solution verified).`,
    };
  }
  iterations += greedy.attempts;
  const warm = validWarmStart(adj, warmStart);
  const resumed = warm !== null;
  function fullCost(label: number[]): {
    cost: number;
    diffs: number[];
    freq: Uint16Array;
  } {
    const diffs = new Array<number>(E);
    const freq = new Uint16Array(n + 1);
    for (let i = 0; i < E; i++) {
      const [a, b] = edges[i]!;
      const d = Math.abs(label[a]! - label[b]!);
      diffs[i] = d;
      freq[d] = numAt(freq, d) + 1;
    }
    let distinct = 0;
    for (let d = 1; d <= n; d++) if (numAt(freq, d) > 0) distinct++;
    return { cost: E - distinct, diffs, freq };
  }
  let restart = 0;
  outer: while (!stopped(deadline, signal)) {
    restart++;
    const label = restart === 1 ? (warm ?? greedyInit()) : randomInit();
    let { cost, diffs, freq } = fullCost(label);
    const posOf = new Array<number>(m);
    const rebuildPos = () => {
      for (let u = 0; u < m; u++) posOf[numAt(label, u)] = u;
    };
    rebuildPos();
    const recordBest = () => {
      if (cost < bestCost) {
        bestCost = cost;
        bestLabeling = label.slice();
        bestDiffs = diffs.slice();
      }
    };
    recordBest();
    if (bestCost === 0) break;
    const stepsPerRestart = Math.max(200000, Math.min(1500000, m * 8000));
    const reheatAfter = Math.max(20000, m * 300);
    let stepsSinceImprove = 0;
    let kickSize = Math.max(5, Math.floor(m / 10));
    let bestAtReheat = bestCost;
    let T = 0.9;
    const cooling = Math.pow(0.002 / 0.9, 1 / stepsPerRestart);
    const restoreBest = (kicks: number) => {
      if (!bestLabeling) return;
      const best = bestLabeling;
      for (let i = 0; i < m; i++) label[i] = numAt(best, i);
      for (let k = 0; k < kicks; k++) {
        const a = Math.floor(rng() * m);
        let b = Math.floor(rng() * m);
        if (b === a) b = (b + 1) % m;
        const t = numAt(label, a);
        label[a] = numAt(label, b);
        label[b] = t;
      }
      rebuildPos();
      const full = fullCost(label);
      cost = full.cost;
      diffs = full.diffs;
      freq = full.freq;
    };
    const evalSwap = (u: number, v: number) => {
      const iu = incident[u]!;
      const iv = incident[v]!;
      const affected: number[] = [];
      for (const e of iu) affected.push(e);
      for (const e of iv) {
        const [a, b] = edges[e]!;
        if (a !== u && b !== u) affected.push(e);
      }
      const fu = numAt(label, u);
      const fv = numAt(label, v);
      const newDiffs = new Array<number>(affected.length);
      for (let k = 0; k < affected.length; k++) {
        const e = affected[k]!;
        const [a, b] = edges[e]!;
        const la = a === u ? fv : a === v ? fu : numAt(label, a);
        const lb = b === u ? fv : b === v ? fu : numAt(label, b);
        newDiffs[k] = Math.abs(la - lb);
      }
      const touched: number[] = [];
      for (const e of affected) {
        const d = numAt(diffs, e);
        if (!touched.includes(d)) touched.push(d);
      }
      for (const d of newDiffs) {
        if (!touched.includes(d)) touched.push(d);
      }
      const removed: number[] = [];
      for (const e of affected) removed.push(numAt(diffs, e));
      let distinctBefore = 0;
      for (const d of touched) if (numAt(freq, d) > 0) distinctBefore++;
      let distinctAfter = 0;
      for (const d of touched) {
        let c = numAt(freq, d);
        for (const r of removed) if (r === d) c--;
        for (const ad of newDiffs) if (ad === d) c++;
        if (c > 0) distinctAfter++;
      }
      return {
        deltaCost: distinctBefore - distinctAfter,
        affected,
        newDiffs,
        fu,
        fv,
      };
    };
    const applySwap = (
      u: number,
      v: number,
      fu: number,
      fv: number,
      affected: number[],
      newDiffs: number[],
      deltaCost: number,
    ): void => {
      label[u] = fv;
      label[v] = fu;
      posOf[fu] = v;
      posOf[fv] = u;
      for (let k = 0; k < affected.length; k++) {
        const e = affected[k]!;
        const oldD = diffs[e]!;
        const nd = newDiffs[k]!;
        if (oldD !== nd) {
          freq[oldD] = numAt(freq, oldD) - 1;
          freq[nd] = numAt(freq, nd) + 1;
          diffs[e] = nd;
        }
      }
      cost += deltaCost;
    };
    const dupEndpoints = (): number[] => {
      const set = new Set<number>();
      for (let e = 0; e < E; e++) {
        if (numAt(freq, numAt(diffs, e)) > 1) {
          const [ea, eb] = edges[e]!;
          set.add(ea);
          set.add(eb);
        }
      }
      return [...set];
    };
    const repairCandidates = (): number[] => {
      const set = new Set<number>(dupEndpoints());
      set.add(numAt(posOf, 0));
      set.add(numAt(posOf, n));
      for (let e = 0; e < E; e++) {
        if (numAt(freq, numAt(diffs, e)) > 1) {
          const [ea, eb] = edges[e]!;
          for (const end of [ea, eb]) {
            for (const w of adj[end] ?? []) set.add(w);
          }
        }
      }
      return [...set];
    };
    const repairSweep = async (maxSteps: number): Promise<void> => {
      for (let s = 0; s < maxSteps; s++) {
        if (stopped(deadline, signal)) return;
        if (dupEndpoints().length === 0) return;
        let bestDelta = 0;
        let bu = -1;
        let bv = -1;
        let bAff: number[] = [];
        let bNd: number[] = [];
        let bfu = 0;
        let bfv = 0;
        for (const u of repairCandidates()) {
          for (let v = 0; v < m; v++) {
            if (v === u) continue;
            iterations++;
            if ((iterations & 511) === 0) {
              onTick?.(iterations);
              await yieldToUI();
              if (stopped(deadline, signal)) return;
            }
            const { deltaCost, affected, newDiffs, fu, fv } = evalSwap(u, v);
            if (deltaCost < bestDelta) {
              bestDelta = deltaCost;
              bu = u;
              bv = v;
              bAff = affected;
              bNd = newDiffs;
              bfu = fu;
              bfv = fv;
            }
          }
        }
        if (bu < 0) return;
        applySwap(bu, bv, bfu, bfv, bAff, bNd, bestDelta);
        if (cost < bestCost) {
          recordBest();
          stepsSinceImprove = 0;
          if (bestCost === 0) return;
        }
      }
    };
    const cycleRepair = async (): Promise<boolean> => {
      const base = repairCandidates();
      if (base.length === 0) return false;
      const S: number[] = [...base];
      while (S.length < Math.min(12, m)) {
        const v = Math.floor(rng() * m);
        if (!S.includes(v)) S.push(v);
      }
      let bestDelta = 0;
      let bx = -1;
      let by = -1;
      let bz = -1;
      let bdir: 1 | -1 = 1;
      for (const x of S) {
        for (const y of S) {
          if (y === x) continue;
          for (const z of S) {
            if (z === x || z === y) continue;
            if (stopped(deadline, signal)) return false;
            for (const dir of [1, -1] as const) {
              iterations++;
              if ((iterations & 511) === 0) {
                onTick?.(iterations);
                await yieldToUI();
                if (stopped(deadline, signal)) return false;
              }
              const lx = numAt(label, x);
              const ly = numAt(label, y);
              const lz = numAt(label, z);
              const nx = dir === 1 ? lz : ly;
              const ny = dir === 1 ? lx : lz;
              const nz = dir === 1 ? ly : lx;
              const affected: number[] = [];
              for (const vv of [x, y, z]) {
                for (const e of incident[vv]!) {
                  if (!affected.includes(e)) affected.push(e);
                }
              }
              const getNew = (w: number): number =>
                w === x ? nx : w === y ? ny : w === z ? nz : numAt(label, w);
              const newDiffs = new Array<number>(affected.length);
              for (let k = 0; k < affected.length; k++) {
                const e = affected[k]!;
                const [a, b] = edges[e]!;
                newDiffs[k] = Math.abs(getNew(a) - getNew(b));
              }
              const touched: number[] = [];
              for (const e of affected) {
                const d = numAt(diffs, e);
                if (!touched.includes(d)) touched.push(d);
              }
              for (const d of newDiffs) {
                if (!touched.includes(d)) touched.push(d);
              }
              const removed: number[] = [];
              for (const e of affected) removed.push(numAt(diffs, e));
              let db = 0;
              let da = 0;
              for (const d of touched) if (numAt(freq, d) > 0) db++;
              for (const d of touched) {
                let c = numAt(freq, d);
                for (const r of removed) if (r === d) c--;
                for (const ad of newDiffs) if (ad === d) c++;
                if (c > 0) da++;
              }
              if (db - da < bestDelta) {
                bestDelta = db - da;
                bx = x;
                by = y;
                bz = z;
                bdir = dir;
              }
            }
          }
        }
      }
      if (bx < 0) return false;
      const lx = numAt(label, bx);
      const ly = numAt(label, by);
      const lz = numAt(label, bz);
      const nx = bdir === 1 ? lz : ly;
      const ny = bdir === 1 ? lx : lz;
      const nz = bdir === 1 ? ly : lx;
      label[bx] = nx;
      label[by] = ny;
      label[bz] = nz;
      posOf[nx] = bx;
      posOf[ny] = by;
      posOf[nz] = bz;
      const full = fullCost(label);
      cost = full.cost;
      diffs = full.diffs;
      freq = full.freq;
      rebuildPos();
      if (cost < bestCost) {
        recordBest();
        stepsSinceImprove = 0;
        cycleFixes++;
        return true;
      }
      return false;
    };
    const endgameRepair = async (): Promise<void> => {
      await repairSweep(10);
      if (stopped(deadline, signal)) return;
      if (bestCost <= 4) await deepRepair();
      if (stopped(deadline, signal)) return;
      if (bestCost <= 3) await cycleRepair();
    };
    await repairSweep(25);
    if (bestCost === 0) break;
    const deepRepair = async (): Promise<boolean> => {
      const Us = repairCandidates();
      if (Us.length === 0) return false;
      interface Mv {
        u: number;
        v: number;
        delta: number;
        aff: number[];
        nd: number[];
        fu: number;
        fv: number;
      }
      const ply1: Mv[] = [];
      for (const u of Us) {
        for (let v = 0; v < m; v++) {
          if (v === u) continue;
          if (stopped(deadline, signal)) return false;
          iterations++;
          if ((iterations & 511) === 0) {
            onTick?.(iterations);
            await yieldToUI();
            if (stopped(deadline, signal)) return false;
          }
          const r = evalSwap(u, v);
          ply1.push({
            u,
            v,
            delta: r.deltaCost,
            aff: r.affected,
            nd: r.newDiffs,
            fu: r.fu,
            fv: r.fv,
          });
        }
      }
      ply1.sort((a, b) => a.delta - b.delta);
      const savedDiffs = diffs.slice();
      const savedFreq = freq.slice();
      const savedCost = cost;
      let followUps = 0;
      for (const mv of ply1) {
        if (mv.delta > 1) break;
        if (followUps >= 64) break;
        if (stopped(deadline, signal)) break;
        followUps++;
        applySwap(mv.u, mv.v, mv.fu, mv.fv, mv.aff, mv.nd, mv.delta);
        const Us2 = repairCandidates();
        let improved = false;
        for (const u2 of Us2) {
          if (stopped(deadline, signal)) break;
          for (let v2 = 0; v2 < m; v2++) {
            if (v2 === u2) continue;
            iterations++;
            if ((iterations & 511) === 0) {
              onTick?.(iterations);
              await yieldToUI();
              if (stopped(deadline, signal)) break;
            }
            const r2 = evalSwap(u2, v2);
            if (cost + r2.deltaCost < bestCost) {
              applySwap(
                u2,
                v2,
                r2.fu,
                r2.fv,
                r2.affected,
                r2.newDiffs,
                r2.deltaCost,
              );
              recordBest();
              stepsSinceImprove = 0;
              improved = true;
              break;
            }
          }
          if (improved || stopped(deadline, signal)) break;
        }
        if (improved) {
          deepFixes++;
          return true;
        }
        for (let k = 0; k < E; k++) diffs[k] = savedDiffs[k]!;
        for (let k = 0; k <= n; k++) freq[k] = savedFreq[k]!;
        cost = savedCost;
        const t = numAt(label, mv.u);
        label[mv.u] = numAt(label, mv.v);
        label[mv.v] = t;
        rebuildPos();
      }
      return false;
    };
    for (let step = 0; step < stepsPerRestart; step++) {
      if ((iterations & 1023) === 0) {
        if (stopped(deadline, signal)) {
          timedOut = true;
          break outer;
        }
        if ((iterations & 8191) === 0) {
          onTick?.(iterations);
          await yieldToUI();
        }
      }
      iterations++;
      stepsSinceImprove++;
      if (stepsSinceImprove > reheatAfter) {
        if (bestCost >= bestAtReheat) {
          kickSize = Math.min(
            Math.floor(m / 2),
            Math.floor(kickSize * 1.6) + 1,
          );
        } else {
          kickSize = Math.max(5, Math.floor(m / 10));
          bestAtReheat = bestCost;
        }
        restoreBest(kickSize);
        await endgameRepair();
        if (bestCost === 0) break outer;
        T = 0.4;
        stepsSinceImprove = 0;
        reheats++;
        continue;
      }
      if ((step & 8191) === 8191 && cost <= 6) {
        await endgameRepair();
        if (bestCost === 0) break outer;
        if (stopped(deadline, signal)) {
          timedOut = true;
          break outer;
        }
        continue;
      }
      let u = 0;
      let v = 1;
      const probe = Math.floor(rng() * E);
      const probeEdge = edges[probe]!;
      const probeDup = numAt(freq, numAt(diffs, probe)) > 1;
      const roll = rng();
      if (probeDup && roll < 0.45) {
        u = rng() < 0.5 ? probeEdge[0] : probeEdge[1];
        v = Math.floor(rng() * m);
        if (v === u) v = (v + 1) % m;
      } else if (probeDup && roll < 0.7) {
        const anchor = rng() < 0.5 ? probeEdge[0] : probeEdge[1];
        const mover = anchor === probeEdge[0] ? probeEdge[1] : probeEdge[0];
        const t = 1 + Math.floor(rng() * n);
        let picked = false;
        if (numAt(freq, t) === 0) {
          const fa = numAt(label, anchor);
          const options: number[] = [];
          if (fa + t <= n) options.push(fa + t);
          if (fa - t >= 0) options.push(fa - t);
          if (options.length > 0) {
            const L = options[Math.floor(rng() * options.length)]!;
            const holder = numAt(posOf, L);
            if (holder !== mover) {
              u = mover;
              v = holder;
              picked = true;
            }
          }
        }
        if (!picked) {
          u = Math.floor(rng() * m);
          v = Math.floor(rng() * m);
          if (v === u) v = (v + 1) % m;
        }
      } else {
        u = Math.floor(rng() * m);
        v = Math.floor(rng() * m);
        if (v === u) v = (v + 1) % m;
      }
      const { deltaCost, affected, newDiffs, fu, fv } = evalSwap(u, v);
      if (deltaCost <= 0 || rng() < Math.exp(-deltaCost / Math.max(T, 1e-9))) {
        applySwap(u, v, fu, fv, affected, newDiffs, deltaCost);
        if (cost < bestCost) {
          recordBest();
          stepsSinceImprove = 0;
          if (bestCost === 0) break outer;
        }
      }
      T *= cooling;
    }
  }
  if (bestLabeling && bestCost === 0) {
    const solved = bestLabeling;
    const edgeLabels = edges.map(([a, b]) =>
      Math.abs(numAt(solved, a) - numAt(solved, b)),
    );
    return {
      labeling: bestLabeling,
      edgeLabels,
      graceful: true,
      iterations,
      bestCost: 0,
      complete: true,
      message: `Stochastic local search (simulated annealing + repair) found a graceful labeling after ${iterations.toLocaleString()} steps over ${restart} restart(s), ${reheats} reheat(s), ${deepFixes} deep fix(es) and ${cycleFixes} cycle fix(es).${resumed ? " Run resumed from the previous closest attempt." : ""}`,
    };
  }
  const cancelled = signal?.aborted ?? false;
  return {
    labeling: bestLabeling,
    edgeLabels: bestDiffs,
    graceful: false,
    iterations,
    bestCost,
    complete: false,
    message: cancelled
      ? `Stochastic search was cancelled after ${iterations.toLocaleString()} swaps with ${bestCost} duplicate edge label(s) in the closest attempt.`
      : timedOut || Date.now() >= deadline
        ? `Stochastic search hit the ${timeLimitMs}ms budget. Closest attempt has ${bestCost} duplicate edge label(s) after ${iterations.toLocaleString()} swaps — shown below as a near-miss. Try a longer budget.`
        : `Stochastic search finished with ${bestCost} duplicate edge label(s) in the closest attempt (shown below).`,
  };
}
export async function solveGraceful(
  adj: AdjList,
  opts: SolveOptions = {},
): Promise<GracefulResult> {
  const timeLimitMs = opts.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const m = adj.length;
  const started = Date.now();
  const validity = validateTree(adj);
  if (!validity.valid) {
    return {
      labeling: null,
      edgeLabels: null,
      edges: [],
      graceful: false,
      algorithm: selectAlgorithm(Math.max(m, 1)),
      timeMs: 0,
      iterations: 0,
      complete: true,
      message: validity.reason ?? "Invalid tree.",
    };
  }
  const edges = edgeListFromAdj(adj);
  const algorithm = opts.algorithm ?? selectAlgorithm(m);
  let partial: Omit<GracefulResult, "edges" | "algorithm" | "timeMs">;
  if (algorithm === "backtracking-mrv") {
    partial = await solveBacktrackingMRV(
      adj,
      edges,
      timeLimitMs,
      opts.seed,
      opts.onTick,
      opts.signal,
    );
  } else if (algorithm === "ac3-cp") {
    partial = await solveCPAC3(
      adj,
      edges,
      timeLimitMs,
      opts.seed,
      opts.onTick,
      opts.signal,
    );
  } else {
    partial = await solveStochasticLocalSearch(
      adj,
      edges,
      timeLimitMs,
      opts.seed,
      opts.onTick,
      opts.initialLabels,
      opts.signal,
    );
  }
  let finalAlgorithm = algorithm;
  if (
    !partial.graceful &&
    !partial.complete &&
    !(opts.signal?.aborted ?? false) &&
    (opts.fallback ?? true) &&
    algorithm !== "stochastic-local-search"
  ) {
    opts.onStage?.("stochastic-fallback");
    const fbBudget = opts.fallbackBudgetMs ?? Math.min(10000, timeLimitMs);
    const fb = await solveStochasticLocalSearch(
      adj,
      edges,
      fbBudget,
      opts.seed,
      opts.onTick,
      opts.initialLabels,
      opts.signal,
    );
    if (fb.graceful && fb.labeling) {
      partial = {
        ...fb,
        iterations: partial.iterations + fb.iterations,
        message: `Primary engine (${ALGORITHM_LABELS[algorithm]}) timed out without deciding the instance. Stochastic fallback then found a graceful labeling: ${fb.message}`,
      };
    } else {
      partial = {
        ...fb,
        labeling: fb.labeling ?? partial.labeling,
        edgeLabels: fb.edgeLabels ?? partial.edgeLabels,
        iterations: partial.iterations + fb.iterations,
        message: `Primary engine (${ALGORITHM_LABELS[algorithm]}) timed out without deciding the instance, and the stochastic fallback also fell short: ${fb.message}`,
      };
    }
    finalAlgorithm = "stochastic-local-search";
  }
  return {
    ...partial,
    edges,
    algorithm: finalAlgorithm,
    timeMs: Date.now() - started,
  };
}
export const ALGORITHM_LABELS: Record<AlgorithmId, string> = {
  "backtracking-mrv": "Backtracking + MRV (m ≤ 30)",
  "ac3-cp": "Constraint programming · AC-3 (31 ≤ m ≤ 100)",
  "stochastic-local-search":
    "Stochastic local search · simulated annealing (m > 100)",
};
