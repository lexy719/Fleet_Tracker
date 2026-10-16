# FleetOS: connected operational environment

Date: 9 October 2026. Initial connected experiment at `/__dev/fleetos-environment?connected`.

Correction after user review: the authored environment is restored as the default. Switching to this replacement layout went beyond improving the established pages. Subsequent backend integration should retain the existing instruments and composition grammar. The implementation and validation below describe the separate experiment, not the default interface.

The underlying problem was that adding a domain changed the visible labels more than the work a dispatcher could perform. A Driver collection needed actual commitments and next stops; a transport needed a valid next action and its blockers. Another status tile did not answer those questions. The authored instruments remain the default, and the one-world experiment remains at `?world`. The separate connected experiment reads FleetOS operations through an application projection and writes through its existing operational service.

## What the trucking software research changes

McLeod describes dispatch planning in terms of assignments, driver activity across past/current/future work, equipment information and exceptions such as late loads and appointment conflicts. Its planner offers operational actions in that context. This supports organizing FleetOS around commitments and decisions, with related resources available in the same working context. It does not imply that FleetOS currently detects every conflict described by McLeod. [Official McLeod release](https://www.mcleodsoftware.com/why-mcleod/resources/press-releases/mcleod-softwares-new-release-reimagines-the-user-experience-offering-flexibility-real-time-insights-streamlined-back-office-tools/).

Samsara separates an ordered route and its assigned resource from stop progress, planned times and actual arrival/departure events. Its API guide also describes dated stop windows and validates route ordering. For FleetOS, the useful route view is therefore a sequence of work with recorded completion and explicit timing provenance. A city pair or an undated clock window cannot establish an arrival prediction. [Official routing guide](https://developers.samsara.com/docs/routing-guide), [official route creation guide](https://developers.samsara.com/docs/creating-routes-via-api).

Alpega's execution material connects transport allocation, tracking, slots, exceptions and settlement. Its broader shipper/carrier perspective is useful for understanding document and exception relationships, but does not replace a truck operator's resource model. [Official transport execution overview](https://www.alpegagroup.com/en-en/transport-execution/).

These are product and API references, rather than a hands-on comparison of licensed products. The design inference is to make each added context answer a concrete shared question, with FleetOS's available data deciding how much of that answer can be supported.

## The backend already present

FleetOS has an operational domain and persistence layer. It is currently local to the browser, rather than a remote multi-user fleet service.

| Existing boundary | Role in this slice |
| --- | --- |
| `OperationsService` | Only path for instructions, stop completion and lifecycle changes. Existing domain rules remain responsible for accepting or rejecting a command. |
| `OperationalStore` / IndexedDB | Atomic record and event writes, with optimistic revision checks. |
| Job lifecycle | Stage progression, required resource references and stop-completion conditions. These rules are not comprehensive legal clearance. |
| Driver and truck domains | Qualification records, declared availability and operational state derived from assignments. |
| `createOperationalQueries` | Resource assignment and execution-timeline reads. Missing or stale execution remains unavailable for arrival predictions. |
| Documents | Issued records and their saved snapshots. Editing instructions does not rewrite an issued guide. |
| Regulation records | Saved route assessment, input revision and dataset provenance. The read model uses the seeded regulation dataset, not a live merge of enabled road-event/ingestion sources. |

The existing backend route analysis remains relevant: `fleetos-backend-route-analysis.md`. In particular, the operational planning modules are more extensive than the interfaces currently exposed in this new environment. A frontend must not treat the presence of those modules as proof that automatic dispatch, comprehensive feasibility or production synchronization is already integrated.

## Implemented behavior

`src/application/environmentQueries.ts` projects supplied jobs, drivers, trucks, trailers and documents. There is no fallback to the earlier J-4217 synthetic world. Execution work appears before other jobs, and working resources before free ones. Resource commitments are ordered with executing work first and then recorded dated commitments. This ordering is not a prediction of release time.

| Composition | Operational answer |
| --- | --- |
| Jobs | Next recorded stop, deadline, assigned resources, issues and the next lifecycle action with its blockers. |
| Drivers + Jobs | Actual active/queued transports for each driver, their routes, stage, deadlines and issues. Free drivers retain their own qualifications and manually recorded baseline. |
| Drivers + Jobs + Routes | Ordered stops for those commitments, completion records, dated windows where available and the distinction between a confirmed legacy route and an available execution timeline. |
| Trucks + Jobs | Actual commitments, truck/trailer references, recorded cargo and capacity facts. Declared availability and derived operational state are shown separately. |
| Documents | Actual issued documents, missing expected guides and customer/reference context. Issuance and PDF workflows are not connected here yet. |
| Conditions | Saved assessment status, date and dataset version, plus missing/stale assignment information. No assessment is displayed as an unrestricted route. |

The small rail adds/removes domains. Adding context opens or reuses a combined composition retaining the anchor and participating domains. “Organizar por” changes the organizing resource while retaining the other contexts. Object links preserve the participating domains. Clicking the base domain returns to its collection. Tabs preserve their filter, query, selection, scroll and unfinished instructions. Esc restores the captured source frame. Confirmed operational changes remain shared across tabs. Frames and unfinished drafts are session state, not durable browser records.

The board, detail host and map stay mounted during composition changes. The live context regions widen during the transition; the work region also morphs when an object is opened. Wide compositions scroll horizontally rather than compressing all six domains into unreadable cells. The map is shown only when there is saved route geometry. Stored latitude/longitude coordinates are converted to MapLibre's longitude/latitude order. Camera state is captured in frame history; native saved-route camera interactions have not been reviewed in this slice.

## Data ownership and editing

The runtime opens saved FleetOS operations without calling demo bootstrap, reset, reanchoring or SLA upkeep. If no saved jobs exist, the initial demonstration uses the separate database `fleetos-environment-operations-v1`. The source selector lets the user explicitly open saved operations, including an empty job collection with existing resources. Existing records in the demonstration database are retained. If IndexedDB cannot be opened for the demonstration, the temporary-memory session is identified in the interface.

Instructions, eligible stop completion and available lifecycle actions write through `OperationsService`. The command adapter reloads before comparing the expected job revision, then relies on the store's atomic revision check during the service commit. A stale edit is rejected. The form keeps its text and shows the current saved instructions; the user can discard it or explicitly continue editing against the reviewed revision. Continuing an edit stages it again; it does not automatically write. Completing a stop preserves an unfinished instructions draft.

No production application providers or production pages were replaced. The new application file is a read projection; the connected interface remains in the DEV entry. Browser verification used isolated Playwright contexts, not the user's saved browser database.

## Validation and practical limits

- Typecheck and targeted ESLint passed. The production build passed; its existing large map-vendor chunk warning remains.
- 23 focused test files / 188 tests passed: the environment suite, operational service and operational persistence tests. The new checks cover frame preservation, combined navigation, persisted notes/events, stale edits across services, serialized writes and absent execution.
- Native browser checks verified combined tabs, actual resource commitments, draft history, persisted instructions after reload, two-page revision conflicts, stop completion, draft preservation during stop completion and explicit conflict resolution.
- Opening a pre-existing saved operation did not reseed its records or append operational events.
- 161 native control checks covered all six collection bases, context addition/removal, filters, sampled object links and returns, search clearing, refresh, tab switching and closing. Current navigation readouts were excluded. This is not an audit of every possible control in every combination.
- At 1440, 1199 and 900 pixels, live context cells had multiple intermediate widths while the canvas hosts retained identity. Five screenshots were captured and reviewed. No browser page errors were recorded.

Evidence: `connected-browser-report.json`, `connected-control-audit.json`, `connected-jobs-1440.png`, `connected-drivers-1440.png` and `connected-detail-{1440,1199,900}.png` in the task visualization artifact directory. The older 384-state synthetic inventory does not establish equivalent coverage for this connected surface.

## Next backend-driven instruments

1. Connect assignment and replanning as reviewed proposals: current assignment → candidate resources and recorded route → changed windows/compatibility → confirmation through the operational planning boundary. Preserve the source frame and reject stale planning inputs. The current environment cannot assign a backlog job or calculate a replacement route.
2. Make the route instrument compare planned execution with recorded stop events. It needs persisted dated windows, actual route geometry and an execution record before displaying an arrival or margin. Clock-only legacy stops need an explicit dating workflow.
3. Deepen Drivers into commitment and driving-time instruments using the real baseline and confirmed execution. Manual recorded hours must not become live remaining legal time. Truck compatibility must retain which facts belong to the tractor, trailer and combination.
4. Connect document issuance and review to immutable snapshots, and bring fresh road-event/dataset provenance into route review. A previously saved assessment needs a visible relation to the inputs that produced it.
5. Add a remote service boundary, authentication, permissions, tenant isolation and change propagation when shared company operation is required. Existing local revision checks help protect browser edits; they are not a substitute for those server responsibilities.

This is a usable first connected slice, rather than a completed transport management system or a replacement for all the richer synthetic instruments.
