"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ALGORITHM_LABELS,
  selectAlgorithm,
  solveGraceful,
  verifyGraceful,
  type AlgorithmId,
} from "~/lib/graceful-labeling";
import {
  CANVAS_H,
  CANVAS_W,
  EXAMPLES,
  childPosition,
  layoutTree,
  makeRandomTree,
  makeSingleNode,
  toAdjList,
  type TreeEdge,
  type TreeGraph,
  type TreeNode,
} from "~/lib/trees";
type Mode = "add" | "move" | "delete";
type SolveStatus = "idle" | "solving" | "solved" | "failed";
interface SolveSummary {
  status: SolveStatus;
  algorithm: AlgorithmId;
  timeMs: number;
  iterations: number;
  message: string;
  graceful: boolean;
  nearMiss: boolean;
  bestCost?: number;
  verifyReason: string;
  complete: boolean;
  runCount: number;
  stage: string;
  liveTicks: number;
}
const MAX_NODES = 400;
const INK = "#1c1917";
const CARD =
  "border-[3px] border-stone-900 bg-white shadow-[6px_6px_0_#1c1917]";
const BTN_BASE =
  "rounded-none border-[3px] border-stone-900 font-bold shadow-[4px_4px_0_#1c1917] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#1c1917] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1c1917]";
const BTN_LIGHT = `${BTN_BASE} bg-white text-stone-900`;
const BTN_LIME = `${BTN_BASE} bg-lime-400 text-stone-900`;
const BTN_RED = `${BTN_BASE} bg-red-500 text-white`;
const BTN_DARK = `${BTN_BASE} bg-stone-900 text-white shadow-[4px_4px_0_#78716c] hover:shadow-[3px_3px_0_#78716c] active:shadow-none`;
const STICKER =
  "inline-block font-mono text-xs font-bold tracking-widest uppercase";
const initialSummary = (m: number): SolveSummary => ({
  status: "idle",
  algorithm: selectAlgorithm(Math.max(m, 1)),
  timeMs: 0,
  iterations: 0,
  message: "",
  graceful: false,
  nearMiss: false,
  bestCost: undefined,
  verifyReason: "",
  complete: false,
  runCount: 0,
  stage: "",
  liveTicks: 0,
});
export function TreeEditor() {
  const [graph, setGraph] = useState<TreeGraph>(() =>
    layoutTree(makeSingleNode()),
  );
  const [mode, setMode] = useState<Mode>("add");
  const [selectedId, setSelectedId] = useState<number | null>(0);
  const [labels, setLabels] = useState<Record<number, number> | null>(null);
  const [edgeLabels, setEdgeLabels] = useState<Record<number, number>>({});
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [timeLimitMs, setTimeLimitMs] = useState(15000);
  const [summary, setSummary] = useState<SolveSummary>(() => initialSummary(1));
  const [history, setHistory] = useState<TreeGraph[]>([]);
  const nextId = useRef(1);
  const nextEdgeId = useRef(0);
  const runId = useRef(0);
  const dragId = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const dragSnapshot = useRef<TreeGraph | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastTickPaint = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const preRunSummary = useRef<SolveSummary | null>(null);
  const summaryRef = useRef<SolveSummary>(summary);
  summaryRef.current = summary;
  const m = graph.nodes.length;
  const expectedAlgorithm = useMemo(() => selectAlgorithm(Math.max(m, 1)), [m]);
  const pushHistory = useCallback((prev: TreeGraph) => {
    setHistory((h) => [...h.slice(-49), prev]);
  }, []);
  const clearSolution = useCallback(() => {
    runId.current++;
    setLabels(null);
    setEdgeLabels({});
  }, []);
  const reseedCounters = useCallback((g: TreeGraph) => {
    nextId.current = g.nodes.reduce((mx, n) => Math.max(mx, n.id), -1) + 1;
    nextEdgeId.current = g.edges.reduce((mx, e) => Math.max(mx, e.id), -1) + 1;
  }, []);
  const loadGraph = useCallback(
    (g: TreeGraph) => {
      pushHistory(graph);
      setGraph(g);
      reseedCounters(g);
      setSelectedId(g.nodes[0]?.id ?? null);
      clearSolution();
      setSummary(initialSummary(g.nodes.length));
    },
    [clearSolution, graph, pushHistory, reseedCounters],
  );
  const addChild = useCallback(
    (parentId: number) => {
      if (graph.nodes.length >= MAX_NODES) return;
      const parent = graph.nodes.find((n) => n.id === parentId);
      if (!parent) return;
      const siblings = graph.edges.filter(
        (e) => e.a === parentId || e.b === parentId,
      ).length;
      const id = nextId.current++;
      const pos = childPosition(parent, siblings, graph.nodes);
      const node: TreeNode = { id, ...pos };
      const edge: TreeEdge = { id: nextEdgeId.current++, a: parentId, b: id };
      pushHistory(graph);
      setGraph({
        nodes: [...graph.nodes, node],
        edges: [...graph.edges, edge],
      });
      setSelectedId(id);
      clearSolution();
      setSummary((s) => ({ ...initialSummary(m + 1), liveTicks: s.liveTicks }));
    },
    [clearSolution, graph, m, pushHistory],
  );
  const deleteNode = useCallback(
    (nodeId: number) => {
      if (graph.nodes.length <= 1) {
        pushHistory(graph);
        setGraph({ nodes: [], edges: [] });
        nextId.current = 0;
        nextEdgeId.current = 0;
        setSelectedId(null);
        clearSolution();
        setSummary(initialSummary(0));
        return;
      }
      const keepRoot = graph.nodes[0]?.id;
      const survivors = new Set<number>();
      const start =
        keepRoot === nodeId
          ? (graph.nodes.find((n) => n.id !== nodeId)?.id ?? null)
          : (keepRoot ?? null);
      if (start !== null) {
        const adj = new Map<number, number[]>();
        for (const n of graph.nodes) adj.set(n.id, []);
        for (const e of graph.edges) {
          adj.get(e.a)?.push(e.b);
          adj.get(e.b)?.push(e.a);
        }
        const q = [start];
        survivors.add(start);
        while (q.length > 0) {
          const u = q.pop()!;
          for (const w of adj.get(u) ?? []) {
            if (w === nodeId || survivors.has(w)) continue;
            survivors.add(w);
            q.push(w);
          }
        }
      }
      if (survivors.size === 0) {
        for (const n of graph.nodes) if (n.id !== nodeId) survivors.add(n.id);
      }
      pushHistory(graph);
      setGraph({
        nodes: graph.nodes.filter((n) => survivors.has(n.id)),
        edges: graph.edges.filter(
          (e) => survivors.has(e.a) && survivors.has(e.b),
        ),
      });
      setSelectedId((sel) =>
        sel !== null && survivors.has(sel) ? sel : (start ?? null),
      );
      clearSolution();
      setSummary((s) => ({
        ...s,
        status: "idle",
        message: "",
        graceful: false,
      }));
    },
    [clearSolution, graph, pushHistory],
  );
  const undo = useCallback(() => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setGraph(prev);
    setHistory(history.slice(0, -1));
    reseedCounters(prev);
    setSelectedId((sel) =>
      sel !== null && prev.nodes.some((n) => n.id === sel)
        ? sel
        : (prev.nodes[0]?.id ?? null),
    );
    clearSolution();
    setSummary(initialSummary(prev.nodes.length));
  }, [clearSolution, history, reseedCounters]);
  const autoLayout = useCallback(() => {
    pushHistory(graph);
    setGraph(layoutTree(graph, selectedId ?? undefined));
  }, [graph, pushHistory, selectedId]);
  const runSolve = useCallback(
    async (warm: boolean) => {
      const { adj, indexOf, nodeIds } = toAdjList(graph);
      if (adj.length === 0) return;
      let initialLabels: number[] | undefined;
      if (warm) {
        const arr = nodeIds.map((id) => labels?.[id]);
        if (arr.some((v) => v === undefined)) return;
        initialLabels = arr as number[];
      }
      const myRun = ++runId.current;
      const controller = new AbortController();
      abortRef.current = controller;
      preRunSummary.current = { ...summary };
      const base = warm
        ? {
            iterations: summary.iterations,
            timeMs: summary.timeMs,
            runs: summary.runCount,
          }
        : { iterations: 0, timeMs: 0, runs: 0 };
      const primaryAlgo: AlgorithmId = warm
        ? "stochastic-local-search"
        : selectAlgorithm(adj.length);
      setSummary({
        status: "solving",
        algorithm: primaryAlgo,
        timeMs: base.timeMs,
        iterations: base.iterations,
        message: "",
        graceful: false,
        nearMiss: warm,
        bestCost: warm ? summary.bestCost : undefined,
        verifyReason: "",
        complete: false,
        runCount: base.runs,
        stage: warm
          ? "Continuing stochastic search from closest attempt"
          : ALGORITHM_LABELS[primaryAlgo],
        liveTicks: base.iterations,
      });
      if (!warm) {
        setLabels(null);
        setEdgeLabels({});
      }
      lastTickPaint.current = 0;
      const result = await solveGraceful(adj, {
        timeLimitMs,
        algorithm: warm ? "stochastic-local-search" : undefined,
        initialLabels,
        signal: controller.signal,
        onTick: (t) => {
          if (runId.current !== myRun) return;
          const now = Date.now();
          if (now - lastTickPaint.current > 250) {
            lastTickPaint.current = now;
            setSummary((s) =>
              s.status === "solving"
                ? { ...s, liveTicks: base.iterations + t }
                : s,
            );
          }
        },
        onStage: () => {
          if (runId.current !== myRun) return;
          setSummary((s) =>
            s.status === "solving"
              ? {
                  ...s,
                  algorithm: "stochastic-local-search",
                  stage: "Stochastic fallback (simulated annealing + repair)",
                }
              : s,
          );
        },
      });
      if (abortRef.current === controller) abortRef.current = null;
      if (runId.current !== myRun) return;
      if (result.labeling) {
        const byId: Record<number, number> = {};
        result.labeling.forEach((f, i) => {
          const id = nodeIds[i];
          if (id !== undefined) byId[id] = f;
        });
        const keyOf = (x: number, y: number) =>
          x < y ? `${x}:${y}` : `${y}:${x}`;
        const editorKeyToId = new Map<string, number>();
        for (const e of graph.edges) {
          const a = indexOf.get(e.a);
          const b = indexOf.get(e.b);
          if (a !== undefined && b !== undefined)
            editorKeyToId.set(keyOf(a, b), e.id);
        }
        const eLabels: Record<number, number> = {};
        result.edges.forEach(([a, b], i) => {
          const id = editorKeyToId.get(keyOf(a, b));
          const d = result.edgeLabels?.[i];
          if (id !== undefined && d !== undefined) eLabels[id] = d;
        });
        const check = verifyGraceful(adj, result.labeling);
        setLabels(byId);
        setEdgeLabels(eLabels);
        const mismatch = result.graceful && !check.graceful;
        setSummary({
          status: check.graceful ? "solved" : "failed",
          algorithm: result.algorithm,
          timeMs: base.timeMs + result.timeMs,
          iterations: base.iterations + result.iterations,
          message: mismatch
            ? `Solver output failed verification: ${check.reason}`
            : result.message,
          graceful: check.graceful,
          nearMiss: !check.graceful,
          bestCost: result.bestCost,
          verifyReason: check.reason,
          complete: result.complete,
          runCount: base.runs + 1,
          stage: "",
          liveTicks: base.iterations + result.iterations,
        });
      } else {
        setSummary({
          status: "failed",
          algorithm: result.algorithm,
          timeMs: base.timeMs + result.timeMs,
          iterations: base.iterations + result.iterations,
          message: result.message,
          graceful: false,
          nearMiss: false,
          bestCost: result.bestCost,
          verifyReason: "",
          complete: result.complete,
          runCount: base.runs + 1,
          stage: "",
          liveTicks: base.iterations + result.iterations,
        });
      }
    },
    [graph, labels, summary, timeLimitMs],
  );
  const cancelSearch = useCallback(() => {
    if (summaryRef.current.status !== "solving") return;
    abortRef.current?.abort();
    abortRef.current = null;
    runId.current++;
    const snap = preRunSummary.current;
    preRunSummary.current = null;
    if (snap) setSummary(snap);
  }, []);
  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }, []);
  const onNodePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, id: number) => {
      e.stopPropagation();
      if (summary.status === "solving") return;
      if (mode === "add") {
        addChild(id);
        return;
      }
      if (mode === "delete") {
        deleteNode(id);
        return;
      }
      setSelectedId(id);
      dragId.current = id;
      dragMoved.current = false;
      dragSnapshot.current = graph;
      (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
    },
    [addChild, deleteNode, graph, mode, summary.status],
  );
  const onNodePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const id = dragId.current;
      if (id === null) return;
      if (!dragMoved.current) {
        dragMoved.current = true;
        if (dragSnapshot.current) pushHistory(dragSnapshot.current);
      }
      const p = toSvgPoint(e.clientX, e.clientY);
      const x = Math.min(Math.max(p.x, 24), CANVAS_W - 24);
      const y = Math.min(Math.max(p.y, 24), CANVAS_H - 24);
      setGraph((prev) => ({
        nodes: prev.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
        edges: prev.edges,
      }));
    },
    [pushHistory, toSvgPoint],
  );
  const endDrag = useCallback(() => {
    if (dragId.current !== null) {
      dragId.current = null;
      dragSnapshot.current = null;
      if (dragMoved.current) {
        dragMoved.current = false;
        clearSolution();
        setSummary((s) => ({
          ...s,
          status: "idle",
          message: "",
          graceful: false,
        }));
      }
    }
  }, [clearSolution]);
  const solving = summary.status === "solving";
  const unlimited = !Number.isFinite(timeLimitMs);
  const budgetLabel = unlimited ? "+∞" : `+${(timeLimitMs / 1000).toFixed(0)}s`;
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const canContinue = summary.nearMiss && labels !== null && !solving && m > 0;
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border-[3px] border-stone-900 bg-white shadow-[4px_4px_0_#1c1917]">
          {(
            [
              ["add", "+ ADD BRANCH"],
              ["move", "✥ MOVE"],
              ["delete", "✕ DELETE"],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-4 py-2 font-mono text-sm font-bold tracking-wide transition ${
                mode === value
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-900 hover:bg-amber-200"
              } ${value !== "add" ? "border-l-[3px] border-stone-900" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => selectedId !== null && addChild(selectedId)}
          disabled={solving || selectedId === null || m >= MAX_NODES}
          className={`${BTN_LIGHT} px-4 py-2 text-sm`}
        >
          + Child to selected
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={solving || history.length === 0}
          className={`${BTN_LIGHT} px-4 py-2 text-sm`}
        >
          ↩ Undo
        </button>
        <button
          type="button"
          onClick={autoLayout}
          disabled={solving || m === 0}
          className={`${BTN_LIGHT} px-4 py-2 text-sm`}
        >
          Auto-layout
        </button>
        <button
          type="button"
          onClick={() => loadGraph(layoutTree(makeSingleNode()))}
          disabled={solving}
          className={`${BTN_BASE} bg-red-400 px-4 py-2 text-sm text-stone-900`}
        >
          Clear
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 border-b-[3px] border-stone-900 bg-amber-200 px-4 py-2 font-mono text-xs font-bold">
            <span>
              {m === 0
                ? "EMPTY CANVAS — START A NEW TREE"
                : `${m} VERTICES · ${m - 1} EDGES · CLICK A VERTEX TO ${
                    mode === "add"
                      ? "GROW A BRANCH"
                      : mode === "delete"
                        ? "PRUNE IT"
                        : "SELECT / DRAG IT"
                  }`}
            </span>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showEdgeLabels}
                onChange={(e) => setShowEdgeLabels(e.target.checked)}
                className="h-4 w-4 rounded-none accent-stone-900"
              />
              EDGE LABELS
            </label>
          </div>
          {m === 0 ? (
            <div className="flex h-[420px] flex-col items-center justify-center gap-4">
              <p className="border-[3px] border-dashed border-stone-900 px-4 py-2 font-mono text-sm font-bold">
                NO TREE YET
              </p>
              <button
                type="button"
                onClick={() => loadGraph(layoutTree(makeSingleNode()))}
                className={`${BTN_LIME} px-6 py-2`}
              >
                ★ Start new tree
              </button>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className={`h-auto w-full touch-none bg-white select-none ${
                mode === "add"
                  ? "cursor-copy"
                  : mode === "delete"
                    ? "cursor-not-allowed"
                    : "cursor-default"
              }`}
              onPointerMove={onNodePointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onPointerDown={() => {
                if (mode === "move") setSelectedId(null);
              }}
            >
              <defs>
                <pattern
                  id="gt-grid"
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1.5" cy="1.5" r="1.5" fill="#d6cdb4" />
                </pattern>
              </defs>
              <rect
                x={0}
                y={0}
                width={CANVAS_W}
                height={CANVAS_H}
                fill="url(#gt-grid)"
              />

              {graph.edges.map((e) => {
                const a = nodeById.get(e.a);
                const b = nodeById.get(e.b);
                if (!a || !b) return null;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                const d = edgeLabels[e.id];
                return (
                  <g key={e.id}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={INK}
                      strokeWidth={3}
                    />
                    {showEdgeLabels && d !== undefined && (
                      <g transform={`translate(${mx},${my})`}>
                        <rect
                          x={-14}
                          y={-12}
                          width={28}
                          height={24}
                          fill="#fbbf24"
                          stroke={INK}
                          strokeWidth={2}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={13}
                          fontWeight={900}
                          fill={INK}
                        >
                          {d}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {graph.nodes.map((n) => {
                const f = labels?.[n.id];
                const isSel = n.id === selectedId;
                const nodeFill =
                  f === undefined
                    ? "#ffffff"
                    : summary.nearMiss
                      ? "#fbbf24"
                      : "#a3e635";
                return (
                  <g key={n.id}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={22}
                      fill={nodeFill}
                      stroke={isSel ? "#4f46e5" : INK}
                      strokeWidth={isSel ? 5 : 3}
                      className={
                        mode === "move"
                          ? "cursor-grab active:cursor-grabbing"
                          : undefined
                      }
                      onPointerDown={(e) => onNodePointerDown(e, n.id)}
                    />
                    <text
                      x={n.x}
                      y={n.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={f !== undefined ? 15 : 12}
                      fontWeight={900}
                      fill={INK}
                      pointerEvents="none"
                    >
                      {f ?? n.id}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          <div className="border-t-[3px] border-stone-900 bg-white px-4 py-2 text-xs leading-relaxed font-medium">
            <span className="bg-lime-300 px-1 font-bold">ADD BRANCH</span> grows
            a leaf on the clicked vertex ·{" "}
            <span className="bg-sky-300 px-1 font-bold">MOVE</span> drags
            vertices · <span className="bg-red-300 px-1 font-bold">DELETE</span>{" "}
            prunes the clicked branch. Node numbers are internal ids — they turn
            into graceful labels after solving.
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className={CARD + " p-4"}>
            <h2 className={`${STICKER} bg-violet-300 px-2 py-0.5`}>
              ▚ Starter trees
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={solving}
                  onClick={() => loadGraph(ex.make())}
                  title={ex.hint}
                  className={`${BTN_LIGHT} px-3 py-2 text-left text-sm`}
                >
                  {ex.label}
                  <span className="block font-mono text-xs font-normal">
                    {ex.hint}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={solving}
                onClick={() =>
                  loadGraph(makeRandomTree(65, Date.now() % 2 ** 31))
                }
                className={`${BTN_LIGHT} px-3 py-2 text-left text-sm`}
              >
                Random · 65
                <span className="block font-mono text-xs font-normal">
                  uses AC-3
                </span>
              </button>
              <button
                type="button"
                disabled={solving}
                onClick={() =>
                  loadGraph(makeRandomTree(120, Date.now() % 2 ** 31))
                }
                className={`${BTN_LIGHT} px-3 py-2 text-left text-sm`}
              >
                Random · 120
                <span className="block font-mono text-xs font-normal">
                  uses local search
                </span>
              </button>
            </div>
          </div>

          <div className={CARD + " p-4"}>
            <h2 className={`${STICKER} bg-lime-300 px-2 py-0.5`}>
              ⚙ Graceful labeling
            </h2>
            <p className="mt-2 text-xs leading-relaxed font-medium">
              Solver for this tree:{" "}
              <span className="bg-stone-900 px-1 font-bold text-white">
                {ALGORITHM_LABELS[expectedAlgorithm]}
              </span>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <label
                htmlFor="gt-budget"
                className="font-mono text-xs font-bold"
              >
                BUDGET
              </label>
              <select
                id="gt-budget"
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(Number(e.target.value))}
                disabled={solving}
                className="border-[3px] border-stone-900 bg-white px-2 py-1 font-mono text-sm font-bold disabled:opacity-40"
              >
                <option value={5000}>5 seconds</option>
                <option value={15000}>15 seconds</option>
                <option value={30000}>30 seconds</option>
                <option value={Infinity}>☠ DANGEROUS · ∞</option>
              </select>
            </div>
            {unlimited && !solving && (
              <p className="mt-2 border-[3px] border-stone-900 bg-red-500 p-2 font-mono text-[11px] font-bold text-white">
                ☠ DANGEROUS: NO TIME LIMIT. THE SEARCH RUNS UNTIL IT FINDS A
                LABELING — OR YOU HIT CANCEL.
              </p>
            )}
            <button
              type="button"
              onClick={() => void runSolve(false)}
              disabled={solving || m === 0}
              className={`${BTN_LIME} mt-3 w-full px-6 py-3 text-lg`}
            >
              {solving
                ? `SEARCHING… ${summary.liveTicks.toLocaleString()}`
                : "▶ Find graceful labeling"}
            </button>

            {summary.status === "solving" && (
              <div className="mt-3">
                <div className="h-3 overflow-hidden border-2 border-stone-900 bg-white">
                  <div className="h-full w-1/3 animate-pulse bg-lime-400" />
                </div>
                <p className="mt-1 font-mono text-xs font-bold">
                  {summary.runCount > 0
                    ? `SEARCH #${summary.runCount + 1} · `
                    : ""}
                  {summary.stage}…
                </p>
                {unlimited && (
                  <p className="mt-1 inline-block border-2 border-stone-900 bg-red-500 px-1 font-mono text-[11px] font-bold text-white">
                    ☠ UNLIMITED — CANCEL TO STOP
                  </p>
                )}
                <button
                  type="button"
                  onClick={cancelSearch}
                  className={`${BTN_RED} mt-2 w-full px-4 py-2 text-sm`}
                >
                  ■ Cancel search
                </button>
              </div>
            )}

            {(summary.status === "solved" || summary.status === "failed") && (
              <div
                className={`mt-3 border-[3px] border-stone-900 p-3 text-sm leading-relaxed ${summary.graceful ? "bg-lime-200" : "bg-amber-200"}`}
              >
                <p className="font-black">
                  {summary.graceful
                    ? "✓ GRACEFUL LABELING FOUND"
                    : summary.complete
                      ? "✕ PROVEN: NO LABELING EXISTS"
                      : summary.nearMiss
                        ? `CLOSEST ATTEMPT — NOT GRACEFUL (${summary.bestCost} DUPLICATE${summary.bestCost === 1 ? "" : "S"})`
                        : "NO LABELING FOUND"}
                </p>
                {summary.runCount > 1 && (
                  <p className="mt-1 inline-block border-2 border-stone-900 bg-white px-1 font-mono text-[11px] font-bold">
                    AFTER {summary.runCount} SEARCHES
                  </p>
                )}
                <p className="mt-1 text-xs font-medium">{summary.message}</p>
                {!summary.graceful && summary.verifyReason && (
                  <p className="mt-1 font-mono text-xs">
                    CHECK: {summary.verifyReason}
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-xs">
                  <div className="border-2 border-stone-900 bg-white px-1 py-1.5">
                    <dt className="font-bold">TIME</dt>
                    <dd className="font-black">
                      {(summary.timeMs / 1000).toFixed(2)}s
                    </dd>
                  </div>
                  <div className="border-2 border-stone-900 bg-white px-1 py-1.5">
                    <dt className="font-bold">STEPS</dt>
                    <dd className="font-black">
                      {summary.iterations.toLocaleString()}
                    </dd>
                  </div>
                  <div className="border-2 border-stone-900 bg-white px-1 py-1.5">
                    <dt className="font-bold">M</dt>
                    <dd className="font-black">{m}</dd>
                  </div>
                </dl>
                <p className="mt-2 font-mono text-[11px] font-bold">
                  {ALGORITHM_LABELS[summary.algorithm]}
                </p>
                {!summary.graceful && !summary.complete && (
                  <p className="mt-1 text-[11px] font-medium">
                    The solvers are randomized — continuing keeps the closest
                    attempt and searches on. Larger budgets help stubborn trees.
                  </p>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {!summary.graceful && !summary.complete && canContinue && (
                    <button
                      type="button"
                      onClick={() => void runSolve(true)}
                      disabled={solving}
                      className={`${BTN_LIME} w-full px-4 py-2 text-sm`}
                    >
                      ↻ Continue search ({budgetLabel} from closest)
                    </button>
                  )}
                  {!summary.graceful && !summary.complete && (
                    <button
                      type="button"
                      onClick={() => void runSolve(false)}
                      disabled={solving}
                      className={`${BTN_LIGHT} w-full px-4 py-1.5 text-xs`}
                    >
                      Start over from scratch
                    </button>
                  )}
                  {(summary.graceful || summary.nearMiss) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearSolution();
                        setSummary(initialSummary(m));
                      }}
                      className={`${BTN_DARK} w-full px-4 py-1.5 text-xs`}
                    >
                      Show ids again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={CARD + " p-4 text-xs leading-relaxed font-medium"}>
            <h2 className={`${STICKER} bg-sky-300 px-2 py-0.5`}>
              ? What am I looking at?
            </h2>
            <p className="mt-2">
              A tree with m vertices is <strong>graceful</strong> if its
              vertices can be numbered 0…m−1 so that the m−1 edge differences{" "}
              <strong>|f(u) − f(v)|</strong> are exactly 1…m−1. Vertex numbers
              appear inside the nodes; edge differences appear on the edges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
