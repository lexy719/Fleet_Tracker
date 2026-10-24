# Engineering continuously recomposing web interfaces: layout engines, morphing/animation, and MapLibre map performance in React (React 19.x + Vite + TS)

Research date: 2026-10-18. Versions current at time of research (verify before pinning): React 19.3 (blog 2026-09-09), Motion 14.3.0 (2026-10-15), MapLibre GL JS 6.x (official examples load 6.14.0), react-map-gl 8.1.x, React Compiler 1.0 (2025-10-07). Items marked **[OUTDATED?]** or **[UNVERIFIED]** need checking.

---

## 1. Layout algorithms for dynamic dashboards: stable/ordered treemaps, constraint layout, CSS Grid, masonry, bin packing, overlap removal. Trade-offs: stability vs aspect ratio vs computation

### Takeaway
There is a proven, quantified trade-off: algorithms that re-sort by weight (squarified, approximation) give the best aspect ratios but get unstable when weights change. Ordered and "state-aware" algorithms (Local Moves, Git, d3's `treemapResquarify`) stay stable, but their aspect ratios get worse as weights drift. Local Moves with a bounded number of moves per step (LM4) is the one algorithm that trades the two explicitly. For a single-screen operational UI with about 3–12 blocks, a small hand-rolled state-aware partition (a slicing tree or quantised grid, edited by a bounded number of local moves per commit) beats a general solver. Cassowary/kiwi is worth using only if designers need to state relational constraints ("map ≥ 50% width", "alerts stuck to the right edge") with priorities.

### Cited Findings

**Treemap stability research (the closest academic analogue to "blocks that resize as attention scores change")**
- Shneiderman & Wattenberg's 2001 ordered treemaps addressed "layout stability, where changes in the data set could result in dramatic discontinuous changes in the treemap layout". The paper later won the IEEE VIS Test of Time award — [HCIL UMD](https://www.hcil.umd.edu/?p=9715)
- Bederson, Shneiderman & Wattenberg, "Ordered and quantum treemaps", ACM TOG 21(4):833–854, 2002. Aspect-ratio-optimising algorithms "cause instability when data changes over time", lose the data order, and are hard to scan. Ordered algorithms keep input-sequence neighbours adjacent. Monte Carlo trials and stock-market data showed ordered treemaps were more stable with reasonable aspect ratios. *Quantum* treemaps force rectangles to integral multiples of an item size (used in PhotoMesa) — [UMIACS](https://umiacs.umd.edu/node/17312); [DRUM UMD](https://drum.lib.umd.edu/handle/1903/6486)
- Vernier, Sondag, Comba, Speckmann, Telea & Verbeek, "Quantitative Comparison of Time-Dependent Treemaps" (EuroVis 2020, CGF 39(3)) compared 14 rectangular algorithms on more than 2,000 datasets — [arXiv 1906.06014](https://arxiv.org/abs/1906.06014). It classifies them as follows:
  - **Unordered:** Squarified (SQR, Bruls et al.) and Approximation (APP, Nagamochi & Abe). APP has a guaranteed worst-case aspect-ratio bound, and SQR "often achieves near-optimal aspect ratios in practice".
  - **Ordered:** Pivot-by-Middle/Size/Split (PBM/PBZ/PBS), Strip (STR), Split (SPL), Spiral (SPI), Hilbert (HIL), Moore (MOO) and Slice-and-Dice (SND).
  - **State-aware:** Local Moves with 0 or 4 moves per step (LM0, LM4), and Git (GIT).
  - Source for this classification and all findings below — [Vernier et al. 2020 PDF](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf)
- Key findings from the same paper — [Vernier et al. 2020 PDF](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf):
  - **Why unordered algorithms flip:** "the sorted order of the weights may change rapidly over time, especially if the weights change much over time or if the weight variance is low", which hurts stability. Unordered treemaps are "more sensitive" to weight variance in stability because they reorder when weights are close.
  - **Ordered algorithms:** "relatively stable over time compared to unordered treemaps", but their visual quality suffers with high weight variance, because large rectangles end up next to small ones.
  - **State-aware algorithms:** they reuse the previous layout. Their stability is "relatively unaffected by frequent weight changes", but "the visual quality of state-aware treemaps will decrease over time if weights change significantly".
  - **Weight change:** for stateless algorithms, "the stability however decreases quickly" while visual quality is unaffected. For state-aware ones, "the stability is largely unaffected, but the visual quality decreases". "LM4 makes an explicit tradeoff between stability and visual quality."
  - **Hierarchy depth:** more levels mean more stability but lower visual quality for most algorithms.
  - **What counts as instability:** the paper's operational definition is "large layout changes that are not caused by large data changes". It measures this against a *baseline treemap*: the old combinatorial layout refitted to the new areas.
  - **Stability metrics:** absolute ones (corner-travel distance) and relative ones (relative position change between rectangle pairs, from Sondag et al.). The two correlate clearly on more than 2,000 datasets.
  - **Aspect-ratio perception:** visual quality is bounded 0–1. A value of 0.25 is "perceptually much worse" than 0.5 (a 2:1 rectangle) and approaches the "extreme aspect ratios" of 4.5 from Kong et al. Minimising aspect ratio is strongly NP-complete (De Berg et al.).
  - **Runtime:** not measured, because the implementations were not equally optimised.
- Sondag's TU/e thesis (Local Moves): it updates an existing layout "through local modifications instead of recomputing it from scratch". This gives "direct control over the stability" and enables non-sliceable layouts of potentially higher visual quality — [IPA TU/e](https://ipa.win.tue.nl/?p=1515)
- SizePairs (Han et al., IEEE VIS 2022) claims better visual quality and stability than existing techniques and is faster than Local Moves (per its abstract) — [IEEE VIS 2022](https://content.ieeevis.org/year/2022/paper_v-full-1163.html)
- d3 ships a practical stable variant. `d3.treemapResquarify` "preserves the topology (node adjacencies) of the previous layout … good for animating changes to treemaps because it only changes node sizes and not their relative positions, thus avoiding distracting shuffling and occlusion. The downside … is a suboptimal layout for subsequent updates: only the first layout uses the Bruls et al. squarified algorithm." The default squarify ratio is the golden ratio φ, after Kong et al. `treemapSliceDice` alternates slicing by depth — [d3-hierarchy treemap](https://d3js.org/d3-hierarchy/treemap)

**Constraint layout (Cassowary / kiwi / Auto Layout)**
- The original `kiwi.js` npm package is marked unmaintained and points to **`@lume/kiwi`**, a TypeScript Cassowary implementation — [npm kiwi.js](https://www.npmjs.com/package/kiwi.js); [lume/kiwi](https://github.com/lume/kiwi)
- `@lume/kiwi` API: `Solver`, `Variable`, `Expression`, `Constraint(expr, Operator.Eq|Le|Ge, strength)`, `solver.addEditVariable(v, Strength.strong)`, `solver.suggestValue(v, x)`, `solver.updateVariables()`, `v.value()`. README sample benchmarks: creation about 26k ops/s vs about 2.6k for Cassowary.js (about 10x); solving about 595k vs 260k ops/s (about 2.3x). These are self-reported samples — [lume/kiwi](https://github.com/lume/kiwi)
- Kiwi vs Cassowary — [kiwisolver internals](https://kiwisolver.readthedocs.io/en/stable/basis/solver_internals.html):
  - Kiwi drops Cassowary's lexicographic strength ordering in favour of floats. Strength = a·1e6 + b·1e3 + c, with weak = (0,0,1), medium = (0,1,0), strong = (1,0,0) and required = (1000,1000,1000).
  - It has no stay constraints. You emulate them with edit variables or with removable non-required equalities.
  - In rare cases many weak constraints can outweigh one medium constraint.
  - Removing constraints can leak variables, so reset the solver periodically.
- Cassowary is "particularly efficient at computing a new answer quickly based on the last-known solution when inputs change" (incremental re-solve) — [cassowary npm](https://npmjs.com/package/cassowary)
- How Apple Auto Layout (built on Cassowary) handles priorities and intrinsic size — [Apple Auto Layout Guide](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/AutolayoutPG/AnatomyofaConstraint.html):
  - **Constraint form:** `item1.attr = multiplier × item2.attr + constant`, with relations =, ≤, ≥.
  - **Priorities:** 1–1000, with required = 1000, high = 750, medium = 500 and low = 250. Use values one or two points off these to avoid ties.
  - **Unsatisfied optional constraints** still act as a "force" pulling toward their value.
  - **Intrinsic content size:** expressed as content hugging (default 250) and compression resistance (default 750). Prefer 999 over 1000 as an "emergency pressure valve".
  - **Guidance:** "it's usually better for a view to be the wrong size than for it to accidentally create a conflict."

**CSS Grid with dynamic tracks / animating grid-template**
- Interpolating `grid-template-columns`/`-rows` (transition or keyframes between track lists) is supported in Chrome/Edge 107+, Firefox 66+ and Safari 16+ — [web.dev CSS animated grid layouts](https://web.dev/articles/css-animated-grid-layouts)
- Animating to intrinsic sizes: `interpolate-size: allow-keywords` and `calc-size()` are in Chrome/Edge 129. The Chrome doc lists Firefox and Safari as unsupported **[OUTDATED?]** — [Chrome for Developers](https://developer.chrome.com/docs/css-ui/animate-to-height-auto)
- Changing geometric properties (width/height/left/top) triggers layout, and "layout is almost always scoped to the entire document" — [web.dev layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)

**Masonry / grid packing**
- Native masonry is now `display: grid-lanes`. Safari 26.4 shipped it unflagged (March 2026). As of May 2026, Chromium (140+, behind a flag) and Firefox had prototypes but no stable release. Use `@supports` with a fallback. These are secondary blogs; verify on caniuse — [buildmvpfast](https://www.buildmvpfast.com/blog/css-grid-lanes-native-masonry-2026); [OpenReplay](https://blog.openreplay.com/css-grid-lanes-masonry-layout/)
- react-grid-layout v2 (2.2.x) — [RGL README v2.2.3](https://cdn.jsdelivr.net/npm/react-grid-layout@2.2.3/README.md); [RGL v2 RFC](https://raw.githubusercontent.com/STRML/react-grid-layout/HEAD/rfcs/0001-v2-typescript-rewrite.md):
  - Full TypeScript rewrite with hooks (`useContainerWidth`, `useGridLayout`, `useResponsiveLayout`); `width` is now required.
  - Pluggable compactors. The default (vertical) is still O(n²); an optional "rising tide" compactor is O(n log n) and may differ in edge cases.

**Overlap removal / force-style box layout**
- Dwyer, Marriott & Stuckey, "Fast Node Overlap Removal" (GD 2005). It removes overlaps while keeping nodes close to their original positions. It is O(n log n) when the number of nodes overlapping any one node is bounded, using generated separation constraints plus a VPSC solver. It is implemented in WebCola (JavaScript) — [Springer DOI](https://www.doi.org/10.1007/11618058_15); search summary of the [agorajs/umontpellier listing](https://esploro.umontpellier.fr/esploro/outputs/code/agorajs-implementation-of-the-Fast-Node/9936900209311)

### Inferences
- **Choose the algorithm class by block count and change rate.** FleetOS has few blocks (about 3–12) whose scores change continuously. That is the "high weight change" regime, where stateless algorithms (squarified, any "recompute from scores" CSS grid) are measurably unstable. Use a **state-aware** layout: keep the previous combinatorial structure (which block is left of or above which), refit sizes on every commit, and allow at most *k* structural "local moves" per commit (LM-style, e.g. k = 1). Only re-run a full optimisation (squarified/APP) on explicit causes such as a user command, a new incident class, or quality falling below a floor.
- **Use a slicing tree as the core data structure.** Each internal node is a horizontal or vertical split with child weights. It maps 1:1 onto nested CSS Grid/flex tracks, and local moves are cheap tree edits: swap siblings, rotate a split, move a leaf to a neighbour, or promote a leaf to "signal". Track a quality metric per commit (min aspect ratio, worst block below its minimum size) and a stability metric (corner travel vs the baseline layout, à la Vernier et al.).
- **Quantise sizes.** Snap every block to a grid of N column/row units (e.g. 24 × 12 on a 1080p screen). This copies the "quantum treemap" idea. Small score changes then produce no layout change at all, which suppresses jitter (see §2).
- **Constraint solver: optional, not core.** Use @lume/kiwi only for designer-stated relations (min/max sizes, "map ≥ 0.45 × width", alignment) solved on top of the tree. Use strong/medium/weak strengths instead of required ones (cf. Apple's 999 advice). At 3–12 blocks a re-solve should be well under 1 ms, judging by the README throughput, but benchmark it yourself.
- **Overlap removal is for floating signals, not blocks.** Use VPSC/WebCola-style removal only for small "signal" chips placed on or next to the map (e.g. anchored to vehicles). Blocks in a partition cannot overlap by construction.
- **Masonry: probably skip.** Native masonry (`grid-lanes`) is not cross-browser in 2026, and masonry is a scrolling-feed pattern. A no-scroll operational screen is a partition problem, not masonry.

```ts
// Sketch: state-aware slicing tree with a bounded local-move budget
type Leaf = { kind: 'leaf'; id: string; weight: number; minW: number; minH: number };
type Split = { kind: 'split'; dir: 'row' | 'col'; children: Node[] };
type Node = Leaf | Split;

interface CommitPolicy { maxMovesPerCommit: number; minQuality: number; quantum: { cols: number; rows: number } }

function commit(prev: Node, targetWeights: Map<string, number>, policy: CommitPolicy): Node {
  // 1. Refit: keep topology, update weights (≈ d3.treemapResquarify / LM0)
  let next = refitWeights(prev, targetWeights);
  // 2. Only if quality < floor, try up to k local moves; pick the move that maximises
  //    quality - λ * cornerTravel(prevRects, nextRects)
  for (let i = 0; i < policy.maxMovesPerCommit && quality(next) < policy.minQuality; i++) {
    next = bestLocalMove(next, prev);
  }
  return quantise(next, policy.quantum); // snap to grid units → many score deltas become no-ops
}
```

### Gaps
- I could not retrieve the full text of Sondag et al., "Stable Treemaps via Local Moves" (IEEE TVCG 2018). The exact move set and its runtime are therefore unconfirmed here. Only the thesis abstract and the description in the EuroVis 2020 paper were read.
- I found no published runtime comparison of treemap algorithms. Vernier et al. explicitly did not measure runtime.
- I found no benchmark of animating `grid-template-*` with many tracks or deep subtrees (cost per frame on low-end GPUs/CPUs).
- I did not research `potpack`, d3-force `forceCollide`, or GridStack in depth.

---

## 2. Hysteresis, quantisation and debouncing to avoid layout thrashing/jitter when scores change continuously; settling rules ("move only on cause")

### Takeaway
The literature gives a precise criterion: instability means layout change that is *not caused by* a proportional data change (Vernier et al.). Dynamic map labeling adds consistency desiderata: no popping or flicker under monotone change, and no dependence on history beyond what is explained. Implement this as a pipeline: continuous scores → smoothing → quantisation → hysteresis thresholds with a minimum dwell time → a commit budget. Schedule commits as React Transitions (`startTransition` / `useDeferredValue`) so they are interruptible and never block input.

### Cited Findings
- Stability should measure "large layout changes that are not caused by large data changes". Large data changes legitimately allow large layout changes, so layout change is judged against a baseline refit of the previous layout — [Vernier et al. 2020](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf)
- Been, Daiches & Yap, "Dynamic Map Labeling" (InfoVis 2006), set out desiderata for consistent zoomable labeling — [Been et al. 2006](https://cs.nyu.edu/visual/home/pub/infovis06.pdf):
  - Avoid "label popping and other artifacts that cause confusion and interrupt navigation".
  - Except when sliding in or out of the view, labels should not vanish when zooming in or appear when zooming out.
- The commonly cited summary of those desiderata: no popping or flickering during monotone zooming, no jumping during animation, and labels depend only on the current view, not its history — [Gemsa, Nöllenburg, Rutter (arXiv 1404.1849)](https://arxiv.org/pdf/1404.1849)
- "Active ranges" approach: each label gets a single active scale range to avoid popping. The optimisation is NP-complete, with constant-factor approximations — [Been, Nöllenburg, Poon, Wolff](https://i11www.iti.kit.edu/extra/publications/bnpw-oarcd-10.pdf)
- A user study found that flickering and label popping may hurt legibility — [TU Wien repository entry](https://repositum.tuwien.at/handle/20.500.12708/15635?mode=full)
- Heer & Robertson (InfoVis 2007) — [UW IDL](https://idl.uw.edu/papers/animated-transitions); [UW CSE442 slides](https://courses.cs.washington.edu/courses/cse442/18au/lectures/CSE442-Animation.pdf):
  - Animated transitions can significantly improve graphical perception.
  - Complex transitions should be **staged**, e.g. scatter → dot plot → bars.
  - Axis rescaling hampers perception, and animations that violate data semantics can mislead.
- `useDeferredValue` is **not** debouncing — [React docs](https://react.dev/reference/react/useDeferredValue):
  - It has no fixed delay and adapts to device speed.
  - The background re-render is interruptible: React abandons it when a newer value arrives.
  - The slow child must be wrapped in `memo` for it to help.
  - Debounce/throttle "are still useful when the work happens outside rendering", and the two can be combined.
- In React 19.3, `<ViewTransition>` animations only run for updates marked as Transitions (`startTransition`, Suspense reveals, `useDeferredValue`). Urgent updates show immediately without animation. `addTransitionType` tells React *what caused* a transition, so the same state change can animate differently — [React 19.3 blog](https://react.dev/blog/2026/09/09/react-19-3)
- FLIP's premise: "There is a window of 100ms after someone interacts with your site where you're able to do work without them noticing." Precompute during idle time and keep two animations from interrupting each other — [Aerotwist FLIP](https://aerotwist.com/blog/flip-your-animations/)
- MapLibre's own Marker code is an example of settle-time quantisation. It skips pixel rounding during `move` events, because rounding on every move "causes stuttered zooming", and rounds only when movement stops. Terrain occlusion checks are throttled to once per 100 ms — [maplibre marker.ts](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/marker.ts)
- Symbol collision checking "can be computationally intensive, particularly when there are a lot of features". Relaxing overlap checks reduces the cost — [MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)

### Inferences
- **Recommended "move only on cause" pipeline** (heuristic design derived from the sources above, not a published standard):
  1. **Smooth:** exponential moving average on each block's raw attention score, with τ ≈ 2–5 s for ambient signals. Bypass smoothing for discrete events such as a new critical alert or a user click; these are *causes*.
  2. **Quantise:** map the smoothed score to a small set of **form levels**: `signal` (chip), `compact`, `normal`, `expanded`, `focus`. Sizes come in grid units per level, never continuous.
  3. **Hysteresis:** enter level L+1 when the score exceeds `up[L]`, but leave it only when the score drops below `down[L] = up[L] − margin` (a Schmitt-trigger pattern). Also require a **minimum dwell time** per level (e.g. 3–8 s) unless the cause is a user action.
  4. **Commit budget:** apply at most one structural change (a local move, split or fold) per commit, and at most one commit per ~0.6–1 s for ambient changes. User-initiated causes commit immediately. This mirrors LM4's bounded-move idea.
  5. **Cause tagging:** each commit carries a `cause` (`'user' | 'alert' | 'ambient' | 'schedule'`). Pass it to `addTransitionType(cause)` so ambient recompositions animate gently or not at all, while user-caused ones animate decisively.
  6. **Freeze during interaction:** do not apply ambient commits while the pointer is down, while a drag or map pan is in progress, or for ~1 s after the last interaction with a block. Queue them instead. This protects target acquisition.
- **Never animate the layout from raw per-frame scores.** Animate only between committed, quantised layouts. Continuous signals inside a block (counters, sparkline values) can update every frame through refs or motion values without touching layout (see §5).
- **Labels/signals on the map** follow Been et al.'s monotonicity rule: once a signal is shown for a vehicle, keep it until its cause disappears. Do not let it flicker with collision changes.

```ts
// Sketch: hysteresis + dwell + cause-aware commit scheduler
type Level = 0 | 1 | 2 | 3 | 4; // signal..focus
const UP   = [0.20, 0.40, 0.65, 0.85];
const DOWN = [0.12, 0.30, 0.55, 0.75]; // margin ≈ 0.08–0.10
const MIN_DWELL_MS = 4000;

function nextLevel(cur: Level, s: number, enteredAt: number, now: number, cause: string): Level {
  if (cause !== 'user' && now - enteredAt < MIN_DWELL_MS) return cur;
  if (cur < 4 && s > UP[cur]) return (cur + 1) as Level;
  if (cur > 0 && s < DOWN[cur - 1]) return (cur - 1) as Level;
  return cur;
}

// Commit as a Transition so React can interrupt it and <ViewTransition>/Motion can animate it
import { startTransition, addTransitionType } from 'react';
function commitLayout(next: LayoutPlan, cause: 'user' | 'alert' | 'ambient') {
  startTransition(() => {
    addTransitionType(cause);
    setLayoutPlan(next); // the ONLY React state that changes on recomposition
  });
}
```

### Gaps
- I found no empirical study that gives optimal hysteresis margins, dwell times or commit rates for adaptive dashboards. The numbers in the sketch are starting points to be tuned in user testing.
- I did not obtain the full Heer & Robertson paper, so its exact recommended durations and staging timings are not cited here.
- I found no sourced, current guidance on animation durations for operational UIs. The MapLibre example uses 1000 ms for a sidebar, which is probably too slow for frequent recomposition.

---

## 3. Animation/morphing: FLIP, View Transitions API (+ React `<ViewTransition>`), Motion layout/layoutId, react-spring, spring parameters, WAAPI, scale distortion and correction, reduced motion

### Takeaway
For blocks that grow, shrink, move, split and fold *while the rest of the screen stays interactive*, Motion's `layout`/`layoutId` (transform-based FLIP with scale correction, interruptible, velocity-preserving) is the safest default in 2026. React 19.3's stable `<ViewTransition>` is now a viable alternative, especially with Chrome 147's element-scoped transitions. Its trade-offs: transitions must be React Transitions, old states are static snapshots, and document-level transitions affect the whole page. The MapLibre canvas should be excluded from both mechanisms' scale transforms (see §4). Use near-critically-damped springs (bounce 0 or slightly negative) for an operational, non-playful feel, and honour `prefers-reduced-motion` via `MotionConfig reducedMotion="user"`.

### Cited Findings

**FLIP**
- FLIP (First, Last, Invert, Play) was published 11 Feb 2015 by Paul Lewis — [Aerotwist](https://aerotwist.com/blog/flip-your-animations/):
  - Measure First, apply the final state, measure Last, apply an inverting `transform`/`opacity`, then play to the identity.
  - It can be implemented with WAAPI `element.animate()` and cleaned up on `finish`.
  - Caveat: scaling distorts child content.
- If an animation needs properties other than transform/opacity, use FLIP to remap them onto transforms — [web.dev compositor-only](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)

**Motion (formerly Framer Motion): layout animations**
- `layout` animates any layout change caused by a React render, via `transform` rather than width/height — [Motion layout docs](https://motion.dev/docs/react-layout-animations):
  - Layout animations are parent-relative.
  - `layout="position"` animates only position and lets size snap; recommended for aspect-ratio changes of text and images.
  - `layoutId` enables shared-element transitions, cross-fading if both elements are mounted.
  - `LayoutGroup` syncs siblings that don't re-render together.
  - `layoutScroll` is for scroll containers and `layoutRoot` for `position: fixed` containers.
  - `layoutAnchor {x,y}` sets the anchor (since 12.38.0 per the changelog).
  - `transition.layout` gives the layout animation its own transition, and `transition.layout.path: arc()` curves the path. For shared transitions, the transition of the element being animated *to* is used.
- Scale correction — [Motion layout docs](https://motion.dev/docs/react-layout-animations):
  - "Children can distort during scale-based animation. Adding `layout` to direct children counter-scales them."
  - `borderRadius` and `boxShadow` are corrected automatically, but only when set via `style` or animation props.
  - Borders cannot be corrected below 1px and trigger layout. The workaround is a padded parent that acts as the border.
- Motion caveats — [Motion layout docs](https://motion.dev/docs/react-layout-animations):
  - Layout changes must come from a React re-render and be made through `style`/`className`, not `animate`.
  - `display: inline` elements don't animate.
  - SVG layout animation is unsupported.
  - Use `scrollbar-gutter: stable` to avoid scrollbar-induced animation.
  - "Layout animations are intentionally disabled during horizontal window resizes."
- Motion's own comparison: Motion is interruptible, doesn't block pointer events, supports simultaneous animations and is scroll-aware. View Transitions are screenshot cross-fades, "can't be interrupted, blocks interaction, is less performant with many elements". This is a vendor claim, partly superseded by element-scoped VT (see below) — [Motion layout docs](https://motion.dev/docs/react-layout-animations)
- Current Motion versions — [Motion changelog](https://motion.dev/changelog?lib=motion):
  - 14.3.0, released 2026-10-15.
  - 14.2.0: hardware-accelerated independent transforms (`x`, `y`, `scaleX`).
  - 14.1.0: `animateLayout` for vanilla JS; layout animations work inside dragged elements; "animations no longer jump after a main-thread stall".
  - 13.5.0: negative `bounce` for overdamped springs.
  - 13.4.0: `AnimateView` for React 19.3 view transitions.
- Install with `npm install motion` and import from `"motion/react"`. Requires React ≥ 18.2 — [Motion installation](https://motion.dev/docs/react-installation)
- `AnimateView` is a Motion+ (paid, early-access, alpha) component built on React's `ViewTransition`, imported from `motion-plus/animate-view` — [Motion AnimateView](https://motion.dev/docs/react-animate-view)

**Springs**
- Motion has two spring modes — [Motion transitions](https://motion.dev/docs/react-transitions):
  - **Physics-based:** `stiffness`/`damping`/`mass`. These "incorporate the velocity of existing gestures or animations".
  - **Duration-based:** `duration`/`bounce`, or `visualDuration`. These don't use velocity but can be generated as pure CSS.
  - `bounce: 0` = critically damped; negative = overdamped with no overshoot and the same arrival time.
  - `visualDuration` sets when the motion *visually* arrives.
  - `bounce`/`duration` are ignored if stiffness, damping or mass is set.
  - Defaults: `restSpeed` 0.1 and `restDelta` 0.01.
- **Conflict on Motion's default stiffness:** the transitions page lists the `stiffness` default as 1, while Motion's spring tutorial says the default is 100 (damping 10, mass 1). Popmotion, Motion's predecessor, also uses 100/10/1 — [Motion transitions](https://motion.dev/docs/react-transitions); contradicted by [Motion JS spring tutorial](https://motion.dev/tutorials/js-spring) and [Popmotion spring](https://www.popmotion.io/api/spring)
- react-spring presets (tension/friction, mass 1) — [react-spring constants.ts](https://raw.githubusercontent.com/pmndrs/react-spring/main/packages/core/src/constants.ts):

  | Preset | Tension | Friction |
  |---|---|---|
  | default | 170 | 26 |
  | gentle | 120 | 14 |
  | wobbly | 180 | 12 |
  | stiff | 210 | 20 |
  | slow | 280 | 60 |
  | molasses | 280 | 120 |

- Damping ratio ζ = c / (2√(km)). ζ < 1 overshoots and oscillates. ζ = 1 (critical) returns to equilibrium "in the minimum amount of time" without oscillating. ζ > 1 returns slowly without overshoot — [Wikipedia: Damping](https://en.wikipedia.org/wiki/Damping)

**View Transitions API**
- Same-document view transitions are Baseline Newly Available since Firefox 144 (2025-10-14). Firefox's support covers `document.startViewTransition`, `view-transition-name`, `view-transition-class`, `:active-view-transition` and `match-element`, and is part of the Interop 2025 focus area. Baseline lists Chrome 125, Firefox 144 and Safari 18 — [web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available). Chrome's own article says Chrome 111 — [Chrome 2025 update](https://developer.chrome.com/blog/view-transitions-in-2025)
- Feature status from Chrome's 2025 update — [Chrome VT 2025](https://developer.chrome.com/blog/view-transitions-in-2025):
  - `view-transition-name: match-element`: Chrome 137, Safari 18.4, Firefox 144.
  - Nested view-transition groups (preserve clipping and 3D): Chrome 140 only.
  - `finished` timing fix that prevents end-of-animation flicker: Chrome 140.
  - `document.activeViewTransition`: Chrome 142, Firefox 147, Safari 26.2.
  - Firefox's initial implementation lacked transition types.
- **Element-scoped view transitions** (`Element.startViewTransition()`) shipped in Chrome 147 stable (blog 2026-03-27) — [Chrome blog](https://developer.chrome.com/blog/element-scoped-view-transitions):
  - Multiple transitions can run concurrently and can nest.
  - "The rest of the page stays interactive."
  - Fixes `position: fixed` layering.
  - The scope root gets `contain: layout` and `view-transition-scope: all` during the transition.
  - Firefox/Safari status is not stated.
- Mechanics — [MDN Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using):
  - The old state is a static image snapshot that users can't interact with. The new state is a live snapshot.
  - Pseudo-tree: `::view-transition` > `::view-transition-group(name)` > `::view-transition-image-pair` > `-old`/`-new`.
  - Defaults: cross-fade, a "smooth scale" for width/height changes, and smooth movement for position/transform changes.
  - The transition is skipped if two rendered elements share a `view-transition-name`, or if the page is hidden.
- React `<ViewTransition>` — [React 19.3 blog](https://react.dev/blog/2026/09/09/react-19-3); [React Labs Apr 2025](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more):
  - Experimental in April 2025, **stable in React 19.3** (2026-09-09).
  - Animation types: `enter`, `exit`, `update` and `share` (a named VT removed in one place and added in another; names must be unique app-wide at any time).
  - Customisation: View Transition Classes in CSS, or imperative WAAPI via `onEnter`/`onExit`/`onShare`/`onUpdate`.
  - Transition types are also exposed to CSS through `:active-view-transition-type()`.
  - DOM only. The blog does not describe a fallback for browsers without the API.
- React 19.3 also made **Fragment refs** stable. A `FragmentInstance` offers `observeUsing`/`unobserveUsing` for `ResizeObserver`/`IntersectionObserver` and `getClientRects()` across a group of children without a wrapper. The changelog also notes "Transitions render independently" — [React 19.3 blog](https://react.dev/blog/2026/09/09/react-19-3)

**Reduced motion**
- `<MotionConfig reducedMotion="user">` follows the OS setting. It disables transform and layout animations but keeps opacity and background-colour animations. `"always"`/`"never"` override the OS setting. `useReducedMotion()` returns a boolean for custom logic, e.g. swapping a slide for a fade — [Motion accessibility](https://motion.dev/docs/react-accessibility)

### Inferences
- **Default stack for FleetOS blocks:** Motion `layout` on each block shell, plus `layout` on each block's *direct* content wrapper for scale correction. Use `layoutId` to morph a block into its folded "signal" chip and back. Make the morph a crossfade between two different forms sharing a `layoutId`; don't scale one DOM tree into another. Wrap all blocks in one `LayoutGroup`, and keep the only re-render per commit at the layout-plan level.
- **Spring choice for "calm" operational motion:** react-spring's default (170/26) works out to ζ = 26/(2√170) ≈ 1.00, i.e. effectively critically damped. "gentle" is ζ ≈ 0.64, "wobbly" ≈ 0.45 and "stiff" ≈ 0.69 (all overshoot); "slow" ≈ 1.79 and "molasses" ≈ 3.6 are overdamped. In Motion, `{ type: 'spring', visualDuration: 0.3–0.45, bounce: 0 }` (or `bounce: -0.1`) gives a predictable arrival time with no overshoot. Prefer physics springs (stiffness/damping) where interruption is common, since they keep velocity when a commit lands mid-animation.
- **Content distortion strategy:** text-heavy content should never be scaled.
  - (a) Use `layout` on direct children (counter-scale).
  - (b) Use `layout="position"` on text blocks so they translate while the shell resizes.
  - (c) For form changes (compact → expanded), render the new form immediately at its final size and cross-fade (opacity 0 → 1 over ~120–180 ms) while the shell animates.
  - Avoid CSS borders on animated shells; use an inset box-shadow or a padded parent.
- **When to prefer `<ViewTransition>`:**
  - Discrete, cause-tagged recompositions (e.g. "alert takes focus") where a browser-native morph is enough.
  - Suspense reveals.
  - Shared-element moves between distant DOM locations.
  - Always run them through `startTransition` + `addTransitionType(cause)`. Scope them per region with `Element.startViewTransition` on Chrome 147+ to keep the rest interactive.
- **Keep the map out of View Transitions:** a document-level VT would snapshot the WebGL canvas as a static image (old state), so the map would freeze or cross-fade. Neither VT nor Motion should apply scale to the map container.
- **Don't run both systems on the same element.** Motion `layout` and a VT `share` both animating one element will fight.
- **Reduced motion:** wrap the app in `<MotionConfig reducedMotion="user">`. For VT, add `@media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }`. With reduced motion, recompositions become instant layout swaps plus a short opacity fade, and the map camera uses `jumpTo` instead of `easeTo`.

```tsx
// Sketch: block shell with scale-corrected content and fold-to-signal morph
import { motion, LayoutGroup, AnimatePresence, MotionConfig } from 'motion/react';

const layoutSpring = { type: 'spring', visualDuration: 0.35, bounce: 0 } as const;

function Block({ id, form, children }: { id: string; form: 'signal' | 'compact' | 'expanded'; children: React.ReactNode }) {
  return form === 'signal' ? (
    <motion.button layoutId={`blk-${id}`} className="signal" transition={{ layout: layoutSpring }} />
  ) : (
    <motion.section layoutId={`blk-${id}`} className="block" style={{ borderRadius: 12 }}
                    transition={{ layout: layoutSpring }}>
      <motion.div layout="position" className="block-content">{children}</motion.div>
    </motion.section>
  );
}

export function Surface({ plan }: { plan: LayoutPlan }) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="surface" style={{ gridTemplateColumns: plan.cols, gridTemplateRows: plan.rows }}>
          {plan.blocks.map(b => <Block key={b.id} id={b.id} form={b.form}>{/* … */}</Block>)}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
```

### Gaps
- No benchmark compares Motion layout animation with View Transitions for N simultaneous blocks on low-end hardware. Motion's "less performant with many elements" claim about VT is vendor-sourced.
- Firefox and Safari support for element-scoped view transitions (Chrome 147) was not found.
- React's documented fallback for `<ViewTransition>` in browsers without the API was not found in the 19.3 post. Presumably the update applies without animation, but that is **[UNVERIFIED]**.
- The Motion default `stiffness` value conflicts between Motion's own pages (1 vs 100). Set it explicitly.
- `layoutDependency` was not documented on the fetched page.

---

## 4. MapLibre GL JS in a resizing container: cost of `map.resize()`, ResizeObserver, animating container size (transform vs width/height), camera framing with padding/fitBounds, DOM markers vs layers, WebGL context limits, react-map-gl vs custom wrappers

### Takeaway
Resizing the map canvas is not free. Every canvas size change clears the WebGL drawing buffer, and since PR #4632 (Sept 2024) MapLibre renders a full frame synchronously on every resize to avoid white flicker. Animating the map container's width/height per frame therefore means one canvas reallocation plus one synchronous full redraw per frame. Animating it with a `transform: scale` distorts the map and breaks pointer math. The officially demonstrated pattern is to keep the canvas size fixed and move the camera's focal area with `padding` (`easeTo({padding, duration})` synchronised with the UI animation). Render hundreds of vehicles as GeoJSON circle/symbol layers with `feature-state`, not DOM markers. Use one map instance (one WebGL context).

### Cited Findings
- `map.resize()` — [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/):
  - "Resizes the map to match its container"; it updates only if the size changed.
  - Fires `movestart`, `move`, `moveend` and `resize`.
  - With the default `trackResize: true`, size changes are detected automatically via the container's ResizeObserver, including hidden-to-visible changes.
  - Call it manually when `trackResize` is false or when the change isn't observable.
- The camera framing API — [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/):
  - `setPadding(padding)` is equivalent to `jumpTo({padding})`.
  - `easeTo` can animate `padding` along with center, zoom, bearing, pitch and roll.
  - `fitBounds` accepts `padding` (top/bottom/left/right).
  - `setPixelRatio(r)` overrides `devicePixelRatio`; the canvas becomes `clientWidth × r`. The applied ratio may be lower to respect `maxCanvasSize`.
  - `triggerRepaint()` coalesces to one frame; `redraw()` forces a synchronous redraw.
- Resize flicker history:
  - Issue #4158 (May 2024, v4.3.2): "White flickering of the map when resizing the window." Maintainer: "this has been a pain point from the dawn of history" — [GitHub #4158](https://github.com/maplibre/maplibre-gl-js/issues/4158)
  - The fix, PR #4632 (merged 2024-09-02): "Resizing the canvas clears it". The map now calls `redraw` (immediate render) whenever the canvas size changes, instead of the async `_update`. The author noted that rendering may run more often, with a possible performance impact — [GitHub PR #4632](https://github.com/maplibre/maplibre-gl-js/pull/4632)
- A CSSWG thread on canvas/WebGL and ResizeObserver: setting a canvas size in a ResizeObserver callback clears it after the rAF render but before compositing. Apps must then either draw from stale information or draw twice per frame — [CSSWG #9717 thread](https://lists.w3.org/Archives/Public/public-css-archive/2023Dec/0535.html)
- MapLibre v6.9.0 fixes — [v6.9.0 notes](https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.9.0):
  - A map created in a hidden container no longer stays at the 400×300 fallback size if shown before the first ResizeObserver notification (#8277).
  - Resizing to zero width no longer throws, and projections skip matrix maths at zero size (#8374).
  - It also contains main-thread stall reductions (OffscreenCanvas sprite readback, fewer redundant WebGL binds).
- The official MapLibre "Offset the vanishing point using padding" example (maplibre-gl@6.14.0) — [MapLibre example](https://maplibre.org/maplibre-gl-js/docs/examples/offset-the-vanishing-point-using-padding/):
  - Sidebars are absolutely positioned overlays animated with `transition: transform 1s`.
  - The camera calls `map.easeTo({ padding: { left: 300 }, duration: 1000 })`, matched to the CSS duration.
  - **The map container is never resized.**
- In the OpenStreetMap website's MapLibre migration, a race between a sidebar CSS transition and map resizing led to the suggestion to prompt the map after the transition finishes (`transitionend`) — [OSM rails-dev PR #6731](https://lists.openstreetmap.org/pipermail/rails-dev/2026-January/047165.html)
- ResizeObserver does not fire for CSS transforms (secondary explainers). MDN's `device-pixel-content-box` is measured "before applying any CSS transforms" — [SitePen](https://sitepen.com/blog/exploring-the-resize-observer-proposal); [Angular in Depth](https://angularindepth.com/article/observer-apis-in-javascript-part-ii/); [MDN observe()](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver/observe)
- Scaled ancestors (`transform: scale(n≠1)`) cause pointer interaction offsets in WebGL map engines (reported for Cesium). The common workaround is to set real width/height instead of scaling. No MapLibre-specific thread was found — [Cesium forum](https://community.cesium.com/t/is-there-a-standard-solution-for-interaction-issues-caused-by-transform-or-is-it-an-unexpected-bug/46065)
- **DOM markers:** every `Marker` listens to `move`, `moveend`, `terrain`, `projectiontransition` and `idle`, and rewrites `element.style.transform = translate(x,y)` on **every move event**. That is O(markers) DOM style writes per camera frame — [maplibre marker.ts](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/marker.ts)
- v6.8.0 clones the default Marker pin instead of rebuilding it, roughly halving constructor time for many default markers. This helps only construction, not per-move cost — [v6.8.0 notes](https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.8.0)
- A third-party Mapbox performance guide gives these thresholds: HTML markers are fine below about 100, symbol layers from about 100 to 10,000, and clustering above that **[secondary source]** — [mcpservers.org Mapbox patterns](https://mcpservers.org/de/agent-skills/mapbox/mapbox-web-performance-patterns). An OSM contributor notes symbol layers perform better, though interactivity is harder — [OSM rails-dev](https://lists.openstreetmap.org/pipermail/rails-dev/2025-December/046174.html)
- Mapbox GL JS guidance (MapLibre is a fork of Mapbox GL JS v1, so it largely applies) — [Mapbox performance guide](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/):
  - "Render time is a function of the number of sources, the number of layers, and the number of vertices."
  - Layers with the same type, source, filter and layout are grouped.
  - Any GeoJSON update reprocesses the whole source, so split static and dynamic data into separate sources.
  - Use `setFeatureState` for hover/selection instead of re-parsing geometry. It works only for data-driven *paint* properties.
- MapLibre's large-data guide — [MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/):
  - Cluster GeoJSON (`cluster: true`, `clusterRadius` default 50).
  - Relax symbol overlap checks.
  - Reduce layers.
  - Set the GeoJSON source `maxzoom` around 12 for points.
  - Load from a URL, chunk data, or convert to vector tiles.
- `GeoJSONSource.updateData` exists in MapLibre 6.x; v6.9.0 fixed queued `updateData` property removals — [v6.9.0 notes](https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.9.0)
- **WebGL context limits:** about 16 concurrent active contexts in major browsers. Creating more loses the oldest ("Too many active WebGL contexts. Oldest context will be lost"). The figure is community-reported; WebKit's patch cites other browsers' 16-context limit — [WebKit commit](https://webkit.googlesource.com/WebKit/+/70e10861eb2fbd9d0862fd8702874c25ae5d8bfd%5E%21); [Plotly forum](https://community.plotly.com/t/too-many-active-webgl-contexts/16379)
- **react-map-gl v8:** `import Map from 'react-map-gl/maplibre'` targets maplibre-gl ≥ 4, needs no `mapLib` prop, and the latest version seen is 8.1.1 — [react-map-gl upgrade guide](https://github.com/visgl/react-map-gl/blob/master/docs/upgrade-guide.md); [react-map-gl 8.1.1 package.json](https://cdn.jsdelivr.net/npm/react-map-gl@8.1.1/package.json)

### Inferences
- **Recommended map-container strategy for a recomposing layout ("oversize + clip + padding")**:
  1. Make the map's DOM container a fixed-size, absolutely positioned element covering the **largest region the map can ever occupy** (often the whole surface). Put it inside a wrapper with `overflow: hidden` (or `clip-path: inset(...)`) that represents the map's *current* block.
  2. When the layout plan changes, animate only the wrapper's clip/bounds. Other blocks animate with Motion transforms.
  3. Call `map.easeTo({ padding: hiddenInsets, duration: D })` with D equal to the layout spring's visual duration, so the visual centre tracks the visible block. Under reduced motion, use `jumpTo({ padding })`.
  4. The canvas never changes size, so ResizeObserver never fires and there is no per-frame buffer clear or synchronous redraw.
  5. Only on a real viewport change (window resize, monitor change) does MapLibre's `trackResize` do one resize.
  6. **This fits the "no panels over map" vision:** neighbouring blocks never overlay the map, because the map's hidden portion is clipped away, not covered.
  - **Cost:** the GPU renders pixels that are hidden. On office PCs with integrated GPUs, cap the pixel ratio (e.g. `pixelRatio: Math.min(devicePixelRatio, 1.5)`) and keep layer and vertex counts low. Measure it.
- **Fallback strategy ("snap at settle"):** if oversizing is too expensive, keep the canvas at its old size during the animation, clipped while shrinking. Call one `map.resize()` (then `easeTo` padding or `fitBounds`) at animation end, i.e. Motion `onLayoutAnimationComplete` or `transitionend`. Growth needs a placeholder background matching the map style for the 300–400 ms before the resize.
- **Avoid:**
  - Motion `layout` (scale) on the map container: the canvas stretches, and ResizeObserver sees one jump at commit time, not the animation.
  - Per-frame width/height animation of the map container: N resizes, each with a clear and a synchronous redraw, plus document layout every frame.
  - View Transitions that include the map.
- **Keep framing stable:** keep "what must be in view" (the focus vehicles' bounds) as state. On each committed layout, recompute `cameraForBounds(bounds, { padding: visibleInsets + margin })` and `easeTo` only if the target bbox leaves the visible region, or if the zoom change exceeds a threshold (hysteresis again). Never call `fitBounds` on every score change.
- **Vehicles/objects:**
  - Use one GeoJSON source for static assets (depots, geofences) and one small dynamic source for vehicle positions, updated with `updateData` (diffs) or `setData` at most about 1–2 Hz.
  - Use `circle` layers plus a `symbol` layer for icons and labels, with `icon-allow-overlap`/`text-optional` tuned to avoid collision cost.
  - Use `setFeatureState` for selected/hover/attention highlights.
  - Reserve DOM `Marker`s for 1–10 rich, interactive "signal" callouts.
- **Wrapper choice:** react-map-gl v8 is fine. FleetOS's needs (imperative camera choreography synchronised with layout springs, padding control, no React re-render per camera frame) are also served by a ~100-line custom hook holding the `Map` in a ref. Either way, never store camera state in React state that updates on `move`. Use `map.on('moveend')` for anything React needs to know.
- **Single map instance:** one map instance, never unmounted during recomposition. Keep it mounted and reposition its wrapper. A remount costs a WebGL context, style parse and tiles. Mini-maps should be static images or a second view of the same data drawn with Canvas2D/SVG, not extra MapLibre instances.

```tsx
// Sketch: map adapter that never resizes the canvas during recomposition
function useMapFraming(map: maplibregl.Map | null, visible: DOMRectReadOnly, stage: DOMRectReadOnly, durationMs: number, reduced: boolean) {
  useEffect(() => {
    if (!map) return;
    const padding = {
      left: visible.left - stage.left, top: visible.top - stage.top,
      right: stage.right - visible.right, bottom: stage.bottom - visible.bottom,
    };
    reduced ? map.jumpTo({ padding }) : map.easeTo({ padding, duration: durationMs, easing: easeOutCubic });
  }, [map, visible.left, visible.top, visible.right, visible.bottom, durationMs, reduced]);
}
// CSS: .map-stage { position:absolute; inset:0 } (fixed size)  .map-clip { overflow:hidden; contain: paint; }
```

### Gaps
- I found no measured cost (ms) of a MapLibre `resize()` + synchronous redraw at typical office resolutions, and no comparison of oversized-canvas fill cost vs per-frame resize. This needs a local benchmark (Chrome Performance panel, integrated GPU).
- I found no MapLibre-specific documentation on CSS-transformed containers and pointer math (only other engines' reports).
- The 16-context WebGL limit is community-reported or derived from a WebKit commit message. I found no official Chrome documentation.
- I did not verify the exact `GeoJSONSource.updateData` diff semantics or performance in 6.x docs.
- Whether `clip-path: inset()` animation is composited (paint-free) in current Chrome, Firefox and Safari was not verified.

---

## 5. Performance budgets: avoiding layout thrash, compositor-only properties, React rendering strategies for 60fps, measuring (Chrome Performance panel, LoAF, INP)

### Takeaway
At 60 fps you have about 16 ms per frame, and only `transform` and `opacity` are compositor-only. Recomposition should therefore be (1) one React commit per *layout change*, never per frame, (2) one batched measure (FLIP "First/Last") per commit, and (3) transform/opacity animation thereafter. Per-frame live values (counters, positions, progress) should bypass React reconciliation via refs, motion values or `useSyncExternalStore` selectors. Mind its tearing rule: store changes during a Transition force a blocking re-render. Measure with the Performance panel (Forced Reflow insight), the Long Animation Frames API (`blockingDuration`) and INP (≤ 200 ms good).

### Cited Findings
- Only `transform` and `opacity` can be handled by the compositor alone, and the element should be on its own layer — [web.dev compositor-only](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count):
  - Promote layers with `will-change: transform`, but "do not promote elements unnecessarily". Layers cost memory and GPU texture upload, and the cost can outweigh the benefit on low-memory devices.
  - Aim for compositing of "around 4-5ms" during transitions.
- Layout thrashing (read/write loops) forces synchronous layout on every iteration — [web.dev layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing):
  - "Batch your style reads and do them first."
  - The budget is "16 milliseconds to get a frame on screen". The example trace spends over 28 ms in layout per frame.
  - Diagnose with Chrome DevTools' **Forced Reflow insight** and the LoAF field `forcedStyleAndLayoutDuration`.
- Long Animation Frames API — [Chrome LoAF docs](https://developer.chrome.com/docs/web-platform/long-animation-frames):
  - Shipped in Chrome 123; unsupported in Firefox and Safari.
  - `blockingDuration` = the sum of the portions over 50 ms of tasks longer than 50 ms, including render time. Example: tasks of 55 + 65 ms plus a 20 ms render give a 140 ms frame with a 40 ms blocking duration.
- INP — [web.dev INP](https://web.dev/articles/inp):
  - Measures click, tap and key interactions from input to the **next paint**. Good ≤ 200 ms, poor > 500 ms (p75).
  - It is the successor to FID.
  - Phases: input delay, processing and presentation delay. Rendering work that delays the next frame counts.
  - Show initial feedback in the next frame.
- ResizeObserver — [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver):
  - Callbacks run "before paint". If any resize ran, style and layout are re-evaluated, which can cascade.
  - Cycles produce "ResizeObserver loop completed with undelivered notifications" and a possible "flash of broken layout".
  - Fix: defer writes to `requestAnimationFrame`, or skip writes when the size equals the expected size (WeakMap).
- `useSyncExternalStore` — [React docs](https://react.dev/reference/react/useSyncExternalStore):
  - `getSnapshot` must return a cached or immutable value; a new object each call loops infinitely.
  - `subscribe` must be stable, or React resubscribes on every render.
  - If the store changes during a non-blocking Transition, React restarts the update as **blocking** to prevent tearing.
  - Store mutations can't be marked as Transitions.
- `useDeferredValue` provides interruptible background re-renders, and the slow subtree must be `memo`'d — [React docs](https://react.dev/reference/react/useDeferredValue)
- React Compiler 1.0 (stable 2025-10-07) is a build-time tool for automatic memoization, including conditional memoization that manual `useMemo` cannot do. It has Vite integration and lint rules in `eslint-plugin-react-hooks` — [React Compiler v1.0 blog](https://react.dev/blog/2025/10/07/react-compiler-1)
- Motion 14.2.0 adds hardware-accelerated independent transforms (`x`, `y`, `scaleX`). 14.1.0 stops animations jumping after a main-thread stall — [Motion changelog](https://motion.dev/changelog?lib=motion)
- Physics springs keep velocity across interruptions — [Motion transitions](https://motion.dev/docs/react-transitions)
- MapLibre render cost scales with sources × layers × vertices — [Mapbox performance guide](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/)
- MapLibre 6.9.0 removed tens of ms of main-thread stall on sprite load via OffscreenCanvas — [v6.9.0 notes](https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.9.0)

### Inferences
- **Frame budget for a recomposition commit** (targets, to be validated by measurement):
  - The React commit of the new layout plan should finish in under ~8 ms of scripting and layout combined on an office PC. That leaves room for Motion's measure and the first animation frame inside the FLIP "100 ms window".
  - Subsequent frames should be compositor-only: transforms and opacity on block shells, plus MapLibre's own WebGL frame from `easeTo` padding.
  - The MapLibre frame is the largest per-frame cost, so keep vertex and layer counts low.
- **State architecture (avoid re-render per frame):**
  - **Layout plan (React state):** changes ≤ 1×/s via `startTransition`. This is the only state that triggers re-layout.
  - **Live telemetry store (external, mutable):** vehicle positions and ETAs. Components subscribe with `useSyncExternalStore` and **narrow selectors** that return primitives or cached objects. Because store updates force blocking re-renders during Transitions, throttle store notifications (e.g. batch to 2–4 Hz in a rAF/interval flush) so they don't keep restarting the recomposition Transition.
  - **Per-frame visuals:** counters, progress bars and the "pulse" of a signal. Write through refs, Motion `useMotionValue`/`useTransform`, or CSS custom properties set on a ref, never through React state.
  - **Map data:** pushed imperatively (`source.updateData`/`setData`, `setFeatureState`) from the store subscription, outside React rendering.
- **Measurement routine:**
  1. Chrome Performance panel with 4x CPU throttling, plus a real integrated-GPU laptop.
  2. Record a scripted "attention storm" (scores oscillating).
  3. Check for Forced Reflow insights, LoAF entries above 50 ms, frames above 16 ms during layout animations, and INP for clicks during recomposition.
  4. Log `PerformanceObserver({ type: 'long-animation-frame', buffered: true })` in dev builds, along with `forcedStyleAndLayoutDuration`.
- **Containment:** give each block shell `contain: layout paint` (and `content-visibility: auto` for off-screen detail panes). In-block content changes then don't invalidate sibling layout. Chrome's element-scoped VT applies `contain: layout` itself during a transition, which is a hint that containment is the expected companion.
- **Enable React Compiler 1.0** in the Vite build. It reduces accidental re-renders of block contents when the layout plan changes. Pair it with `memo` boundaries per block keyed by block id and form.

```ts
// Sketch: throttled external telemetry store + selector hook (no per-frame React renders)
const listeners = new Set<() => void>();
let snapshot: Readonly<Record<string, Vehicle>> = {};
let pending = false;
export function ingest(v: Vehicle) {             // called at sensor rate
  snapshot = { ...snapshot, [v.id]: v };          // immutable swap (or structural sharing)
  if (!pending) { pending = true; setTimeout(() => { pending = false; listeners.forEach(l => l()); }, 250); } // ~4 Hz
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useVehicleField<T>(id: string, pick: (v?: Vehicle) => T): T {
  return useSyncExternalStore(subscribe, () => pick(snapshot[id])); // pick must return primitives/cached values
}
```

### Gaps
- I found no authoritative per-device frame budgets for "office PCs" (integrated Intel/AMD GPUs, 1080p at DPR 1–1.25). The budgets above are inferences.
- I did not verify whether Chrome DevTools' Performance panel shows LoAF entries natively in 2026. A DZone article said it did not, which may be outdated.
- Signals libraries (e.g. Preact Signals for React) and Zustand's transient subscriptions were not researched; no sources were collected.
- I found no source quantifying the cost of Motion's layout measurement (getBoundingClientRect per `layout` component) for 10–30 animated elements.
