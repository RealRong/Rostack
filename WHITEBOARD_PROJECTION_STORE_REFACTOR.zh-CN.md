# WHITEBOARD_PROJECTION_STORE_REFACTOR

## 范围

本文只讨论 whiteboard 拖拽热路径上的 projection/store 重构，目标是回答四件事：

1. `shared/core/src/store` 这一层是否需要调整。
2. `table.ts` 和 `keyed.ts` 哪个更适合 projection 热路径。
3. `whiteboard-editor` 的 projection source 最终应该长成什么样。
4. 如何在不保留兼容层的前提下，直接收敛到长期最优形态。

本文不讨论：

- DOM `elementsFromPoint` 的具体实现细节。
- snap/index 的几何算法本身。
- React 组件样式或 DOM 结构上的微观优化。

这些问题可以继续优化，但它们不是这份文档的主轴。

## 结论

结论固定为：

- 需要调整 store 使用方式，但不需要把 `shared/core/src/store` 全盘推翻。
- `keyed.ts` 不是当前拖拽瓶颈的唯一来源，真正的问题是：精准 delta 在 projection 层被重新放大成了“整份 snapshot source”。
- 热路径不应继续以 `snapshot -> projected keyed store` 为基础模型。
- `table.ts` 适合用作热路径 `byId` sink 的基础设施。
- 但 `table.ts` 本身还不够，因为 graph/ui family 不是单纯的 `byId`，而是 `ids + byId`。
- 最终应新增一个底层复用设施：`FamilyStore`。
- `ProjectionSources` 不再从 `snapshot` 派生 `nodeGraph/edgeGraph/nodeUi/edgeUi/...`，而应直接消费 runtime `result.change` 做 patch。
- 不保留兼容层，不走双轨。直接替换 projection source 模型。

换句话说：

- 要换的不是“所有 store”。
- 要换的是“projection hot path 对 store 的使用方式”。

## 问题本质

当前拖拽慢，主要不是 graph runtime 算得太慢，而是 projection flush 之后的订阅传播过重。

问题核心不在于：

- runtime delta 不精准。

而在于：

- runtime 已经给出了精准 `result.change`，
- 但 projection source 仍然把它还原成整份 `snapshot`，
- 然后再让 keyed derived store 从整份 `snapshot` 中自己重读、自己重算。

当前结构见：

- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`

尤其是：

- [controller.ts:289](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/controller.ts:289)
- [controller.ts:296](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/controller.ts:296)
- [sources.ts:49](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/sources.ts:49)

这条链的问题是：

1. `runtime.update(...)` 已经算出精确 change。
2. `snapshotStore.set(result.snapshot)` 把整份 snapshot 作为唯一 source 推给下游。
3. `createProjectedKeyedStore(...)` 让所有 keyed 读模型依赖整个 snapshot。
4. 单节点拖拽虽然只改 1 个节点，但订阅传播会沿着粗粒度 source 广泛扩散。

所以真正需要收敛的是：

- source authority
- family sink
- publish patch 的消费方式

而不是先去全局怀疑所有 `isEqual` 或所有 React `memo`。

## 对 `table.ts` 与 `keyed.ts` 的判断

### `keyed.ts`

`createKeyedStore.patch()` 在有变更时会 `new Map(current)`，见：

- [keyed.ts:126](/Users/realrong/Rostack/shared/core/src/store/keyed.ts:126)
- [keyed.ts:133](/Users/realrong/Rostack/shared/core/src/store/keyed.ts:133)

它适合：

- 一般 keyed state
- 写频率不极端高的场景
- 需要不可变替换语义的场景

它不适合：

- 单次只改少量 key、但写入非常高频的 drag hot path

原因不是它不能用，而是：

- 每次 patch 都会复制整张 `Map`

### `table.ts`

`createTableStore.write.apply()` 的特点是：

- 原地更新当前 `Map`
- 只通知被监听且被 patch 触达的 key

见：

- [table.ts:183](/Users/realrong/Rostack/shared/core/src/store/table.ts:183)
- [table.ts:195](/Users/realrong/Rostack/shared/core/src/store/table.ts:195)
- [table.ts:217](/Users/realrong/Rostack/shared/core/src/store/table.ts:217)

这更适合：

- node/edge/ui 这种按 key 精确更新的 projection sink

但 `table.ts` 也有明确边界：

- 它只解决 `byId`
- 不解决 `ids/order`
- `write.replace()` 仍然会 `new Map(next)`，见 [table.ts:172](/Users/realrong/Rostack/shared/core/src/store/table.ts:172)

所以正确结论不是：

- 用 `table.ts` 替换全部 store

而是：

- 用 `table.ts` 作为 `byId` 热路径 sink 的基础
- 再补一个管理 `ids + byId` 的 family 设施

## 最终基础设施

### 新增 `FamilyStore`

长期最优不应让业务层手写：

- 一个 `ids` store
- 一个 `byId` table
- 再手动拼 patch

应该下沉一个统一设施，例如：

```ts
interface FamilyPatch<Id extends string, Value> {
  ids?: readonly Id[]
  set?: readonly (readonly [Id, Value])[]
  remove?: readonly Id[]
}

interface FamilyStore<Id extends string, Value> {
  ids: ReadStore<readonly Id[]>
  byId: TableStore<Id, Value>
  read: {
    family(): Family<Id, Value>
    get(id: Id): Value | undefined
  }
  write: {
    replace(input: {
      ids: readonly Id[]
      byId: ReadonlyMap<Id, Value>
    }): void
    apply(patch: FamilyPatch<Id, Value>): void
    clear(): void
  }
  project: {
    field<Projected>(
      select: (value: Value | undefined) => Projected,
      isEqual?: Equality<Projected>
    ): KeyedReadStore<Id, Projected>
  }
}
```

语义固定为：

- `ids` 只负责顺序。
- `byId` 只负责单 key 实体。
- `write.apply()` 只消费精准 patch。
- `read.family()` 只给确实需要 whole family 的非热路径读侧。

### 为什么不直接复用 `publishEntityFamily`

`publishEntityFamily` 仍然是 runtime publish 层的结构复用设施，它输出的是：

- `{ ids, byId }`

它不负责：

- 下游 store 生命周期
- key 订阅
- patch 通知

所以两层职责不能混。

关系应该是：

- runtime publish 继续产出 canonical `Family`
- projection sink 用 `FamilyStore.write.apply()` 消费 `result.change`

## Projection 最终模型

### 1. controller 保留 snapshot，但 snapshot 不再是 source authority

`ProjectionController` 仍然保留：

- `runtime`
- `currentResult`
- `current().snapshot`

因为 boundary / procedure / query cache 仍然需要 canonical snapshot。

但 source authority 必须改成：

- `itemsStore`
- `chromeStore`
- `graphNodesStore`
- `graphEdgesStore`
- `mindmapsStore`
- `groupsStore`
- `uiNodesStore`
- `uiEdgesStore`

也就是说：

- `snapshot` 继续存在
- 但 React / read hot path 不再从 `snapshot` 投影 family source

### 2. `ProjectionSources` 删除粗粒度 `graph` 和 `ui`

当前：

- [sources.ts:33](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/sources.ts:33)
- [sources.ts:41](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/sources.ts:41)

这两个 whole-object store 对热路径没有价值，只会制造更粗的依赖面。

最终 `ProjectionSources` 应收敛为：

```ts
interface ProjectionSources {
  snapshot: ReadStore<Snapshot>
  items: ReadStore<readonly SceneItem[]>
  chrome: ReadStore<ChromeView>
  nodeGraph: KeyedReadStore<string, NodeView | undefined>
  edgeGraph: KeyedReadStore<string, EdgeView | undefined>
  mindmap: KeyedReadStore<string, MindmapView | undefined>
  group: KeyedReadStore<string, GroupView | undefined>
  nodeUi: KeyedReadStore<string, NodeUiView | undefined>
  edgeUi: KeyedReadStore<string, EdgeUiView | undefined>
}
```

删除：

- `ProjectionSources['graph']`
- `ProjectionSources['ui']`

如果未来确实还需要 whole family 只读聚合：

- 直接从对应 `FamilyStore.read.family()` 做命令式读取
- 不再把它做成 React 订阅源

### 3. `items` 和 `chrome` 继续是 value store

`items` 与 `chrome` 的特点不同于 family：

- `items` 是 top-level list
- `chrome` 是当前交互态的整体对象

它们不需要 per-key 订阅。

最终保持为：

- `ValueStore<readonly SceneItem[]>`
- `ValueStore<ChromeView>`

更新规则：

- 只有当 `result.change.items.changed === true` 时才 `set`
- 只有当 `result.change.ui.chrome.changed === true` 时才 `set`

### 4. controller 直接消费 `result.change`

`flush()` 不再只做：

- `snapshotStore.set(result.snapshot)`

而应改成：

1. 更新 `snapshotStore`
2. 按 `result.change.graph.nodes / edges / owners.*` patch 对应 graph family store
3. 按 `result.change.ui.nodes / edges` patch 对应 ui family store
4. 按 `result.change.items` 更新 `itemsStore`
5. 按 `result.change.ui.chrome` 更新 `chromeStore`

这里的关键点是：

- family sink 的 patch 范围由 runtime change 决定
- source 层不再二次推导“哪些 key 变了”

## Read 层最终调整

### `read/graph.ts`

要同步收缩：

- 删掉 `GraphRead.graph`
- 删掉 `GraphRead.ui`

保留：

- `snapshot`
- `items`
- `spatial`
- `node`
- `edge`
- `selection`
- `mindmap`
- `group`
- `chrome`

原因很简单：

- 真正的读模型都已经拆到了 keyed/fine-grained source
- 再暴露 whole `graph/ui` 只会诱导粗订阅和粗读取

### `read/public.ts`

这里只需要小改，不需要重写：

- `query.visible()` 继续用 `graph.snapshot` 读 revision 做 cache key
- `node/edge/mindmap/group` 仍然走 keyed read
- `chrome` 继续消费单独 `chromeStore`

也就是说：

- read 层 API 大体不变
- source authority 改掉即可

## 需要修改的文件

### shared/core

- `shared/core/src/store/types.ts`
  新增 `FamilyPatch` / `FamilyStore` 类型
- `shared/core/src/store/index.ts`
  导出新的 family store
- `shared/core/src/store/`
  新增 family store 实现文件

### whiteboard-editor

- `whiteboard/packages/whiteboard-editor/src/projection/controller.ts`
  从 snapshot-only flush 改为 delta-applied sink flush
- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`
  从 `createProjectedKeyedStore(snapshot, ...)` 改为直接暴露 family/value sink
- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
  删除 `graph/ui` 粗源
- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
  只做配套调整

### 不在本次一起做，但必须跟进

- `whiteboard/packages/whiteboard-editor/src/document/read.ts`
  `index.snap.inRect()` 不能继续全量扫 committed nodes
- `whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts`
  active drag session 应有 fast path，不能每帧都做完整 pick

这两项不是 store 重构本身，但如果不做，drag 仍然会继续被别的 O(N) 路径拖慢。

## 实施原则

原则固定为：

- 不保留旧 `snapshot-derived projection sources`
- 不保留兼容 API
- 不在 controller 中同时维护“旧 source”和“新 source”
- 不做过渡期双轨

替换顺序应当是：

1. 先补 `shared/core` family store 基础设施。
2. 再把 `projection/controller.ts` 改成 delta-applied sink。
3. 再改 `projection/sources.ts`。
4. 再删 `read/graph.ts` 中的粗源暴露。
5. 最后清理所有 snapshot-derived source 残留。

## 最终判断

关于“store 本身是不是也得换”，最终结论是：

- 要换，但只换 projection hot path 的基础设施。
- `table.ts` 是正确基础。
- `keyed.ts` 不需要全局删除。
- 不能继续让 projection source 以 `snapshot` 为唯一 authority。

真正的长期最优不是：

- “把所有地方改成 table”

而是：

- 在 `shared/core/store` 下沉一个专门服务 family patch 的公共设施，
- 让 whiteboard projection 直接消费 runtime 精准 delta，
- 从根上消掉“整份 snapshot 投影 -> 粗粒度依赖扩散”这条热路径。
