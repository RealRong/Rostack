# Dataview Active View API Simplification Plan

## Goal

Clarify the engine API around view access under the real product constraint:

- A document can contain multiple persistent views.
- At any moment, there is only one active view.

The aim is not to remove multi-view support. The aim is to remove the API ambiguity between:

- persistent view configuration
- active view runtime/session state

This document records the current assessment and a recommended simplification direction. It does not propose code changes yet.

## Current Model

The current architecture has three related concepts:

1. Persistent view collection

- `DataDoc.views`
- `DataDoc.activeViewId`
- document helpers such as `getDocumentActiveView()`

This part is correct. The document model is explicitly multi-view.

2. Active view runtime projection

- `ActiveViewState`
- active projections for `filter`, `group`, `search`, `sort`, `records`, `sections`, `appearances`, `fields`, `calculations`

This is also correct. These values are runtime/session projections for the currently active view, not just aliases of `View`.

3. View facade layer

- `engine.active`
- `engine.views`
- `engine.views.api(viewId)`
- `createViewEngineApi()`
- `createViewCommandNamespaces()`

This is where the current API becomes misleading.

## Main Finding

The main problem is not `ActiveViewState`.

`ActiveViewState` is a legitimate boundary. It represents the runtime state for the currently active view, and a large part of the React layer already treats `engine.active` as the real working surface.

The more questionable abstraction is `engine.views.api(viewId): ViewEngineApi`.

It looks like any view can be opened as a full domain API, but that is not actually true.

Parts of `ViewEngineApi` depend on active-only runtime state, especially operations that need:

- `appearances`
- `sections`
- grouped movement/write behavior
- active ordering/runtime projections

In the current implementation, the scoped API for an arbitrary `viewId` only has a usable `readState()` when that `viewId` is also the active view. That means the type surface suggests "full API for any view", while the runtime semantics are actually "full API only for the active one".

That mismatch is the real source of indirection and confusion.

## What Is Not The Problem

### `engine.views`

`engine.views` itself is valid and should remain.

The document is multi-view, so collection-level operations are necessary:

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

These are document-level view management capabilities, not active-view session capabilities.

### `commands.ts`

`dataview/src/engine/facade/view/commands.ts` is mostly an implementation extraction, not the core architectural issue.

It centralizes patch-oriented command builders for view configuration updates. This file may or may not deserve to stay split out, but even if it were inlined into `view/index.ts`, the conceptual problem would still remain.

So this file is not the first simplification target.

### `facade/index.ts`

`dataview/src/engine/facade/index.ts` is only a barrel export. It does not materially affect the architecture.

## Recommended Direction

The simplification should separate two concepts more explicitly:

1. active view session API
2. persistent view collection/config API

### Keep `engine.active` as the only full view domain API

`engine.active` should remain the single complete view domain surface.

Reason:

- it has access to `ActiveViewState`
- it matches UI usage
- it correctly models operations that only make sense for the current runtime view

Examples of capabilities that naturally belong here:

- `search`
- `filter`
- `sort`
- `group`
- `calc`
- `display`
- `table`
- `gallery`
- `kanban`
- `order`
- `items`
- `cells`
- `select`
- active read helpers

### Keep `engine.views` as collection management API

`engine.views` should stay focused on managing the set of persistent views in the document.

Recommended scope:

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

This API should describe view entities as document members, not as active runtime sessions.

### Remove or de-emphasize `engine.views.api(viewId)`

This is the cleanest simplification target.

The current surface implies:

- "give me the API for that view"

But the actual semantics are closer to:

- "give me a patch-oriented config API for that view, plus some active-only methods that silently degrade unless that view is active"

That is a bad contract.

Recommended direction:

- stop exposing `engine.views.api(viewId)` publicly, or
- narrow it so it cannot pretend to be a full `ViewEngineApi`

## Better API Split

If there is a real need to edit inactive views without opening them first, expose a narrower API for persistent view configuration only.

For example, conceptually split the current `ViewEngineApi` into:

### 1. `ActiveViewSessionApi`

This is the current `engine.active` shape, including runtime-dependent capabilities.

Responsibilities:

- runtime read/select APIs
- item move/create/remove
- cell writes
- order operations that depend on active runtime context
- section/group-aware behaviors

### 2. `ViewConfigApi`

This would be a narrower API for editing stored view configuration by `viewId`.

Responsibilities:

- rename
- type
- search
- filter
- sort
- group definition
- calc config
- display config
- view options
- static order config if still considered part of stored view schema

Non-responsibilities:

- `items`
- `cells`
- `select`
- active read helpers
- anything that depends on `appearances`, `sections`, or active runtime projections

This split would make the contract truthful.

## Why This Is Simpler

This direction simplifies the system in three ways.

### 1. The public API matches the actual runtime truth

There is exactly one active view session.

The API should make that obvious instead of pretending every persistent view can be treated as a full runtime session.

### 2. The implementation boundary becomes cleaner

Today `createViewEngineApi()` mixes:

- patch-oriented view config writes
- active-runtime item/cell/order behavior

Those are related, but not identical responsibilities.

The split makes the dependency on `ActiveViewState` explicit instead of incidental.

### 3. React usage already aligns with this model

Most React code already uses:

- `engine.active.*` for current working view behavior
- `engine.views.*` for tab management and cross-view document actions

So the recommended direction brings the public engine shape closer to how the app is already mentally modeled.

## Minimal Refactor Strategy

If this is implemented later, the least disruptive path is:

1. Freeze the intended semantics in docs and type comments.
2. Stop adding new call sites of `engine.views.api(viewId)`.
3. Introduce a narrower internal or public config-scoped API if inactive-view editing is needed.
4. Move active-only behaviors behind `engine.active` only.
5. Deprecate and eventually remove `engine.views.api(viewId)` if there are no meaningful callers.

This keeps the data model intact while simplifying the runtime mental model.

## Non-Goals

This proposal does not recommend:

- removing multi-view support from documents
- collapsing `views` into a single `view`
- removing `ActiveViewState`
- changing document persistence semantics
- rewriting React features around a single-view document assumption

## Recommended End State

The target mental model should be:

- `engine.views` manages persistent views in the document.
- `engine.active` represents the one currently active view session.
- only `engine.active` owns runtime-dependent view behavior.
- inactive views, if editable directly, use a narrower config-only API.

That gives the simplest truthful global model while preserving the real multi-view document structure.
