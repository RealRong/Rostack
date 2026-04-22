# Whiteboard Editor Graph 重写方案

本文对应统一重构的第四步：

- 建设 `whiteboard-editor-graph`

本文不讨论兼容方案，不讨论渐进迁移，不讨论双轨保留。

本文只回答一个问题：

在 `whiteboard-engine` 已收敛成 committed `DocumentEngine`、`@shared/projection-runtime` 已建设完成的前提下，`whiteboard-editor-graph` 的长期最优形态到底应该是什么，应该如何一步到位实现。

本文默认前提：

- 第一阶段 contract 已按 [WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md) 冻结
- 第二阶段 `whiteboard-engine` 已按 [WHITEBOARD_ENGINE_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_ENGINE_REWRITE.zh-CN.md) 收敛成 committed truth
- 第三阶段 `@shared/projection-runtime` 已按 [WHITEBOARD_PROJECTION_RUNTIME_KIT_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_PROJECTION_RUNTIME_KIT_REWRITE.zh-CN.md) 建成
- 不保留旧 `EngineRead`
- 不保留旧 editor `query/layout/store` 派生链作为底座

还要额外明确一条：

- whiteboard 不是“两份并列真相”，而是 committed truth 与 projection truth 两级 authoritative truth

---

## 1. 目标

第四步的唯一目标，是把 `whiteboard-editor-graph` 建成 whiteboard 的唯一 authoritative projection runtime。

它必须同时做到：

1. 吃进 committed document 与 editor 全部输入面
2. 用显式 phase 把输入投影成单次 publish 的 `editor.Snapshot`
3. 在 publish 时同时产出 authoritative `editor.Change`
4. 让后续 `whiteboard-editor`、`whiteboard-react`、renderer、devtools 都只消费这份结果

这里必须明确：

- draft / preview / measure / selection / viewport 这些不是新的公开真相
- 它们只是构造 projection truth 的输入
- 真正对外公开的第二级 truth 只有 `editor.Snapshot`

一句话概括：

> `whiteboard-editor-graph` 不是新的 query 层，而是新的 projection engine。

---

## 2. 非目标

下面这些都不是第四步的目标：

- React hook
- DOM / canvas / renderer 同步
- `shared/core/store` 适配
- session / history / action wiring
- pointer / keyboard / IME 宿主接线
- 继续维护旧 `whiteboard-editor/src/query`
- 继续维护旧 `whiteboard-editor/src/layout`

这些分别属于：

- 第五步 `whiteboard-editor`
- 第六步 `whiteboard-react` / renderer / 其他 adapter

第四步要先把 authoritative runtime 核心做对，而不是先接 UI。

---

## 3. 对当前包的判断

当前仓库里已经有 `whiteboard/packages/whiteboard-editor-graph`，但它现在只是一个占位实现，不是最终形态。

现状问题主要有四类。

### 3.1 当前运行时只是“从 document 直接拼一个快照”

当前 `src/runtime/createEditorGraphRuntime.ts` 每次 `update()` 只做了三件事：

- 递增 revision
- 直接调用 `buildEditorSnapshot()`
- 直接用 document change 拼一份 editor change

这不是 projection runtime，只是 document snapshot 的一层浅包装。

它没有：

- working state
- dirty planner
- phase graph
- publish discipline
- source discipline

### 3.2 当前包自己复制了一份 generic runtime contracts

当前包里还保留了这些文件：

- `src/contracts/core.ts`
- `src/contracts/phase.ts`
- `src/contracts/trace.ts`
- `src/contracts/source.ts`

这在第三步之后已经不是正确方向。

generic runtime 语言必须统一来自 `@shared/projection-runtime`，`whiteboard-editor-graph` 只保留 whiteboard 自己的 domain contracts。

### 3.3 当前快照没有承载真正的 whiteboard 投影语义

当前 `buildSnapshot.ts` 里缺失了 whiteboard 真正复杂的部分：

- 文本测量
- owner structure
- mindmap tree layout
- 编辑态 draft / preview 合成
- node geometry / edge geometry
- selection affordance
- chrome / overlay
- scene / pick / spatial

也就是说，它还没有回答“编辑器应该怎么显示”，只是回答了“文档里现在有哪些实体”。

### 3.4 当前 editor 旧 query/layout 世界仍然独立存在

当前真正承载 projection 复杂度的，仍然是：

- `whiteboard/packages/whiteboard-editor/src/query/*`
- `whiteboard/packages/whiteboard-editor/src/layout/*`

这说明现在的 `whiteboard-editor-graph` 还没有成为唯一 authoritative projection runtime。

第四步的目标，就是把这个角色彻底收回来。

---

## 4. 最终边界

### 4.1 包的位置

长期最优下，依赖方向应固定为：

```text
@whiteboard/core
@whiteboard/engine
@shared/projection-runtime
        \
         -> @whiteboard/editor-graph
                 \
                  -> @whiteboard/editor
                          \
                           -> @whiteboard/react / renderer / devtools
```

### 4.2 `whiteboard-editor-graph` 拥有什么

它必须拥有：

- `editor.Input` / `editor.InputChange`
- `editor.Snapshot` / `editor.Change`
- whiteboard domain `WorkingState`
- whiteboard `ImpactPlan`
- whiteboard 全部 phases
- whiteboard publisher
- snapshot read facade
- trace / testing fixtures
- 可选的 store-agnostic publish/apply spec

### 4.3 `whiteboard-editor-graph` 明确不拥有什么

它不得拥有：

- `shared/core/store`
- React
- DOM
- canvas renderer
- concrete source runtime
- engine subscription wiring
- session/action/history host 编排

也就是说：

- 它不自建 UI store
- 它不持有 concrete source/store publication layer
- 它不自订阅浏览器事件
- 它不自己做宿主生命周期管理

这些都留给后续 `whiteboard-editor`。

### 4.4 这一步与 dataview 的对应关系

从边界上看：

- `whiteboard-engine` 对应 dataview 的 `engine`
- `whiteboard-editor-graph` 对应 dataview 的 `runtime core`
- `whiteboard-editor` 对应 whiteboard 自己的 host/orchestrator

因此，dataview 那套原则在这里要落成下面三句：

- `DocumentEngine` 不认识 `store`
- `EditorGraphRuntime` 不暴露旧式 query/store graph
- 只有 `whiteboard-editor` 持有 concrete store/source runtime，其他层都只消费它的 publish 结果

---

## 5. 最终公共 API

### 5.1 包级公开面

第四步完成后，`@whiteboard/editor-graph` 的公开面应该尽量小。

长期最优建议只保留 3 组入口：

1. 根入口：runtime + read facade + editor contracts
2. `publish` 子路径：store-agnostic publish/apply spec
3. `testing` 子路径：builder / harness / assert

其中根入口应该尽量简单：

```ts
// @whiteboard/editor-graph
export { createEditorGraphRuntime }
export { createEditorGraphRead }

export type {
  Input,
  InputChange,
  Snapshot,
  Change,
  Result,
  Runtime,
  Read
} from './contracts/editor'
```

这里故意不把下面这些东西暴露给宿主：

- `ImpactPlan`
- `WorkingState`
- phase 名字与 phase spec
- planner / publisher 细节
- trace / source / dirty 的 generic contracts
- 任何 concrete store/source runtime

原因很简单：

- 宿主要消费的是 runtime 结果，不是 runtime 内脏
- 一旦把这些内部机制暴露出去，后续 `whiteboard-editor` 就会反向依赖内部结构
- 包边界会重新退化成“半公开 query/runtime 工具箱”

### 5.2 子路径设计

如果宿主确实需要额外能力，建议只开放两个子路径。

第一类是发布层规范：

```ts
// @whiteboard/editor-graph/publish
export { createEditorGraphPublishSpec }
export type { EditorGraphPublishSpec }
```

第二类是测试能力：

```ts
// @whiteboard/editor-graph/testing
export { createEditorGraphHarness }
export { createEditorGraphBuilder }
export type { EditorGraphHarness }
```

重点在于：

- `publish` 子路径只给 store-agnostic spec
- `testing` 子路径只给测试辅助
- 二者都不引入 concrete store/source runtime

### 5.3 `createEditorGraphRuntime()`

为了让宿主侧 API 尽量简单，建议 `createEditorGraphRuntime()` 保持极简：

```ts
export interface CreateEditorGraphRuntimeInput {
  initialSnapshot?: editor.Snapshot
}

export const createEditorGraphRuntime: (
  input?: CreateEditorGraphRuntimeInput
) => editor.Runtime
```

这里故意不传下面这些东西：

- `DocumentEngine`
- store
- source runtime
- React / DOM host

原因是这些都属于第五步 `whiteboard-editor` 的宿主编排责任。

`createEditorGraphRuntime()` 的正确职责是：

- 基于 whiteboard domain phases 组装 `@shared/projection-runtime`
- 返回纯 runtime instance
- 只接受 `update(input, change)` 驱动
- 只发布 `snapshot + change + trace`

它不应该：

- 自己订阅 `DocumentEngine`
- 自己创建 store
- 自己创建 source runtime
- 自己连 React / DOM

这一步必须保持纯净，否则第五步没法把 host 边界切干净。

### 5.4 `Runtime` API

`Runtime` 本身也应该保持极简。

```ts
export interface Runtime {
  snapshot(): editor.Snapshot
  update(input: editor.Input, change: editor.InputChange): editor.Result
  subscribe(
    listener: (snapshot: editor.Snapshot, change: editor.Change) => void
  ): () => void
}
```

这里有两个设计判断：

- `snapshot()` 给同步读面
- `update()` 是唯一驱动入口

除此之外不要再加：

- `getWorking()`
- `getDirty()`
- `runPhase(name)`
- `patchSource()`

这些接口一旦公开，包边界就会开始泄漏。

### 5.5 `createEditorGraphRead()`

`Read` 应只做 snapshot facade。

例如：

```ts
export interface CreateEditorGraphReadInput {
  runtime: Pick<editor.Runtime, 'snapshot'>
}

export interface Read {
  snapshot(): editor.Snapshot
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
  scene(): editor.SceneSnapshot
  ui(): editor.UiSnapshot
}

export const createEditorGraphRead: (
  input: CreateEditorGraphReadInput
) => Read
```

注意：

- `Read` 只能读 published snapshot
- 不允许内部再跑半套 runtime
- 不允许回头读 `DocumentEngine`

`Read` 里也不要加入：

- 订阅 API
- store API
- phase introspection
- query helper graph

### 5.6 `Publish` 子路径 API

由于 concrete store/source runtime 被明确下沉到 `whiteboard-editor`，`editor-graph` 最多只需要给出 store-agnostic publish spec。

建议公开面固定成一个很小的工厂：

```ts
export interface PublishSlice<TValue, TChange> {
  read(snapshot: editor.Snapshot): TValue
  change(change: editor.Change): TChange
}

export interface EditorGraphPublishSpec {
  graph: PublishSlice<editor.GraphSnapshot, editor.GraphChange>
  scene: PublishSlice<editor.SceneSnapshot, editor.Change['scene']>
  ui: {
    selection: PublishSlice<
      editor.UiSnapshot['selection'],
      editor.Change['ui']['selection']
    >
    chrome: PublishSlice<
      editor.UiSnapshot['chrome'],
      editor.Change['ui']['chrome']
    >
  }
}

export const createEditorGraphPublishSpec: () => EditorGraphPublishSpec
```

这套 API 已经足够宿主使用：

- `whiteboard-editor` 可以据此建立自己的 concrete store/source runtime
- `editor-graph` 只负责声明 authoritative publish slices
- spec 本身不实例化任何 store/source runtime

### 5.7 测试 API

测试入口也应该尽量简单：

```ts
export interface EditorGraphHarness {
  runtime: editor.Runtime
  read: editor.Read
  update(input: editor.Input, change: editor.InputChange): editor.Result
  snapshot(): editor.Snapshot
}
```

这样第四步就能独立验证：

- publish 是否一致
- phase trace 是否正确
- reference reuse 是否正确
- live edit relayout 是否正确

### 5.8 明确不公开的内部 API

下面这些必须留在包内，不对宿主公开：

- `createPlanner()`
- `createPublisher()`
- `createWorking()`
- `createPhaseGraph()`
- `runPhase()`
- `impact.Token`
- `WorkingState`

判断标准很简单：

- 只要是“宿主不该依赖的内部机制”，都不应成为公开 API

---

## 6. 输入面设计

`whiteboard-editor-graph` 的输入，不是“给它一个 document 就行”，而是必须一次性纳入 editor 全部会影响图投影的输入域。

长期最优建议固定成下面 6 组：

1. `document`
2. `session`
3. `measure`
4. `interaction`
5. `viewport`
6. `clock`

### 6.1 `document`

只放 committed truth：

- `document.snapshot`

### 6.2 `session`

只放 editor 会话语义：

- edit
- draft
- preview
- tool

这里最重要的是：

- draft 文本
- draft size
- preview patch

它们必须成为 runtime 的一等输入，而不是附着在 query/store 链上偷偷合成。

### 6.3 `measure`

只放测量结果与测量可用性：

- text metrics
- text box measure
- resource readiness

对白板来说，这一组输入直接决定：

- auto width
- auto height
- owner relayout
- edge label geometry

### 6.4 `interaction`

只放运行时交互状态：

- selection
- hover
- drag
- transform gesture

### 6.5 `viewport`

只放相机和视区：

- camera
- zoom
- visible rect

### 6.6 `clock`

只放动画/时间：

- `now`

这对 enter/exit animation、preview animation、blink/caret 等时钟型投影很重要。

---

## 7. WorkingState 设计

长期最优的 `WorkingState` 应明确按职责分层，而不是一个平铺大对象。

建议固定成下面 8 个子域：

1. `input`
2. `graph`
3. `measure`
4. `structure`
5. `tree`
6. `element`
7. `ui`
8. `scene`

### 7.1 `input`

保存规范化后的输入视图：

- normalized document refs
- normalized draft/preview
- normalized interaction
- normalized viewport

### 7.2 `graph`

保存 editor graph 级的中间态：

- node base entries
- edge base entries
- owner membership
- frame / containment refs

### 7.3 `measure`

保存所有测量中间态：

- text metrics
- auto-size intent
- measured text box size
- edge label metrics

### 7.4 `structure`

保存 owner 级结构：

- mindmap structure
- group structure
- dirty subtree ids
- collapsed/expanded derived state

### 7.5 `tree`

保存 owner layout 结果：

- root anchoring
- branch placement
- subtree translation
- owner bbox

这层是解决 mindmap 编辑态 relayout 问题的关键层。

测量变化必须在这里直接驱动 tree relayout，而不是等 commit 后再补一轮。

### 7.6 `element`

保存最终元素级投影：

- node geometry
- node render
- edge route
- edge label geometry
- capability / affordance base

### 7.7 `ui`

保存 UI 级投影：

- selection summary
- transform plan
- chrome overlays
- edit overlays

### 7.8 `scene`

保存最终 scene 级投影：

- ordered scene items
- pick items
- spatial index
- visible buckets

---

## 8. Phase 设计

whiteboard 的 phase 需要和 shared runtime kit 的 phase shell 对齐，但 phase 语义完全属于 whiteboard 自己。

建议固定成下面 10 个 phase。

### 8.1 `input`

职责：

- 规范化全部输入
- 建立本轮 input revision
- 展开更细的 impact tokens

### 8.2 `graph`

职责：

- 从 committed document facts 组装 node/edge/owner base graph
- 把 draft / preview 会影响的图实体找出来
- 建立本轮 graph dirty seeds

### 8.3 `measure`

职责：

- 解析文本测量结果
- 形成 auto-size 结果
- 生成 node / label 的 measured size

### 8.4 `structure`

职责：

- 组装 owner structure
- 应用 preview / drag / collapse 等结构级输入
- 形成 subtree dirty set

### 8.5 `tree`

职责：

- 基于 structure + measure 计算 owner layout
- 解决 root anchor、branch placement、subtree move
- 输出 owner bbox 与 node placement

这是 whiteboard 里最关键的 phase 之一。

mindmap topic 文本编辑时，测量高度变化要在这一层直接驱动整棵树 relayout。

### 8.6 `element`

职责：

- 产出 node geometry / node render
- 产出 edge geometry / label geometry
- 计算 capability / frame / bounds

### 8.7 `selection`

职责：

- 基于 element 结果推导 selection summary
- 推导 transform handles / selection frame
- 推导操作计划

### 8.8 `chrome`

职责：

- 推导 hover chrome
- 推导 edit chrome
- 推导 overlay / handle / guide

### 8.9 `scene`

职责：

- 组装最终 scene layer
- 产出 pick / spatial / visible ordering
- 为 renderer 提供最终消费面

### 8.10 `publish`

职责：

- 用 stable reference helper 生成最终 `editor.Snapshot`
- 同时生成 authoritative `editor.Change`
- 记录 trace / metrics

---

## 9. 发布模型

### 9.1 `editor.Change` 必须 authoritative

`editor.Change` 必须由 publisher 直接产生。

不允许：

- source adapter 重新猜 changed ids
- renderer 根据前后快照自己算 scene 变化
- hook 根据局部字段自己猜 selection/chrome 是否变化

### 9.2 稳定引用复用必须在 publish 决定

publisher 需要为下面这些切片决定复用：

- `graph.nodes`
- `graph.edges`
- `graph.owners.mindmaps`
- `graph.owners.groups`
- `scene`
- `ui.selection`
- `ui.chrome`

如果引用复用不在 publish 决定，而是在 adapter 各自猜，系统会重新长出多份语义真相。

### 9.3 live edit 的正确 publish 纪律

对白板最关键的一条纪律是：

- 文本 draft 改了
- 测量结果变了
- owner tree relayout 了
- node/scene 位置变了

这些变化必须在同一轮 `update()` 中被 publish 成一份新的 editor snapshot。

不允许出现：

- 编辑态先只长高
- commit 后才整体回到正确 layout

那说明 tree phase 没把 measure 变化接成本轮 authoritative publish。

---

## 10. `Read` / `Publish Spec` / Adapter 边界

### 10.1 `Read` 不是 query 链

新 `Read` 只能做 snapshot facade。

它不是：

- `query/node/read.ts` 的升级版
- 新的 selector graph
- store read 的统一门面

### 10.2 `Publish Spec` 只提供 apply 语义，不提供 store/source runtime

第四步如果确实需要表达发布分片，最多只允许保留 store-agnostic publish/apply spec，建议直接放在 `publish/` 子域。

它最多只承担下面这些事情：

- whiteboard published slices 的 apply spec
- graph/scene/ui 的同步分片边界
- 对外声明 authoritative change 应如何被宿主 publication layer 消费

它不应承担：

- `shared/core/store` 的具体实例化
- concrete source runtime
- React hook
- renderer runtime

具体 store/source runtime 留给第五步 `whiteboard-editor`，第六步 adapter 只消费其结果。

### 10.3 热点优化只能留在 adapter

如果后续需要：

- `NodeTableStore`
- `SceneTableStore`
- `SpatialPickStore`
- renderer patch table

这些都只能出现在 adapter。

不允许为了这些优化：

- 修改 `editor.Snapshot`
- 修改 `editor.Change`
- 让 `EditorGraphRuntime` 暴露订阅模型

---

## 11. 最终目录结构

第四步完成后，`whiteboard-editor-graph` 建议直接收成下面的结构：

```text
whiteboard/packages/whiteboard-editor-graph/
  src/contracts/
    editor.ts
    impact.ts
    working.ts
  src/input/
    normalize.ts
    change.ts
  src/impact/
    tokens.ts
    planner.ts
  src/phases/
    input.ts
    graph.ts
    measure.ts
    structure.ts
    tree.ts
    element.ts
    selection.ts
    chrome.ts
    scene.ts
  src/publish/
    snapshot.ts
    change.ts
    apply.ts
  src/read/
    createRead.ts
  src/runtime/
    createWorking.ts
    createSpec.ts
    createEditorGraphRuntime.ts
  src/testing/
    builders.ts
    runtime.ts
  src/index.ts
```

必须删除当前这批 generic duplication：

- `src/contracts/core.ts`
- `src/contracts/phase.ts`
- `src/contracts/trace.ts`

必须重写当前这批 stub 实现：

- `src/contracts/editor.ts`
- `src/runtime/buildSnapshot.ts`
- `src/runtime/createEditorGraphRuntime.ts`
- `src/index.ts`

---

## 12. 实施顺序

### 12.1 第一步：先清包边界

先做两件事：

- 删除本包对 generic runtime contracts 的本地复制
- 明确本包只依赖 `@shared/projection-runtime`、`@whiteboard/engine`、`@whiteboard/core`

完成标准：

- 本包不再自定义通用 `core/phase/trace/source`
- 本包不再承载 concrete source/store runtime

### 12.2 第二步：重写 domain contracts

重写：

- `editor.Input`
- `editor.InputChange`
- `editor.Snapshot`
- `editor.Change`
- `impact.Token`
- `WorkingState`

完成标准：

- 包的公共语言已经能表达真实 whiteboard 语义，而不是 stub

### 12.3 第三步：基于 shared runtime 搭 runtime shell

实现：

- `createWorking()`
- planner
- publisher
- phase graph
- `createEditorGraphRuntime()`

完成标准：

- 一轮 `update()` 只 publish 一次

### 12.4 第四步：先打通 `graph -> measure -> structure -> tree`

这是 whiteboard 的最关键半程。

先保证：

- 节点基础图正确
- 文本测量正确进入 runtime
- owner structure 正确
- tree relayout 正确

完成标准：

- mindmap topic 编辑时，测量变化能在编辑态直接驱动 tree relayout

### 12.5 第五步：再打通 `element -> selection -> chrome -> scene`

在 tree 稳定后，再实现：

- node / edge 最终 geometry
- selection summary / transform plan
- chrome overlays
- scene / pick / spatial

完成标准：

- renderer 已能只靠 published snapshot 得到完整消费面

### 12.6 第六步：补 read/publish-spec/testing

实现：

- `createEditorGraphRead()`
- publish/apply specs
- harness / trace assertions / builders

完成标准：

- 包可以独立测试，不需要 `whiteboard-editor` 接入

### 12.7 第七步：删当前 stub

最后统一删除：

- 当前 `buildSnapshot.ts` 直拼实现
- 当前无 phase 的 runtime
- 当前本地 generic contracts

完成标准：

- 包内只剩最终形态

---

## 13. 完成标准

第四步完成后，系统至少要满足下面这些条件：

### 13.1 边界标准

- `whiteboard-editor-graph` 不依赖 `shared/core/store`
- `whiteboard-editor-graph` 不依赖 React / DOM
- `whiteboard-editor-graph` 不自订阅 `DocumentEngine`
- `whiteboard-editor-graph` 不持有 concrete source/store runtime

### 13.2 运行时标准

- 每次 `update()` 只发布一份 `editor.Snapshot`
- 每次 `update()` 只发布一份 `editor.Change`
- trace 能明确看到 phase 顺序与 action

### 13.3 正确性标准

- mindmap 文本编辑时，measure 改变会在编辑态直接驱动 tree relayout
- node geometry / owner layout / scene 在同一 revision 内一致
- `Read` 不再建立任何隐藏派生链

### 13.4 清理标准

- 当前 stub runtime 已删除
- 当前 generic contracts duplication 已删除
- 本包已成为后续 `whiteboard-editor` 唯一可接入的 projection runtime

---

## 14. 最终建议

第四步不应该被理解成“给现有 editor query/layout 抽个中间层”。

真正应该做的是：

1. 把现有 `whiteboard-editor-graph` 从 stub 改成真正的 projection runtime
2. 让它完整承接 whiteboard 的 graph / measure / structure / tree / element / scene 语义
3. 让它基于 `@shared/projection-runtime` 运行，而不是再自带一套 runtime contracts
4. 让第五步 `whiteboard-editor` 独占 concrete store/source runtime 与 host wiring，而不是继续承载 authoritative projection 逻辑

一句话概括：

> `whiteboard-editor-graph` 的最终使命，不是“方便 editor 读图”，而是“成为 editor 图真相本身”。
