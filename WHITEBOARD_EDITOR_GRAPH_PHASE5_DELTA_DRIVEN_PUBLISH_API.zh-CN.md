# `whiteboard-editor-graph` 阶段五 `delta-driven publisher / PublishDelta` 详细设计

## 1. 文档范围

这份文档只定义迁移总文档里的阶段五：

> 把 publisher 改成 delta-driven。

这份文档只覆盖：

- `PublishDelta` 的内部 contract
- `WorkingState.delta.publish`
- graph / scene / ui 的 publish patch API
- publisher 的实施顺序

这份文档不覆盖：

- graph patch 本身
- `SpatialIndexState / SpatialDelta`
- editor read 层的 `equal` 收缩
- DOM pick / overlay pick
- 阶段六删除旧代码后的最终清理

---

## 2. 硬约束

- 单轨重构
- 不保兼容 facade
- 不保 old/new 双实现并行
- 允许重构中途暂时无法跑通

阶段五还要额外固定下面几条：

1. publisher 不再默认使用 `publishFamily(...)` 做整族 compare。
2. publisher 不再默认使用 `publishValue(...)` 对 `SceneSnapshot` 做整块 compare。
3. `PublishDelta` 只记录“本轮哪些 published subtree / family entry 需要更新”，不携带 snapshot 大对象。
4. public `Snapshot` / `Change` contract 阶段五不改形状。
5. `graph / spatial / ui` 的 runtime truth 继续留在 `working`，publisher 只负责 patch published snapshot。

---

## 3. `WorkingState` 与 `PublishDelta`

## 3.1 `WorkingState.delta` 增加 `publish`

阶段五以后，`WorkingState` 收敛成：

```ts
interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  spatial: SpatialIndexState
  ui: UiState
  scene: SceneSnapshot
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
    publish: PublishDelta
  }
}
```

这里的边界固定成：

- `graph`
  - graph patch 的正式事务 delta
- `spatial`
  - spatial patch 的正式事务 delta
- `publish`
  - publisher 消费的正式事务 delta

`PublishDelta` 是 runtime 内部投影层，不是 public `Change`。

## 3.2 `PublishDelta`

阶段五推荐直接定义成：

```ts
interface PublishDelta {
  graph: GraphPublishDelta
  scene: ScenePublishDelta
  ui: UiPublishDelta
}
```

### `GraphPublishDelta`

```ts
interface GraphPublishDelta {
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  owners: {
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
}
```

### `ScenePublishDelta`

```ts
interface ScenePublishDelta {
  items: boolean
  visible: boolean
}
```

### `UiPublishDelta`

```ts
interface UiPublishDelta {
  selection: boolean
  chrome: boolean
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
}
```

这里的 contract 要写死：

- `PublishDelta.graph`
  - 只覆盖 published graph families
- `PublishDelta.scene.items`
  - 对应 `snapshot.scene.items`
- `PublishDelta.scene.visible`
  - 对应 `snapshot.scene.visible`
  - 也同时驱动 `snapshot.scene.spatial` 和 `snapshot.scene.pick`
- `PublishDelta.ui.selection`
  - 对应 `snapshot.ui.selection`
- `PublishDelta.ui.chrome`
  - 对应 `snapshot.ui.chrome`
- `PublishDelta.ui.nodes / edges`
  - 对应 `snapshot.ui.nodes / edges`

## 3.3 `PublishDelta` 的 reset helper

阶段五推荐新增：

```ts
function createPublishDelta(): PublishDelta
function resetPublishDelta(delta: PublishDelta): void
```

建议的默认值：

```ts
function createPublishDelta(): PublishDelta {
  return {
    graph: {
      nodes: createIdDelta(),
      edges: createIdDelta(),
      owners: {
        mindmaps: createIdDelta(),
        groups: createIdDelta()
      }
    },
    scene: {
      items: false,
      visible: false
    },
    ui: {
      selection: false,
      chrome: false,
      nodes: createIdDelta(),
      edges: createIdDelta()
    }
  }
}
```

## 3.4 `PublishDelta` 的写入规则

阶段五固定成三条：

1. `PublishDelta.graph`
   - 由 `GraphDelta.entities.*` 同步过来
2. `PublishDelta.scene`
   - 由 `GraphDelta.order`、`SpatialDelta.order`、`SpatialDelta.visible` 同步过来
3. `PublishDelta.ui`
   - 由 ui phase 直接写入

不允许 publisher 再自己从：

- `previous snapshot`
- `working snapshot`

做整块 compare 推导 change。

---

## 4. `createEditorGraphPublisher()` 的目标 contract

阶段五不改 public runtime 接口：

```ts
interface RuntimePublisher<TWorking, TSnapshot, TChange> {
  publish(input: {
    revision: Revision
    previous: TSnapshot
    working: TWorking
  }): {
    snapshot: TSnapshot
    change: TChange
  }
}
```

阶段五只改 `whiteboard-editor-graph` 内部实现：

```ts
function createEditorGraphPublisher(): RuntimePublisher<
  WorkingState,
  Snapshot,
  Change
>
```

publisher 的唯一正式输入固定成：

- `previous`
- `working`
- `working.delta.publish`

publisher 不再直接依赖：

- `runtime/equality.ts` 里的整块 snapshot equality
- `publishFamily(...)`
- `publishValue(...)`

来推导 graph / scene / ui 的 change。

---

## 5. publish patch helper API

## 5.1 family patch helper

阶段五推荐在 `runtime/publish/` 下引入一个 family patch helper：

```ts
interface PatchedFamily<TKey, TValue> {
  value: Family<TKey, TValue>
  ids: Ids<TKey>
  changed: boolean
}

function patchPublishedFamily<TKey extends string, TValue>(input: {
  previous: Family<TKey, TValue>
  delta: IdDelta<TKey>
  read(id: TKey): TValue | undefined
}): PatchedFamily<TKey, TValue>
```

语义固定成：

- `added`
  - 从 `read(id)` 读当前值并写入 `byId`
- `updated`
  - 从 `read(id)` 读当前值并覆盖 `byId`
- `removed`
  - 从 `byId` 删除
- `ids`
  - 只有在 `added / removed` 非空时才重建
- `changed`
  - 由 `delta` 是否为空决定

这里不做 entry equality compare。  
`delta` 说 touched 了，publisher 就 patch。

## 5.2 scene patch helper

阶段五推荐单独提供 scene patch helper：

```ts
interface PatchedScene {
  value: SceneSnapshot
  changed: boolean
}

function patchPublishedScene(input: {
  previous: SceneSnapshot
  working: WorkingState
  delta: ScenePublishDelta
}): PatchedScene
```

scene patch 规则固定成：

- `delta.items === false`
  - 复用 `previous.items`
- `delta.items === true`
  - 从 `working.scene.items` 直接替换
- `delta.visible === false`
  - 复用：
    - `previous.visible`
    - `previous.spatial`
    - `previous.pick`
- `delta.visible === true`
  - 从 `working.scene.visible`、`working.scene.spatial`、`working.scene.pick` 直接替换

`layers` 在阶段五继续固定复用静态值。

## 5.3 value patch helper

对 `selection` / `chrome` 这类 value subtree，阶段五推荐直接用布尔 bit：

```ts
interface PatchedValue<TValue> {
  value: TValue
  changed: boolean
}

function patchPublishedValue<TValue>(input: {
  previous: TValue
  next: TValue
  changed: boolean
}): PatchedValue<TValue>
```

语义固定成：

- `changed === false`
  - 直接复用 `previous`
- `changed === true`
  - 直接使用 `next`

这里不再接 `isEqual`。

---

## 6. graph / scene / ui 的 publisher 设计

## 6.1 graph publish

graph publish 固定拆成四个 family：

- `nodes`
- `edges`
- `owners.mindmaps`
- `owners.groups`

推荐 API：

```ts
function patchPublishedGraph(input: {
  previous: GraphSnapshot
  working: WorkingState
  delta: GraphPublishDelta
}): {
  value: GraphSnapshot
  change: GraphChange
}
```

graph publish 规则固定成：

- `delta.nodes`
  - patch `snapshot.graph.nodes`
- `delta.edges`
  - patch `snapshot.graph.edges`
- `delta.owners.mindmaps`
  - patch `snapshot.graph.owners.mindmaps`
- `delta.owners.groups`
  - patch `snapshot.graph.owners.groups`

public `GraphChange` 直接由这四个 namespace 生成：

```ts
interface GraphChange {
  nodes: Ids<NodeId>
  edges: Ids<EdgeId>
  owners: {
    mindmaps: Ids<MindmapId>
    groups: Ids<GroupId>
  }
}
```

## 6.2 scene publish

推荐 API：

```ts
function patchPublishedScene(input: {
  previous: SceneSnapshot
  working: WorkingState
  delta: ScenePublishDelta
}): {
  value: SceneSnapshot
  change: Flags
}
```

public `Change.scene` 阶段五继续保持：

```ts
type SceneChange = Flags
```

scene change 规则固定成：

- `delta.items || delta.visible`
  - `changed = true`
- 否则
  - `changed = false`

## 6.3 ui publish

推荐 API：

```ts
function patchPublishedUi(input: {
  previous: UiSnapshot
  working: WorkingState
  delta: UiPublishDelta
}): {
  value: UiSnapshot
  change: UiChange
}
```

规则固定成：

- `selection`
  - 用 `delta.selection`
- `chrome`
  - 用 `delta.chrome`
- `nodes`
  - 用 `delta.nodes`
- `edges`
  - 用 `delta.edges`

public `UiChange` 阶段五保持不变：

```ts
interface UiChange {
  selection: Flags
  chrome: Flags
  nodes: Ids<NodeId>
  edges: Ids<EdgeId>
}
```

---

## 7. `PublishDelta` 与现有 delta 的同步规则

## 7.1 graph -> publish

阶段五推荐提供一个同步 helper：

```ts
function syncGraphPublishDelta(input: {
  source: GraphDelta
  target: GraphPublishDelta
}): void
```

同步规则固定成：

```ts
target.nodes = source.entities.nodes
target.edges = source.entities.edges
target.owners.mindmaps = source.entities.mindmaps
target.owners.groups = source.entities.groups
```

这里不复制 `geometry`。

## 7.2 graph/spatial -> scene publish

阶段五推荐提供：

```ts
function syncScenePublishDelta(input: {
  graph: GraphDelta
  spatial: SpatialDelta
  target: ScenePublishDelta
}): void
```

固定规则：

```ts
target.items = input.graph.order
target.visible = input.spatial.order || input.spatial.visible
```

## 7.3 ui phase -> publish.ui

阶段五不新增独立 `UiDelta` 类型。  
ui phase 直接写：

```ts
working.delta.publish.ui
```

推荐在 ui phase 内提供：

```ts
function resetUiPublishDelta(delta: UiPublishDelta): void
function markUiSelectionChanged(delta: UiPublishDelta): void
function markUiChromeChanged(delta: UiPublishDelta): void
function markUiNodeAdded(delta: UiPublishDelta, id: NodeId): void
function markUiNodeUpdated(delta: UiPublishDelta, id: NodeId): void
function markUiNodeRemoved(delta: UiPublishDelta, id: NodeId): void
function markUiEdgeAdded(delta: UiPublishDelta, id: EdgeId): void
function markUiEdgeUpdated(delta: UiPublishDelta, id: EdgeId): void
function markUiEdgeRemoved(delta: UiPublishDelta, id: EdgeId): void
```

### ui phase 的写入规则

selection：

- `input.delta.ui.selection === true`
  - `publish.ui.selection = true`

chrome：

- `input.delta.ui.hover`
- `input.delta.ui.marquee`
- `input.delta.ui.guides`
- `input.delta.ui.draw`
- `input.delta.ui.edit`
- `input.delta.ui.tool`

任一为 `true`：

- `publish.ui.chrome = true`

ui node family：

- graph `entities.nodes.added`
  - `publish.ui.nodes.added`
- graph `entities.nodes.removed`
  - `publish.ui.nodes.removed`
- graph `entities.nodes.updated`
  - `publish.ui.nodes.updated`
- graph `entities.mindmaps.updated`
  - 命中的 member node ids 写入 `publish.ui.nodes.updated`
- selection / hover / edit / preview / draft / draw hidden nodes 影响到的 node ids
  - 写入 `publish.ui.nodes.updated`

ui edge family：

- graph `entities.edges.added`
  - `publish.ui.edges.added`
- graph `entities.edges.removed`
  - `publish.ui.edges.removed`
- graph `entities.edges.updated`
  - `publish.ui.edges.updated`
- selection / edit / preview 影响到的 edge ids
  - 写入 `publish.ui.edges.updated`

阶段五允许 ui phase 内部继续重建 `working.ui`，  
但不允许 publisher 再通过 compare 推导这些 ids。

---

## 8. `createEditorGraphPublisher()` 的最终骨架

阶段五推荐收敛成下面这条骨架：

```ts
export const createEditorGraphPublisher = (): RuntimePublisher<
  WorkingState,
  Snapshot,
  Change
> => ({
  publish: ({ revision, previous, working }) => {
    const delta = working.delta.publish

    const graph = patchPublishedGraph({
      previous: previous.graph,
      working,
      delta: delta.graph
    })

    const scene = patchPublishedScene({
      previous: previous.scene,
      working,
      delta: delta.scene
    })

    const ui = patchPublishedUi({
      previous: previous.ui,
      working,
      delta: delta.ui
    })

    return {
      snapshot: {
        revision,
        documentRevision: working.revision.document,
        graph: graph.value,
        scene: scene.value,
        ui: ui.value
      },
      change: {
        graph: graph.change,
        scene: scene.change,
        ui: ui.change
      }
    }
  }
})
```

这里不再调用：

- `publishFamily(...)`
- `publishValue(...)`

也不再从 `previous` 和 `working` 做全量 equality compare。

---

## 9. 文件落位建议

阶段五推荐新增：

```txt
whiteboard/packages/whiteboard-editor-graph/src/runtime/publish/
  delta.ts
  family.ts
  graph.ts
  scene.ts
  ui.ts
```

并改动：

```txt
whiteboard/packages/whiteboard-editor-graph/src/contracts/delta.ts
whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts
whiteboard/packages/whiteboard-editor-graph/src/runtime/createWorking.ts
whiteboard/packages/whiteboard-editor-graph/src/runtime/publisher.ts
whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts
whiteboard/packages/whiteboard-editor-graph/src/runtime/createSpec.ts
```

### 各文件职责

#### `contracts/delta.ts`

放：

- `PublishDelta`
- `GraphPublishDelta`
- `ScenePublishDelta`
- `UiPublishDelta`

#### `contracts/working.ts`

把 `working.delta.publish` 正式加进去。

#### `runtime/createWorking.ts`

初始化：

```ts
delta.publish = createPublishDelta()
```

#### `runtime/publish/delta.ts`

放：

- `createPublishDelta`
- `resetPublishDelta`
- `syncGraphPublishDelta`
- `syncScenePublishDelta`
- ui publish delta mark helpers

#### `runtime/publish/family.ts`

放：

- `patchPublishedFamily`

#### `runtime/publish/graph.ts`

放：

- `patchPublishedGraph`

#### `runtime/publish/scene.ts`

放：

- `patchPublishedScene`

#### `runtime/publish/ui.ts`

放：

- `patchPublishedUi`

#### `runtime/publisher.ts`

只保留 orchestrator，不再保留：

- `publishEntry`
- `publishGraphSnapshot`
- `publishUiSnapshot`
- `publishValue(scene)`

这类 compare-driven 逻辑。

---

## 10. 实施方案

## 10.1 第一步：引入 `PublishDelta` contract 与 working slot

推荐修改：

```txt
contracts/delta.ts
contracts/working.ts
runtime/createWorking.ts
runtime/publish/delta.ts
```

具体动作：

1. 定义 `PublishDelta` 三个 namespace。
2. `WorkingState.delta` 增加 `publish`。
3. 初始化 `createPublishDelta()`。
4. 提供 `resetPublishDelta(...)`。

这一步完成时，应满足：

- runtime 内存在正式 `working.delta.publish`
- publisher 还没切，但 contract 已经稳定

## 10.2 第二步：把 graph / scene 的 publish delta 同步接通

推荐修改：

```txt
runtime/publish/delta.ts
runtime/publisher.ts
```

具体动作：

1. graph publish delta 从 `GraphDelta.entities.*` 同步。
2. scene publish delta 从：
   - `GraphDelta.order`
   - `SpatialDelta.order`
   - `SpatialDelta.visible`
   同步。
3. 在 publisher 开头统一 reset + sync `working.delta.publish`。

这一步完成时，应满足：

- graph / scene 的 publish 决策已经不再依赖 compare
- ui 仍可临时沿用旧 publisher 逻辑

## 10.3 第三步：落 graph publish family patch

推荐修改：

```txt
runtime/publish/family.ts
runtime/publish/graph.ts
runtime/publisher.ts
```

具体动作：

1. 写 `patchPublishedFamily(...)`。
2. 写 `patchPublishedGraph(...)`。
3. `publisher.ts` 的 graph 部分改成只吃 `PublishDelta.graph`。
4. 删除 graph 侧：
   - `publishFamily(...)`
   - `publishEntry(...)`
   - `isNodeViewEqual`
   - `isEdgeViewEqual`
   - `isMindmapViewEqual`
   - `isGroupViewEqual`
   在 publisher 里的依赖

这一步完成时，应满足：

- graph family publish 不再扫描全量 family
- graph change ids 只来自 `PublishDelta.graph.*`

## 10.4 第四步：落 scene publish patch

推荐修改：

```txt
runtime/publish/scene.ts
runtime/publisher.ts
```

具体动作：

1. 写 `patchPublishedScene(...)`。
2. `scene.items` 只由 `PublishDelta.scene.items` 控制。
3. `scene.visible / spatial / pick` 只由 `PublishDelta.scene.visible` 控制。
4. 删除 `publisher.ts` 中对整个 `SceneSnapshot` 的 `publishValue(...)` compare。

这一步完成时，应满足：

- `Change.scene.changed` 只来自 publish bits
- scene publish 不再 compare 整个 `SceneSnapshot`

## 10.5 第五步：ui phase 写出 `PublishDelta.ui`

推荐修改：

```txt
phases/ui.ts
runtime/publish/delta.ts
```

具体动作：

1. ui phase 开头 reset `working.delta.publish.ui`。
2. selection / chrome 写布尔 bit。
3. node / edge family 写 `IdDelta`。
4. graph add/remove 与 ui family add/remove 保持一致。
5. selection / hover / edit / preview / draft 影响到的 ids 写 `updated`。

这一步完成时，应满足：

- ui publish 决策已经在 ui phase 内产出
- publisher 不需要再 compare `selection / chrome / nodes / edges`

## 10.6 第六步：落 ui publish patch 并删掉旧 compare path

推荐修改：

```txt
runtime/publish/ui.ts
runtime/publisher.ts
runtime/equality.ts
```

具体动作：

1. 写 `patchPublishedUi(...)`。
2. `publisher.ts` 的 ui 部分改成只吃 `PublishDelta.ui`。
3. 删除 publisher 里对：
   - `isSelectionViewEqual`
   - `isChromeViewEqual`
   - `isNodeUiViewEqual`
   - `isEdgeUiViewEqual`
   的直接依赖。
4. 只保留 runtime 其他地方仍在用的 equality helper。

这一步完成时，应满足：

- ui publish 不再 compare 整块 ui snapshot
- publisher 只做 patch，不做业务推断

## 10.7 第七步：补测试并收口旧路径

推荐修改：

```txt
whiteboard/packages/whiteboard-editor-graph/test/
  runtime.test.ts
  graphDelta.test.ts
  publisher.test.ts
```

如果没有 `publisher.test.ts`，阶段五建议新增。

至少补下面这些测试：

1. graph entity add/update/remove 只 patch 对应 published family ids。
2. graph idle update 不触发 graph publish。
3. viewport-only input 只触发 scene visible publish。
4. graph order update 只触发 scene items / visible publish，不触发 graph family publish。
5. selection-only input 只触发 `ui.selection` 与对应 node/edge ui ids。
6. hover-only input 只触发 `ui.chrome` 与命中的 node ui id。
7. draw / marquee / edit 只触发对应 ui publish bits。
8. publisher 在 idle update 上直接复用 previous snapshot subtree。

---

## 11. 阶段五完成标准

阶段五完成时，应满足下面这些结果：

1. runtime 内存在正式 `PublishDelta`。
2. `working.delta.publish` 每轮都被 reset 并重新写入。
3. graph publish 不再默认调用 `publishFamily(...)` 扫全族。
4. scene publish 不再默认 compare 整个 `SceneSnapshot`。
5. ui publish 不再默认 compare 整块 `UiSnapshot`。
6. public `Snapshot` / `Change` shape 保持不变。
7. `Change.graph` 只来自 `PublishDelta.graph`。
8. `Change.scene.changed` 只来自 `PublishDelta.scene`。
9. `Change.ui` 只来自 `PublishDelta.ui`。
10. publisher 中不再保留旧 compare-driven fallback。

---

## 12. 非目标

阶段五不处理：

- 删除 read 层 `equal`
- 重写 ui phase 成真正的 entry-level patch phase
- 改 public `Change` shape
- 改 public `Snapshot` shape
- DOM pick / overlay pick
- 阶段六的死代码清理

---

## 13. 最终收口

阶段五完成后，`whiteboard-editor-graph` 的发布链固定成：

```txt
GraphDelta / SpatialDelta / ui publish bits
  -> PublishDelta
  -> publisher patch previous snapshot
  -> public Snapshot / Change
```

阶段五之后，publisher 的职责固定为：

1. 消费 `PublishDelta`
2. patch published snapshot
3. 产出 public `Change`

不再承担：

1. 全量 compare
2. 重新推断 touched ids
3. 从整块 snapshot equality 倒推 publish 语义
