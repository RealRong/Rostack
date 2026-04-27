# Whiteboard Editor Scene 最终 Render / Projection API 设计与重构实施清单

## 范围与约束

这份文档定义最终形态，不定义过渡方案。

执行规则：

1. 不保留兼容层。
2. 不保留旧 phase 结构。
3. 不保留 `shared/projection` 当前 family surface 的 `replace-only` 模型。
4. 不保留 `whiteboard-editor-scene` 当前单一 `view` phase。
5. 所有 API 以长期最优为目标，不以最小改动为目标。

完成后必须满足：

1. `shared/projection` 公开稳定的 spec 类型 API。
2. `shared/projection` family field 支持增量 delta 驱动的 apply sync。
3. `shared/projection` surface sync 按 field changed 短路。
4. `whiteboard-editor-scene` 的 `render` 成为独立 phase。
5. `render` 消费 canonical phase delta，而不是粗 touched ids。
6. `render` 自己产出正式 `RenderDelta`。

---

## 一、最终架构总览

最终 phase 图固定为：

1. `graph`
2. `spatial`
3. `items`
4. `ui`
5. `render`

依赖关系固定为：

1. `spatial` after `graph`
2. `items` after `graph`
3. `ui` after `graph`
4. `render` after `graph`, `items`, `ui`

最终变化分层固定为：

1. `EditorSceneSourceChange`
2. `InputDelta`
3. `GraphDelta`
4. `GraphChanges`
5. `ItemsDelta`
6. `UiDelta`
7. `RenderDelta`
8. `Surface sync patch`

角色固定为：

1. `EditorSceneSourceChange` 只表示输入通道变化。
2. `InputDelta` 只表示 projection 规划输入。
3. `GraphDelta` 表示 graph canonical state 的结构变化。
4. `GraphChanges` 表示 graph 语义变化原因。
5. `ItemsDelta` 表示 scene item 顺序与成员变化。
6. `UiDelta` 表示 UI family 与 chrome 的真实变化。
7. `RenderDelta` 表示 render family 与 render chrome 的真实变化。
8. surface sync 只消费 phase output delta，不再自行做粗暴快照替换。

---

## 二、`shared/projection` 最终 API

## 1. 删除项

以下内容直接删除：

1. `shared/projection/src/internal.ts`
2. `shared/projection` 中所有 scope builder
3. `shared/projection` 中所有 field builder
4. editor-scene 内部自定义的 `valueField` / `familyField`
5. 任何对 `@shared/projection/internal` 的引用
6. `shared/projection/src/runtime.ts` 内部 `value()` / `family()` builder 包装

删除后，scope 一律使用 pure string spec，surface field 一律使用 plain object spec。

## 2. 最终公开导出

`shared/projection/src/index.ts` 最终必须导出：

```ts
export { createProjectionRuntime } from './runtime'

export type { Revision } from './core'
export type { Run as ProjectionTrace } from './trace'
export type {
  ProjectionSpec,
  ProjectionRuntime,
  ProjectionValueField,
  ProjectionFamilyField,
  ProjectionSurfaceField,
  ProjectionSurfaceTree,
  ProjectionStoreRead,
  ProjectionFamilySnapshot,
  ProjectionFieldSyncContext
} from './runtime'
export type {
  ScopeSchema,
  ScopeInputValue,
  ScopeValue,
  ScopeFieldSpec
} from './scope'
```

## 3. 最终 scope spec 类型

`shared/projection/src/scope.ts` 最终必须把 scope schema 收敛成 pure string spec：

```ts
export type ScopeFieldSpec = 'flag' | 'set' | 'slot'

export type ScopeSchema<TValueShape extends Record<string, unknown>> = {
  [K in keyof TValueShape]:
    TValueShape[K] extends boolean
      ? 'flag'
      : TValueShape[K] extends ReadonlySet<any>
        ? 'set'
        : 'slot'
}
```

最终使用方式固定为：

```ts
type GraphPatchScope = {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
}

const graphPhaseScope = {
  reset: 'flag',
  order: 'flag',
  nodes: 'set',
  edges: 'set'
} satisfies ScopeSchema<GraphPatchScope>
```

这里不允许再出现：

1. `defineScope(...)`
2. `flagScopeField()`
3. `setScopeField<T>()`
4. `slotScopeField<T>()`
5. `nodes: { kind: 'set' }`

scope field 没有除 field kind 之外的任何 runtime 信息，因此 runtime 结构必须是最小字符串字面量。

## 4. 最终 `shared/delta` schema 类型

`shared/delta/src/changeState.ts` 最终必须把 change schema 收敛成 pure string spec：

```ts
import type { IdDelta } from './idDelta'

export type ChangeFieldSpec = 'flag' | 'ids' | 'set'

export type ChangeSchema<TValueShape extends Record<string, unknown>> = {
  [K in keyof TValueShape]:
    TValueShape[K] extends boolean
      ? 'flag'
      : TValueShape[K] extends IdDelta<any>
        ? 'ids'
        : TValueShape[K] extends ReadonlySet<any>
          ? 'set'
          : TValueShape[K] extends Record<string, unknown>
            ? ChangeSchema<TValueShape[K]>
            : never
}
```

最终使用方式固定为：

```ts
import type {
  ChangeSchema,
  IdDelta
} from '@shared/delta'

interface GraphChanges {
  order: boolean
  node: {
    lifecycle: IdDelta<NodeId>
    geometry: IdDelta<NodeId>
    content: IdDelta<NodeId>
    owner: IdDelta<NodeId>
  }
}

const graphChangeSpec: ChangeSchema<GraphChanges> = {
  order: 'flag',
  node: {
    lifecycle: 'ids',
    geometry: 'ids',
    content: 'ids',
    owner: 'ids'
  }
}
```

这里不允许再出现：

1. `defineChangeSpec(...)`
2. `changeFlag()`
3. `changeIds<T>()`
4. `changeSet<T>()`
5. `field: { kind: 'flag' | 'ids' | 'set' }`
6. `InferChangeState<typeof spec>`

change schema 与 scope schema 一样，只有 leaf kind，没有任何额外 runtime 信息，因此最终必须使用字符串字面量。

`shared/delta` 最终公开导出固定为：

```ts
export {
  createChangeState,
  cloneChangeState,
  mergeChangeState,
  takeChangeState,
  hasChangeState,
  type ChangeSchema,
  type ChangeFieldSpec
} from './changeState'
```

最终不再公开：

1. `defineChangeSpec`
2. `changeFlag`
3. `ids`
4. `changeSet`
5. `ChangeField`
6. `ChangeObjectFields`
7. `ChangeSpec`
8. `InferChangeState`

`createChangeState()` / `cloneChangeState()` / `mergeChangeState()` / `takeChangeState()` / `hasChangeState()` 的签名必须统一为：

```ts
export const createChangeState = <TState extends Record<string, unknown>>(
  schema: ChangeSchema<TState>
): TState
```

其余四个 API 同理，以 `TState` 作为唯一公开状态类型，不再从 builder spec 反推类型。

## 5. 最终 surface field 类型

`shared/projection/src/runtime.ts` 中的 field 类型改为公开导出，并扩展为以下最终版本：

```ts
import type { Equality } from '@shared/core'
import type { EntityDelta } from '@shared/delta'

export interface ProjectionFamilySnapshot<TKey extends string, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface ProjectionFieldSyncContext<TState> {
  state: TState
}

export interface ProjectionValueField<TState, TValue> {
  kind: 'value'
  read(state: TState): TValue
  isEqual?: Equality<TValue>
  changed?(context: ProjectionFieldSyncContext<TState>): boolean
}

export interface ProjectionFamilyField<
  TState,
  TKey extends string,
  TValue
> {
  kind: 'family'
  read(state: TState): ProjectionFamilySnapshot<TKey, TValue>
  isEqual?: Equality<TValue>
  idsEqual?: Equality<readonly TKey[]>
  changed?(context: ProjectionFieldSyncContext<TState>): boolean
  delta?(
    context: ProjectionFieldSyncContext<TState> & {
      previous: ProjectionFamilySnapshot<TKey, TValue>
      next: ProjectionFamilySnapshot<TKey, TValue>
    }
  ): EntityDelta<TKey> | 'replace' | 'skip'
}

export type ProjectionSurfaceField<TState> =
  | ProjectionValueField<TState, any>
  | ProjectionFamilyField<TState, string, any>

export type ProjectionSurfaceTree<TState> = {
  [key: string]: ProjectionSurfaceField<TState> | ProjectionSurfaceTree<TState>
}
```

## 6. `changed` 的最终语义

`changed` 的语义固定如下：

1. `changed` 缺失：该 field 每次 `surface.sync()` 都进入 sync 流程。
2. `changed` 返回 `false`：该 field 本次完全跳过，不读取、不比较、不写 store。
3. `changed` 返回 `true`：该 field 本次进入 sync 流程。

这条规则是 `Surface sync 按 field changed 短路` 的正式实现，不允许绕开。

## 7. family field `delta` 的最终语义

`delta` 的语义固定如下：

1. 返回 `'skip'`：本次 family field 不写入 store。
2. 返回 `'replace'`：本次强制走 `replace`。
3. 返回 `EntityDelta<TKey>`：本次强制走 `apply`。

`EntityDelta<TKey>` 到 `FamilyPatch<TKey, TValue>` 的转换规则固定如下：

1. `delta.order === true` 时：
   - `patch.ids = next.ids`
2. `delta.set` 中每个 key：
   - 从 `next.byId.get(key)` 取值
   - 生成 `[key, value]`
   - value 必须存在
3. `delta.remove` 直接写入 `patch.remove`

运行时不允许出现“set key 在 next.byId 中不存在”的静默容错。遇到这种情况直接抛错。

## 8. family field `idsEqual` 的最终语义

`idsEqual` 的语义固定如下：

1. 用于判断 `ids` 是否需要发布变更。
2. `idsEqual(previous.ids, next.ids) === true` 时，surface 保留 `previous.ids` 引用。
3. 缺失时默认 `Object.is`。

editor-scene 的所有 family field 都必须显式传入 `idsEqual`，统一使用顺序比较。

## 9. `createSurfaceStore()` 最终行为

`createSurfaceStore()` 的行为固定为：

1. build 阶段为每个 field 创建 store 和本地 cached snapshot。
2. sync 阶段逐 field 执行，不再统一无脑写入。
3. `value` field：
   - `changed === false` 直接跳过
   - 否则 `read(next)`，若 `isEqual(previous, next)` 则跳过
   - 否则 `source.set(next)` 并更新缓存
4. `family` field：
   - `changed === false` 直接跳过
   - 读取 `next`
   - 若有 `delta`，按 `delta` 结果执行 `skip/replace/apply`
   - 若没有 `delta`，按 `replace` 逻辑执行
   - `idsEqual` 为 true 时保留旧 ids 引用
   - 更新 cached snapshot

## 10. 最终移除 `replace-only` surface 思路

`shared/projection` 中以下逻辑必须彻底删除：

```ts
syncers.push((nextState) => {
  source.write.replace(field.read(nextState as TState))
})
```

这套逻辑不允许保留在任何 family field 实现中。

## 11. `shared/core/src/store/table.ts` 的最终角色

`shared/core/src/store/table.ts` 不作为新的 scene surface DSL 入口重构。

长期最优边界固定如下：

1. `createFamilyStore().write.apply()` 继续作为 family `byId` 的最终增量写入入口。
2. `createTableStore()` 继续负责 key 级通知与按 key 等值比较。
3. `shared/projection` 的职责是把 phase delta 精确转换成 `FamilyPatch`，而不是绕过 `createFamilyStore()` 直接面向 `table.ts` 重新发明一套 surface 同步层。
4. 性能瓶颈的根因是 projection surface 当前总在 `replace + 新 ids 引用`，不是 `table.ts` 缺少增量能力。

因此实施时不新增一层“projection 直连 table store”的旁路，直接把 `shared/projection` family sync 改成 `delta -> FamilyPatch -> createFamilyStore().write.apply()`。

---

## 三、`shared/projection` 最终测试要求

必须新增以下测试：

1. `value field changed=false` 时不读取 field、不通知 store。
2. `family field changed=false` 时不读取 next snapshot、不通知 store。
3. `family field delta='skip'` 时不通知 ids 和 byId。
4. `family field delta=EntityDelta` 时走 `apply`，只通知涉及 key。
5. `family field idsEqual=true` 时保留旧 ids 引用。
6. `surface.sync()` 只同步 changed field。

这些测试必须放在：

1. `shared/projection/test/modelRuntime.test.ts`
2. 新增 `shared/projection/test/surfaceSync.test.ts`

---

## 四、`whiteboard-editor-scene` 最终 phase 设计

## 1. Phase 名称与职责

最终 phase 固定为：

### `graph`

职责：

1. patch canonical graph state
2. patch document state
3. patch indexes
4. 输出 `GraphDelta`
5. 输出 `GraphChanges`

### `spatial`

职责：

1. 消费 `GraphDelta`
2. patch spatial state
3. 输出 `SpatialDelta`

### `items`

职责：

1. 根据 canvas order patch `working.items`
2. 输出 `ItemsDelta`

### `ui`

职责：

1. patch `ui.nodes`
2. patch `ui.edges`
3. patch `ui.chrome`
4. 输出 `UiDelta`

### `render`

职责：

1. 消费 `GraphDelta`
2. 消费 `GraphChanges`
3. 消费 `ItemsDelta`
4. 消费 `UiDelta`
5. patch `render.node`
6. patch `render.edge.statics`
7. patch `render.edge.active`
8. patch `render.edge.labels`
9. patch `render.edge.masks`
10. patch `render.overlay`
11. patch `render.chrome`
12. 输出 `RenderDelta`

## 2. 删除当前 `view` phase

以下内容直接删除：

1. `contracts/delta.ts` 中的 `ViewPatchScope`
2. `runtime/model.ts` 中的 `viewPhaseScope`
3. `model/view/patch.ts` 中的 `patchViewState`
4. 任何 “graph changed -> emit single view scope” 的逻辑

`model/view` 目录最终必须拆解为：

1. `model/items/patch.ts`
2. `model/ui/patch.ts`
3. `model/render/patch.ts`
4. `model/render/node.ts`
5. `model/render/edge.ts`
6. `model/render/chrome.ts`

不再保留当前“大型 `model/view/render.ts` + `model/view/patch.ts`” 结构。

---

## 五、`whiteboard-editor-scene` 最终 delta 设计

## 1. `contracts/delta.ts` 最终结构

`contracts/delta.ts` 最终必须定义：

```ts
import type {
  ChangeSchema,
  EntityDelta,
  IdDelta
} from '@shared/delta'
import type {
  Revision,
  ScopeSchema
} from '@shared/projection'

export interface GraphDelta {
  revision: Revision
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}

export interface GraphChanges {
  order: boolean
  node: {
    lifecycle: IdDelta<NodeId>
    geometry: IdDelta<NodeId>
    content: IdDelta<NodeId>
    owner: IdDelta<NodeId>
  }
  edge: {
    lifecycle: IdDelta<EdgeId>
    route: IdDelta<EdgeId>
    style: IdDelta<EdgeId>
    labels: IdDelta<EdgeId>
    endpoints: IdDelta<EdgeId>
    box: IdDelta<EdgeId>
  }
  mindmap: {
    lifecycle: IdDelta<MindmapId>
    geometry: IdDelta<MindmapId>
    connectors: IdDelta<MindmapId>
    membership: IdDelta<MindmapId>
  }
  group: {
    lifecycle: IdDelta<GroupId>
    geometry: IdDelta<GroupId>
    membership: IdDelta<GroupId>
  }
}

export const graphChangeSpec: ChangeSchema<GraphChanges> = {
  order: 'flag',
  node: {
    lifecycle: 'ids',
    geometry: 'ids',
    content: 'ids',
    owner: 'ids'
  },
  edge: {
    lifecycle: 'ids',
    route: 'ids',
    style: 'ids',
    labels: 'ids',
    endpoints: 'ids',
    box: 'ids'
  },
  mindmap: {
    lifecycle: 'ids',
    geometry: 'ids',
    connectors: 'ids',
    membership: 'ids'
  },
  group: {
    lifecycle: 'ids',
    geometry: 'ids',
    membership: 'ids'
  }
}

export type SceneItemKey =
  | `mindmap:${MindmapId}`
  | `node:${NodeId}`
  | `edge:${EdgeId}`

export interface ItemsDelta {
  revision: Revision
  change?: EntityDelta<SceneItemKey>
}

export interface UiDelta {
  node: IdDelta<NodeId>
  edge: IdDelta<EdgeId>
  chrome: boolean
}

export const uiChangeSpec: ChangeSchema<UiDelta> = {
  node: 'ids',
  edge: 'ids',
  chrome: 'flag'
}

export interface RenderDelta {
  node: IdDelta<NodeId>
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<EdgeId>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<EdgeId>
    staticsIds: boolean
    activeIds: boolean
    labelsIds: boolean
    masksIds: boolean
  },
  chrome: {
    scene: boolean
    edge: boolean
  }
}

export const renderChangeSpec: ChangeSchema<RenderDelta> = {
  node: 'ids',
  edge: {
    statics: 'ids',
    active: 'ids',
    labels: 'ids',
    masks: 'ids',
    staticsIds: 'flag',
    activeIds: 'flag',
    labelsIds: 'flag',
    masksIds: 'flag'
  },
  chrome: {
    scene: 'flag',
    edge: 'flag'
  }
}

export const graphPhaseScope = {
  reset: 'flag',
  order: 'flag',
  nodes: 'set',
  edges: 'set',
  mindmaps: 'set',
  groups: 'set'
} satisfies ScopeSchema<GraphPatchScope>

export const spatialPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<SpatialPatchScope>

export const itemsPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<ItemsPatchScope>

export const uiPhaseScope = {
  reset: 'flag',
  nodes: 'set',
  edges: 'set',
  chrome: 'flag'
} satisfies ScopeSchema<UiPatchScope>

export const renderPhaseScope = {
  reset: 'flag',
  node: 'flag',
  statics: 'flag',
  active: 'flag',
  labels: 'flag',
  masks: 'flag',
  overlay: 'flag',
  chrome: 'flag'
} satisfies ScopeSchema<RenderPatchScope>
```

## 2. `working.delta` 最终结构

`contracts/working.ts` 与 `runtime/state.ts` 最终必须变为：

```ts
export interface WorkingState extends State {
  measure?: TextMeasure
  draft: {
    node: Map<NodeId, NodeDraftMeasure>
  }
  delta: {
    graph: GraphDelta
    graphChanges: GraphChanges
    spatial: SpatialDelta
    items: ItemsDelta
    ui: UiDelta
    render: RenderDelta
  }
}
```

## 3. 所有 delta 都必须每次 update 重置

每个 phase 的 delta 重置规则固定如下：

1. `graph` phase 开始前重置 `graph` 和 `graphChanges`
2. `spatial` phase 开始前重置 `spatial`
3. `items` phase 开始前重置 `items`
4. `ui` phase 开始前重置 `ui`
5. `render` phase 开始前重置 `render`

不允许任何 phase 读取前一轮 update 残留的 output delta。

---

## 六、最终 scope 设计

scope 只负责 phase 调度，不承担 canonical delta 职责。

## 1. `graphPhaseScope`

最终类型与 spec 固定为：

```ts
export interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

export const graphPhaseScope = {
  reset: 'flag',
  order: 'flag',
  nodes: 'set',
  edges: 'set',
  mindmaps: 'set',
  groups: 'set'
} satisfies ScopeSchema<GraphPatchScope>
```

## 2. `spatialPhaseScope`

固定为：

```ts
export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

export const spatialPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<SpatialPatchScope>
```

## 3. `itemsPhaseScope`

固定为：

```ts
export interface ItemsPatchScope {
  reset: boolean
  graph: boolean
}

export const itemsPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<ItemsPatchScope>
```

## 4. `uiPhaseScope`

固定为：

```ts
export interface UiPatchScope {
  reset: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  chrome: boolean
}

export const uiPhaseScope = {
  reset: 'flag',
  nodes: 'set',
  edges: 'set',
  chrome: 'flag'
} satisfies ScopeSchema<UiPatchScope>
```

## 5. `renderPhaseScope`

最终 `render` 不再按实体 touched set 调度，而按子域调度：

```ts
export interface RenderPatchScope {
  reset: boolean
  node: boolean
  statics: boolean
  active: boolean
  labels: boolean
  masks: boolean
  overlay: boolean
  chrome: boolean
}

export const renderPhaseScope = {
  reset: 'flag',
  node: 'flag',
  statics: 'flag',
  active: 'flag',
  labels: 'flag',
  masks: 'flag',
  overlay: 'flag',
  chrome: 'flag'
} satisfies ScopeSchema<RenderPatchScope>
```

这是最终形态。render phase 内部靠 `working.delta.graphChanges/items/ui/render` 做真正增量。

---

## 七、最终 graph phase 设计

## 1. `GraphDelta` 保留

`GraphDelta` 继续作为 graph -> spatial 的核心输入，不改语义。

## 2. `GraphChanges` 必须在 patchNode / patchEdge / patchMindmap / patchGroup 中写满

### Node

在 `model/graph/node.ts` 中：

1. add/remove 写入 `node.lifecycle`
2. geometry 变化写入 `node.geometry`
3. node model 内容变化写入 `node.content`
4. owner 变化写入 `node.owner`

### Edge

在 `model/graph/edge.ts` 中：

1. add/remove 写入 `edge.lifecycle`
2. route points/svgPath/segments/labels point 变化写入 `edge.route`
3. edge style 变化写入 `edge.style`
4. label text/style/size/maskRect 变化写入 `edge.labels`
5. source/target ends 变化写入 `edge.endpoints`
6. edge box 变化写入 `edge.box`

### Mindmap

在 `model/graph/mindmap.ts` 中：

1. add/remove 写入 `mindmap.lifecycle`
2. layout/bbox 变化写入 `mindmap.geometry`
3. connectors 变化写入 `mindmap.connectors`
4. node membership 变化写入 `mindmap.membership`

### Group

在 `model/graph/group.ts` 中：

1. add/remove 写入 `group.lifecycle`
2. frame bounds 变化写入 `group.geometry`
3. items membership 变化写入 `group.membership`

## 3. `graph` emit 的最终规则

`graph` phase 结束后 emit：

1. `spatial.graph = true`，当且仅当 `GraphDelta` 对 spatial 有影响
2. `items.graph = true`，当且仅当 order 或 scene item lifecycle 有变化
3. `ui.nodes/ui.edges/chrome`，根据 `InputDelta + GraphDelta`
4. `render` 子域 flag，根据 `GraphChanges`

`graph` phase 不再 emit `view` scope。

---

## 八、最终 items phase 设计

## 1. `items` 独立文件

新增：

- `whiteboard/packages/whiteboard-editor-scene/src/model/items/patch.ts`

## 2. `items` patch 行为

行为固定为：

1. 从 `document.snapshot.document.canvas.order` 构建 `nextItems`
2. 使用 `entityDelta.fromSnapshots()` 计算 `ItemsDelta.change`
3. `SceneItemKey` 规则固定：
   - `node:${id}`
   - `edge:${id}`
   - `mindmap:${id}`
4. `working.items` 更新为 `nextItems`
5. `ItemsDelta.revision = revision`

## 3. `items` emit 的最终规则

`items` phase 结束后 emit：

1. `render.statics = true`，当 `ItemsDelta.change` 存在
2. 其他 render 子域不受 `items` phase 直接驱动

---

## 九、最终 ui phase 设计

## 1. `ui` 独立文件

新增：

- `whiteboard/packages/whiteboard-editor-scene/src/model/ui/patch.ts`

## 2. `ui` patch 行为

`ui` phase 必须只产出三类结果：

1. `ui.nodes`
2. `ui.edges`
3. `ui.chrome`

它不再碰 `items`，也不再碰 `render`。

## 3. `UiDelta` 写入规则

### node

当 node ui view 真变化时：

1. 写入 `UiDelta.node.updated`
2. 删除时写入 `removed`
3. 新增时写入 `added`

### edge

当 edge ui view 真变化时：

1. 写入 `UiDelta.edge.updated`
2. 删除时写入 `removed`
3. 新增时写入 `added`

### chrome

当 `ui.chrome !== previous` 时：

1. `UiDelta.chrome = true`

## 4. `ui` emit 的最终规则

`ui` phase 结束后 emit：

1. `render.node = true`，当 `UiDelta.node` 非空
2. `render.active = true`，当 `UiDelta.edge` 非空或 hover/selection/edit 相关输入变化
3. `render.labels = true`，当 `UiDelta.edge` 非空
4. `render.overlay = true`，当 `UiDelta.edge` 非空或 `UiDelta.chrome=true` 或 tool/interaction/edit/preview.edgeGuide 变化
5. `render.chrome = true`，当 `UiDelta.chrome=true` 或 `render.overlay=true`

`ui` phase 不直接驱动 `render.statics` 或 `render.masks`。

---

## 十、最终 render phase 设计

## 1. render 拆文件

新增或重组为：

1. `model/render/patch.ts`
2. `model/render/node.ts`
3. `model/render/edgeStatics.ts`
4. `model/render/edgeLabels.ts`
5. `model/render/edgeMasks.ts`
6. `model/render/edgeActive.ts`
7. `model/render/overlay.ts`
8. `model/render/chrome.ts`
9. `model/render/delta.ts`

删除当前单文件：

- `model/view/render.ts`

## 2. Node render 最终输入

`node render` 只消费：

1. `GraphChanges.node.lifecycle`
2. `GraphChanges.node.geometry`
3. `GraphChanges.node.content`
4. `GraphChanges.node.owner`
5. `UiDelta.node`

patch 行为固定为：

1. reset 时 rebuild 全部
2. 普通 patch 时只处理上述变化涉及 nodeId
3. 写 `RenderDelta.node`

## 3. Edge statics 最终输入

`edge statics` 只消费：

1. `ItemsDelta.change`
2. `GraphChanges.edge.lifecycle`
3. `GraphChanges.edge.route`
4. `GraphChanges.edge.style`

patch 行为固定为：

1. 基于 `styleKeyByEdge / edgeIdsByStyleKey / staticIdByEdge / staticIdsByStyleKey` 做 bucket 级增量 patch
2. 只重建受影响 `styleKey` 的 bucket
3. 只为受影响 bucket 生成新的 `EdgeStaticView`
4. `RenderDelta.edge.statics` 记录 changed staticId
5. `RenderDelta.edge.staticsIds` 在 bucket 新增/删除/重排时置 true

禁止行为：

1. 普通 patch 路径中调用全量 `buildStaticState()`

## 4. Edge labels 最终输入

`edge labels` 只消费：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.route`
3. `GraphChanges.edge.labels`
4. `UiDelta.edge`

patch 行为固定为：

1. 按受影响 `edgeId` 计算该 edge 所有 `EdgeLabelKey`
2. 只 patch 这些 label key
3. `RenderDelta.edge.labels` 记录 changed label key
4. `RenderDelta.edge.labelsIds` 在 label family 成员增删时置 true

禁止行为：

1. 普通 patch 路径中全量扫描全部 edge 生成 labels map

## 5. Edge masks 最终输入

`edge masks` 只消费：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.route`
3. `GraphChanges.edge.labels`

patch 行为固定为：

1. 只按受影响 `edgeId` patch
2. `RenderDelta.edge.masks` 记录 changed edgeId
3. `RenderDelta.edge.masksIds` 在 mask family 成员增删时置 true

禁止行为：

1. 因 selection / hover / editing 重算 mask
2. 普通 patch 路径全量扫描所有 edge

## 6. Edge active 最终输入

`edge active` 只消费：

1. `GraphChanges.edge.lifecycle`
2. `GraphChanges.edge.route`
3. `GraphChanges.edge.style`
4. `GraphChanges.edge.box`
5. `UiDelta.edge`
6. 当前 input 中与 hover / selection / edit 相关的高频状态

patch 行为固定为：

1. 先计算本轮 active edge 集
2. 只 patch active 集与上一轮 active 集并集
3. `RenderDelta.edge.active` 记录 changed edgeId
4. `RenderDelta.edge.activeIds` 在 active family 成员增删时置 true

## 7. Overlay 最终输入

`overlay` 只消费：

1. `GraphChanges.edge.route`
2. `GraphChanges.edge.endpoints`
3. `GraphChanges.edge.box`
4. `UiDelta.edge`
5. `UiDelta.chrome`
6. input 的 tool / interaction / edit / preview.edgeGuide

patch 行为固定为：

1. 作为 value field
2. 真变化时 `RenderDelta.chrome.edge = true`

## 8. Chrome render 最终输入

`chrome render` 只消费：

1. `UiDelta.chrome`
2. overlay changed

patch 行为固定为：

1. 作为 value field
2. 真变化时 `RenderDelta.chrome.scene = true`

---

## 十一、最终 Runtime surface 设计

## 1. `RuntimeStores` 保持形状稳定

对 host/React 层，最终 `RuntimeStores` 保持当前主要结构不变：

1. `graph.*`
2. `render.node`
3. `render.edge.statics/active/labels/masks`
4. `render.chrome.scene/edge`
5. `items`

不改外层 read surface 路径。

这里的稳定仅限 read 路径，不代表沿用旧 surface builder。
实现层必须直接写 plain object field spec，并且由 phase delta 驱动 `changed` / `delta`。

## 2. family surface 的最终 field 定义

`runtime/model.ts` 中 surface 定义必须直接使用 plain object field spec。

示例：

```ts
render: {
  edge: {
    statics: {
      kind: 'family',
      read: state => ({
        ids: state.render.statics.ids,
        byId: state.render.statics.byId
      }),
      isEqual: isStaticViewEqual,
      idsEqual: equal.sameOrder,
      changed: ({ state }) => hasChangeState(renderChangeSpec, state.delta.render)
        && (
          state.delta.render.edge.statics.added.size > 0
          || state.delta.render.edge.statics.updated.size > 0
          || state.delta.render.edge.statics.removed.size > 0
          || state.delta.render.edge.staticsIds
        ),
      delta: ({ state }) => toEntityDeltaFromRenderStatics(state.delta.render)
    }
  }
}
```

## 3. `items` surface 的最终 sync

`items` 不再作为纯 value surface 每次整数组 set。

最终定义为 family surface：

```ts
items: {
  kind: 'family',
  read: state => ({
    ids: state.items.ids,
    byId: state.items.byId
  }),
  idsEqual: equal.sameOrder,
  changed: ({ state }) => state.delta.items.change !== undefined,
  delta: ({ state }) => state.delta.items.change ?? 'skip'
}
```

这要求 `working.items` 从裸数组改为：

```ts
items: {
  ids: readonly SceneItemKey[]
  byId: ReadonlyMap<SceneItemKey, SceneItem>
}
```

裸数组形式直接废弃。

---

## 十二、editor-scene 结构性删除项

以下内容必须删除：

1. `working.items: readonly SceneItem[]`
2. `buildItems(snapshot): readonly SceneItem[]`
3. `patchViewState()`
4. `ViewPatchScope`
5. `model/view/render.ts`
6. `runtime/model.ts` 中任何 field builder 包装层
7. 所有 `surface.read` 中的 `[...map.keys()]` 即时构造 ids 模式
8. 所有 render 普通 patch 路径中的全量 rebuild

---

## 十三、文件级实施清单

## A. `shared/projection`

### 1. 新增文件

1. `shared/projection/test/surfaceSync.test.ts`

### 2. 修改文件

1. `shared/projection/src/index.ts`
2. `shared/projection/src/scope.ts`
3. `shared/projection/src/runtime.ts`
4. `shared/projection/test/modelRuntime.test.ts`
5. 删除 `shared/projection/src/runtime.ts` 内部 `value()` / `family()` builder

### 3. 删除文件

1. `shared/projection/src/internal.ts`

## B. `shared/delta`

### 1. 重写文件

1. `shared/delta/src/changeState.ts`
2. `shared/delta/src/index.ts`
3. `shared/delta/test/changeState.test.ts`

### 2. 删除导出

1. `defineChangeSpec`
2. `changeFlag`
3. `ids`
4. `changeSet`
5. `ChangeField`
6. `ChangeObjectFields`
7. `ChangeSpec`
8. `InferChangeState`

### 3. 必测场景

1. nested `flag / ids / set` 在 pure string schema 下能正确 `create/clone/merge/take/reset`
2. `takeChangeState()` 会正确清空嵌套 `flag`
3. `hasChangeState()` 对空 `ids` / 空 `set` / `false flag` 返回 `false`

## C. `whiteboard-editor-scene`

### 1. 新增文件

1. `src/model/items/patch.ts`
2. `src/model/ui/patch.ts`
3. `src/model/render/patch.ts`
4. `src/model/render/node.ts`
5. `src/model/render/edgeStatics.ts`
6. `src/model/render/edgeLabels.ts`
7. `src/model/render/edgeMasks.ts`
8. `src/model/render/edgeActive.ts`
9. `src/model/render/overlay.ts`
10. `src/model/render/chrome.ts`
11. `src/model/render/delta.ts`

### 2. 重写文件

1. `src/contracts/delta.ts`
2. `src/contracts/working.ts`
3. `src/runtime/state.ts`
4. `src/runtime/model.ts`
5. `src/model/graph/patch.ts`
6. `src/model/graph/node.ts`
7. `src/model/graph/edge.ts`
8. `src/model/graph/mindmap.ts`
9. `src/model/graph/group.ts`

### 3. 删除文件

1. `src/model/view/patch.ts`
2. `src/model/view/render.ts`

### 4. 迁移文件

1. `src/model/view/items.ts` 迁移为 `src/model/items/patch.ts` 的内部实现
2. `src/model/view/ui.ts` 迁移为 `src/model/ui/patch.ts` 与 `src/model/ui/equality.ts`

---

## 十四、必须新增的测试

## 1. graph changes 测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/graphChanges.test.ts`

覆盖：

1. node geometry/content/owner 分流
2. edge route/style/labels/endpoints/box 分流
3. mindmap connectors/membership 分流
4. group geometry/membership 分流

## 2. items delta 测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/itemsDelta.test.ts`

覆盖：

1. add/remove/orderChanged
2. `SceneItemKey` 稳定性

## 3. ui delta 测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/uiDelta.test.ts`

覆盖：

1. node ui family patch
2. edge ui family patch
3. chrome flag

## 4. render delta 测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/renderDelta.test.ts`

覆盖：

1. node render patch
2. edge statics bucket patch
3. labels patch
4. masks patch
5. active patch
6. overlay/chrome value patch

## 5. surface sync 测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/runtimeSurfaceSync.test.ts`

覆盖：

1. graph family 只同步 graph changed field
2. render statics ids 稳定
3. mask 变化不唤醒 statics ids
4. node-only 变化不唤醒 edge static families

## 6. 性能测试

新增：

- `whiteboard/packages/whiteboard-editor-scene/test/renderPerf.test.ts`

固定 benchmark：

1. 100 edge
2. 500 edge
3. 2000 edge

操作：

1. 拖拽无关 node
2. 拖拽连接 2 条 edge 的 node
3. 拖拽连接 20 条 edge 的 node

断言：

1. `render.edge.statics` changed 数与受影响 bucket 数一致
2. 普通 node 拖拽时 statics family 不同步
3. labels/masks patch 只作用于受影响 edge

---

## 十五、最终验收标准

全部完成后，必须满足以下硬性条件：

1. `shared/projection/src/internal.ts` 已删除。
2. `shared/projection` 中已不存在 `defineScope / flagScopeField / setScopeField / slotScopeField / valueField / familyField`。
3. 所有 scope schema 均使用 pure string spec。
4. 所有 surface field 均使用 plain object spec。
5. `shared/projection` family field 已支持 `changed + delta + idsEqual`。
6. `surface.sync()` 已按 field changed 短路。
7. `shared/delta` 中已不存在 `defineChangeSpec / changeFlag / ids / changeSet / InferChangeState`，基于 `ids` 的 `changeIds` 导入别名也不再使用。
8. 所有 change schema 均使用 pure string spec。
9. `whiteboard-editor-scene` 已不存在 `view` phase。
10. `graph / spatial / items / ui / render` 五 phase 全部存在并由 runtime 管理。
11. `working.delta` 已包含 `graph / graphChanges / spatial / items / ui / render`。
12. `working.items` 已从裸数组升级为 family snapshot。
13. `patchStatics` 普通路径不再全量 rebuild。
14. `patchLabelsAndMasks` 普通路径不再全量扫描所有 edge。
15. render family surface 不再通过 `[...map.keys()]` 每次生成新 ids 数组后直接 replace。
16. `shared/projection` family sync 通过 `createFamilyStore().write.apply()` 下发增量 patch，不新增 table 旁路。
17. 对无关 node 的拖拽不会同步 `render.edge.statics` surface。
18. 对无关交互的变化不会同步 `render.edge.masks` surface。
19. 全部新增测试通过。

---

## 十六、执行顺序

执行顺序固定，不允许颠倒：

1. 重写 `shared/projection` 公开 API 与 surface sync。
2. 重写 `shared/delta` 为 pure string schema。
3. 重写 `whiteboard-editor-scene` contracts 和 working delta。
4. 拆分 `view` phase 为 `items/ui/render`。
5. 重写 graph changes 写入。
6. 重写 items delta。
7. 重写 ui delta。
8. 重写 render delta 与增量 patch。
9. 重写 runtime surface 定义。
10. 删除旧文件与旧接口。
11. 补齐全部测试与性能基线。

不允许先局部优化 render 再回头补 projection。  
最终形态必须一次到位。
