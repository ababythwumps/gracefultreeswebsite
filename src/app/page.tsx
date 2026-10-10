import { TreeEditor } from "~/app/_components/TreeEditor";
import { HydrateClient } from "~/trpc/server";
const ALGOS = [
  {
    level: "LVL 1 · m ≤ 30",
    title: "Backtracking + MRV",
    body: "Depth-first search that always branches on the vertex with the minimum remaining values, with forward checking on edge differences, max-diff-first value ordering, and complement-symmetry breaking. Complete: it can also prove ungracefulness — though no tree is known to be ungraceful.",
    box: "bg-lime-300",
  },
  {
    level: "LVL 2 · 31 ≤ m ≤ 100",
    title: "Constraint programming · AC-3",
    body: "Arc consistency (AC-3) over the vertex all-different constraint, forward checking of edge-difference conflicts against decided edges, and backtracking with MRV. Propagation prunes whole subtrees before they are ever explored.",
    box: "bg-amber-300",
  },
  {
    level: "LVL 3 · m > 100",
    title: "Stochastic local search",
    body: "Simulated annealing over label permutations (vertex injectivity comes for free), minimizing duplicate edge differences with focused swaps, goal-directed moves, steepest-descent repair sweeps, 2-ply deep repair, 3-cycle repair, and reheat-with-adaptive-kick. Incomplete but scales far beyond exhaustive search.",
    box: "bg-sky-300",
  },
];
export default async function Home() {
  return (
    <HydrateClient>
      <main className="gt-paper min-h-screen text-stone-900">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <header className="text-center">
            <p className="inline-block -rotate-1 border-[3px] border-stone-900 bg-lime-400 px-3 py-1 font-mono text-xs font-bold tracking-[0.3em] uppercase shadow-[4px_4px_0_#1c1917]">
              Interactive demo · Rosa 1967
            </p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-7xl">
              GRACEFUL{" "}
              <span className="inline-block rotate-1 border-[3px] border-stone-900 bg-amber-400 px-3 shadow-[6px_6px_0_#1c1917]">
                TREES
              </span>{" "}
              LAB
            </h1>
            <p className="mx-auto mt-6 max-w-2xl border-[3px] border-stone-900 bg-white p-4 text-base leading-relaxed font-medium shadow-[6px_6px_0_#1c1917] sm:text-lg">
              The <strong>Graceful Trees Conjecture</strong> claims every tree
              admits a graceful labeling — vertex numbers 0…m−1 whose edge
              differences are exactly 1…m−1. Grow your own tree below and watch
              a solver prove it graceful.
            </p>
          </header>

          <section className="mt-10">
            <TreeEditor />
          </section>

          <section className="mt-12">
            <h2 className="inline-block border-[3px] border-stone-900 bg-stone-900 px-3 py-1 font-mono text-sm font-bold tracking-widest text-white uppercase">
              ★ The solver roster ★
            </h2>
            <div className="mt-4 grid gap-5 md:grid-cols-3">
              {ALGOS.map((a) => (
                <div
                  key={a.title}
                  className={`border-[3px] border-stone-900 ${a.box} p-5 shadow-[6px_6px_0_#1c1917]`}
                >
                  <p className="inline-block border-2 border-stone-900 bg-white px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest">
                    {a.level}
                  </p>
                  <h3 className="mt-2 text-lg font-black">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed font-medium">
                    {a.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 border-[3px] border-stone-900 bg-white p-5 shadow-[6px_6px_0_#1c1917]">
            <h2 className="text-lg font-black">
              <span className="bg-pink-300 px-1">
                THE CONJECTURE, PRECISELY
              </span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed font-medium">
              A labeling f of a graph with m vertices and e edges is{" "}
              <em>graceful</em> if f is an injection V → {"{0, …, e}"} and the
              induced edge labels |f(u) − f(v)| are all distinct. For a tree, e
              = m − 1, so the edge labels must be exactly 1…m−1. Alexander Rosa
              introduced graceful labelings in 1967 and conjectured that all
              trees are graceful. It remains open: it is verified
              computationally only up to 35 vertices. Every tree you build here
              with more than 35 vertices is, strictly speaking, an experiment on
              an unsolved problem.
            </p>
          </section>

          <footer className="mt-10 border-t-[3px] border-stone-900 pt-6 text-center font-mono text-xs font-bold tracking-wide">
            GRACEFUL TREES LAB · SOLVERS RUN IN YOUR BROWSER · CONJECTURE OPEN
            SINCE 1967
          </footer>
        </div>
      </main>
    </HydrateClient>
  );
}
