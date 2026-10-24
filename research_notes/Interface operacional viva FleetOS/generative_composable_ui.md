# Generative, intent-driven and composable UI: how context-driven surfaces decide what to show, how big, and when

Research notes for FleetOS, a truck dispatch office tool where one environment recomposes itself from things × presentations × compositions, driven by questions and events, with no page navigation. Compiled 2026-10-18. Sources from before 2023 are marked **[older]**. Each finding names its source. Interpretation is kept in the "Inferences" sections.

---

## 1. Generative UI / LLM-composed interfaces: patterns (catalogue + model selects/arranges) and reported pitfalls

### Takeaway
The field has settled on a spectrum. At one end the model only picks and fills components the developer built (a "static" or "controlled" approach). In the middle the model emits a declarative JSON tree constrained to a vetted catalogue (A2UI, json-render). At the far end the model writes the full HTML or JS (Google's Generative UI, Claude "Imagine", MCP Apps). The reported pitfalls are consistent across sources:
- latency (Google says "a minute or more")
- non-determinism and loss of muscle memory
- security and prompt-injection risk from arbitrary rendering
- cost
- hallucination and trust

Practitioners therefore recommend a hybrid: a fixed shell and critical flows, with generated content only inside bounded slots.

### Cited Findings

**Google Research "Generative UI" (Nov 2025) and its paper**
- Published 18 Nov 2025 by Yaniv Leviathan, Dani Valevski, Vishnu Natchu and Yossi Matias. It ships in the Gemini app as the "dynamic view" and "visual layout" experiments, and in AI Mode in Google Search for U.S. AI Pro/Ultra subscribers — [Google Research blog](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
- The system runs on Gemini 3 Pro with three additions:
  - server-side tools (image generation, web search), whose results go either back to the model or straight to the browser
  - detailed system instructions (goal, planning, examples, technical specs, tool manuals, tips for avoiding common errors)
  - post-processors that fix common output issues

  Output is HTML/CSS/JS rendered in the browser — [Google Research blog](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
- On consistency: products can be configured with a fixed visual style applied to all results, including generated assets. Otherwise the system picks a style, or the user steers it through the prompt — [Google Research blog](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
- On pitfalls: generation "can sometimes take a minute or more", and outputs have "occasional inaccuracies". Rater preference was measured with generation speed ignored — [Google Research blog](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)
- Paper: "Generative UI: LLMs are Effective UI Generators" (arXiv 2604.09577, submitted 24 Feb 2026).
  - Raters "overwhelmingly preferred" generated UIs over markdown, but only when speed was ignored.
  - Generated UIs were worse than expert-crafted ones but "at least comparable" in 50% of cases.
  - The authors released the PAGEN dataset of expert-made sites.

  — [arXiv abstract](https://arxiv.org/abs/2604.09577)
- Appendix ELO scores (Info-Seeking prompt set), as reported in search extraction of the PDF and not independently verified from a clean render:

  | Format | ELO |
  |---|---|
  | Human expert site | ≈1821.5 |
  | Generative markdown | ≈1385.5 |
  | Generative text | ≈1141.4 |

  The expert site won 55.5% of head-to-heads against generative UI — [arXiv PDF](https://arxiv.org/pdf/2604.09577)

**A2UI (Google, open protocol, Apache 2.0)**
- The agent's UI is a "declarative data format, not executable code". Agents "can only use pre-approved components from your catalog". It is built to answer "how can AI agents safely send rich UIs across trust boundaries?" It uses a flat, streaming JSON structure, and LLMs "can build UIs incrementally without perfect JSON in one shot" — [a2ui.org](https://a2ui.org/)
- Versions listed: v0.8 (legacy), v0.9 (introduced `createSurface`), v0.9.1 (current) and v1.0 (candidate; adds client-to-server RPC `actionResponse`). Renderers exist for Angular, Flutter, Lit and Markdown. CopilotKit contributed — [a2ui.org](https://a2ui.org/)
- v0.8 has four message types:
  - `surfaceUpdate`: components for a named surface
  - `dataModelUpdate`: data for that surface's model
  - `beginRendering`: signals the first render can happen and names the root
  - `deleteSurface`

  The client buffers updates until `beginRendering` arrives. In v0.9, `createSurface`, `updateComponents` and `updateDataModel` replace these — [A2UI message reference](https://a2ui.org/reference/messages/); [A2UI v0.8 spec](https://a2ui.org/specification/v0.8-a2ui/)
- Components use an adjacency-list model: a flat list where parents reference child IDs. The stated rationale is that generating a perfectly nested tree in one pass is error-prone. Values can be literals or JSON-Pointer bindings (for example `/user/name`) into a per-surface data model — [A2UI components concept](https://a2ui.org/concepts/components); [A2UI messages](https://a2ui.org/reference/messages/)
- Secondary coverage dates the public release to Dec 2025. It also reports integration in Google's Opal, Gemini Enterprise and the Flutter GenUI SDK. That integration claim comes from one secondary source — [Analytics Vidhya, Dec 2025](https://www.analyticsvidhya.com/blog/2025/12/google-a2ui-explained/); [The Decoder](https://the-decoder.com/googles-open-standard-lets-ai-agents-build-user-interfaces-on-the-fly/)

**json-render (Vercel Labs)**
- Developers define a catalogue of permitted components and actions with Zod schemas, and the LLM emits a JSON spec constrained to it. A registry maps catalogue entries to real React components. Malformed output fails validation instead of rendering. One catalogue can drive React, Vue, Svelte, Solid and React Native renderers — [InfoQ, Mar 2026](https://infoq.com/news/2026/03/vercel-json-render); [LogRocket](https://blog.logrocket.com/vercel-json-render-dynamic-ui/)
- A community summary reports a flat-tree spec and patch/merge/diff edit modes for progressive updates from v0.14. This is unverified against the README — [pyshine summary](https://pyshine.com/json-render-Generative-UI-Framework-Keeps-AI-on-a-Leash/)

**Vercel AI SDK**
- The current pattern is tool calling:
  - tools are defined with Zod `inputSchema`
  - "The model can decide when and how to use these tools based on the context of the conversation"
  - the client renders typed tool parts (`tool-${toolName}`) by state (`input-available` shows loading, `output-available` renders the component with the tool output as props, `output-error` shows the error)

  — [AI SDK docs: Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- The older RSC `streamUI` approach, which streamed React Server Components, carries a notice that AI SDK RSC development is paused, with a pointer to migration docs — [Vercel rsc-genui template](https://vercel.com/templates/next.js/rsc-genui)

**CopilotKit taxonomy**
- **Static/controlled:** the agent picks a pre-built component and supplies its parameters.
- **Declarative:** the agent emits a schema (A2UI, Open-JSON-UI).
- **Open-ended:** the agent supplies a full surface (HTML or iframe, typically MCP Apps). This mode is flagged for security and performance concerns.
- AG-UI is the runtime layer under all three.

— [CopilotKit generative UI](https://copilotkit.ai/generative-ui); [CopilotKit/generative-ui GitHub](https://github.com/CopilotKit/generative-ui)

**OpenAI**
- ChatGPT Apps SDK display modes:
  - **Inline card:** a single action or decision; at most two primary actions; "No nested scrolling"; no tabs or drill-ins.
  - **Inline carousel:** 3–8 items, three lines of metadata.
  - **Fullscreen:** maps, canvases, detailed browsing. The composer stays visible.
  - **Picture-in-picture:** live or ongoing sessions; pinned to the top while scrolling until dismissed or the session ends.

  "Every app initially appears inline." Apps must use system colours and fonts ("Don't use custom fonts, even in full screen modes"), and ChatGPT appends the app logo itself — [OpenAI Apps SDK UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)
- ChatGPT canvas (Oct 2024): OpenAI post-trained GPT-4o to decide when to open a canvas, reaching 83% (writing) and 94% (coding) correct triggering against a prompted zero-shot baseline. For coding they "intentionally biased the model against triggering" to avoid disrupting power users. They also noted that baseline quality is highly prompt-sensitive. This is reported via the OpenAI announcement; the direct fetch returned 403, so these points come from search extraction of openai.com and mirrors — [OpenAI: Introducing canvas](https://openai.com/index/introducing-canvas/); [Tectonic mirror](https://gettectonic.com/openai-introduces-canvas/)

**Anthropic**
- Artifacts (launched June 2024 with Claude 3.5 Sonnet) put substantial, self-contained content in "a dedicated window separate from the main conversation", to the right of the chat. Claude generally creates one for content that is significant and self-contained, "typically over 15 lines" — [Claude support: What are artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them); [SD Times](https://sdtimes.com/ai/anthropic-updates-claude-with-new-features-to-improve-collaboration/)
- "Imagine with Claude" (research preview, ~30 Sep 2025, with Sonnet 4.5) generated the app UI at runtime from context, with no codebase. It was available to Max subscribers for 5 days. A hands-on reviewer reported similar prompts giving very similar results, no saved state ("once we refresh the page, everything is gone") and bugs. This is a single secondary source — [DataCamp tutorial](https://datacamp.com/tutorial/imagine-with-claude)

**Design-research framing and practitioner criticism**
- NN/g, "Generative UI and Outcome-Oriented Design" (Kate Moran and Sarah Gibbons, 22 Mar 2024):
  - genUI is "dynamically generated in real time by artificial intelligence"
  - designers shift to "designing outcomes" and define "must show / should show / never show" constraints
  - "Constantly changing UIs will cause usability problems"
  - "Generative AI's problems are GenUI's problems"
  - privacy risks come from the deep personal data required

  — [NN/g](https://www.nngroup.com/articles/generative-ui/)
- Practitioner retrospective (Javier Cañete, 28 Apr 2026):
  - Runtime-generated UI fits personalised dashboards, adaptive forms and ad-hoc visualisations.
  - It fails in high-frequency muscle-memory flows ("UI that changes every session is frustrating"), critical operations (finance, health, infrastructure) and auditable flows.
  - The "winning hybrid pattern" is a static shell, navigation and critical operations, with generative UI limited to specific widgets.
  - Per-request cost "explodes fast"; the mitigation is to cache generated trees.
  - Prompt injection via inputs can steer which components render (OWASP LLM01:2025).

  — [jacar.es](https://jacar.es/en/runtime-generated-ui-the-first-serious-year/)
- An academic working definition (DIS 2025 Companion) draws on a review of 127 publications, 18 expert interviews and 12 case studies. It frames Generative UI as an "iterative and co-creative process" with hybrid creation and curation-based workflows. Only the abstract was read — [arXiv 2505.15049](https://arxiv.org/abs/2505.15049v1)

### Inferences
- In this taxonomy, FleetOS's "things × presentations × compositions" is a catalogue-constrained (static or declarative) system. The A2UI concepts map closely onto it:
  - *surface* is a composition region
  - *component catalogue* is the presentations
  - *data model with JSON-pointer bindings* is the things
  - *flat adjacency list* is the composition spec
- Using A2UI's split between component messages and data-model messages would let FleetOS stream data changes (truck ETA, job status) without re-composing, and re-compose only when the question changes.
- Every source that measures quality ignores or flags latency. A dispatch office cannot wait seconds or minutes for layout. Composition decisions should therefore be deterministic and rule-driven: fast, testable, auditable. An LLM, if used at all, would map a question to a composition spec chosen from known recipes. It would not generate layout code.
- The canvas finding is the closest analogue to "when to recompose". OpenAI deliberately biased against automatically opening a new surface for power users. FleetOS dispatchers are power users, so automatic recomposition should be conservative, with explicit user triggers preferred.
- The Apps SDK rules are portable constraints for a FleetOS presentation catalogue:
  - every thing first appears in a small inline form
  - cards have at most two primary actions and no nested scroll
  - "fullscreen" is reserved for map or canvas tasks
  - a persistent input (the question bar) is always visible
  - live sessions go in a pinned PiP-like slot

### Gaps
- No source gives quantitative latency budgets (p50/p95) for production declarative-catalogue systems (A2UI or json-render). Google gives only "a minute or more" for full-code generation.
- No controlled study measures user trust or error rates in generated operational UIs, as distinct from info-seeking pages. The Google evaluation is preference-only.
- The ELO numbers come from an imperfect PDF text extraction and should be checked against the paper.
- The OpenAI canvas page returned 403 to direct fetch. The 83%/94% figures are as quoted in search extraction and mirrors.

---

## 2. Intent-driven and object-oriented UI (OOUX), malleable software, dynamic medium, Smalltalk-style object views, composable workspaces

### Takeaway
The intellectual lineage runs from Smalltalk objects, through Naked Objects (UI generated from domain objects), to OOUX (objects before actions) and Notion's block model (data separate from type, so presentation can change without data loss). It ends in Ink & Switch's 2025 "malleable software" argument for shared data and composable tools rather than siloed apps. The common thread is to model the *things* first and let presentations be swappable views over them. The cautionary data point is Arc: powerful composable concepts that very few users adopted, which the company called a "novelty tax".

### Cited Findings

**Ink & Switch, "Malleable Software: Restoring User Agency in a World of Locked-Down Apps" (Geoffrey Litt, Josh Horowitz, Peter van Hardenberg, Todd Matthews; June 2025)**
- Malleable software is "a software ecosystem where anyone can adapt their tools to their needs with minimal friction" — [Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)
- Gentle slope: "each incremental increase in tailoring power should only require a small incremental investment of learning and skill" — [Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)
- Tools, not apps:
  - apps are "avocado slicers"
  - shared data (files, databases, shared objects) lets many tools act on "the same reality"
  - UI composition through compound documents and embedded tools avoids switching between isolated experiences

  — [Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)
- AI code generation lowers the barrier but is not sufficient on its own. Open problems are how generated tools compose and persist, and how to make precise edits without AI. AI works best inside a malleable environment — [Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)
- Prototypes cited in the essay:
  - **Potluck:** dynamic behaviour layered on plain-text recipes.
  - **Embark:** a travel-plan outline with embedded, context-aware maps and calendars.
  - **Patchwork:** data and tool code in shared, versioned documents.

  Precedents: HyperCard user "levels", Smalltalk objects, spreadsheets — [Ink & Switch](https://www.inkandswitch.com/essay/malleable-software/)

**Bret Victor / Dynamicland [older, 2014–2018]**
- "The Humane Representation of Thought" (2014) sets out a long-term vision of a "spatial dynamic medium" — [Dynamicland 2014](https://dynamicland.org/2014/The_Humane_Representation_of_Thought/)
- Victor's 2016 mailing-list post: "We can now make a dynamic medium that hosts dynamic representations -- not just static marks. A dynamic representation can compute, respond to people, and connect to other things." — [Dynamicland archived email 2016](https://dynamicland.org/archived-emails/2016/04/email-DL2016-04-06ebd9.html)

**Naked Objects [older, 2004 thesis]**
- Three principles:
  - business logic lives in behaviourally complete domain objects
  - the UI is a direct representation of those objects, with user actions limited to creating, retrieving and invoking their methods
  - the UI is generated entirely automatically from the object definitions, by reflection or code generation

  Trygve Reenskaug (inventor of MVC) wrote the thesis foreword, saying it is closer to MVC's original intent — [Wikipedia: Naked objects](https://en.wikipedia.org/wiki/Naked_objects); [Pawson thesis (Apache Causeway copy)](https://causeway.apache.org/docs/2.0.0/_attachments/Pawson-Naked-Objects-thesis.pdf)

**OOUX (Sophia Prater, c. 2015)**
- OOUX identifies the objects in the user's mental model before designing actions. The ORCA process covers **O**bjects, **R**elationships, **C**alls-to-action and **A**ttributes. The rationale: once objects are defined, "when users see an object, they already know what to do with it". These are secondary sources; Prater's own slides were not retrieved — [uxdesign.cc: What is OOUX](https://uxdesign.cc/what-is-object-oriented-ux-19e14c435d18); [Miro ORCA template](https://miro.com/miroverse/ooux-orca-process/); [LogRocket](https://blog.logrocket.com/ux-design/object-oriented-ux-ooux/)

**Notion block model [older, May 2021]**
- Every piece of content is a block with an ID, a type, properties, content (an ordered array of child IDs) and a parent (used for permissions) — [Notion engineering blog](https://www.notion.com/blog/data-model-behind-notion)
- "Turn into" changes only the type. Properties persist even when the new type ignores them, so a to-do keeps its checked state through a round-trip via heading. Each type renders its children differently: indented, toggle-hidden, or as a separate page — [Notion engineering blog](https://www.notion.com/blog/data-model-behind-notion)

**Arc / The Browser Company ("Letter to Arc members 2025", 26 May 2025)**
- The "novelty tax": Arc was too different, with too much to learn for too little return. It behaved more like a specialised professional tool than a mass product — [Browser Company letter](https://browsercompany.substack.com/p/letter-to-arc-members-2025)
- Share of daily active users per feature:

  | Feature | DAU share |
  |---|---|
  | More than one Space, regularly | 5.52% |
  | Live Folders | 4.17% |
  | Calendar Preview on Hover | 0.4% |

  — [Browser Company letter](https://browsercompany.substack.com/p/letter-to-arc-members-2025)
- Scott Forstall compared Arc to a saxophone, "powerful but hard to learn", and urged them to build a piano. Dia's stated approach is to hide complexity behind familiar interfaces. Arc moved to maintenance only — [Browser Company letter](https://browsercompany.substack.com/p/letter-to-arc-members-2025); [PCWorld](https://www.pcworld.com/article/2795432/the-beloved-arc-browser-is-in-stasis-cast-aside-for-an-ai-future.html)

**tldraw computer**
- An infinite canvas where connected components generate and transform data through a multimodal LLM, including branching and looping workflows (Steve Ruiz talk, 2025). No official launch post was found; the sources are thin — [AI Engineer talk listing](https://ai.engineer/talks/tldraw-computer)

### Inferences
- FleetOS "things" correspond to OOUX objects, Naked Objects domain objects and Notion blocks. FleetOS "presentations" correspond to Notion block *types*: the same data can be shown in different forms, and switching form loses nothing.
- Notion's type/data separation is directly reusable. A truck rendered as a map glyph, a row, a card or a timeline lane should share one record. Presentation-specific state, such as a collapsed or expanded lane, should survive a change of form.
- Naked Objects shows that "UI derived from objects" can be fully automatic. It also became known for producing generic UIs, which is why the frameworks allow custom views. FleetOS should derive default presentations from object schemas and hand-tune the high-traffic ones.
- Arc is a direct warning for a recomposing environment. Its novel organisational concepts (Spaces, Live Folders) were used by about 5% or fewer of daily users. FleetOS should make recomposition *ambient*, triggered by questions and events, with no new concepts for users to learn. The "piano" should look like familiar dispatch views.
- The malleable-software principle "in-place toolchain, gentle slope" suggests letting dispatchers pin, resize and keep a composition (as in Smart Stack pinning). Their own adaptations then outrank the system's guesses.

### Gaps
- No primary 2023–2026 source was found on Muse's (spatial canvas) design or outcomes.
- No measured outcomes for OOUX were found; the evidence is practitioner advocacy.
- The Ink & Switch essay does not give quantitative adoption data on malleable-tool use.

---

## 3. Context surfaces: Dynamic Island / Live Activities, Smart Stack, At a Glance, widgets, car HMIs

### Takeaway
In every mature context surface, the app supplies content in several pre-designed sizes and the **system** chooses which size and slot, based on competition for space and on device context:
- Live Activities: compact when one activity is active, minimal when several are, expanded on long-press.
- Watch Smart Stack: relevance plus pinning.
- Android Automotive: driving-state restrictions that cap string length, list items and depth.

Apps must design every presentation of the same item, keep presentations visually continuous, and update only when content actually changes.

### Cited Findings

**Apple Live Activities (HIG, updated 13 Oct 2026)**
- "Depending on the device and system location where a Live Activity appears, the system chooses a presentation style or a combination of styles." Apps must support all four presentations: compact, minimal, expanded and Lock Screen — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Selection rules:
  - **Compact:** "the system uses the compact presentation when only one Live Activity is active". It has leading and trailing elements either side of the camera.
  - **Minimal:** "When multiple Live Activities are active, the system uses the minimal presentation to display up to three of them". One is attached and the others are detached circles or ovals.
  - **Expanded:** appears on touch-and-hold.
  - **StandBy:** shows minimal, then the Lock Screen layout scaled 2× on tap.

  — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Cross-device composition: the system combines the compact leading and trailing elements into one view for Apple Watch and CarPlay. On the Watch, Live Activities appear "at the top of the Smart Stack". In CarPlay "the system deactivates interactive elements" — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Orientation and continuity rules:
  - "The expanded presentation is an enlarged version of the compact or minimal presentation. Ensure information and layouts expand predictably."
  - "Preserve as much of the existing layout as possible by animating existing elements to their new positions rather than removing and animating them back in."
  - Animations last at most 2 seconds, and none run on Always-On reduced-luminance displays.

  — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Update and interruption discipline:
  - "Update a Live Activity only when new content is available."
  - "Alert people only for essential updates."
  - Don't send push notifications for the same updates.
  - Prefer "a single Live Activity that uses a dynamic layout and rotates through events" over many separate ones.
  - Height is dynamic: shrink when there is less to show and grow as information arrives (rideshare example).

  — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Lifecycle:
  - Use for tasks with "a defined beginning and end", up to eight hours.
  - After an activity ends it remains for up to four hours on the Lock Screen, Mac menu bar and Watch Smart Stack. Apple suggests a 15–30 minute custom dismissal.
  - Offer in-app controls to turn activities off, or users may disable them in Settings altogether.

  — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- Sizes (iPhone 430×932):

  | Presentation | Size (pt) |
  |---|---|
  | Compact (each side) | 62.33×36.67 |
  | Minimal | 36.67–45 × 36.67 |
  | Expanded / Lock Screen | 408 × 84–160 |
  | Limited-width | 28×28 circle |

  — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)

**Apple Smart Stack (watchOS / iOS)**
- "On Apple Watch, widgets appear in the Smart Stack in an order that best fits a person's context… watchOS attempts to determine a widget's relevance based on several factors, including contextual clues your app provides" — [Apple RelevanceKit docs](https://developer.apple.com/documentation/relevancekit)
- RelevanceKit `RelevantContext` clues (watchOS 26+; the API exists on other platforms but "doesn't have any effect"):
  - date, date interval or date range, each with a `DateKind`
  - location, as a `CLRegion` or inferred home/work/school/commute
  - fitness (workout state)
  - sleep (bedtime/wakeup)
  - hardware (headphones connected)

  — [Apple RelevanceKit docs](https://developer.apple.com/documentation/relevancekit)
- iPhone/iPad Smart Stacks offer **Smart Rotate**, which moves widgets with timely information to the top, and **Widget Suggestions**, which propose widgets the person doesn't have. On Watch, people can pin favourites to a fixed position — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- The system's on-device intelligence "considers when and how often a person uses your app", but "can't access in-app context", so apps supply:
  - behavioural clues: donated `PredictableIntent` app intents on iOS
  - contextual clues: RelevanceKit on watchOS

  — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- With a watchOS `RelevanceConfiguration`, the same widget can appear several times, once per matching clue (for example weather at the current location and at a trip destination). Such widgets cannot be pinned, and `associatedKind` lets them replace a pinned timeline widget when "the Smart Stack could run out of space" — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- WWDC23 design guidance [2023]:
  - "Widgets rise to the top of the Smart Stack based on relevance… widgets can also be pinned to the top."
  - "There is an upper limit on the number of widgets."
  - Session-control widgets (system-generated) appear at the top automatically while a session is in progress.
  - Glance time is "no more than 10 seconds".

  — [WWDC Notes: Design widgets for the Smart Stack (WWDC23 10309)](https://wwdcnotes.com/documentation/wwdc23-10309-design-widgets-for-the-smart-stack-on-apple-watch/)

**Google Pixel "At a Glance"**
- At a Glance shows weather, alarms, calendar and air quality by default, plus contextual items: the flashlight-on reminder, flight and boarding-pass details, rideshare tracking, and later sports and stocks cards. Long-press opens "About this content", which explains it uses "info from your phone and your Google activity" and names sources (weather.com, location) — [9to5Google, Aug 2023](https://9to5google.com/2023/08/21/about-at-a-glance/); [Android Headlines, Aug 2023](https://www.androidheadlines.com/2023/08/at-a-glance-widget-more-about-content.html); [Android Authority](https://www.androidauthority.com/google-pixel-at-a-glance-widget-upgrade-3590232)
- On Pixel Watch, At a Glance is a small pill at the bottom of the screen (for example a flight gate) that expands on tap — [Android Authority](https://www.androidauthority.com/pixel-watch-5-at-a-glance-3697382/)

**Car HMI: Android Automotive driver-distraction restrictions**
- When driving state triggers restrictions, only activities tagged `distractionOptimized` may run. Otherwise "the system will stop the foreground activity." The platform checks only the manifest declaration; Play review enforces adherence — [AOSP driver distraction guidelines](https://source.android.com/docs/automotive/driver_distraction/guidelines); [CarUxRestrictions reference](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictions)
- Restriction bitflags:

  | Flag | Meaning |
  |---|---|
  | `NO_DIALPAD` | no dialpad |
  | `NO_FILTERING` | no typing a character to filter a list |
  | `LIMIT_STRING_LENGTH` | strings capped at `getMaxRestrictedStringLength()` |
  | `NO_KEYBOARD` | no text entry |
  | `NO_VIDEO` | no animated frames above 1 fps |
  | `LIMIT_CONTENT` | browsing capped by `getMaxCumulativeContentItems()` and `getMaxContentDepth()` |
  | `NO_SETUP` | no setup or form entry |
  | `NO_TEXT_MESSAGE` | no text messages |
  | `NO_VOICE_TRANSCRIPTION` | no voice transcription shown |
  | `FULLY_RESTRICTED` (511) | all of the above |

  Docs example: with a limit of 60 items, a task could show 10 countries and 50 songs, or 20 and 40. Depth 1 is a single list; depth 2 is list then detail — [CarUxRestrictions reference](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictions)
- Restrictions vary by automaker and market. Apps should react to the reported restriction set, not infer it from the raw driving state — [Qt Android Automotive driver distraction docs](https://doc.qt.io/QtAndroidAutomotive/qandroiddriverdistraction.html)

### Inferences
- The Live Activities "presentation ladder" (minimal, compact, expanded, full) is a near-exact template for FleetOS presentations of a thing (truck, job, alert). The decisive rule is that **presentation size is chosen by the system based on how many things compete for the same slot**: one item gets compact, several get minimal (up to three), and the user expands on demand. FleetOS could give each "thing" type a required set of size variants and let the composer choose by slot budget.
- "Expanded is an enlarged version of compact; animate existing elements to new positions" is a concrete continuity rule for recomposition without losing orientation. The same truck should keep its colour, glyph and relative placement of key fields across sizes.
- Android's `LIMIT_CONTENT` (maximum cumulative items, maximum depth) is a formal *attention budget*. FleetOS could define per-mode budgets in the same way. For example, during an incident only N items and depth ≤ 2 may be shown, and string length is capped in dense modes. The flags would then be "modes" the environment enters on events, analogous to driving states.
- Apple separates system-observed signals (usage frequency and time) from app-supplied signals (in-app context, scheduled dates, location). This maps onto FleetOS, where the environment can observe dispatcher behaviour while the domain supplies relevance windows: a delivery slot, a driver's rest-period deadline, a vehicle approaching a restricted zone.
- "A single Live Activity that rotates through events" rather than many separate ones is a useful pattern for multi-truck alerts. One consolidated surface would cycle the most pressing events instead of spawning a tile per truck.

### Gaps
- Apple does not document the Smart Stack ranking model itself: weights, how system signals combine with app scores, or the rotation rate limit. Only the inputs are documented.
- No primary documentation was found for how Pixel At a Glance (formerly "Smartspace") chooses or orders cards, beyond the "About this content" disclosure.
- The relevance logic of Windows 11 widgets and Android home-screen widgets was not researched in depth; no primary source was found in this pass.
- How Live Activities are ordered when more than three are active is not stated in the HIG.

---

## 4. Pro tools that reorganise around focus: Linear, Raycast, Superhuman, Figma, Bloomberg, Grafana; command-bar patterns

### Takeaway
Pro tools mostly keep a **stable frame** and adapt *within* it:
- context-aware side panels (Grafana)
- conditional show/hide of empty or irrelevant sections (Grafana)
- palettes that boost context-relevant commands rather than hiding others (Superhuman)
- frecency ranking (Raycast)

When Figma tried a more fluid layout (floating panels), heavy users were slower and Figma reverted. Bloomberg's stated strategy is to hide complexity without moving things, because "even something as simple as a font change or the relocation of a button can be disruptive."

### Cited Findings

**Superhuman command palette ("How to build a remarkable command palette", Tim Boucher, 12 Oct 2021) [older]**
- Available everywhere from one shortcut. Pressing it again dismisses the palette and restores previous focus — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- One central command registry, with execution decoupled from UI. Every action exists as a UI element, a shortcut and a command — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- Ranking:
  - default importance scores, with a scale multiplier to boost or demote
  - a "follow" list that guarantees one command ranks below another
  - usage-based ordering as an option
  - fuzzy matching with a threshold, plus aliases shown as "title (alias)"

  — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- Context: "Hide only commands that are truly irrelevant… boost the scores of relevant ones." For example, Send and Attach rank up when a draft is focused. Most commands stay available everywhere — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- The palette teaches shortcuts: each result shows its key, so users can "learn the shortcut for next time" — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/); [Superhuman help](https://help.superhuman.com/article/478-superhuman-command)

**Raycast root search**
- Ranking accounts for how often each item is opened and whether the user has typed a previously used search term or its prefix (v1.40.0, Sep 2022). Fuzzy search became the root algorithm — [Raycast changelog 1.40.0](https://www.raycast.com/changelog/macos-v1/1-40-0)
- An earlier "Boost ranking by previous searches" option and an "accelerated decay of ranking scores" for items not opened recently (v1.6.0) [older] — [Raycast changelog 1.6.0](https://raycast.com/changelog/1-6-0)
- A user-facing "Reset Ranking" action clears an item's frecency. The extension API exposes `useFrecencySorting` (`visitItem`, `resetRanking`) — [Raycast manual: Search Bar](https://manual.raycast.com/search-bar.md); [Raycast useFrecencySorting](https://developers.raycast.com/utilities/react-hooks/usefrecencysorting)

**Linear ("How we redesigned the Linear UI part II", Karri Saarinen et al., 28 Mar 2024)**
- The redesign aimed to "reduce visual noise" in the sidebar, tabs, headers and panels. It increased hierarchy and density in navigation, and restrained chrome colour so content stands out — [Linear blog](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Views rely on "a set of structured layouts that support the navigation elements and content", so the arrangement stays predictable across list, board and split views — [Linear blog](https://linear.app/now/how-we-redesigned-the-linear-ui)
- The team avoided a full overhaul (don't "completely disassemble the product to its atomic parts") and deferred navigation changes as riskier — [Linear blog](https://linear.app/now/how-we-redesigned-the-linear-ui)

**Figma UI3 ("Our approach to designing UI3", Jenny Xie, 1 Oct 2024)**
- The north star was keeping designers "in the flow", with work centre stage. "Minimize UI" collapses the side panels — [Figma blog](https://www.figma.com/blog/our-approach-to-designing-ui3/)
- Beta findings on floating panels:
  - they cramped the canvas
  - designs "peek[ed] out" behind them
  - rulers ended up farther from designs
  - most importantly, they slowed down people who spend many hours a day in Figma

  "Speed is a feature" (KC Oh). Panels became fixed but resizable for the full rollout — [Figma blog](https://www.figma.com/blog/our-approach-to-designing-ui3/)
- Lessons stated:
  - "Craft and flow don't have easy metrics"
  - "Redesigns are fun for designers, but can be genuinely scary for users"
  - offer an opt-out during beta and a gradual rollout
  - be willing to reverse course

  — [Figma blog](https://www.figma.com/blog/our-approach-to-designing-ui3/)
- Forum reaction was mixed. Some called the fixed panels claustrophobic and asked for a choice between fixed and floating — [Figma forum](https://forum.figma.com/suggest-a-feature-11/launched-fixed-panels-are-back-23789); [uxdesign.cc](https://uxdesign.cc/figma-scrapes-ui3s-floating-panels-44303803c1ad)

**Bloomberg Terminal**
- "How Bloomberg Terminal UX designers conceal complexity" (Dec 2022). CTO Shawn Edwards: "We're hiding complexity." Designers must be careful because "even something as simple as a font change or the relocation of a button can be disruptive." This is from search extraction; direct fetch returned 403 — [Bloomberg: How Bloomberg Terminal UX designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity)
- Launchpad [older, launch-era]: components can be grouped "so that a change in one security is reflected across the entire group" (linked views). Launch coverage mentioned up to 25 components per view — [Global Custodian](https://www.globalcustodian.com/bloomberg-introduces-new-desktop-39launchpad39/); [Finextra](https://www.finextra.com/newsarticle/5899/bloomberg-readies-launchpad-for-pc-desktop)
- A critical view [older, 2010] argues that complexity works partly as lock-in and that users take pride in mastering it — [UX Magazine](https://uxmag.com/articles/the-impossible-bloomberg-makeover)

**Grafana dynamic dashboards (Grafana 12, May 2025; public preview Jan 2026; GA Apr 2026 per Grafana's what's-new titles)**
- Conditional rendering: panels, rows or tabs show or hide based on variable values or on whether a query returns data. Example: hide a row whose query is empty. The motivation was that empty panels and collapsible rows confused users — [Grafana blog](https://grafana.com/blog/dynamic-dashboards-grafana-12/); [Grafana what's new](https://grafana.com/whats-new/2025-04-10-dynamic-dashboards/)
- Auto-grid layout resizes panels to fit the screen, with creators setting maximum columns and maximum height. A dashboard "outline" (tree-view navigation pane) gives a structural overview and jump-to for dashboards with hundreds of panels. A context-aware side pane shows options for the selected tab, row or panel — [Grafana blog](https://grafana.com/blog/dynamic-dashboards-grafana-12/)
- Tabs can nest inside rows and rows inside tabs. Status progressed from experimental, to public preview (Jan 2026), to GA (Apr 2026) — [Grafana what's new: public preview](https://grafana.com/whats-new/2026-01-14-dynamic-dashboards-in-public-preview/); [Grafana what's new: GA](https://grafana.com/whats-new/2026-04-08-dynamic-dashboards-is-now-generally-available/)
- Caveat: enabling the feature converts dashboards to the v2 schema irreversibly (backend), which affects dashboard-as-code pipelines — [Grafana blog](https://grafana.com/blog/dynamic-dashboards-grafana-12/)

### Inferences
- Figma's reversal of floating panels is direct evidence for FleetOS's direction of "no panels over map". Overlays that float over the primary work surface slowed expert users and pushed spatial references away from the work. Adaptive regions should *dock and resize*, not float.
- The Superhuman rule is the right default for an adaptive environment: *boost relevant, hide only the truly irrelevant*. FleetOS should keep every composition and command reachable through the question/command bar while reordering by context, and avoid removing options.
- Grafana's conditional rendering, outline and context-aware side pane form a practical package for "recompose without getting lost":
  - collapse sections with no data
  - always provide a structural outline (a "you are here" map of what is composed)
  - make the edit pane follow the selection
- Raycast's frecency with decay, plus a user-visible "reset ranking", is a small, transparent ML-free learning mechanism. Ranking adapts to the user, and the user can undo it.
- Bloomberg's linked component groups correspond to FleetOS "compositions bound to a focus thing". Selecting a truck re-targets every linked view, rather than opening new pages.

### Gaps
- No Linear engineering post was found describing context-sensitive command ranking. Raycast does not publish its frecency formula.
- No current Bloomberg Launchpad documentation was retrieved (403 and only third-party copies were available). The 25-component figure is launch-era and unverified for today.
- No direct sources were found on Superhuman's "split inbox" ranking internals.

---

## 5. Mechanisms used to rank and size content: relevance scores, degree-of-interest, Smart Stack signals, ML ranking, rules plus hysteresis

### Takeaway
The mechanisms documented in production are simple:
- app-assigned relevance **scores with a validity window** (Apple `TimelineEntryRelevance(score, duration)`; a score ≤ 0 means never promote)
- typed **contextual triggers** (RelevanceKit)
- **usage frecency with decay** (Raycast)
- **rule flags with numeric budgets** (Android CarUxRestrictions)
- **conditional visibility on data presence** (Grafana)
- **system-enforced rate limits** on rotation (WidgetKit)

The canonical visualisation formalism is Furnas' degree-of-interest (DOI), extended to graphs by van Ham & Perer: "search, show context, expand on demand". HCI research shows that prediction *accuracy* matters more than predictability, and that keeping items in place while changing salience (ephemeral adaptation) beats moving them. No source documents explicit hysteresis thresholds.

### Cited Findings

**Apple relevance scoring**
- `TimelineEntryRelevance` has a `score` and a `duration`. "When the date of an entry arrives, and for the duration you specify, WidgetKit may rotate your widget to the top of the stack." Relevance "isn't the only factor" — [Apple: TimelineEntryRelevance](https://developer.apple.com/documentation/widgetkit/timelineentryrelevance)
- Scoring rules:
  - "decide on an absolute scale from least relevant to most relevant… WidgetKit calculates the relative difference of scores between entries; the absolute values don't matter"
  - "use a consistent scale" across timelines, for example low, medium and high enum values
  - "A score of zero (0) or lower indicates that a widget isn't relevant, and WidgetKit won't consider rotating it"

  — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- Rate limiting: "WidgetKit normally limits the number of times it rotates the widget to the top of the stack or when it inserts the widget as a suggestion." A Developer Mode switch bypasses the limit for testing — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- In the Emoji Rangers sample, relevance is a domain-state function: the score equals the hero's health level, and on watchOS it is relevant over `date(from: injuryDate, to: fullHealthDate)` — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)
- Behavioural learning: donated `PredictableIntent`s with parameters let the system learn (for example "art events in Paris" on weekends), rotate to a matching widget, or suggest a pre-configured one — [Apple: Increasing the visibility of widgets in Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)

**Degree-of-interest [older, 2009]**
- van Ham & Perer, "Search, Show Context, Expand on Demand: Supporting Large Graph Exploration with Degree-of-Interest" (IEEE InfoVis 2009 / TVCG 15(6)). They adapt Furnas' DOI function from trees to graphs to extract a contextual subgraph around a node of interest, instead of computing a full overview. It was demonstrated on a legal-citation database of more than 3 million nodes — [CMU DIG publication page](https://dig.cmu.edu/publications/2009-doigraphs.html)

**Adaptive-UI research [older]**
- Gajos et al., CHI 2008, "Predictability and Accuracy in Adaptive User Interfaces":
  - split-toolbar study at 50% and 70% accuracy, comparing most-recently-used (predictable) with random adaptation
  - raising both predictability and accuracy increased satisfaction
  - "accuracy had a stronger effect than predictability on performance, utilization, and some satisfaction ratings"
  - MRU raised perceived control and predictability

  — [Gajos et al. CHI 2008 PDF](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf); [Microsoft Research page](https://www.microsoft.com/en-us/research/?p=145411)
- Findlater, Moffatt, McGrenere & Dawson, CHI 2009, "Ephemeral Adaptation":
  - predicted items appear immediately while the rest fade in, which "reduces visual search time while maintaining spatial consistency"
  - faster than static menus when accuracy was high; not significantly slower when low; faster than adaptive highlighting
  - rationale: abrupt onset is a stronger attention cue than colour

  — [Findlater et al. 2009 (UBC)](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf); [DOI 10.1145/1518701.1518956](https://www.doi.org/10.1145/1518701.1518956)
- A secondary summary reports no benefit at 50% accuracy and a benefit at 79% — [HCI museum: Ephemeral Menu](https://hci-museum.lisn.upsaclay.fr/ephemeral-menu)

**Rules and budgets**
- Android CarUxRestrictions: numeric budgets (maximum string length, maximum cumulative content items, maximum content depth) activated by driving state — [CarUxRestrictions reference](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictions)
- Grafana show/hide rules on variable value or data presence — [Grafana blog](https://grafana.com/blog/dynamic-dashboards-grafana-12/)
- NN/g's suggested genUI constraint set is "must show / should show / never show" — [NN/g](https://www.nngroup.com/articles/generative-ui/)
- Live Activities: "If the underlying content or status remains the same, maintain the same display until the underlying content or status changes" — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)

**Usage-based ranking**
- Raycast ranks by open frequency and by previously typed search prefix, with accelerated score decay for items not opened recently — [Raycast changelog 1.40.0](https://www.raycast.com/changelog/macos-v1/1-40-0); [Raycast changelog 1.6.0](https://raycast.com/changelog/1-6-0)
- Superhuman uses default scores, multipliers and "follow" ordering constraints — [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)

### Inferences
- A FleetOS composer could combine these into one score per (thing, presentation, slot): DOI(thing | focus) = a-priori importance (domain-assigned, as with an Apple score) + user interest (frecency with decay, as in Raycast) − distance from the current focus (graph or geographic distance, as in DOI). Relevance windows would come from domain time (as in Apple `duration`, RelevanceKit date ranges). A score ≤ 0 would mean "never promote".
- The documented equivalent of hysteresis is **rate-limited rotation plus "keep the display until content changes"**. FleetOS should add explicit hysteresis: a thing only displaces another in a slot if its score exceeds the incumbent's by a margin, and promotions have a minimum dwell time. This is an inference; no source specifies thresholds.
- Gajos's accuracy result implies that adaptation is only worth doing where predictions are reliable. Domain-deterministic events in FleetOS (an ETA breach, a driving-time limit, a restriction violation) are near-100%-accurate triggers and are good candidates for auto-promotion. Speculative "you might want to see…" suggestions are poor ones.
- Ephemeral adaptation is a concrete way to signal relevance without moving things: change salience (immediate onset, emphasis) while keeping positions stable. For a map-centric UI, relevant trucks can brighten or pulse in place rather than being relocated or re-laid-out.

### Gaps
- No public source was found on Apple's actual Smart Stack ranking model, ML features or rotation-limit values.
- No production source documents explicit hysteresis or dwell-time thresholds for adaptive surfaces.
- The van Ham & Perer DOI formula and its weighting terms could not be extracted. The PDF was retrieved but not parseable in this environment, so the exact formula is not quoted.
- No 2023–2026 controlled studies on adaptive-UI predictability were found; the strongest evidence is from 2008–2009.

---

## 6. Documented failures and criticism of adaptive/context UIs, and lessons

### Takeaway
The recurring failure modes are:
1. Surfaces that try to be icon, widget and notification at once (Windows 8 Live Tiles).
2. Proactive feeds that drift from personal utility into generic content and ads, and lose user control (Google Now to Feed/Discover).
3. Adaptive stacks that show irrelevant content, or replace established gestures (watchOS 10 Smart Stack).
4. Novel organisational concepts with a high learning cost (Arc's "novelty tax").
5. Fluid layouts that slow experts (Figma's floating panels).
6. Generated UIs that break muscle memory and auditability.

The lessons that recur across these cases:
- give a clear role per surface
- keep user control (pin, reorder, turn off)
- adapt only on high-accuracy signals
- keep the shell stable
- roll out gradually and be willing to revert

### Cited Findings

**Windows 8 Live Tiles and the Start screen [older]**
- Mark Hachman (PCWorld, 21 Jul 2015): Live Tiles "work best as signposts, not shortcuts". The Start screen "dropped like a bomb on an unsuspecting public". Few users knew they could type to launch apps. Users navigated "a maze of flashing lights". For many, Start "embodied Windows 8's failure". Windows 8 peaked at 8.02% share in Sep 2013. Each later revision walked back the premise (Start button, boot to desktop in 8.1) — [PCWorld](https://www.pcworld.com/article/428571/a-tribute-to-windows-8-if-it-hadnt-been-so-bad-windows-10-wouldnt-be-so-good.html)
- Video-essay analysis (TechAltar): Live Tiles sat at an "unpleasant intersection" of icons, widgets and notifications, and were mobile-first designs struggling on large screens. Live Tiles were abandoned around 2017. This is a secondary summary of a video — [Rosetta summary of TechAltar](https://rosetta.to/u/techaltar/the-real-reason-microsoft-killed-live-tiles)
- Steven Sinofsky, the former Windows chief, defended the Start screen as addressing old Start menu and taskbar shortcomings — [Neowin](https://www.neowin.net/news/windows-8-10-years-later-former-windows-chief-steven-sinofsky-speaks-out/)

**Google Now cards [older, 2012–2017]**
- Google Now "proactively delivered information… in the form of informational cards" predicted from search habits and other signals. "Now" branding was largely removed in Oct 2016, cards were replaced by the Feed, and the Now Launcher shut down in April 2023 — [Wikipedia: Google Now](https://en.wikipedia.org/wiki/Google_Now); [Android Headlines](https://www.androidheadlines.com/2023/04/google-now-launcher-getting-discontinued-10-years-after-launch.html)
- User and press criticism of the successor:
  - Discover is "simply a feed of random news articles"
  - the Feed is "a glorified news reader"
  - users missed personal cards (calendar, package tracking, price changes, flights)
  - users asked to "re-order the panels, turn some off or on"
  - users now "have to directly ask" the Assistant instead of receiving proactive updates

  These are opinion pieces — [PiunikaWeb, Dec 2022](https://piunikaweb.com/2022/12/19/opinion-is-google-discover-a-step-back-from-google-now/); [Droid Life, Nov 2017](https://www.droid-life.com/2017/11/28/else-misses-google-now/)

**watchOS 10 Smart Stack [2023]**
- Complaints:
  - a "treasure trove of irrelevance" (date and a near-empty calendar or weather card)
  - an oversized clock widget wasting space
  - the loss of the double-click-crown shortcut to the last app
  - accidental activation, because turning the crown now opens the stack
  - a pinned Reminders widget that appears only when reminders are due

  — [Gadgets & Wearables, Sep 2023](https://gadgetsandwearables.com/2023/09/26/watchos-10-smart-stack-widgets/)
- TidBITS (David Shayer, 15 Dec 2023): Apple "knows it inconveniences users by changing an established workflow". watchOS 10.2 added a setting to restore swiping between watch faces. Readers complained that the list view resets to the top — [TidBITS](https://tidbits.com/2023/12/15/why-did-apple-change-the-watchos-10-interface)

**Arc (2025)**
- Spaces were used regularly by 5.52% of daily users, Live Folders by 4.17% and Calendar Preview by 0.4%. The company's diagnosis was a "novelty tax". It moved to maintenance mode and built Dia around "familiar interfaces" — [Browser Company letter](https://browsercompany.substack.com/p/letter-to-arc-members-2025)

**Figma UI3 floating panels (2024)**
- Floating panels slowed heavy users, cramped the canvas and distracted with content peeking behind them. Figma reverted to fixed, resizable panels — [Figma blog](https://www.figma.com/blog/our-approach-to-designing-ui3/)

**Generative and adaptive UI in general**
- NN/g: "Constantly changing UIs will cause usability problems"; designers must balance personalisation with predictability — [NN/g](https://www.nngroup.com/articles/generative-ui/)
- Practitioner view: generated UI fails for muscle-memory flows, critical operations and auditable flows. "Dynamic generation dilutes the verifiability and auditability these areas require" — [jacar.es](https://jacar.es/en/runtime-generated-ui-the-first-serious-year/)
- Apple's Live Activities guidance warns that activities appearing unexpectedly "can be surprising or even unwanted". Without in-app controls, people "may choose to turn off Live Activities in Settings altogether" — [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)

### Inferences
- **One role per surface.** Live Tiles failed partly because a tile was icon, widget and notification at once. Each FleetOS slot (map, focus lane, alert strip, question bar) should have one clear job. A thing's presentation should match the slot's job, not try to do everything.
- **User control beats cleverness.** Smart Stack pinning, Google Now users asking to reorder and turn off cards, and Apple's warning about Settings-level opt-outs all show that adaptive surfaces need visible pin, dismiss and "don't show this" controls. Otherwise users disable the adaptive behaviour wholesale.
- **Don't replace established gestures or anchors.** The watchOS 10 complaints were about lost shortcuts and accidental activation as much as content. Recomposition in FleetOS must never take over an input the dispatcher already relies on, such as map pan/zoom or a list's keyboard navigation.
- **Avoid the "novelty tax".** The FleetOS environment should present familiar dispatch artefacts (map, job board, timeline, driver list). The *recomposition* should be the invisible part, not a new set of concepts (spaces, folders, modes) users must learn.
- **Ship adaptivity with an off-ramp.** Figma's beta opt-out, gradual rollout and reversal suggest FleetOS should offer a "freeze layout" or "fixed composition" fallback. Adaptivity can then earn trust.
- **Keep the record auditable.** For operational decisions (dispatch, compliance), the environment should log *why* a composition was shown, for example "promoted because ETA breach > 20 min". This makes adaptive behaviour inspectable, in line with the auditability criticism and Pixel's "About this content" disclosure.

### Gaps
- No rigorous post-mortem or usage data was found for Google Now cards or Windows 8 Live Tiles. The evidence is press and opinion plus a video essay.
- No documented failure case of adaptive UI specifically in logistics or dispatch software was found.
- No 2024–2026 data on Smart Stack satisfaction after watchOS 11/26 changes was found. The criticism above is from 2023.
- Office 2000 "personalized menus" (a classic adaptive-UI failure) was not researched in this pass; no source was gathered.
