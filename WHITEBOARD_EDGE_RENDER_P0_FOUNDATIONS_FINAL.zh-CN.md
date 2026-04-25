# Whiteboard Edge Render P0 基础能力 API 与实施细节

## 1. 口径

- 本文只覆盖 `WHITEBOARD_EDGE_RENDER_INFRA_FINAL.zh-CN.md` 的 P0，以及 `WHITEBOARD_EDITOR_FINAL_GRAPH_STORE_REFACTOR_PLAN.zh-CN.md` 里已经确定的 `shared/projector/store` 设计。
- 本文只做三件事：
  - 让 `editor-scene` 通过一个同步 `measure` 函数使用 text measure，而不是接收 measure snapshot / delta。
  - 让 `shared/projector` 具备 projector-store bridge primitive。
  - 让 `whiteboard-core` 具备纯 edge render/hit primitive。
- 本文不引入 `MeasureInput`、`MeasureDelta`、`EditorGraphDirtyEvent`。
- 第一版不新增独立 measure 层；如果后续需要缓存，只允许藏在 `editor/layout` 内部。
- 本文不展开 render phase、`hit.edge` query、React layer 改造；那些属于后续阶段。

---

## 2. 最终 API 设计

## 2.1 `whiteboard-editor-scene` 只接收一个同步 `measure`

`editor-scene` 不再把 measure 当作 input source。它只依赖一个同步函数：当 graph patch 某个 touched node / edge 时，现场同步测量。

```ts
export type TextMeasureTarget =
  | {
      kind: 'node'
      nodeId: NodeId
      node: Node
      rect: Rect
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
      label: EdgeLabel
    }

export type TextMeasure = (
  input: TextMeasureTarget
) => Size | undefined
```

`Input` 收敛为：

```ts
export interface Input {
  document: DocumentInput
  session: SessionInput
  interaction: InteractionInput
  clock: ClockInput
  delta: InputDelta
}
```

`InputDelta` 保持现有三段，不再增加 measure：

```ts
export interface InputDelta {
  document: DocumentDelta
  graph: GraphInputDelta
  ui: UiInputDelta
}
```

runtime 创建入口改成：

```ts
declare function createEditorSceneRuntime(
  input?: {
    measure?: TextMeasure
  }
): Runtime
```

`WorkingState` 内部只保留这个函数引用：

```ts
export interface WorkingState {
  measure?: TextMeasure
  revision: ...
  graph: ...
  indexes: ...
  spatial: ...
  ui: ...
  items: ...
  delta: ...
  publish: ...
}
```

约束：

- `editor-scene` 不保存 measure snapshot。
- `editor-scene` 不规划 measure delta。
- `editor-scene` 只在 patch touched ids 时同步调用 `measure(...)`。

---

## 2.2 `whiteboard-editor` 只做 measure 转发

`editor` 第一版只做一件事：把 React 提供的同步 measure 转发给 `editor-scene`。

```ts
const runtime = createEditorSceneRuntime({
  measure: layout.measureText
})
```

说明：

- `editor` 不向 `scene` 暴露 measure 状态。
- `editor` 不需要 `prepare`、`delta`、`dirty event`。
- React 到 editor 的注册沿用现有 `services.layout` 路径，不再新增第二条 measure 注册协议。
- 如果后面需要缓存，只允许藏在 `layout.measureText(...)` 内部，不新增公共概念。

---

## 2.3 `whiteboard-editor` layout / backend 测量入口

`layout` 继续是 editor 内部的文本测量总入口。最简方案里，React 只需要把 DOM measure 注册到 editor，editor 再把 `layout.measureText` 传给 `editor-scene`。

```ts
export type TextSourceRef =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
    }

export type LayoutRequest =
  | {
      kind: 'size'
      nodeId?: NodeId
      source?: TextSourceRef
      ...
    }
  | {
      kind: 'fit'
      nodeId: NodeId
      source?: TextSourceRef
      ...
    }
```

`EditorLayout` 只新增一个方法：

```ts
export type EditorLayout = {
  text: TextMetricsResource
  measureText(
    request: import('@whiteboard/editor-scene').TextMeasureTarget
  ): Size | undefined
  patchNodeCreatePayload(...): ...
  patchMindmapTemplate(...): ...
  patchNodeUpdate(...): ...
  resolvePreviewPatches(...): ...
}
```

约束：

- `measureText({ kind: 'node' })` 返回 node graph 真正需要的文本尺寸。
- `measureText({ kind: 'edge-label' })` 返回 edge label placement / mask 真正需要的文本尺寸。
- `TextSourceRef` 必须扩展到 `edge-label`，这样 DOM backend 可以复用真实 label 元素测量。
- 第一版不要求额外缓存层；直接同步测量即可。

---

## 2.4 `shared/projector` projector-store bridge

`shared/projector` 对外补齐统一 bridge。业务包不再直接依赖 `@shared/projector/sync`。

根导出：

```ts
export {
  createProjector,
  createProjectorStore,
  value,
  family,
  projectListChange,
  publishStruct,
  defineScope,
  flag,
  set,
  slot
} from '@shared/projector'
```

`delta` 导出：

```ts
export {
  idDelta,
  entityDelta,
  writeEntityChange
} from '@shared/projector/delta'
```

`ProjectorStore` API：

```ts
interface ProjectorRuntimeLike<TSnapshot, TChange> {
  snapshot(): TSnapshot
  subscribe(listener: (snapshot: TSnapshot, change: TChange) => void): () => void
}

interface ProjectorStoreValueField<TSnapshot, TChange, TValue> {
  kind: 'value'
  read(snapshot: TSnapshot): TValue
  changed(change: TChange): boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}

interface ProjectorStoreFamilyField<TSnapshot, TChange, TKey extends string, TValue> {
  kind: 'family'
  read(snapshot: TSnapshot): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  delta(change: TChange): IdDelta<TKey> | undefined
  isEqual?: (left: TValue, right: TValue) => boolean
}

interface ProjectorStore<TSnapshot, TChange, TRead> {
  readonly read: TRead
  snapshot(): TSnapshot
  sync(input: {
    previous: TSnapshot
    next: TSnapshot
    change: TChange
  }): void
  dispose(): void
}

declare function createProjectorStore<
  TSnapshot,
  TChange,
  TSpec extends ProjectorStoreSpec<TSnapshot, TChange>
>(input:
  | {
      runtime: ProjectorRuntimeLike<TSnapshot, TChange>
      spec: TSpec
    }
  | {
      initial: TSnapshot
      spec: TSpec
    }
): ProjectorStore<TSnapshot, TChange, InferProjectorStoreRead<TSpec>>
```

builder 只保留两种：

```ts
declare function value<TSnapshot, TChange, TValue>(input: {
  read(snapshot: TSnapshot): TValue
  changed(change: TChange): boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}): ProjectorStoreValueField<TSnapshot, TChange, TValue>

declare function family<TSnapshot, TChange, TKey extends string, TValue>(input: {
  read(snapshot: TSnapshot): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  delta(change: TChange): IdDelta<TKey> | undefined
  isEqual?: (left: TValue, right: TValue) => boolean
}): ProjectorStoreFamilyField<TSnapshot, TChange, TKey, TValue>
```

`writeEntityChange`：

```ts
interface WriteEntityChangeInput<TKey extends string, TValue> {
  delta: IdDelta<TKey>
  id: TKey
  previous: TValue | undefined
  next: TValue | undefined
  equal?: (left: TValue, right: TValue) => boolean
}

declare function writeEntityChange<TKey extends string, TValue>(
  input: WriteEntityChangeInput<TKey, TValue>
): void
```

---

## 2.5 `whiteboard-core` edge render / hit primitive

P0 只下沉纯函数，不下沉 render bucket、chunking、membership index。

```ts
export interface EdgeStaticStyle {
  color?: string
  width: number
  opacity: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

declare function styleKey(
  style: EdgeStyle | undefined
): string

declare function staticStyle(
  style: EdgeStyle | undefined
): EdgeStaticStyle

declare function distanceToPath(input: {
  path: Pick<EdgePathResult, 'points' | 'segments'>
  point: Point
}): number
```

导出面：

```ts
export const edge = {
  render: {
    styleKey,
    staticStyle
  },
  hit: {
    test,
    pathBounds,
    distanceToPath
  }
}
```

---

## 3. 实施细节

## 3.1 `editor-scene` 改动

修改：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projector/spec.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/node.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/edge.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/domain/mindmap.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/testing/builders.ts`
- `whiteboard/packages/whiteboard-editor-scene/test/*`

具体动作：

1. 从 `contracts/editor.ts` 删除：
   - `MeasureInput`
   - `TextMeasureInput`
   - `Input.measure`
2. 在 `contracts/editor.ts` 新增：
   - `TextMeasureTarget`
   - `TextMeasure`
3. 在 `contracts/working.ts` 给 `WorkingState` 增加 `measure?: TextMeasure`。
4. `projector/spec.ts`：
   - `createEmptyInput()` 不再创建空 `measure`
   - `createWorking()` 改成接收 `measure`
5. `createEditorSceneRuntime.ts`：
   - 从无参改成 `createEditorSceneRuntime({ measure })`
   - 把 `measure` 传给 `createWorking({ measure })`
6. `domain/node.ts`：
   - 删除 `input.input.measure.text.nodes.get(nodeId)`
   - 改成 `input.working.measure?.({ kind: 'node', ... })`
7. `domain/edge.ts`：
   - 删除 `input.input.measure.text.edgeLabels.get(edgeId)`
   - 改成对每个 label 调 `input.working.measure?.({ kind: 'edge-label', ... })`
8. `domain/mindmap.ts`：
   - root / child node 的 measured size 改成同步调用 node measure service
9. `projector/impact.ts` 不再为 measure 增加任何 scope 逻辑。现有 `document / graph / ui` touched scope 保持不变。
10. 测试不再通过 `Input.measure` 喂数据，统一改成在 runtime 创建时注入 stub `measure`。

关键原则：

- `editor-scene` 不拥有 measure cache。
- `editor-scene` 不拥有 measure delta。
- `editor-scene` 只在现有 touched ids 上同步调用 `measure`。

---

## 3.2 `whiteboard-editor` 改动

修改：

- `whiteboard/packages/whiteboard-editor/src/types/layout.ts`
- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/dom/textSourceStore.ts`
- 必要时 `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/layout.ts`

具体动作：

1. 在 `types/layout.ts` 扩展 `TextSourceRef`：
   - 现有 `node`
   - 新增 `edge-label`
2. 在 `layout/runtime.ts` 新增 `measureText(request)`：
   - `node` 请求走现有 node text layout 逻辑
   - `edge-label` 请求走 edge label typography / size 测量逻辑
3. `projection/input.ts`：
   - 删除整段 `measure: { ... }`
   - `createEditorGraphInput(...)` 不再拼 measure
4. `projection/controller.ts`：
   - 创建 scene runtime 时直接注入 `layout.measureText`
   - 不新增独立 measure 层

```ts
createEditorSceneRuntime({
  measure: layout.measureText
})
```

5. `textSourceStore.ts` 需要支持 `edge-label` source key，这样 DOM backend 可以在 label 存在时复用真实元素测量。
6. React 侧继续沿用现有 `services.layout` 注册路径，不新增新的 measure bridge。

关键原则：

- 第一版不要求 cache。
- 如果后面需要 cache，只允许藏在 `layout.measureText(...)` 内部。
- scene 只拿同步 `measure`，不拿 editor 的内部状态。

---

## 3.3 `shared/projector` bridge 落地

修改：

- `shared/projector/src/index.ts`
- `shared/projector/src/delta/index.ts`
- `shared/projector/package.json`

新增：

- `shared/projector/src/store/*`
- `shared/projector/src/delta/writeEntityChange.ts`

具体动作：

1. 新增 `createProjectorStore`、`value`、`family`。
2. `createProjectorStore` 内部直接复用 `@shared/core/store`：
   - `store.createValueStore`
   - `store.createFamilyStore`
   - `store.createKeyedReadStore`
   - `store.batch`
3. `runtime` 模式下：
   - 用 `runtime.snapshot()` 建初始值
   - 自动订阅 `runtime.subscribe(...)`
   - 每次收到 `(snapshot, change)` 时调用内部 `sync(...)`
4. `initial` 模式下：
   - 只建 store，不自动订阅
   - 调用方自己喂 `sync(...)`
5. `sync(...)` 行为固定：
   - `value` field 只在 `changed(change)` 为真时重读并写入
   - `family` field 只消费 `delta(change)` 返回的 `IdDelta`
6. `@shared/projector/sync` 不再作为业务层正式依赖面。

第一批直接替换点：

- `whiteboard/packages/whiteboard-editor/src/scene/source.ts`

替换原则：

- 删除 `composeSync`
- 删除 `createValueSync`
- 删除 `createIdDeltaFamilySync`
- 改成一份 `createProjectorStore({ initial, spec })`

---

## 3.4 `whiteboard-core` edge primitive 落地

新增：

- `whiteboard/packages/whiteboard-core/src/edge/render.ts`

修改：

- `whiteboard/packages/whiteboard-core/src/edge/hitTest.ts`
- `whiteboard/packages/whiteboard-core/src/edge/index.ts`

具体动作：

1. 把 `whiteboard-editor/src/scene/edgeRender.ts` 里的纯逻辑下沉到 `edge/render.ts`：
   - style 归一化
   - style key 生成
2. 最终对外只保留：
   - `edge.render.staticStyle(style)`
   - `edge.render.styleKey(style)`
3. 把 `whiteboard-editor/src/scene/pick.ts` 里的 point-to-edge distance 下沉到 `edge/hitTest.ts`，命名为 `distanceToPath`。
4. 现有：
   - `matchEdgeRect`
   - `getEdgePathBounds`

继续留在 `edge/hitTest.ts`。

第一批必须切换的消费者：

- `whiteboard/packages/whiteboard-editor/src/scene/edgeRender.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/pick.ts`

---

## 4. 实施顺序

1. 先落 `shared/projector` 的 `createProjectorStore` / `value` / `family` / `writeEntityChange`。
2. 再落 `whiteboard-core` 的 `edge.render.*` 与 `edge.hit.distanceToPath`。
3. 再改 `editor-scene` 合同：删掉 measure input，改成 `measure` 注入。
4. 再在 `whiteboard-editor` 的 `layout` 上补 `measureText`，并把它直接注入 scene runtime。
5. 最后清理测试和 `projection/input.ts` 里的旧 measure 装配逻辑。

这个顺序的原因：

- `shared/projector` 与 `whiteboard-core` 都是下游依赖。
- `editor-scene` 先改成 `measure` 合同，editor 才能直接把现有 layout 测量接进去。
- `projection/input.ts` 的 measure 删除放在最后，便于分步替换。
