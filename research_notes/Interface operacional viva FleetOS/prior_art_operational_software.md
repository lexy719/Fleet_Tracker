# Prior art: operational software UIs for a "living", self-reorganising fleet/transport dispatch environment

Research date: 2026-10-18. Scope: fleet/visibility products, control-room HMI and alarm disciplines, workspace-style professional tools, and evidence on predictability vs adaptivity. Most vendor material is marketing and reports vendor claims, not independently measured results. Items older than 2023 are marked **[older]**. Where a page could not be fetched (HTTP 403/404), the finding comes from the search engine's summary of that page and is marked **(via search summary)**.

---

## 1. Fleet / logistics / visibility products: what do dispatcher/operations UIs look like, and does any of them adapt layout to context?

### Takeaway
The current products (2024–2026) share one pattern: a live map plus lists/boards, with **management by exception**, meaning the system shows only the items that need attention, ranks them, and increasingly closes routine ones with AI agents. The adaptation happens in **what content is surfaced and in what order** (ranked exception queues, alerts, agent hand-offs, natural-language copilots). I found no documented case of a fleet or visibility product that **rearranges its own screen layout** in response to events.

### Cited Findings

**Samsara (telematics + routing, US-centric but sold in UK/EU)**
- An Aug 19, 2025 Samsara engineering/design blog post says the dispatch UI is built around exception management, "highlighting only what needs attention, so dispatchers can act quickly and confidently". Its examples are a driver running late and a driver off-route. Dispatchers see which driver is on which route in real time, and can manually adjust a plan that was optimised in one click. — [Samsara, Behind the build: routing & navigation](https://www.samsara.com/uk/blog/behind-the-build-routing-and-navigation-at-samsara)
- The same post says the design team runs hands-on research with customers so that insights appear "at the right time and in the right way". Execution data feeds back into future planning. — [Samsara blog](https://www.samsara.com/uk/blog/behind-the-build-routing-and-navigation-at-samsara)
- Samsara's routing product page says dispatchers monitor route progress and manage exceptions in real time. — [Samsara Routing](https://www.samsara.com/ca/products/telematics/routing)
- Samsara help-center articles describe:
  - a Fleet Overview Map with live vehicles, assets and gateways, filters by tags and attributes, and the ability to dispatch a vehicle to a location directly from the map;
  - a route list grouped as En Route / Completed / Scheduled;
  - stop colour coding: green = on time, red = late, light grey = upcoming, dark grey = skipped. (via search summary; I did not check which of the two articles holds which detail) — [Samsara KB 1](https://kb.samsara.com/hc/en-us/articles/4408022742541), [Samsara KB 2](https://kb.samsara.com/hc/en-us/articles/41266933936269)

**Motive (ex-KeepTruckin)**
- Motive's dispatch module has a Dispatch Board where an order is assigned to a driver or vehicle and tracked in real time. The "Fleet View" map is the monitoring surface. Drivers handle dispatches, inspections and messaging in the Motive Driver App. — [Motive Dispatch Workflow](https://gomotive.com/products/dispatch-workflow/)
- The Q3 2024 "Dispatch Refresh" product brief claims "21% less time spent planning and scheduling dispatches" (vendor figure). — [Motive product brief 2024 Q3 (PDF)](https://gomotive.com/wp-content/uploads/2024/09/2024Q3_1207994431646182_Product-Brief_Dispatch_Refresh-1.pdf)
- At Vision 25 (April 2025) Motive announced AI-powered Analytics and an AI coaching avatar. I found no source tying these to the dispatch UI. — [Motive product updates (via search summary)](https://gomotive.com/blog/tag/product-features/)

**project44 (Movement platform: shipper/3PL visibility)**
- On Feb 12, 2025 project44 announced six AI capabilities. They include AI Data Quality Agents (vendor claim: data gaps cut by up to 50%), the "MO" supply-chain assistant, and an AI Disruption Navigator. — [project44 press release](https://www.project44.com/?p=61082)
- In August 2025 it launched an "Intelligent TMS", positioned as an "agentic iTMS from context to action". — [project44 iTMS summit page](https://www.project44.com/?p=61133)
- A May 21, 2026 project44 blog post describes the exception workflow. Key points:
  - **Configuration:** operators set triggers in "Autopilot", which decide "which signals should wake the agent up", plus the agent's "next-step actions".
  - **What the operator sees:** routine cases are "resolved before the team gets to them". Cases that need judgment rise to the top with the agent's analysis attached. A Monday dashboard shows what needs attention.
  - **Prioritisation:** it varies by lane and by carrier history. For example, a carrier that missed twice in a month is escalated.
  - **Human checkpoints:** humans step in for customer, claims or legal impact; for carrier responses outside the expected pattern; and in a weekly review of agent behaviour.
  - **Audit:** every carrier interaction is logged and attributable.
  — [project44, Stop Reacting, Start Resolving](https://www.project44.com/es/?p=80631)
- Year-end results coverage reports more than 15 AI-agent use cases in core workflows and nearly 1 million automated calls/emails to carriers to resolve exceptions (vendor-reported, via search summary). — [AJOT](https://www.ajot.com/news/project44-achieves-first-positive-operating-free-cash-flow-quarter-with-48-new-arr-growth-in-q4); [project44 ARR release](https://www.project44.com/?p=4414)

**FourKites (visibility and "Intelligent Control Tower")**
- Nucleus Research reports that FourKites announced "Loft" at Manifest 2026. Loft is an agentic-AI platform that automates follow-up after a disruption is flagged: asset assignment, missed check-ins, delayed confirmations, detention follow-ups. Nucleus says it "does not replace existing systems or promise full autonomy". — [Nucleus Research](https://nucleusresearch.com/research/single/fourkites-expands-its-control-tower-strategy-with-loft/)
- FourKites markets named agents: "Tracy" handles carrier exceptions, "Sophie" turns standard operating procedures into workflows, and others run "autonomously 24/7". Alerts from its digital twins trigger automated workflows. FourKites' framing ("autonomous") differs from Nucleus' more cautious framing. — [FourKites Agentic AI](https://www.fourkites.com/fourkites-ai/agentic-ai/)

**Uber Freight**
- On May 21, 2025 Uber Freight announced an "AI logistics network" built on a logistics-specific LLM and embedded in its TMS, with more than 30 execution agents and "Insights AI" giving always-on recommendations. It said the TMS would become "a real-time logistics command center" by the end of 2025. — [Automotive World press release](https://www.automotiveworld.com/news-releases/uber-freight-launches-industry-first-ai-logistics-network-at-scale-ushering-in-a-new-era-of-intelligent-supply-chains/); [DC Velocity](https://www.dcvelocity.com/technology/artificial-intelligence/uber-freight-embeds-ai-into-its-tms)
- A later release added chat for complex queries and a real-time KPI dashboard. I could not confirm the date. — [SDCExec](https://www.sdcexec.com/transportation/fleet-management/news/22920025/uber-freight-uber-freight-advances-endtoend-logistics)

**Flexport (forwarder platform)**
- Flexport's Fall 2025 release includes an exceptions module covering more than 600 exception types, "grouped by category and ranked by priority". It also surfaces active shipments, POs, exceptions and declarations. "Flexport Intelligence" answers natural-language questions. — [Flexport products](https://www.flexport.com/products/)
- Flexport's Control Tower launched in February 2025 among more than 20 tech/AI products. It extends milestone visibility, ML transit predictions and exception alerts to freight that other forwarders move. — [STAT Times](https://www.stattimes.com/amp/logistics/flexport-launches-20-tech-and-ai-powered-products-1354567)
- Trade press reports Flexport keeps "human in the loop" for complex decisions and exception handling. — [Air Cargo Week](https://aircargoweek.com/betting-on-human-in-the-loop-ai-for-reliability/)

**Transporeon (Trimble; dominant European shipper–carrier platform)**
- The 2025 Visibility fact sheet describes processing GPS data with an AI engine, live map tracking and ETA calculation. It detects when a truck has left the loading place and "alert[s] involved parties in case of delays". — [Transporeon Visibility fact sheet 2025 (PDF)](https://www.transporeon.com/website/Fact%20Sheet/product%20pages/Visibility%20Hub/Transporeon-Visibility-fact-sheet-2025-EN.pdf)
- A new "Transportplaner" tool, covering freight sourcing and time-window management, was previewed at the Transporeon Summit in September 2025 and was in testing until Q1 2026. — [transport-online.de](https://transport-online.de/news/transporeon-neues-transportplaner-tool-erweitert-tms-funktionen-184001.html)
- I found no description of a Transporeon dispatcher "cockpit" UI.

**Trimble TMW (US carrier TMS)**
- TMW Operations documentation centres on configurable "board views": users create, edit, restrict and set a default board view, including custom SQL views. The Orders screen opens a Trimble Maps map from an icon. This suggests a **board-first, map-on-demand** design. — [Trimble TMW Operations docs](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/c7a5498f6ad3/docs/Current/index.html); [Orders screen](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/dd62b9ba798a/docs/Current/OrdersScreen-Overview.html)

**Webfleet (Bridgestone; strong in Europe)**
- Webfleet advertises scheduling and dispatching orders "with one order sequence" so predicted routes per driver are visible. Backlog orders are rescheduled and reassigned by drag-and-drop. Best-driver suggestions use TomTom Traffic plus order and vehicle status. — [Webfleet order dispatching & optimisation](https://www.webfleet.com/en_gb/webfleet/products/webfleet/features/order-dispatching-optimisation/); [Webfleet dynamic dispatching](https://www.webfleet.com/en_gb/webfleet/products/webfleet/features/dynamic-dispatching/)

**Alpega (European TMS)**
- Alpega's real-time visibility module aggregates partner data (Shippeo, project44, Wakeo; FourKites since 2020 **[older]**) with customisable delay alerts. An optional module adds map views and shareable tracking links on top of ETA and exception notifications. — [Alpega real-time visibility](https://www.alpegagroup.com/en-en/transport-solutions/categories/transport-execution/real-time-visibility/); [UIRR document](https://www.uirr.com/en/component/downloads/downloads/1929.html); [FourKites–Alpega 2020 [older]](https://www.supplychaindive.com/press-release/20201019-alpega-partners-with-fourkites-to-deliver-supply-chain-visibility-in-north)

**Frotcom (Portuguese telematics vendor, HQ Carnaxide; directly relevant to Iberia)**
- Frotcom's route planning and monitoring flyer lists fleet alarms, a fleet management dashboard and **driving-times monitoring** (tachograph) among its core features. — [Frotcom flyer (PDF)](https://www.frotcom.com/sites/default/files/asset/document/flyer_-_route_planning_and_monitoring.pdf)
- Its blog describes a "nearest vehicle" search from any location, and the mobile app lets managers respond to fleet alarms. **[older: 2022 blog]** — [Frotcom blog 2022](https://info.frotcom.com/blog/2022/04/6-frotcom-features-increase-your-fleets-productivity)
- Frotcom Lusitana says it has served more than 500 Portuguese businesses. — [Frotcom Lusitana 15 years (2025)](https://info.frotcom.com/blog/2025/04/frotcom-lusitana-15-years-transforming-fleet-management-portugal)

**Adjacent: AI dispatcher assistants for carriers**
- Numeo's "AI Hub" automates load discovery, ranking and broker outreach, and "escalat[es] judgment calls back to dispatchers". Its guidance keeps humans in charge of price, carrier commitments, driver assignment and service- or compliance-affecting exceptions. — [Numeo AI Hub](https://numeo.ai/blog/introducing-ai-hub); [Numeo, what can be automated safely](https://numeo.ai/blog/load-board-automation-what-can-be-automated-safely)

### Inferences
- **The industry pattern is a stable frame with adaptive content.** The map, board and list stay put. What changes is which items surface (exceptions), their rank, and whether an agent has already handled them. A "living" layout that physically recomposes would be novel in this category: a possible differentiator, but with no proven precedent.
- **Exceptions are moving from "alert list" to "agent-curated work queue".** That queue shows the agent's analysis, a resolved/unresolved split, and an audit trail (project44, FourKites, Flexport). For FleetOS, the stage after "surface what matters" is "show what the system already did, and what needs the human".
- **Products built for carriers are board- and map-centric with drag-and-drop assignment** (Motive, Webfleet, TMW). The control towers (project44, FourKites, Flexport, Transporeon) are built for shippers and forwarders and are exception-queue-centric. A Portuguese/Spanish carrier office sits in between: it plans trucks and drivers, but its shipper customers (via Transporeon, Alpega or project44 networks) demand ETAs and exception updates.
- **Iberia specifics:**
  - Transporeon and Alpega are the European shipper-side platforms Iberian carriers are most likely to meet: time slots, tenders, visibility requests.
  - Frotcom shows that local telematics buyers expect driving-time (tachograph) monitoring as a first-class concern next to map and alarms.
  - FleetOS should treat "shipper visibility obligations" and "driver hours" as standing concerns of the environment, not pages.

### Gaps
- No primary screenshots or UI documentation found for Transporeon's carrier-side UI, Descartes, or Uber Freight's TMS layout. Descartes was not covered at all.
- No vendor documents an adaptive or self-rearranging layout. That absence could be because such products don't exist, or because marketing pages don't describe it.
- No independent (non-vendor) measurements of AI exception-agent accuracy or of operator outcomes were found.
- Uber/Lyft internal operations tooling (city ops dashboards) had no reliable public sources in this pass.

---

## 2. Control rooms and high-performance HMI (ISA-101, ISA-18.2/EEMUA 191, Endsley SA, ATC): what do they say about layouts, salience, attention and overload?

### Takeaway
Control-room disciplines converge on four rules:
- **Calm by default:** grey and low contrast for normal; colour reserved exclusively for abnormal.
- **A fixed display hierarchy:** overview first, progressive detail via drill-down.
- **Consistent locations** for alerts and navigation.
- **Strict alarm budgets:** about 1 alarm per operator per 10 minutes in steady state; more than 10 per 10 minutes counts as a flood.

The place where these disciplines *do* adapt to context is the **alarm system** (state-based alarming / designed suppression), not the screen layout. Automation and adaptation must stay observable to avoid "automation surprise" and out-of-the-loop problems.

### Cited Findings

**ISA-101 / High-Performance HMI (grey-normal, colour-abnormal, hierarchy)**
- ISA's own summary article:
  - a grey background and muted colours reduce glare, and abnormal conditions are "designed to stand out clearly";
  - displays should form a hierarchy providing "progressive exposure of detail", starting from a Level 1 overview;
  - the overview is not used for control interactions.
  (via search summary; page redirects and returns 403) — [ISA Interchange, The High-Performance HMI](https://blog.isa.org/the-high-performance-hmi)
- A secondary source sums the idea up as "gray is good": when operators see colour, "it means attention is needed". — [Control.com, Going Gray (via search summary)](https://control.com/technical-articles/going-gray/)
- The four-level hierarchy is commonly given as Level 1 overview (span-of-control health), Level 2 unit/monitoring and control, Level 3 equipment detail, and Level 4 diagnostics/faceplate. Level names and the per-level grey hex values (e.g. #F0F0F0 for L1, #C0C0C0 for L3) differ between secondary sources and are vendor examples, not normative. — [Tatsoft ISA-101 how-to](https://docs.tatsoft.com/display/FX/ISA-101+HMI+Compliance+How-to); [open-exam-prep HMI study guide](https://open-exam-prep.com/study-guides/pe-control-systems/control-hmi-logic/hmi-control-room)
- A study guide describes the Level 1 overview as the screen for "one glance: is this console's span of control healthy?":
  - a few analog key performance indicators (KPIs);
  - equipment run state in low contrast;
  - alarm tiles that switch to alarm colour only when in alarm.
  It also says run/stop should be shown with shape, fill or modest contrast, not red/green, because those collide with alarm meaning. — [open-exam-prep HMI study guide](https://open-exam-prep.com/study-guides/pe-control-systems/control-hmi-logic/hmi-control-room)
- Bill Hollifield (co-author, *High Performance HMI Handbook*) **[older: 2011]**:
  - "An effective HMI gives the operator better situational awareness". "Poor HMIs impede that."
  - Avoid animation, shadows, 3D, bright colours and inconsistent colour coding.
  - Missing trends are among "the most glaring" deficiencies. Trends should be embedded in graphics and show normal/abnormal ranges.
  - Analog depictions exploit pattern recognition.
  - Alarm colours must be used exclusively for alarms, with redundant coding (colour + shape + text) by priority.
  — [Control Global, The Ultimate HMI (Aug 2011)](https://www.controlglobal.com/articles/2011/the-ultimate-hmi)
- The ASM Consortium (Honeywell-led) white paper, March 2015 **[older]**:
  - Supporting SA means supporting all three stages (perception, comprehension, projection), "not just … perception of alarms through gray-scale color-coding".
  - An HP HMI is "not simply applying a new gray-scale color palette". The hierarchy should represent "a correct mental model" with "fast, intuitive, easily-accessible navigation".
  - Navigation buttons should sit "in standard locations consistent with the mental model", not "all over".
  - Requirements should come from operator decision needs per scenario, "rather than … operator preferences".
  - The deliverable is an HMI Philosophy & Style Guide covering display types, screen use, navigation and alarm integration.
  - Typical failure modes are "like-for-like" migration and skipping the Level 1/Level 2 displays.
  — [ASM white paper 2015 (PDF)](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/March%2031%202015%20-%20Operator%20Situation%20Awareness%20and%20Delivering%20ASM%20compliant%20High%20Performance%20HMIs%20Failure%20Modes%20and%20Success%20Factors.pdf)
- Evidence of benefit (NOVA Chemicals / ASM study **[older, ~2000s]**): sources report different figures.
  - A Honeywell ASM presentation cites 38% better detection of events before alarms, 41% faster problem solving and 26% more successful scenario completion. — [Honeywell ASM presentation 2017](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/presentations/September%2014%202017%20ASM%20Ammonia%20Safety%20Conference.pdf)
  - A 2025 PTQ table cites success handling abnormal situations rising from 10% to 48%, and task time falling from 18.1 to 10.6 minutes (−41%). — [PTQ Q3 2025](https://ptqmagazines.digitalrefining.com/PTQ-Q3-2025/87/)
  - A 2025 thesis describes the study as 21 experienced operators running identical upset scenarios. — [Tampere University thesis](https://trepo.tuni.fi/handle/10024/227868)
  - The figures are inconsistent across sources; the original report was not found.

**Alarm management (ISA-18.2 / IEC 62682, EEMUA 191)**
- Commonly cited benchmarks (secondary sources; standard texts are paywalled):
  - steady-state rate of about 1 alarm per operator per 10 minutes (about 6/hour), with about 12/hour as the manageable maximum;
  - a flood is about 10 or more alarms per 10 minutes per operator, with floods in under 1% of 10-minute periods;
  - priority mix of about 80% low / 15% medium / 5% high;
  - fewer than 5 standing alarms (active over 24 h) per console.
  — [open-exam-prep ISA-18.2 guide](https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/alarm-management-isa182); [Digital Refining, Alarm floods and plant incidents](https://digitalrefining.com/article/1000558/alarm-floods-and-plant-incidents)
- ISA-18.2 distinguishes three suppression states:
  - **shelving:** operator-initiated and time-limited; a timer automatically unshelves;
  - **suppressed-by-design:** logic decides "the relevance of the alarm" based on plant state;
  - **out-of-service:** maintenance-controlled.
  — [WinCC OA alarm shelving docs](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/alarmshelving/topics/alarm_shelving_overview.html); [Emerson DeltaV advanced alarming white paper (PDF)](https://www.emerson.com/documents/automation/white-paper-advanced-alarming-techniques-deltav-en-6116368.pdf)
- Emerson calls **state-based alarming**, which changes alarm configuration when the operating state changes, "the most powerful" advanced technique. Practitioner guides stress that such suppression must be specified, tested and visible. — [Emerson DeltaV white paper (PDF)](https://www.emerson.com/documents/automation/white-paper-advanced-alarming-techniques-deltav-en-6116368.pdf)

**Situation awareness (Endsley)**
- Endsley's NDIA slides **[older: 2012]**:
  - SA has three mechanisms: perception, comprehension and projection, driven by goals and mental models.
  - People "don't get information that is needed", "don't correctly understand" it, or "don't project what will happen".
  - The "information gap" arises because "each new system is just added on", data is "not integrated", and the "decision maker [is] left to figure it out".
  - Common pitfalls: "Requires more than putting data on the same display" and "Cool is not necessarily functional."
  — [Endsley, NDIA 2012 (PDF)](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)
- The first six of Endsley's 50 SA-oriented design principles, from the same deck:
  1. Organize information around goals ("central organizing feature; flexible to meet changing goals").
  2. Present Level 2 SA (comprehension) directly, with integrated information.
  3. Support Level 3 projections.
  4. Support global SA, meaning "awareness of status across goals".
  5. Support trade-offs between goal-driven and data-driven processing ("avoid attentional narrowing").
  6. Make critical cues for schema activation salient.
  The same deck lists command-and-control goals: "situation understanding at a glance", "one-step access to any screen or task", "easy monitoring across multiple task demands", and "[user] controlled flexibility for changing needs and priorities". — [Endsley NDIA 2012 (PDF)](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)
- Endsley's 2013 handbook chapter describes 50 principles. The third edition of *Designing for Situation Awareness* (Endsley & Jones) has 60 principles, including the effects of automation and AI on SA. — [Oxford Handbook of Cognitive Engineering chapter](https://academic.oup.com/edited-volume/34402/chapter/296618526); [Designing for SA, 3rd ed.](https://www.booksamillion.com/p/Designing-Situation-Awareness/Mica-R-Endsley/9781032482118)
- The eight "SA demons": attentional tunneling, requisite memory trap, WAFOS (workload, anxiety, fatigue, other stressors), data overload, misplaced salience, complexity creep, errant mental models, and out-of-the-loop syndrome. — [Endsley NDIA 2012 (PDF)](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf); [exida blog, 2015 [older]](https://www.exida.com/Blog/help-your-operators-defeat-the-situation-awareness-demons)
- **Out-of-the-loop.** Bainbridge's "Ironies of Automation" (Automatica 1983 **[older]**) argues that automation can expand operator problems: what remains is monitoring plus the tasks designers could not automate, while manual and cognitive skills degrade from disuse. — [Bainbridge 1983 (PDF)](https://gwern.net/doc/sociology/technology/1983-bainbridge.pdf)
- **Automation surprise.** In aviation human-factors work, Wiener's question "what is it doing now?" sits with "what will it do next?" and "why did it do this?". Sarter & Woods found that indirect, system-initiated mode changes with low observability ("silent" changes) are a major cause of surprise **[older: 1990s]**. (via search summary) — [NASA NTRS report](https://ntrs.nasa.gov/api/citations/19980016965/downloads/19980016965.pdf)

**ATC / aviation display and alerting practice**
- FAA flight-deck alerting guidance (a compendium of AC 25.1322-1 and others):
  - "Use consistent wording, position, color and other shared attributes" for all alerts, under one alerting philosophy.
  - "Conditions that do not require flightcrew awareness should not generate an alert."
  - Annunciations appear "only … while the condition exists".
  - Red/amber/yellow for non-alerting use "must be limited".
  - Limit blinking because "it can be distracting", and don't blink text that must be read.
  - Present only one aural alert at a time.
  — [FAA HF guidance, alerting chapter](https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_04_Section_01.html)
- The FAA Human Factors Design Standard (HF-STD-001B, 2016) covers air traffic and technical-operations systems, including alarms and alerts. I did not retrieve the clause-level text. — [FAA HFDS](https://hf.tc.faa.gov/hfds/)
- EUROCONTROL's CoRe programme **[older: completed 2002]** and the newer ITWP baseline HMI define "general display principles that are applied across all controller working positions", i.e. cross-position consistency via a style guide. — [EUROCONTROL ITWP Baseline HMI](https://www.eurocontrol.int/publication/integrated-tower-working-position-itwp-human-machine-interface-hmi-description); [SKYbrary Controller Position Design](https://skybrary.aero/articles/controller-position-design)
- SKYbrary notes that changes to the controller working position are "a matter of considerable significance, potential sensitivity", and that "acceptance of a system upgrade can be won or lost" in how change is handled. — [SKYbrary Controller Position Design](https://skybrary.aero/articles/controller-position-design)
- EUROCONTROL label anti-overlap work: "constant good legibility" of traffic labels is "of the utmost importance". (via search summary) — [EUROCONTROL archive](https://www.eurocontrol.int/archive_download/all/node/10206)

**Calm technology (attention theory)**
- Weiser & Brown (Xerox PARC, 1995 **[older]**) separate the **center** and **periphery** of attention. Calm technology "engages both" and moves information between them. Their example is engine noise, peripheral until it changes. — [Weiser & Brown, Designing Calm Technology](https://calmtech.com/papers/designing-calm-technology)

### Inferences
- **The control-room answer to "living interface" is *living alarms, stable displays*.** Context drives which alarms are relevant (state-based suppression), while geography, hierarchy and navigation positions stay fixed. FleetOS could make *salience and inclusion* context-driven while keeping the map and core regions spatially stable.
- **Grey-normal / colour-abnormal fits the "calm and professional" requirement directly.**
  - Normal trucks, jobs and drivers render in low-contrast neutral tones.
  - Colour is reserved exclusively for exceptions (late ETA, hours-of-service risk, fuel anomaly, missing document).
  - Brand accent colours should never reuse alert hues.
  - Red/green for "moving/stopped" should be avoided, which contradicts Samsara-style green/red stop colouring.
- **A Level 1 overview for a carrier office** could answer at one glance: are today's transports on time, are drivers within hours, any trucks idle or off-route, any documents blocking? It would show a few trend or analog indicators rather than numbers, and support drill-down to transport, truck or driver detail (Level 2/3).
- **Alarm budgets give a measurable calmness target.** For example, no more than about 6 new attention items per dispatcher per hour in steady state, with "flood" handling (grouping by root cause) when more than about 10 arrive in 10 minutes. These process-industry numbers are not validated for transport; they are a starting heuristic.
- **Shelving is a useful pattern.** Operator-snoozed, time-limited exceptions that auto-return (e.g. "known delay at Algeciras port, re-alert in 60 min"), plus designed suppression (e.g. no "stopped" alert during a planned tachograph rest).
- **Any system-initiated recomposition must answer the pilot's questions** (what changed, why, what next), or it risks automation surprise. This argues for visible "why this is here" cues and an undo or pin.

### Gaps
- Normative text of ISA-101, ISA-18.2 and EEMUA 191 not accessed (paywalled). All benchmarks above are from secondary or vendor sources.
- No rail control-room (e.g. Network Rail ROC, Adif/IP CTC) interface guidance found in this pass.
- No ATC-specific source found that explicitly evaluates *system-rearranged* displays. ATC practice documents consistency but I found no direct study of dynamic layout.

---

## 3. Workspace-style professional tools (Bloomberg, Palantir, CAD, airline ops): how do they handle many simultaneous concerns? Fixed vs user-arranged vs system-arranged?

### Takeaway
Professional multi-concern tools are overwhelmingly **user-arranged** (Bloomberg Launchpad) or **builder-arranged** (Palantir Workshop apps configured by app builders), with **linked selection** across panels. Emergency CAD gravitates to a **single map-centric screen** with an event list and decision support (recommended units). None of the sources documents a system that autonomously rearranges the operator's layout. Bloomberg explicitly treats abrupt UI change as harmful to expert workflows.

### Cited Findings

**Bloomberg Terminal / Launchpad**
- Launchpad lets subscribers "combine multiple functions into a single view" to monitor securities, news and analysis, arranged by the user. — [Bloomberg Terminal Essentials: IB, Worksheets & Launchpad](https://www.bloomberg.com/professional/?p=81843)
- A Bloomberg engineering retrospective says Launchpad grew from asking what if "any visual component could be dragged out anywhere on the desktop". Clients soon filled all screens, "sometimes 200 components across 8 displays". (page 403; via search summary) — [Tech at Bloomberg, Paul Williams retrospective](https://www.bloomberg.com/company/stories/reflecting-20-years-bloomberg-engineering-paul-williams-head-application-frameworks)
- Bloomberg's 2017 UX article on relaunching Launchpad **[older]** describes Launchpad as a user-specific arrangement of connected applications across a multi-display desktop. Change was deliberately gradual because "any abrupt change to the user interface can dramatically disrupt their workflows". The goal was that a well-executed framework update would "seemingly be unchanged from a customer's perspective". (page 403; via search summary) — [Bloomberg UX, Relaunching Launchpad (2017)](https://www.bloomberg.com/ux/2017/11/10/relaunching-launchpad-disguising-ux-revolution-within-evolution/)

**Palantir Foundry Workshop / Gotham-style common operating picture**
- Workshop is a builder for "interactive and high-quality applications for operational users". All data comes from the Ontology object layer, and writeback happens through Actions. — [Palantir Workshop overview](https://palantir.com/docs/foundry/workshop/overview/)
- Widgets include Object Table/List/View, Map, Metric Card, Timeline and filters. Map layers bind to object-set variables that work in both directions: selecting on the map updates the variable, and vice versa. — [Palantir Map in Workshop](https://palantir.com/docs/foundry/map/workshopConfiguration)
- Object Views can render as a compact "panel" form factor. Training covers opening object views in a drawer, a common pattern on maps. — [Palantir panel Object Views](https://palantir.com/docs/foundry/object-views/use-panel-views-in-platform/); [Palantir AppDev 06](https://learn.palantir.com/appdev-06)
- Palantir describes Common Operating Pictures as shared views of operational information, e.g. an "on-the-wall", big-screen view with a map, relevant statistics and charts. (via search summary) — [Palantir AppDev 06](https://learn.palantir.com/appdev-06)

**Emergency computer-aided dispatch (CAD)**
- Wong & Blandford (2004 **[older]**) studied SA among senior ambulance dispatchers ("allocators") at one of the world's largest ambulance services using ethnography and cognitive task analysis. — [Wong & Blandford, SA in emergency medical dispatch](https://repository.mdx.ac.uk/item/80qy7)
- Whalen's field study of a 9-1-1 centre **[older]** warns against CAD design driven by computational capability "rather than by a detailed analysis" of dispatch work. It notes that Denver and London Ambulance temporarily reverted to manual dispatch after CAD problems. — [Whalen, Expert Systems versus Systems for Experts](https://researchgate.net/profile/Jack-Whalen/publication/263232352_Expert_Systems_versus_Systems_for_Experts/links/0f31753a314f45605e000000/Expert-Systems-versus-Systems-for-Experts.pdf)
- A 2021 patent application describes legacy CAD as "grids and tables" driven by "hotkeys, command line interfaces, and/or text-based menus". It proposes map-based call management that auto-selects incident-specific supplemental information. — [US patent application 20230049959](https://patents.justia.com/patent/20230049959)
- Vendors: IPC's IQ/CAD manages resources through "a single, map-based graphical user interface" where "additional screens appear as users add information" (date unclear, likely **[older]**). — [Urgent Comms, Map-driven CAD system promises simplification](https://urgentcomm.com/?p=7034)
- Motorola Guardian CAD's recommended-resourcing tool suggests which units to send based on predetermined parameters, to reduce decision fatigue. — [Motorola Guardian CAD data sheet (PDF)](https://www.motorolasolutions.com/content/dam/msi/docs/en-xu/public-safety/guardian-cad-data-sheet-police.pdf)
- Esri's geospatial CAD paper: GIS plus automatic vehicle location (AVL) lets dispatchers see incidents and units. Address verification is still required, because the caller's location may differ from the incident's. — [Esri Geospatial CAD white paper (PDF)](https://geonet.esri.com/ccqpr47374/attachments/ccqpr47374/public-safety-docs/9/1/J9699%20Geospatial%20Computer%20Aided%20Dispatch.pdf)
- A vendor/portfolio case study describes a three-panel CAD layout: active events table, live unit map and remarks feed on one screen, so dispatchers don't navigate away (marketing/portfolio, unverified). — [NexCAD portfolio](https://contra.com/p/EXsL2NXg-nex-cad-computer-aided-dispatch-platform-for-emergency-services)

**Airline operations control (OCC)**
- Bruce (2011) observed 52 controllers across six airline OCCs on simulated disruptions. Controllers distinguish levels of "decision considerations", a step underemphasised in both literature and OCC practice. — [Bruce 2011, IJAVIM via IDEAS/RePEc](https://ideas.repec.org/a/ids/ijavim/v1y2011i1-2p89-104.html)
- A TU Darmstadt dissertation notes that OCC decision-support systems "have mainly been a theoretical construct" and have hardly been used in practice. — [TU Darmstadt tuprints](https://tuprints.ulb.tu-darmstadt.de/7636)

### Inferences
- **Two proven models for multi-concern work:**
  - user-arranged plus linked components (Bloomberg): fits experts with stable, idiosyncratic workflows;
  - builder-configured operational apps with linked map/list/object panels and drawers (Palantir), plus single-screen map-centric CAD.
  FleetOS's "one environment" vision is closest to the CAD/COP model. The "recomposition" element has no direct precedent in these tools.
- **Linked selection is the universal glue** (map selection ↔ list ↔ detail drawer). A living composition can build on this: selecting a truck re-centres related transports, driver, fuel and documents without changing pages. That is "recomposition by focus", which users initiate and therefore predict.
- **Recommendation without rearrangement** (Guardian CAD recommended units; Numeo escalations; project44 flagged cases) is the established way to let the system "surface what matters" without moving the user's furniture.
- **Bloomberg's change-management stance** ("abrupt change … disrupt[s] workflows") is a strong caution. Any recomposition FleetOS does should be incremental and spatially conservative.

### Gaps
- No primary Bloomberg UX article text retrieved (403). The quotes are from search-engine summaries and should be verified before external citation.
- No public documentation found on Palantir Gotham's operator-facing layout behaviour, or on whether Palantir apps adapt layout automatically.
- No public sources found on Uber/Lyft marketplace-operations consoles or trading-desk layout studies.

---

## 4. Concrete lessons, failure modes and quotes on predictability vs adaptivity in operations contexts

### Takeaway
The empirical HCI record is consistent:
- **Adaptive UIs that move things hurt performance and satisfaction.**
- **Adaptations that leave the original layout intact** (a "split" region, replication, highlighting) can help, but only when the system's predictions are accurate (about 70–80%).
- **Users prefer control:** user-adaptable or mixed-initiative over purely system-driven.

Combined with the automation-surprise and out-of-the-loop literature, the lesson for a self-reorganising dispatch UI is clear: keep spatial stability, adapt within designated regions, keep accuracy high and changes infrequent, and make every system-initiated change visible, explainable and reversible.

### Cited Findings
- **Findlater & McGrenere (CHI 2004 [older]), 27 subjects, split menus.**
  - "The static menu was found to be significantly faster than the adaptive menu".
  - The user-adaptable menu was faster than adaptive under some conditions, and most users (55%) preferred adaptable; 30% preferred adaptive and 15% static, even though static was the optimal menu.
  - "Most users prefer the control afforded by an adaptable approach … rather than a system-controlled adaptive approach".
  - The authors suggest mixed-initiative designs, e.g. "have the system periodically suggest additions/deletions".
  — [Findlater & McGrenere 2004 (PDF)](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- The same paper describes Microsoft Office 2000's adaptive menus: items appeared and disappeared based on use, and "users cannot view or change the underlying user model". In a field study, most participants preferred a user-adaptable alternative to that adaptive interface. — [Findlater & McGrenere 2004 (PDF)](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)
- **Gajos, Czerwinski, Tan & Weld (AVI 2006 [older]).**
  - They compared a "Split" interface (adaptive items copied into a separate region), a "Moving" interface (items relocated) and "Visual Popout" (highlighting).
  - Users ranked Split highest (p<0.001). User comments credited Split with "stability" and "semantic grouping"; Moving drew "instability"; Popout drew "poor discoverability".
  - Participants were significantly faster with Split than with the non-adaptive baseline, and only marginally faster with Moving.
  - Both adaptive interfaces were faster at 70% than at 30% prediction accuracy. Participants used the adaptation more when accuracy was higher.
  - The framework factors are stability, locality, adaptation frequency, accuracy, predictability, interaction frequency and task complexity.
  — [Gajos et al. AVI 2006 slides (PDF)](https://www.eecs.harvard.edu/~kgajos/papers/2006/kgajos-avi06-slides.pdf)
- **Gajos et al. (CHI 2008 [older]), predictability and accuracy.** Raising both strongly improved satisfaction. Accuracy had a stronger effect on performance and utilisation than predictability. (via search summary) — [Microsoft Research, Predictability and Accuracy in Adaptive User Interfaces](https://www.microsoft.com/en-us/research/?p=145411)
- **Findlater et al. (CHI 2009 [older]), ephemeral adaptation.** Predicted items appear first and the rest fade in. These menus beat static menus at 79% accuracy but not at 50%. (via search summary) — [Findlater et al. 2009 (PDF)](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- **Findlater & McGrenere (2008 [older]).** Adaptive interfaces are "more beneficial when screen real estate is constrained". (via search summary; I could not tell which of the returned papers the quote came from, so verify before citing) — [UMass reading list copy (PDF)](https://groups.cs.umass.edu/nmahyar/wp-content/uploads/sites/8/2019/01/reading30.pdf)
- **Control-room change management.** The ASM paper notes that operators typically challenge HMI changes, so leadership buy-in and human-factors-led onboarding are needed. Requirements should come from scenario-based decision needs, not preferences. — [ASM white paper 2015 (PDF)](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/March%2031%202015%20-%20Operator%20Situation%20Awareness%20and%20Delivering%20ASM%20compliant%20High%20Performance%20HMIs%20Failure%20Modes%20and%20Success%20Factors.pdf)
- **ATC.** Changes to controller working positions are "a matter of considerable significance, potential sensitivity", and "acceptance … can be won or lost". — [SKYbrary](https://skybrary.aero/articles/controller-position-design)
- **Bloomberg.** "Any abrupt change to the user interface can dramatically disrupt their workflows." (via search summary) — [Bloomberg UX 2017](https://www.bloomberg.com/ux/2017/11/10/relaunching-launchpad-disguising-ux-revolution-within-evolution/)
- **Automation surprise.** Indirect, system-initiated mode changes with poor feedback ("silent") produce surprise. Operators ask "what is it doing now / what will it do next / why did it do this". (via search summary) — [NASA NTRS](https://ntrs.nasa.gov/api/citations/19980016965/downloads/19980016965.pdf)
- **Out-of-the-loop / ironies.** Automating the routine leaves humans with monitoring plus the hardest cases, while their skills degrade. — [Bainbridge 1983 (PDF)](https://gwern.net/doc/sociology/technology/1983-bainbridge.pdf)
- **Exception-agent era.** project44 keeps humans for judgment cases, out-of-pattern carrier responses, and a **weekly review of agent behaviour**, with every action logged. — [project44 blog, May 2026](https://www.project44.com/es/?p=80631). Flexport positions AI as "human in the loop". — [Air Cargo Week](https://aircargoweek.com/betting-on-human-in-the-loop-ai-for-reliability/). Nucleus notes Loft does not "promise full autonomy". — [Nucleus Research](https://nucleusresearch.com/research/single/fourkites-expands-its-control-tower-strategy-with-loft/)
- **CAD failure mode.** Technology-driven CAD led centres such as Denver and London Ambulance to temporarily revert to manual dispatch **[older]**. — [Whalen](https://researchgate.net/profile/Jack-Whalen/publication/263232352_Expert_Systems_versus_Systems_for_Experts/links/0f31753a314f45605e000000/Expert-Systems-versus-Systems-for-Experts.pdf)
- **Endsley.** Support "flexib[ility] to meet changing goals" and "[user] controlled flexibility for changing needs and priorities", alongside "one-step access to any screen or task". — [Endsley NDIA 2012 (PDF)](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)

### Inferences
These are my interpretation for FleetOS, not documented findings.
- **"Split, don't move."** Keep an anchored map plus stable home positions for core concerns (transports, trucks, drivers). Put system-driven recomposition in a designated adaptive zone ("what matters now"), or as additive emphasis on the map. Never relocate the furniture the user has learned. This is the Gajos "Split" result applied to space.
- **Accuracy gate.** Only promote an item into the attention zone when confidence is high. Below that, show it in the stable lists without salience. Low-accuracy adaptation (about 30–50%) produced no benefit in the studies.
- **Throttle adaptation frequency.** Recompose at event boundaries (new exception, shift start, focus change), not continuously. Respect an alarm-style budget so the environment stays calm.
- **Make recomposition observable.** Each system-initiated change should carry a reason ("surfaced because ETA at Zaragoza slipped 45 min"), a short visible transition, and pin/dismiss/snooze controls. Shelving with auto-return is the industrial precedent. This addresses "what is it doing now / why".
- **Mixed initiative over pure adaptivity.** User-initiated focus recomposition (select a driver and the environment gathers their truck, transports, hours and documents) is predictable because the user caused it. System-initiated recomposition should mostly *suggest* ("3 items need you"), not take over.
- **Weekly review loop.** Borrow project44's "review agent behaviour" ritual as a FleetOS feature: a calm log of what the environment surfaced, suppressed or auto-handled.
- **Iberian carrier office context.** Small dispatch teams (often 1–5 planners) handle long-haul PT↔ES↔EU traffic with tachograph rules, port/border waits and shipper portal obligations. That favours a single shared environment with low alarm rates and strong exception grouping, e.g. one root cause such as a strike or a closure at a border crossing affecting many transports.

### Gaps
- No empirical study found that tests **system-rearranged layouts in real-time operational monitoring** (as opposed to menus/toolbars in office software). The HCI evidence is from productivity software and is older (2004–2009). Transfer to dispatch is an inference.
- No documented commercial operations product found that autonomously recomposes its layout, so there are no field-failure or field-success reports specific to that idea.
- No quantitative data found on dispatcher alarm/alert rates in trucking comparable to ISA-18.2 benchmarks.
