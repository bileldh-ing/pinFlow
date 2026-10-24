# PINFLOW STUDIO — Senior Engineering Master Build Prompt

**Product:** PinFlow Studio  
**Category:** Premium web-based Arduino / ESP32 programming environment  
**Primary promise:** Convert supported Arduino C++ sketches into editable Scratch-style blocks, edit blocks and code side by side, and keep both representations synchronized in real time without silently changing program behavior.  
**Target user:** Makers, robotics students, educators, IoT developers, Arduino and ESP32 hobbyists, and advanced users who need a visual programming interface without abandoning real C++.

> **Instruction to Hark Pro:** Treat this file as the product specification, engineering contract, test plan, and acceptance checklist. Do not respond with only a plan, mockup, or code snippets. Inspect the existing repository first, research the current official documentation for all selected technologies, then implement the working product in vertical slices. Run tests after each slice, keep this document's checklist updated, and clearly distinguish implemented, tested, partially implemented, and blocked items. Never claim a feature works until it has been exercised in the repository.

---

# 0. EXECUTIVE DIRECTIVE

Build **PinFlow Studio**, a premium SaaS web application for authoring Arduino C++ visually and textually. Its defining feature is **true bidirectional code/block editing**:

- A user imports or writes a valid Arduino sketch in a professional C++ editor.
- The application parses supported constructs and maps them to editable visual blocks.
- Blocks and code appear side by side and stay synchronized.
- The user can add, edit, move, nest, duplicate, disable, comment, reconnect, or delete blocks.
- Every block edit updates the source code quickly and deterministically.
- Text edits are parsed incrementally; supported changes update blocks without losing the user's work.
- If code contains syntax or language constructs the visual editor cannot faithfully represent, the application preserves them explicitly as advanced/raw C++ regions, shows a coverage indicator, and never silently deletes or rewrites them.
- The user can configure a target board (for example, ESP32 Dev Module or Arduino Uno), manage dependencies, compile with the real Arduino toolchain, inspect diagnostics, export the sketch, and—with an explicitly configured local bridge—upload it to connected hardware.

This is an educational and developer tool, not merely a Blockly demo. Deliver a robust editor, a carefully designed C++ subset, a loss-aware parser and code generator, real persistence, a safe compile path, an attractive interface, and meaningful automated tests.

## Non-negotiable principles

1. **Correctness before visual magic.** Do not pretend arbitrary C++ can always be mapped cleanly into a finite block vocabulary.
2. **Never lose user code.** Unsupported source must remain intact in an explicit raw/advanced-code block or an explicitly marked unsupported region.
3. **No silent semantic changes.** If an import cannot be represented without losing syntax or meaning, show what cannot be mapped and preserve the original source.
4. **No fake compiler.** Compilation uses Arduino CLI or a clearly identified local toolchain. Mock results are permitted only in automated UI tests.
5. **No unsafe arbitrary command execution.** Compile and upload infrastructure must be sandboxed, allowlisted, authenticated where applicable, and isolated per job.
6. **Real application state.** Projects, settings, versions and workspace state must persist to a real database and recover after reload.
7. **Professional responsive design.** A wide desktop workspace is the primary experience; tablet and mobile layouts must remain usable rather than merely shrinking desktop panes.
8. **Research current documentation.** Verify the latest stable compatible versions at implementation time. Pin exact versions in the lockfile and document why each dependency is used.
9. **A feature is complete only when tested.** Each feature requires explicit acceptance criteria and automated tests where feasible.

---

# 1. PRODUCT EXPERIENCE AND CORE USER JOURNEY

## 1.1 Landing page

Create an original premium landing page with the visual quality of a modern professional developer tool—not a generic AI SaaS template.

Sections:

- Hero with a clear product statement: **“Arduino code. Visual clarity. One living project.”**
- Product preview showing editable blocks and real C++ synchronized side by side.
- Interactive demonstration using a small ESP32 + DHT11 example.
- Feature sections: code ↔ blocks, real compilation, board-aware blocks, sketch templates, version history and collaboration.
- Template cards for ESP32 sensors, LED control, buttons, PWM, Servo, Serial Monitor and DHT11/DHT22.
- Trust section describing local hardware bridging, project privacy, compiler isolation and transparent block coverage.
- Pricing / plan section only if billing is implemented; no fake purchase buttons.
- FAQ, documentation, changelog, status page link if available, terms, privacy and contact.
- Sign in and “Create your first sketch” calls to action.

Keep the landing page fast and accessible. Use authentic interface previews rendered from the actual application when possible; avoid placeholder dashboards masquerading as working UI.

## 1.2 Account and onboarding

Support:

- Email/password authentication and a provider-based sign-in flow if configured.
- Email verification, password reset, session expiration and sign-out.
- User profile: display name, avatar, language, theme and editor preferences.
- Onboarding: choose skill level (beginner, intermediate, advanced), preferred board, default editor layout and initial template.
- Create a new project from a blank sketch, a template or an imported `.ino`/`.cpp` file.
- An optional guided DHT11-on-ESP32 tutorial that can be skipped.
- First-run empty states, loading states and actionable error recovery.

Do not require account creation to view a public demo. Saving to a cloud account requires authentication. Offer local temporary work only if its persistence behavior is clear to the user.

## 1.3 Projects dashboard

Include:

- Recent projects, pinned projects, search, sort, filtering and grid/list layouts.
- Project name, board target, last edited timestamp, block coverage status and latest compile result.
- Create, duplicate, rename, archive, restore, export and delete.
- Soft-delete or trash with recovery window if practical.
- Import `.ino`, `.cpp`, `.h`, `.zip` Arduino sketch packages and a native PinFlow project archive.
- Warn before importing unsupported or potentially oversized archives.
- Import preview: file tree, recognized board/core hints, dependencies, parsing report and expected block coverage before committing.
- Project templates with screenshots/diagrams only when actual assets exist.

## 1.4 Main editor: premium three-zone workbench

The editor is the heart of the product. Desktop should feel like a serious engineering tool with a carefully balanced hierarchy.

### Layout

- **Top application bar:** logo, project name, save/sync state, undo/redo, target board selector, verify/compile action, export, upload (when configured), help and account menu.
- **Left navigation rail:** projects/files, blocks toolbox, variables, functions, libraries, pins/hardware, diagnostics and history.
- **Main work area:** resizable split panes for blocks and source code. Users can choose side-by-side, blocks-first, code-first or focus mode.
- **Bottom/status area:** parser state, block coverage, board/core/library state, compilation status, cursor line, modified state and connected-device state.
- **Right inspector:** contextual options for the selected block, board pins, library configuration, variable details or generated-code mapping.

Default desktop view: blocks on the left, code on the right, synchronized vertical navigation and a draggable divider. Provide a one-click maximize action for either pane. Pane sizes and last layout should persist.

### Design direction: “Liquid Glass Workbench”

Use a premium, restrained glass aesthetic:

- Dark graphite/ink workspace as the default engineering canvas, with a polished light theme as a first-class option.
- Translucent navigation and inspector surfaces, subtle blur, restrained borders, soft shadows, fine highlights and depth.
- Accent colors inspired by mint, electric cyan and a warm amber reserved for warnings; colors must remain readable and must not be the only means of communicating state.
- Sophisticated typography, strong spacing rhythm, compact editor controls and carefully designed iconography.
- Blockly blocks should be colorful enough to communicate categories, but with a unified design system: tasteful gradients or highlights, clear labels, precise input sockets and visible connection affordances.
- Monaco editor should retain proper code-editor ergonomics: readable monospace font, syntax highlighting, indentation, line numbers, diagnostics and a professional dark/light theme.
- Motion should be fluid but quiet: 120–220 ms interaction transitions for ordinary UI; avoid animating large expensive surfaces continuously.
- Use GPU-friendly transforms/opacity for motion. Do not animate layout dimensions when that causes scroll jank.
- Respect `prefers-reduced-motion`, keyboard focus, contrast requirements and touch targets.
- No blur behind every surface; preserve text clarity and rendering performance.
- Provide skeletons for true async operations, helpful empty states and visible error messages.

### Responsive behavior

- Desktop: full synchronized split view.
- Small laptop/tablet: resizable panes and focus modes; toolbox becomes collapsible.
- Phone: prioritize reviewing code or blocks in tabs/focus mode, not a cramped split view. Editing remains possible, but advanced compile/upload actions may be limited by device/browser support.
- Avoid horizontal overflow, clipped menus and controls hidden behind the virtual keyboard.

---

# 2. TECHNICAL STACK AND ARCHITECTURE

Choose technologies based on maintainability, parser/editor performance and a secure Arduino compile workflow.

## 2.1 Recommended stack

### Web platform

- **Next.js 16.4.x or the latest stable compatible release at implementation time**, using App Router for product pages and authenticated application routes.
- React stable version supported by that Next.js release.
- TypeScript in strict mode; no broad `any` escapes for core parser, project or sync models.
- pnpm workspace/monorepo with lockfile and shared packages.
- Tailwind CSS with a token-based design system. Use CSS variables for themes, glass surfaces, spacing and motion.
- Accessible primitive components from a maintained library such as Radix UI, with a customized original PinFlow design system.
- Framer Motion or a compatible maintained animation library for interface transitions; native CSS for simpler transitions.

### Core editing components

- **Google Blockly** for the block workspace, using custom block definitions, a carefully designed toolbox, custom theme/renderer only where necessary, and a dedicated Arduino C++ generator.
- **Monaco Editor** for code mode: syntax highlighting, completion hooks, diagnostics, diff editor and source navigation.
- **Tree-sitter C++ (WASM in a Web Worker)** as a resilient, incremental concrete-syntax parser for source structure and ranges. Verify the current maintained grammar and WASM integration at implementation time.
- A **PinFlow Arduino Intermediate Representation (IR)** owned by the application. Blockly workspace state is a visualization/editing model, not the only canonical representation of source semantics.
- Parser, synchronization and code generation should run away from the main UI thread where practical, with cancellation of obsolete parse jobs.

### Backend

- PostgreSQL with a maintained typed ORM such as Drizzle or Prisma. Choose one rather than duplicating data access abstractions.
- Managed PostgreSQL/auth/object storage is acceptable (Supabase is an option), provided tenant isolation and row-level security are configured and tested. Alternatively, implement a standard Auth.js/OIDC-compatible identity layer and managed Postgres.
- Next.js Route Handlers/server actions for ordinary product workflows; a dedicated compile-job service/worker for Arduino toolchain work.
- Redis-compatible queue/caching service if required by compilation queues or collaboration.
- WebSocket/SSE only where needed for job progress, presence or collaboration; do not make all project data depend on a permanently open connection.
- S3-compatible object storage for project archives, attachments and export artifacts where cloud files are used.

### Compilation and device integration

- **Arduino CLI** for board/core/library management, sketch compilation and, through the local bridge, upload. Official docs: https://arduino.github.io/arduino-cli/latest/ and https://docs.arduino.cc/arduino-cli/getting-started/ .
- Cloud compilation must execute in a short-lived, resource-limited sandbox/container with isolated file system, CPU/memory limits, timeouts and restricted network access. Never run arbitrary user C++ directly inside the main web server.
- Optional **PinFlow Bridge**, a small local companion service (prefer Rust for a compact, explicit, least-privilege executable; Node.js/TypeScript is acceptable if Rust would delay reliable delivery). The bridge exposes an authenticated loopback-only API to the web app for local board discovery, compile and upload workflows. It must never provide arbitrary shell execution.
- Browser-only Web Serial can be considered for supported workflows, but do not claim it can replace the complete board/core/library upload toolchain across all browsers and operating systems.
- Treat Arduino CLI's redistribution and licensing requirements as a formal release check, especially for a commercial SaaS product. Do not bundle or redistribute tools without reviewing their licenses and complying with required obligations.

### Quality and operations

- Vitest for unit/component tests, Playwright for end-to-end browser workflows, and fast-check for property-based parser/synchronization invariants if practical.
- ESLint, Prettier, TypeScript strict checks, dependency/license auditing and secret scanning.
- GitHub Actions or another CI runner.
- Structured logs with request/job/project IDs; metrics for parsing duration, code generation duration, compile duration, sync failures and worker failures.

### Version policy

Before installation, check official release notes and compatibility matrices. Select the current stable set that works together, pin exact versions and commit a lockfile. Do not use prerelease packages for core editor/parser/compile paths unless justified and isolated behind an experiment.

## 2.2 System architecture

Separate the platform into these layers:

1. **Presentation:** responsive Next.js UI, Blockly, Monaco, panel state and user feedback.
2. **Editor orchestration:** tab/file management, shared project revision, undo/redo, sync state and conflict handling.
3. **Language service:** tokenizer/parser adapter, C++/Arduino IR, supported-feature coverage, error mapping and source-range tracking.
4. **Block adapter:** IR-to-Blockly conversion, stable block IDs, Blockly event mediation, comments, mutators and custom blocks.
5. **Code generator:** block/IR-to-Arduino-C++ generation, headers, declarations, function order, formatting and source maps.
6. **Validation service:** static safety/quality checks, dependency and target-board checks, Arduino CLI compilation and diagnostics normalization.
7. **Persistence/API:** accounts, projects, file revisions, workspace state, board profiles, templates, compile jobs and project sharing.
8. **Compile worker:** sandboxed Arduino CLI, pinned toolchains/cores and bounded logs/artifacts.
9. **Local bridge:** optional local serial/board discovery and uploads, with a narrow command contract.
10. **Observability and audit:** error reporting, job status, activity events and operational metrics without collecting source code unnecessarily.

Do not build a monolithic component that controls the workspace, parser, code generator, persistence and UI in one file. Define typed interfaces between each layer.

---

# 3. THE HARDEST PART: REAL BIDIRECTIONAL C++ ↔ BLOCKS SYNCHRONIZATION

This section is the highest-priority engineering work. Build and test it before spending significant time on polish.

## 3.1 State the limitation honestly

Arduino sketches are C++ programs with preprocessor directives, arbitrary libraries, templates, macros, classes, pointer arithmetic, overloaded operators, conditional compilation and board-specific APIs. A block vocabulary cannot faithfully represent every valid C++ construct.

Therefore the promise is:

- **High-fidelity bidirectional editing for the explicitly supported Arduino subset.**
- **Loss-aware preservation for unsupported code.**
- **Clear, measurable coverage reporting.**
- **No automatic deletion or fabricated replacement of unsupported constructs.**

Do not advertise “any C++ converts perfectly” unless that has been proven for the input and language coverage. The supported subset will expand over time through tests and versioned language support.

## 3.2 Source import pipeline

Implement this pipeline for importing or editing text:

1. Preserve the exact source text, line endings and encoding as the source snapshot.
2. Parse in a Web Worker using Tree-sitter C++ or another explicitly justified parser.
3. Extract a concrete syntax tree with source byte/line/column ranges and parser error nodes.
4. Run an Arduino-aware normalization pass for `.ino` preprocessing conventions only when the behavior is understood; do not invent hidden declarations.
5. Build the PinFlow IR for supported syntax nodes, storing node type, values, source span, source text where needed, stable internal ID, parent relationship and comment/trivia association.
6. Classify each source region as `fully_visualized`, `partially_visualized`, `raw_preserved`, or `parse_error`.
7. Adapt supported IR nodes into Blockly blocks. Convert unsupported statements to a conspicuous **Advanced C++ / Preserved Code** block, or preserve a structured raw region between mapped blocks where needed.
8. Generate a coverage report with supported and unsupported construct types, line ranges and plain-language explanations.
9. Present imported blocks, source code and coverage together. Never hide import problems in a generic success toast.

If source is temporarily incomplete while the user types, keep the previous valid block snapshot visible with a status such as “Code has unsaved syntax errors; blocks show the last valid parse.” Do not clear the whole block workspace on a missing brace or partial function declaration.

## 3.3 Block edit → C++ pipeline

1. Capture meaningful Blockly events but ignore viewport-only actions when determining code changes.
2. Batch drag/move sequences and input edits into transactions; avoid generating an enormous number of revisions during a drag.
3. Convert workspace changes into a validated IR update.
4. Generate C++ deterministically for supported constructs.
5. Reinsert raw-preserved C++ chunks in their defined source positions without editing their contents.
6. Generate source maps from block IDs to code ranges and code ranges back to block IDs.
7. Update Monaco using a minimal edit/diff where practical so cursor position, selection and undo history are not destroyed unnecessarily.
8. Mark the active change origin as `blocks`, not `code`, to prevent the generated editor update from triggering another import loop.
9. Run lightweight syntax checks locally; enqueue full compilation only on user request or a debounced validation setting.
10. Show status and diagnostics without interrupting the user's action.

Deleting a block must remove only the source region owned by that block. Deleting a parent control-flow block must provide clear behavior for nested blocks, comments and unsupported raw regions. If a deletion could drop preserved source, show a confirmation and/or move the content into an explicit orphaned-code panel rather than erasing it.

## 3.4 C++ edit → blocks pipeline

1. On Monaco text change, debounce parsing (e.g., 250–500 ms, tune with profiling) and cancel stale jobs.
2. Parse in a worker and verify the result revision still matches the current editor revision.
3. Update the IR and compute a structural diff against the prior valid IR.
4. Preserve stable IDs and block identity for unchanged constructs, when possible, rather than recreating every block on every keystroke.
5. Apply a workspace diff to Blockly and preserve viewport, scroll, selection and user positioning where possible.
6. Do not rearrange a user's manually organized workspace for harmless code formatting.
7. If a construct is unsupported, turn that source region into a raw code block with exact original content and a visible badge; allow the user to open and edit it as text.
8. If a syntax error makes safe structural mapping impossible, keep the last valid block state and show parser errors tied to source lines. Offer explicit actions: “Retry parse,” “Keep code as-is,” or “Convert this region to advanced code.”
9. Never replace user text with newly generated code merely because parsing ran.
10. Only a successful, explicitly committed parse may become the new shared structural state.

## 3.5 Conflict and loop prevention

Implement a typed synchronization coordinator with fields such as:

- `revisionId`
- `origin`: `blocks | code | import | generator | undo | redo | remote`
- `parseStatus`
- `blockRevision`
- `sourceRevision`
- `coverageReport`
- `dirtyState`
- `lastSuccessfulParseRevision`
- `lastSuccessfulGenerationRevision`

Rules:

- Never treat a generated Monaco update as a user text edit.
- Never treat a parser-driven Blockly update as a user block edit.
- Debounce or coalesce the appropriate operations, not all actions indiscriminately.
- Ignore responses from older async jobs.
- A user can continue editing while a prior compile runs; the result must be tagged with the exact project revision that was compiled.
- If a server revision conflicts with the local revision, offer compare/reload/duplicate resolution rather than silently overwriting either one.
- Undo/redo must apply coherently to source and blocks. Use a unified logical command history or carefully coordinated history snapshots. Do not maintain two independently drifting undo stacks.

## 3.6 Round-trip and preservation invariants

Add tests that establish the following properties:

1. `parse(generate(blocks))` produces a normalized IR equivalent to the original block IR for every supported fixture.
2. Import → blocks → generate produces semantically equivalent code for supported constructs.
3. Unsupported/raw C++ survives import and generation byte-for-byte where the region has not been explicitly edited.
4. Comments, string literals, escaped characters, nested braces, preprocessor directives and blank lines never confuse brace matching or truncate source.
5. Parentheses, operator precedence, unary operators and evaluation order are preserved.
6. A code edit to one statement does not unexpectedly reset unrelated block IDs, comments or workspace layout.
7. Repeated synchronization reaches a stable fixed point: further no-op sync cycles do not produce code/workspace changes.
8. A failed parse never overwrites the last known-good block structure.
9. A compiler diagnostic maps to the correct file and source range; if a block owns the range, the user can navigate to that block.
10. Saving/reloading a project retains the source, blocks, raw chunks, board configuration and mapping metadata.

Use golden test fixtures and property-based tests where feasible. Run them in CI.

---

# 4. SUPPORTED ARDUINO LANGUAGE: VERSION 1

Create a formal **PinFlow Arduino Visual Subset v1** document that specifies exactly what becomes native editable blocks and what remains an advanced/raw region.

## 4.1 Native C++ blocks

Implement these first, with appropriate input/output types and valid generated C++:

### Sketch structure

- `setup()` definition
- `loop()` definition
- User-defined function definitions with supported return types and parameter lists
- Function calls for supported expressions
- Global and local variable declarations for common scalar types
- Constants / `const` declarations
- Assignments and compound assignments
- Return statements
- Comments and named section comments

### Control flow

- `if / else if / else`
- `switch / case / default / break` (after syntax and generator tests)
- `for` loop
- `while` loop
- `do / while` only if full round-trip is reliable; otherwise raw-preserved until supported
- `break` and `continue`

### Expressions and data

- Integer and floating-point literals
- Booleans, character and escaped string literals
- Variable references
- Arithmetic, comparison, logical, bitwise and unary operators with explicit precedence
- Parenthesized expressions
- Ternary operator only if visual representation remains unambiguous
- Arrays and indexing within a deliberately defined subset
- Type casts only where semantics are understood; otherwise raw-preserved
- Enumerations/struct/class definitions are an advanced feature; do not falsely flatten them

### Common Arduino APIs

- `pinMode(pin, INPUT | INPUT_PULLUP | OUTPUT)`
- `digitalRead(pin)` and `digitalWrite(pin, HIGH | LOW)`
- `analogRead(pin)`
- `analogWrite(pin, value)` with target-specific availability notes
- `delay(ms)` and `delayMicroseconds(us)`
- `millis()` and `micros()`
- `Serial.begin(baud)`
- `Serial.print(...)` / `Serial.println(...)` for supported arguments
- `map(...)` and `constrain(...)`
- `min`, `max`, `abs` when target headers support them
- explicit library include and object construction blocks for known libraries

### ESP32-specific notes

- Board-aware pin selectors for common ESP32 families.
- Do not imply every pin on every ESP32 board is interchangeable. Include input-only pins, boot-strapping limitations, flash/PSRAM-reserved pins and board-specific ADC/PWM behavior where applicable.
- Keep target-specific rules in a versioned board profile, not hard-coded into UI components.
- Show warnings for unsafe or questionable pin configurations. Warnings are advisory unless verified for the selected board profile.

## 4.2 DHT11 + ESP32 first-class template

Include a complete starter template for an ESP32 Dev Module with a DHT11 sensor. It must include:

- Required library dependency (e.g. a compatible DHT sensor library and its dependency) detected and documented.
- `#include` directives preserved/generated properly.
- Pin constant.
- DHT instance initialization.
- `setup()`: `Serial.begin`, sensor initialization if required by selected library, and optional startup message.
- `loop()`: temperature/humidity reads, validation for failed readings, serial output, and delay.
- A configurable GPIO selection with target-aware warnings.
- Block representation for library include, object construction, variables, serial output, sensor reads, conditional validity checks and delay.
- Code generated must be valid for the selected target and dependency versions. Compile this fixture through Arduino CLI in CI where the toolchain is available.

Provide an alternate non-blocking example based on `millis()` with an explicit state/interval pattern. This helps teach users why long `delay()` calls block other work.

## 4.3 Library-specific custom blocks

Implement a block-extension/plugin model. Each library extension can register:

- library name, author, version, license metadata, compatible architectures/boards and installation instructions;
- block schemas, input/output types, mutators and tooltips;
- parser adapters or recognizable code patterns;
- code generation handlers;
- dependency declarations and compatibility warnings;
- test fixtures and generator tests.

Start with carefully tested blocks for common Arduino operations and the DHT sensor library. Add Servo, HC-SR04 ultrasonic distance sensor, button, LED, PWM, I2C/OLED and Wi-Fi/MQTT examples as later packs. Keep blocks extensible; do not make the core editor depend on one sensor vendor.

A project that uses an unrecognized library must still import: leave includes and associated code preserved, and show the user which statements are not represented by native blocks.

## 4.4 Advanced/raw C++ region

Every project must support an `Advanced C++` raw block or source island containing exact text. It should:

- show a visible “preserved source / not structurally visualized” indicator;
- expose its content in a Monaco sub-editor or code region;
- preserve comments, preprocessor directives and formatting of the raw region;
- allow the user to edit the source directly;
- have a known relationship to surrounding supported nodes;
- participate in save/export/compile;
- not be interpreted or executed by the web app;
- be explicit about whether nearby statements can be visually reordered safely.

If reordering blocks around a raw source island can change program semantics, constrain the allowed move/drop target or require a confirmation.

---

# 5. BLOCKS UX: EDITABLE, DISCOVERABLE, ACCESSIBLE

## 5.1 Toolbox categories

Create polished, searchable groups:

- Structure: setup, loop, functions, comments.
- Flow: if/else, loops, switch, break/continue.
- Logic: Boolean values, comparison, AND/OR/NOT.
- Math: arithmetic, min/max, constrain, map.
- Variables: create, rename, assign, read, type display.
- Pins & Digital I/O: pinMode, digitalRead, digitalWrite, HIGH/LOW.
- Analog & PWM: analogRead, analogWrite and board-specific variants.
- Time: delay, millis, micros and non-blocking timer patterns.
- Serial: begin, print, println, supported formatted output.
- Sensors: DHT11/DHT22, buttons, ultrasonic sensor and library packs.
- Functions: supported user-defined calls and return values.
- Advanced C++: preserved raw blocks, includes, defines and unsupported syntax.

The search box must search names, keywords, descriptions and aliases. Clicking a result should insert the block when insertion is valid, or explain why it cannot be inserted.

## 5.2 Block operations

- Drag, connect, disconnect, reconnect, reorder and nest.
- Edit dropdowns, numeric/text fields and typed expressions.
- Delete selected block, nested structure or selected sequence with a clear confirmation when preserved source is involved.
- Duplicate a block or compatible substack.
- Copy/paste within and between projects with identifier-safe behavior.
- Add comments and collapse sections.
- Rename variables/functions safely across all supported references.
- Create variables with inferred or selected type. Display a warning if an expression's type cannot be inferred safely.
- Keyboard shortcuts and context menu; visible focus states and accessible labels.
- Undo/redo across meaningful operations.
- Zoom, center, minimap/overview if useful, pan and fit-to-content.
- Search workspace and navigate to definitions/references.
- Highlight the block that generated the current code range when the user clicks a corresponding source location.

## 5.3 Custom block renderer

Use Blockly as the functional foundation, not a screenshot replacement. Customize its theme and renderer only where needed. Avoid patching fragile internals without tests. Keep block sockets, connection checking and keyboard/navigation behavior intact. All block dimensions, colors, typography and shadows should be tokenized.

---

# 6. CODE EDITOR EXPERIENCE

Use Monaco Editor with a configured C++ language service and an Arduino-aware layer.

Features:

- Syntax highlighting for C++/Arduino.
- Line numbers, folding, bracket matching and indentation.
- Autocomplete for known Arduino APIs, target board symbols, libraries and variables/functions defined in the current project.
- Snippets for `setup`, `loop`, common sensor patterns and Serial output.
- Diagnostics in editor gutter and panel.
- Go to definition/references for supported IR symbols.
- Format document only on explicit user request; formatting must not silently overwrite raw regions.
- Diff view comparing the previous generated code with current source.
- Toggle line wrapping, minimap and font size.
- Find/replace and project-wide search when multi-file support exists.
- On syntax error, underline the affected region, explain how block conversion is impacted and preserve the current source.
- Copy source, download sketch, export `.ino`/project ZIP.

Use an editor language provider and typed services. Do not implement C++ parsing with a handful of regular expressions. Regex may be used for narrow textual labels, but structure must come from a real parser.

---

# 7. LIVE SYNC DETAILS

## 7.1 Behavior matrix

| User action | Required result |
|---|---|
| Drag a `digitalWrite` block to another position | Code reorders accordingly; unrelated code remains unchanged. |
| Change pin number in a block | Code updates; selected board warnings update. |
| Edit `delay(1000)` in Monaco to `delay(500)` | Corresponding block updates after a successful parse. |
| Type a partial `if (` expression | Parse state becomes pending/error; last valid blocks remain visible. |
| Add a comment to source | Comment is represented or preserved at the correct location. |
| Import an unknown function or library call | Source remains present in a raw-preserved region; coverage report identifies it. |
| Delete a block whose source contains an unsupported region | Explicit warning/confirmation; no silent data loss. |
| Click a code diagnostic | Focus affected source and its mapped block if available. |
| Trigger undo after a block edit | Code and blocks restore the same prior logical revision. |
| Trigger undo after source edit | Source and blocks return to the prior valid state, or clearly indicate invalid pending text before rollback. |
| Change board target | Project target changes; board-specific APIs/pin warnings and compile configuration update. |
| Compile while continuing to edit | Result remains tied to the compiled revision and is labeled outdated if source changed meanwhile. |

## 7.2 Source mapping

Every generator needs a source mapping table containing:

- file path;
- generated start/end line and column;
- IR node ID;
- associated block ID(s);
- whether source is native-generated or raw-preserved.

Source maps support bidirectional highlighting, error navigation and preservation checks. Mapping precision must degrade honestly for raw regions; do not fabricate block-level locations for code the parser does not understand.

## 7.3 Performance targets

Use profiling to validate these initial targets on a representative laptop:

- Common supported-sketch parse: under 150 ms p95 for a sketch up to 1,000 lines on a modern laptop, excluding initial WASM load.
- Block-edit code regeneration: under 100 ms p95 for normal interaction on typical projects.
- No main-thread freeze longer than 50 ms from parser/generator work during ordinary editing.
- Obsolete worker results discarded, not applied.
- Workspace interactions should remain smooth while a compile job runs.

These are engineering targets, not guarantees. Record actual benchmarks and revise only with documented evidence.

---

# 8. PROJECT MODEL, FILE TREE AND PERSISTENCE

## 8.1 Multi-file sketches

Support a native project container that can hold:

- `.ino`, `.cpp`, `.c`, `.h` and `.hpp` files;
- project metadata and board profile;
- library dependencies and versions where known;
- source snapshots and Blockly/IR state;
- mapping/coverage metadata;
- compile results and logs;
- export/build metadata.

Begin with a highly reliable single `.ino` project. Implement multi-file support as a well-defined follow-on slice; do not flatten headers into one file or reorder declarations without preserving behavior. Imported directory structures must follow Arduino CLI sketch expectations.

## 8.2 Database entities

Create migrations and typed access for the core entities. Adapt names to the selected ORM while preserving the relationships:

- `users` / auth identity mapping;
- `user_preferences`;
- `projects` (owner, title, description, visibility, active revision, board FQBN/profile, archived/deleted timestamps);
- `project_members` (role and access grants if sharing is implemented);
- `project_files` (project, path, type, current revision, content hash, content/storage reference);
- `project_revisions` (revision ID, source snapshots, IR/block-state snapshot, parent revision, creator, timestamp, metadata);
- `project_dependencies` (library/core name, version and source);
- `board_profiles` (FQBN, architecture, pin metadata version, warning rules);
- `templates` and `template_versions`;
- `compile_jobs` and `compile_artifacts`;
- `device_sessions` / local bridge connection metadata where relevant;
- `audit_events` for significant security-sensitive operations.

Never store large binary compilation artifacts directly in ordinary row fields if object storage is more suitable. Use immutable content hashes for revisions/artifacts where practical.

## 8.3 Saving and recovery

- Autosave after a stable pause, but never claim “Saved” before the server acknowledges persistence.
- Show explicit states: local unsaved, saving, saved, offline, conflict and save failed.
- Use IndexedDB for a resilient local draft/outbox if appropriate. Do not rely on localStorage for large projects.
- Recover local changes after refresh/crash and offer explicit recovery when server/local revisions differ.
- Maintain useful version history with restore/duplicate/compare actions.
- Use optimistic concurrency checks or revision numbers to prevent two tabs from silently overwriting each other.
- Support export independent of account availability.

## 8.4 Access control

- Project owner, editor and viewer roles if collaboration is included.
- Authorization checks in every route/action; do not trust client-supplied project owner IDs.
- Tenant isolation verified with automated tests.
- Private-by-default projects.
- Public sharing only through an explicit user action with revocation and a preview of what becomes public.

---

# 9. REAL COMPILATION AND DEVICE UPLOAD

## 9.1 Board selector

Start with a limited, tested catalog rather than claiming universal board support:

- ESP32 Dev Module / a well-defined ESP32 core target;
- Arduino Uno (classic AVR target);
- Arduino Nano or Mega only after its board definition is tested.

Show exact Fully Qualified Board Name (FQBN), installed core version and supported features. More boards can be added through a maintainable registry.

## 9.2 Dependency management

- Read `#include` statements and project dependency metadata.
- Show recognized library dependencies with version/install status.
- Never automatically choose an ambiguous library based only on the header file name without disclosing the choice.
- Permit users to pin library/core versions.
- Cache verified toolchain packages where licensed and technically allowed.
- Record compiler/core/library versions with every compilation result.

## 9.3 Compile workflow

- “Check syntax” should run fast parser/language checks.
- “Compile” runs Arduino CLI with the selected FQBN in a sandbox or via the local bridge.
- Show queued, preparing dependencies, compiling, succeeded/failed, canceled and timeout states.
- Parse CLI output into structured diagnostics with file, line, column, severity and original message.
- Clicking a diagnostic navigates to the code. If the source mapping identifies a block, highlight it too.
- Preserve full raw output behind a details panel and allow export of build logs.
- The UI must mark compile output “outdated” if the current source hash differs from the compiled source hash.

Official references to use and verify at implementation time:

- Arduino CLI: https://arduino.github.io/arduino-cli/latest/
- Getting started: https://docs.arduino.cc/arduino-cli/getting-started/
- Compile: https://docs.arduino.cc/arduino-cli/commands/arduino-cli_compile/
- Upload: https://docs.arduino.cc/arduino-cli/commands/arduino-cli_upload/

## 9.4 Upload workflow

Uploading must be opt-in and local, not a hidden server-side operation.

- Web app confirms board, selected port, project revision, FQBN and intended operation.
- Optional local PinFlow Bridge performs allowlisted commands with strict arguments and timeouts.
- Bridge must bind to loopback only by default, validate an origin allowlist, use a short-lived pairing token or equivalent secure handshake, and reject arbitrary command strings.
- Uploading must not let the web UI pass arbitrary paths or shell snippets. Server-side and bridge-side validation are mandatory.
- Display discovery and upload progress, success/failure, logs and recovery steps.
- If device access is unavailable, show honest instructions rather than fake a successful upload.
- Default mode must be “compile only,” not “compile and upload.”

## 9.5 Compile worker threat model

Treat project files and code as untrusted:

- Run each job in a disposable, non-root container or equivalent sandbox.
- Apply CPU, memory, process-count, disk and wall-clock limits.
- Deny access to internal network metadata, secrets, other users' files and production DB credentials.
- Restrict network egress; dependency installation must be an explicit isolated step.
- Validate archive paths against traversal and symlinks before extraction.
- Delete ephemeral workspaces after job retention expires.
- Redact credentials from logs and prohibit network upload from the sketch build process unless the user explicitly configures an allowed feature.
- Add per-user rate limits, quotas and abuse protection.

---

# 10. VALIDATION, WARNINGS AND DEVELOPER HELPERS

Create a non-destructive diagnostics layer with severity levels: information, warning, error and board-dependent warning.

Examples:

- Missing `setup()` or `loop()` when importing a sketch expected to be an Arduino program.
- Undefined variable in supported subset (only when confidently analyzable).
- Incompatible data type between connected block sockets.
- Pin used without `pinMode` only as a heuristic warning, not automatically a compiler error.
- ESP32 pin restrictions, ADC/PWM differences or bootstrapping warnings based on the selected board profile.
- Blocking delays in timing-sensitive examples, presented as an educational suggestion.
- Required library missing from selected compile environment.
- Unsupported source region that prevents full structural visualization.
- Parse syntax error or incomplete code.
- Generated code differs from source in unsupported/raw regions.

Each diagnostic should state what was detected, why it matters, certainty level, source location and the recommended user action. Avoid alarmist or false-positive warnings. Give warnings a dismiss/ignore state where appropriate but do not remove them from the compile log silently.

---

# 11. OPTIONAL EDUCATIONAL AND COLLABORATIVE FEATURES

Implement these after the parser/sync/compile core is stable:

- Interactive walkthrough for “DHT11 temperature + humidity on ESP32.”
- Block-to-code and code-to-block highlighting that explains each construct.
- Hover tooltips with Arduino API signature, type and a short example.
- Pin diagram for selected supported boards.
- Save reusable snippets and local templates.
- Share a project with view/edit permissions.
- Comments/discussion per revision if collaboration is implemented.
- Public project gallery only with explicit publication and abuse/reporting flows.
- Starter challenges and tutorials with expected compile outcomes.
- Optional AI tutor behind a provider interface, disabled by default unless configured. It may explain code and suggest edits, but may not silently mutate source or replace the deterministic parser/generator. Every proposed code edit must be a reviewable diff and must pass syntax/compile validation.

These are not allowed to delay the reliability of the core synchronization engine.

---

# 12. SECURITY, PRIVACY, ACCESSIBILITY AND RELIABILITY

## Security

- Secure session management, CSRF/origin protection where applicable, rate limits and safe error messages.
- Schema validation at every API boundary.
- Parameterized database access and least-privilege service roles.
- No secrets in client bundles, project exports or compiler logs.
- Escape/render project descriptions and comments safely; do not render user-authored HTML unsanitized.
- Sandbox compilation and harden the local bridge.
- Lock dependency versions and run vulnerability/license audits.
- Explicit account deletion and data export workflows.

## Privacy

- Explain whether source projects are stored in the cloud or locally.
- Keep projects private unless shared deliberately.
- Do not use user code to train AI models unless explicitly opted in and permitted by policy.
- Establish retention windows for compile logs and temporary artifacts.
- Provide deletion of projects, versions and artifacts subject to documented retention requirements.

## Accessibility

- Keyboard-accessible menus and actions.
- Visible focus, appropriate contrast and status text beyond color alone.
- Screen-reader labels for essential controls.
- Keyboard operations for block navigation where supported, plus a code alternative for users who cannot use drag-and-drop.
- Reduced-motion mode and usable light/dark themes.

## Reliability

- Recoverable errors and retry paths for parsing, saving and compilation.
- No full-app crash from malformed user code.
- No data loss when a worker crashes or network disconnects.
- Idempotent save/compile API behavior where appropriate.
- Timeouts, cancellation and stale-job handling.
- Error boundaries and structured monitoring.

---

# 13. PROPOSED APPLICATION AND API STRUCTURE

Use actual routes/actions with shared validation schemas. Adapt naming as appropriate, but keep responsibilities clean.

## Main routes

- `/` — landing page
- `/pricing` — pricing only if commercial plans are implemented
- `/docs` — documentation home
- `/docs/arduino-subset` — supported language and conversion coverage
- `/templates` — template library
- `/dashboard` — projects overview
- `/projects/new` — creation/import flow
- `/projects/[projectId]/editor` — main workbench
- `/projects/[projectId]/history` — revision history
- `/projects/[projectId]/settings` — project settings, board and dependencies
- `/settings/profile` — account preferences
- `/settings/devices` — bridge/device connections
- `/admin` — restricted admin/operational surfaces if required

## API/domain operations

- Create/import project, create/rename/delete/move file, save revision, restore revision.
- Update board target and dependencies.
- Parse source to IR and return coverage/diagnostics/source ranges.
- Generate source from IR and return source maps.
- Validate IR/block connections.
- Create/cancel/poll compilation jobs and retrieve logs/artifacts.
- Pair/disconnect local bridge and discover supported devices through it.
- Request upload only for the current confirmed project revision.
- Export project as `.ino`, supported Arduino directory ZIP or PinFlow native archive.

All payloads must be validated with a shared schema library (for example Zod) and typed end-to-end. Do not expose generic endpoints that execute arbitrary commands.

---

# 14. REPOSITORY STRUCTURE

A reasonable starting monorepo:

```text
pinflow-studio/
├── apps/
│   ├── web/                         # Next.js product, dashboard and workbench
│   ├── compile-worker/               # Isolated Arduino CLI job worker
│   └── local-bridge/                 # Optional Rust local compile/upload bridge
├── packages/
│   ├── design-system/                # Tokens and accessible UI primitives
│   ├── block-definitions/            # Blockly definitions and toolbox packs
│   ├── arduino-ir/                   # Typed intermediate representation
│   ├── cpp-parser/                   # Tree-sitter adapter and source ranges
│   ├── arduino-parser-mapping/       # C++ CST/IR -> supported blocks/raw regions
│   ├── arduino-codegen/              # IR/blocks -> C++ and source maps
│   ├── sync-engine/                  # Revisions, origin, structural diffs, conflict logic
│   ├── board-registry/               # Board FQBNs, pin metadata, constraints
│   ├── library-registry/             # Library packs and dependency metadata
│   ├── validation/                   # Diagnostics and validation schemas
│   ├── database/                     # ORM schema, migrations and repositories
│   └── shared-types/                 # API and domain contracts
├── examples/
│   ├── dht11-esp32/
│   ├── blink-uno/
│   ├── button-led/
│   └── nonblocking-millis/
├── fixtures/
│   ├── parser-golden/
│   ├── roundtrip/
│   ├── unsupported-cpp/
│   └── compile/
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── property-based/
├── infra/
│   ├── docker/
│   └── ci/
├── docs/
│   ├── architecture.md
│   ├── parser-coverage.md
│   ├── synchronization.md
│   ├── security-threat-model.md
│   ├── local-bridge.md
│   ├── supported-boards.md
│   └── operations-runbook.md
├── pnpm-workspace.yaml
├── package.json
├── README.md
└── CHANGELOG.md
```

Do not create all folders as empty theater. Add modules when they have a real implementation or place an explicit documented scaffold in the implementation report.

---

# 15. TESTING STRATEGY — REQUIRED, NOT OPTIONAL

## 15.1 Unit tests

Test:

- token/range conversion, parser mapping and raw chunk preservation;
- operator precedence and generator parenthesization;
- string escaping, character literals, multi-line comments and preprocessor lines;
- stable ID mapping for unchanged constructs;
- generation from all native blocks;
- variable rename/reference consistency;
- board-aware warning rules;
- source-map and diagnostic coordinate mapping;
- revision/conflict and autosave state transitions;
- project import path validation;
- API authorization and schema validation.

## 15.2 Golden parser and round-trip fixtures

At minimum include:

1. ESP32 + DHT11 with include, object construction, `setup`, `loop`, sensor reads, failed-read checks, Serial output and delay.
2. Arduino Blink.
3. Button input and LED output.
4. `if/else`, nested conditions and compound logic.
5. `for`, `while`, `break` and `continue`.
6. User-defined function with parameters and return value.
7. Globals, locals, constants, arrays and expressions.
8. Multiline and inline comments.
9. Strings containing braces, escaped quotes, semicolons and comment-like text.
10. `#define`, `#ifdef`, multiple includes and board-specific compile guards.
11. Unknown library calls preserved as raw blocks.
12. Templates, lambdas, class definitions and complex macros marked unsupported/raw rather than corrupted.
13. An intentionally malformed sketch.
14. A file with CRLF line endings and a file with UTF-8 comments.
15. Multiple files with headers and function definitions.

Every golden fixture must specify expected parser coverage and normalized IR, not only expected screenshot output.

## 15.3 Property-based tests

Generate supported IR trees and assert:

- generation then parsing preserves the normalized structure;
- save/load preserves the IR and workspace state;
- arbitrary legal whitespace/comment changes do not alter the meaning of supported nodes;
- no synchronization event loops indefinitely;
- generated parentheses preserve operator precedence;
- unsupported chunks remain present and ordered.

## 15.4 Integration tests

- Import actual `.ino`; inspect blocks; edit block; compare output; compile.
- Edit code; verify correct blocks update and unsupported text is preserved.
- Break syntax then repair it; verify last valid block state remains until successful parse.
- Create and rename a variable and verify code references update.
- Compile a selected ESP32 DHT11 example with pinned dependencies in a prepared CI environment.
- Test compile timeout, failed dependency installation, compiler output parsing and cancellation.
- Save, refresh and restore project state.
- Disconnect network during editing and verify recovery behavior.
- Exercise malicious ZIP path names against import and archive extraction.

## 15.5 End-to-end browser tests

Playwright tests must cover:

- onboarding and project creation;
- split view layout resize and persistence;
- block insertion, connection, deletion and undo/redo;
- code edit causing block update;
- block edit causing code update;
- raw C++ preservation;
- parse error handling;
- target board selection and warning display;
- compile workflow (using a deterministic test worker, clearly identified as test-only);
- export and re-import;
- mobile/tablet responsive workflows and accessibility smoke tests.

## 15.6 Hardware acceptance tests

Before claiming physical upload works, test on real supported boards and document:

- operating system and browser;
- board model, USB-to-serial adapter and port;
- core/tool version and FQBN;
- successful compile/upload, timeout/failure and retry;
- permission errors and board disconnect during upload;
- bridge pairing/origin validation;
- no arbitrary command/path injection through the bridge.

A simulated board cannot count as physical acceptance evidence.

---

# 16. DEFINITION OF DONE

PinFlow Studio is not done merely because its landing page and workspace render.

## Core acceptance criteria

- [ ] User can create, save, reload, duplicate, rename, export and delete a sketch.
- [ ] ESP32 + DHT11 template exists as code and editable blocks.
- [ ] Monaco and Blockly are both functional and visible side by side at desktop size.
- [ ] Supported code-to-block parsing produces editable blocks with source mapping.
- [ ] Block-to-code generation is deterministic and tested.
- [ ] Code and blocks synchronize both ways without loop, stale overwrite or data loss.
- [ ] Parser coverage is visible, with raw-preserved code for unsupported constructs.
- [ ] Syntax errors do not destroy the last valid block representation.
- [ ] Comments, string literals, preprocessor directives and unsupported constructs are preserved or explicitly flagged.
- [ ] Board selection affects target profile and relevant warnings.
- [ ] Real Arduino CLI compilation runs in a secure, isolated environment or explicitly configured local toolchain.
- [ ] Compilation results are associated with the exact source revision that was compiled.
- [ ] Diagnostics are displayed and navigate to the correct source range/block where mapping exists.
- [ ] Persistence, revision history and conflict behavior work.
- [ ] Authorization and tenant isolation tests pass.
- [ ] Accessible keyboard/focus paths exist for core operations.
- [ ] The UI is responsive and handles loading, errors, empty states, and reduced-motion preferences.
- [ ] CI runs typecheck, lint, unit tests, parser fixtures, round-trip tests and E2E tests.
- [ ] README includes prerequisites and reproducible setup instructions.
- [ ] Architecture, parser coverage, security, compile worker and bridge docs exist and are accurate.
- [ ] No feature is marked implemented unless its acceptance test or manual validation evidence exists.

## Product quality gates

- Zero known data-loss bugs in tested import/edit/generate/save flows.
- Zero uncaught runtime exceptions in the primary create/edit/sync/compile flows during the test suite.
- No compile or upload operation can execute arbitrary shell commands from user input.
- No secret is bundled into browser code.
- All user-facing actions have success, loading and failure states.
- No misleading universal language-support claims.
- Performance is measured and documented on at least one representative desktop browser.

---

# 17. IMPLEMENTATION PLAN — BUILD VERTICAL SLICES

Follow this order. Do not begin with a large decorative dashboard before proving source/block correctness.

## Phase 0 — Repository and feasibility audit

- Inspect all existing files, scripts, tests and current implementation.
- Research current official docs for Next.js, Blockly, Monaco, Tree-sitter, Arduino CLI, security sandboxing and selected database/auth stack.
- Pin compatible stable versions and license-audit all dependencies.
- Write a concise architecture decision record (ADR) for parser, IR, raw-block preservation and sync strategy.
- Create `docs/parser-coverage.md` describing exactly what v1 will support.

**Exit gate:** architecture decisions are written, dependency lockfile exists, initial environment boots, and a working proof-of-concept parses/generates the DHT11 fixture without source loss.

## Phase 1 — Prove the core engine

- Implement IR types and source mappings.
- Implement parser worker and supported syntax mapping.
- Implement a small native block catalogue: setup/loop, pinMode, digitalWrite, delay, Serial output, variable and simple if.
- Implement code generator and raw-preserved block.
- Implement golden round-trip tests.

**Exit gate:** the editor can import, visualize, edit and regenerate the starter fixture with tested preservation behavior.

## Phase 2 — Real workbench

- Implement Blockly and Monaco split view.
- Add synchronization coordinator, unified history, parse states, diff application and source highlighting.
- Implement the design system and responsive layout.
- Add accessibility and keyboard operations.

**Exit gate:** edit a block and see code update; edit code and see blocks update; invalid syntax does not destroy state; test suite proves no sync loop.

## Phase 3 — Project persistence and import/export

- Implement auth, database schema, authorization and project CRUD.
- Add autosave, revisions, offline recovery and export/import.
- Add file tree and multi-file project handling once single-file reliability is proven.

**Exit gate:** reload, recovery, restore and export/re-import pass integration tests.

## Phase 4 — Language coverage and board profiles

- Add expressions, variables, functions, loops, conditionals, comments and common Arduino APIs incrementally.
- Add target-aware pin profiles and custom DHT library pack.
- Add unsupported constructs to fixtures.

**Exit gate:** documented coverage metrics and round-trip fixtures for the supported subset.

## Phase 5 — Real compilation

- Create the sandboxed compile worker and dependency resolution process.
- Install/pin supported cores/libraries in a controlled cache.
- Add compile queue, progress, logs, cancellation, structured diagnostics and result revision hashes.
- Add local compile mode when useful.

**Exit gate:** DHT11/ESP32 and Blink fixtures compile with the selected actual toolchain, or any toolchain unavailability is precisely documented. No fake success response.

## Phase 6 — Local bridge and upload

- Only after compile is stable, implement narrow local bridge, board discovery and upload flow.
- Complete security and hardware tests.

**Exit gate:** actual board compilation/upload is tested and documented for supported environments; otherwise label upload as unavailable/experimental.

## Phase 7 — SaaS finish and polish

- Improve landing, template gallery, tutorial experience, help, account settings, project sharing and optional pricing.
- Add telemetry that respects privacy, support/error workflows and operations docs.
- Profile parse/render performance, refine animations, audit accessibility and complete production deployment setup.

**Exit gate:** definition-of-done checklist reviewed against real evidence.

---

# 18. INSTRUCTIONS FOR HARK PRO WHILE WORKING

1. Start by inspecting the repository and reporting the current state briefly. If a repo already exists, preserve its useful work and architecture where sound.
2. Then act; do not stop after the report or ask for approval on routine implementation choices.
3. Implement one vertical slice at a time and run the relevant tests before moving forward.
4. Prioritize the bidirectional parser/sync proof-of-concept and data preservation over visual flourishes.
5. Use actual Blockly and Monaco components, not screenshots, canvas mockups or hard-coded decorative blocks.
6. Never use regex-only heuristics as the main structural C++ parser.
7. Never pass arbitrary project content to a shell, compile service or local bridge without validation/sandboxing.
8. Do not silently “fix” user's C++ when importing or generating code. Offer explicit transformations as reviewable changes.
9. If full support for a C++ construct is not available, preserve it and explain the limitation instead of fabricating a block.
10. Keep the examples compile-oriented: include a real DHT11/ESP32 sketch and a simpler Blink sketch.
11. Update tests and documentation alongside code. Keep `docs/implementation-status.md` with per-feature status, test evidence, known limitations and the next action.
12. Do not mark a checkbox complete because a component was scaffolded. Completion requires working behavior and test evidence.
13. If a cloud service credential is unavailable, implement the integration behind configuration, test with a controlled stub, and document the exact credential required. Never hard-code secrets or claim the real service was exercised.
14. If time/context limits require scope reduction, finish the highest-value correct vertical slice and list remaining work with honest status. Do not generate hundreds of unconnected files and call it finished.
15. At final handoff, provide setup commands, environment variables, migration instructions, test commands, how to import a sketch, how to use the split editor, how to compile, supported board/construct matrix, known issues and precise completed/incomplete status.

---

# 19. OFFICIAL REFERENCES TO CONSULT

Use current versions and verify any API change before implementation. These sources ground the recommended architecture; they do not imply the integrations have been built yet.

- Next.js release history: https://nextjs.org/blog
- Blockly custom blocks overview: https://docs.blockly.com/guides/create-custom-blocks/overview/
- Blockly code generation: https://docs.blockly.com/guides/create-custom-blocks/code-generation/overview/
- Blockly serialization: https://docs.blockly.com/guides/configure/serialization/
- Monaco Editor: https://microsoft.github.io/monaco-editor/
- Monaco Editor releases: https://github.com/microsoft/monaco-editor/releases
- Tree-sitter: https://tree-sitter.github.io/tree-sitter/
- Tree-sitter repository: https://github.com/tree-sitter/tree-sitter
- Arduino CLI documentation: https://arduino.github.io/arduino-cli/latest/
- Arduino CLI getting started: https://docs.arduino.cc/arduino-cli/getting-started/
- Arduino CLI compile command: https://docs.arduino.cc/arduino-cli/commands/arduino-cli_compile/
- Arduino CLI upload command: https://docs.arduino.cc/arduino-cli/commands/arduino-cli_upload/

Before shipping, verify the license and redistribution terms for every third-party library, toolchain, board package, sensor library and example asset. Keep required license notices in the repository and in distributed builds.

---

# 20. FINAL DELIVERABLES

The completed product handoff must contain:

1. A working Next.js application with a polished landing page and authenticated project dashboard.
2. A functional synchronized Blockly + Monaco Arduino workbench.
3. Documented supported language subset and source coverage reporting.
4. Tested import → blocks → code → compile workflow for the DHT11/ESP32 example and Blink example.
5. A safe raw-code preservation path for unsupported C++ syntax.
6. A real database with migrations, authorization and persistent project history.
7. A secure Arduino CLI compile workflow with structured diagnostics.
8. A separate optional local bridge for board discovery/upload if implemented and hardware-tested.
9. Unit, round-trip, property, integration and browser E2E tests.
10. CI workflow and pinned dependencies.
11. A clear README and detailed architecture, setup, parser-coverage, security and troubleshooting documentation.
12. `docs/implementation-status.md` listing each major feature as `implemented-and-tested`, `implemented-but-not-fully-tested`, `partial`, or `blocked`, with evidence and limitations.
13. A short recorded or reproducible demo flow: import DHT11 sketch, inspect mapped blocks and coverage, edit a sensor interval or pin, watch code update, edit code and see the blocks update, compile for ESP32, inspect results, save/reload and export.

**Success is a trustworthy two-way visual programming environment for real Arduino code—not just a beautiful Blockly playground. Preserve code faithfully, show the truth about what is represented, compile with the real toolchain, and make the entire editing experience feel premium.**
