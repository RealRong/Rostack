# Whiteboard 图上一致发布重构方案

本文讨论的不是某一个 mindmap bug，而是 whiteboard 整体派生链为什么会反复出现“局部算对、全局不同步、修一处又在别处漏”的问题，以及在不考虑成本、不考虑兼容的前提下，长期最优应该怎么重构。

本文要明确回答四个问题：

1. 现有 `shared/core/store` 和 whiteboard 派生管线的问题到底在哪里。
2. 要做到“图上一致发布”，是继续修改当前 store，还是单独做新的运行时。
3. whiteboard 的长期最优架构应该长什么样。
4. 具体如何重构，才能把复杂度降下来，让 bug 变少、可维护性变高。

结论先写在最前面：

- 长期最优不是继续把 `shared/core/store` 改造成图状态发布系统。
- 长期最优是保留 `shared/core/store` 作为轻量 UI / 局部状态工具，同时为 whiteboard 单独建设一套新的“图上一致发布运行时”。
- whiteboard 的 authoritative 派生链必须从“到处 `store.read` 的 lazy selector 图”迁移到“显式 phase、显式依赖、单次发布 revision”的快照运行时。
- 如果一定要把新能力继续叫 store，也应该是一个新的 store family，而不是继续沿用当前 `createDerivedStore / createKeyedDerivedStore / createProjectedKeyedStore(sync)` 的语义。

---

## 1. 问题定义

whiteboard 当前最难修、最容易回归的问题，不是算法本身，而是“图上没有一个强一致发布边界”。

具体表现为：

- 同一个时刻，不同消费链读到的是不同 freshness 的中间状态。
- 某一条链通过 `get()` 已经拉到了新值，另一条链仍然在等订阅 fanout。
- 一个变化本来影响整棵树，却被拆成多个 keyed store、多个 projection、多个 `read()` 调用之后，依赖链很难再被人脑完整还原。
- 查询层和投影层互相读取彼此的中间结果，导致 bug 出现时很难判断问题是在“没算出来”还是“算出来没传播”。

这类系统问题会不断长出新的局部现象：

- mindmap 编辑时宽度或高度只更新了当前 topic，没有同步 sibling/scene/chrome。
- scene 已经反映 live layout，但 node render 还是旧 rect。
- commit 后一切瞬间正确，说明 committed 链路是对的，live edit 链路只是发布不一致。
- 同一个逻辑，在 `get()` 直接读取时看上去是好的，在订阅驱动的 UI 里又会暴露出 stale。

只要没有单一发布边界，这类问题不会消失。

---

## 2. 对当前 `shared/core/store` 的判断

### 2.1 这套 store 适合做什么

当前 `shared/core/store` 的核心语义是：

- 依赖由 `read()` 动态采集。
- derived 节点是 lazy 的，依赖变了先标脏，不立刻全图重算。
- keyed family 可以局部订阅、局部回收。
- projected store 可以做同步或异步合并。

这套设计很适合：

- tool / viewport / pointer / hover / panel 之类局部 UI 状态。
- 一些轻量 query selector。
- key 之间相对独立的列表、表格、面板类读取。
- “订阅后按需拉取”的 React 消费模型。

一句话说，它更像“惰性 selector runtime”，而不是“强一致图状态系统”。

### 2.2 这套 store 不适合做什么

它不适合承担 whiteboard authoritative 派生链，原因不是实现粗糙，而是语义目标不同。

它天生不擅长：

- 一个输入变化同时影响很多 key 的图传播。
- 多条 projection 链并行消费同一份中间派生状态。
- 既依赖订阅 fanout，又大量混用 `get()` 的复杂运行时。
- 需要“某一 revision 内所有消费者看到的是同一份图快照”的场景。

最核心的问题有三个。

### 2.3 `get()` 会刷新，但不保证发布一致

当前 derived 的关键语义是：

- `get()` 会触发 `ensureFresh(false)`。
- 它会重算、更新依赖、甚至更新内部缓存。
- 但 `notify === false` 时不会向下游发通知。

这意味着：

- 某条链可能已经因为 `get()` 看到了新状态。
- 另一条依赖同一中间节点的链如果没被 refresh / fanout，就仍然是旧状态。

这不是某个 bug，而是当前设计本身允许出现的现象。

换句话说，当前系统没有“同一 revision 的一致快照”契约，只有“谁先 pull 谁先新”的局部语义。

### 2.4 `createProjectedKeyedStore(sync)` 和异步模式不是同一套语义

当前 `createProjectedKeyedStore`：

- `sync` 模式直接退化为 `createKeyedDerivedStore`
- 异步模式才维护中心 `Map` 并按 changed keys fanout

这导致同一个 API 在不同 schedule 下其实是两种完全不同的系统：

- `sync` 更像每个 key 独立的惰性 selector。
- `microtask / raf` 更像一次 select + changed-keys fanout 的快照发布。

whiteboard 这种“树级变化影响很多 key”的几何派生，更接近后者需求，而不是前者。

### 2.5 依赖链太隐式，`read()` 到处散落

当前 whiteboard 代码里，很多派生逻辑是这样长出来的：

- 某个 `createDerivedStore` 里 `read()` 另一个 derived
- 那个 derived 里再 `read()` layout / selection / preview / session
- 最终同一份最终 render 结果，背后跨了很多文件和很多中间层

这种模式的问题不只是长，而是依赖关系没有显式边界：

- 代码里很难一眼看出“谁是 authoritative 输入，谁只是中间缓存”。
- 一个 bug 出来后，排查依赖链需要不停展开 `store.read()`。
- 局部修复很容易把系统推向更长的链，而不是更清晰的边界。

### 2.6 当前 store 设计不是错，只是不该承担这份职责

这里要明确：

- `shared/core/store` 不是失败的设计。
- 它对轻量 UI 状态和局部 selector 非常合适。
- 但它不是白板几何真相发布系统。

如果强行继续把它往那个方向改，会把两种目标混在一起：

- 一种是“lazy、局部、轻量、低接入成本”
- 一种是“显式 phase、全图一致、一次发布、强 revision 语义”

这两种目标不该放在同一套原语上硬兼容。

---

## 3. 是否应该改当前 store，还是单独做新的 store

### 3.1 选项 A：继续修改当前 `shared/core/store`

理论上可以，但这条路不是长期最优。

如果继续改当前 store，要真正满足 whiteboard 需要，至少要加入：

- 强 revision 概念
- `get()` / `subscribe()` 同步到同一发布快照的契约
- derived / projected / keyed / family 的统一快照语义
- cross-key fanout 的一等能力
- 显式 dirty set 和 phase 边界
- “发布前工作区”和“发布后快照”的双态机制

问题在于：

- 一旦把这些能力真的做进去，它本质上已经不是当前这套 store 了。
- 原有简单场景的 API 会变复杂。
- 运行时会同时承担两种不同需求，设计张力会非常大。
- 最后得到的是一套谁都能用、但谁都不够顺手的折中系统。

### 3.2 选项 B：为 whiteboard 单独做新的图发布运行时

这条路更适合当前目标。

原因很简单：

- whiteboard 需要的是 authoritative graph projection runtime，不是通用 selector helper。
- 它最重要的不是“任意地方都能 `read()`”，而是“所有消费者都看到同一份已发布图快照”。
- 这套运行时完全可以只优化 whiteboard / dataview 这类复杂投影系统，不必照顾轻量 store 的 ergonomics。

### 3.3 最终建议

最终建议非常明确：

- 不要把 whiteboard 的 authoritative 派生链继续建立在当前 `shared/core/store` 上。
- 不要尝试把当前 store 渐进式改成强一致图系统。
- 新建一套 whiteboard 专用的“图上一致发布运行时”。

当前 `shared/core/store` 的保留角色：

- tool
- viewport
- pointer
- hover
- panel
- dialog
- 输入 staging
- 一些与几何真相无关的轻量本地状态

新的图发布运行时负责：

- committed + live edit + preview 的 authoritative 投影
- node / edge / mindmap / selection / chrome 的最终快照
- 一次输入变更后的单次一致发布

如果未来证明这套运行时足够成熟，再考虑抽出新的通用包。不要先以“通用 store”目标约束 whiteboard 重构。

---

## 4. 长期最优的目标架构

### 4.1 一个输入工作区，一个已发布快照

长期最优模型应分成两层：

1. 工作区 `WorkingState`
2. 已发布快照 `EditorSnapshot`

工作区特点：

- 可变
- 允许 phase 内多次更新
- 允许局部 dirty set
- 不直接暴露给 UI

已发布快照特点：

- 不可变
- 有 revision
- 所有对外读取都只能读它
- 一次 publish 后对所有消费者一致

这意味着：

- 中间 phase 可以反复算
- 但 UI 和 query 永远只看到 publish 之后的整体验证结果

### 4.2 一个 revision 内只发布一次

每次输入变化后，运行时流程必须是：

1. 接收输入变化
2. 标记 dirty sets
3. 按 phase 顺序重算 working state
4. 统一产出 `EditorSnapshot(revision + 1)`
5. 一次性通知相关订阅者

中间不允许：

- 某个 node render 先看到 revision N+1
- 另一个 mindmap scene 还停留在 revision N
- 同一个 topic 的 width 已经是 N+1，但 sibling y 还是 N

### 4.3 最终消费者只读 snapshot，不读中间 store

最终外部消费只能面向：

- `snapshot.nodes.render`
- `snapshot.edges.render`
- `snapshot.mindmaps.scene`
- `snapshot.selection`
- `snapshot.chrome`

不能再让对外消费绕回去读：

- `layout.draft`
- `mindmap.nodeGeometry`
- `query.node.projected`
- `preview.text`
- 各种中间 derived store

中间层只属于 runtime 内部。

---

## 5. 新运行时应该怎么设计

## 5.1 明确输入层

新的运行时只接受几类显式输入：

- committed engine document
- session edit state
- preview state
- interaction state
- viewport state
- text measurement backend

不要允许 phase 在内部随意从各种 store `read()`。

应该改成：

- phase 输入是显式字段
- phase 输出是显式 patch
- orchestrator 负责组装 phase 图

### 5.2 明确 phase 边界

建议把 whiteboard authoritative 派生链拆成这些 phase：

1. `CommittedGraphPhase`
   负责把 engine committed state 归一成统一图输入。

2. `EditDraftPhase`
   负责把 edit session 变成 draft text / draft measure / draft patch。

3. `TreeProjectionPhase`
   负责所有 owner 级几何投影。
   mindmap 的 live edit、root move、subtree move、enter 动画都在这里解决。

4. `NodeProjectionPhase`
   负责把 node 的 committed data、draft text、owner geometry、preview patch 合成成最终 node render。

5. `EdgeProjectionPhase`
   负责 edge 的最终 render。

6. `ScenePhase`
   负责 scene list、mindmap scene、selection frame、chrome 等最终消费态。

这里最重要的原则是：

- 会影响整棵树布局的事情，只能进 `TreeProjectionPhase`
- node phase 不能再反向修补 owner tree 几何

### 5.3 引入显式 dirty set

新的运行时不能靠“某个 derived 被 read 了所以顺便刷新”。

应该显式维护 dirty set，例如：

- `dirty.nodes`
- `dirty.edges`
- `dirty.mindmaps`
- `dirty.selection`
- `dirty.chrome`
- `dirty.scene`

输入变更后先计算影响范围，再推进 phase。

例如：

- 编辑一个 `owner=mindmap` 的 topic
  先脏掉该 node、所属 mindmap、该 mindmap 的相关 node 集、scene、chrome。

- 移动一个 free node
  只脏掉该 node、相关 edges、scene、selection。

这一步必须是显式算法，而不是散落在 query 里的隐式副作用。

### 5.4 输出采用快照 + patch

建议每个 phase 的输出不是新的 store，而是：

- 对 working state 的 patch
- 对 changed entity ids 的声明

例如：

```ts
type PhaseResult = {
  changedNodeIds?: ReadonlySet<NodeId>
  changedEdgeIds?: ReadonlySet<EdgeId>
  changedMindmapIds?: ReadonlySet<MindmapId>
}
```

orchestrator 汇总这些结果后，再决定最后 publish 哪些实体发生变化。

### 5.5 发布层提供稳定引用

最终 `EditorSnapshot` 需要做到：

- revision 增加时，只为真的变化实体创建新对象
- 没变化的 node render / edge render / scene item 保持旧引用
- keyed 订阅只根据 publish 阶段算出的 changed ids 通知

这里的 keyed 通知不应该再通过“重新 select 一个 map 然后 diff previous/next”来间接推导，而应该直接来自 runtime 已知的 dirty / changed 集。

也就是说，通知不是 store 自己猜出来的，而是 runtime 在 phase 执行时已经知道的。

---

## 6. 新的对外读取模型

### 6.1 对外只暴露 Snapshot Read

建议引入新的读接口：

```ts
type EditorSnapshotRead = {
  getSnapshot(): EditorSnapshot
  subscribe(listener: () => void): Unsubscribe
  nodes: {
    get(id: NodeId): NodeRender | undefined
    subscribe(id: NodeId, listener: () => void): Unsubscribe
  }
  edges: {
    get(id: EdgeId): EdgeRender | undefined
    subscribe(id: EdgeId, listener: () => void): Unsubscribe
  }
  mindmaps: {
    getScene(id: MindmapId): MindmapScene | undefined
    subscribeScene(id: MindmapId, listener: () => void): Unsubscribe
  }
}
```

这些 `get()` 只读已发布 snapshot。

这些 `subscribe()` 只听 publish 结果。

内部 phase 永远不通过这套接口互相通信。

### 6.2 React 绑定极薄

React 层应该退化成：

- 订阅 snapshot revision
- 读取对应 entity

不再做：

- hook 层 semantic cache
- hook 层额外 equal 语义
- hook 层替 store 修 snapshot 一致性

也不再需要“这个组件到底是订阅 query.node.render，还是订阅某个中间 store 再 render 时直接 `get()` 兜底”这种混合玩法。

---

## 7. 为什么这比修改当前 whiteboard 派生链更好

### 7.1 依赖链会变显式

当前问题之一是到处 `store.read()`，依赖链很难靠代码结构看出来。

新的 phase runtime 下，依赖关系不再藏在函数体深处，而是由 orchestrator 和 phase 输入明确声明：

- `TreeProjectionPhase` 依赖 committed graph + draft measure + preview
- `NodeProjectionPhase` 依赖 committed node + tree geometry + text draft + node preview
- `ScenePhase` 依赖 final node/edge/mindmap outputs

这会让“读代码就能看出依赖链”重新成立。

### 7.2 不会再有跨链 freshness 不一致

因为所有最终消费者都只读 `EditorSnapshot(revision)`，就不会再出现：

- live layout 已经是新值
- nodeGeometry 还是旧值
- node render 半新半旧

同一 revision 内，所有消费者必然来自同一批 phase 产物。

### 7.3 tree 级问题能在 tree 级解决

当前很多问题的根源是：

- owner 几何是 tree 级真相
- node render 又在 node 级试图局部补丁

这会把问题拆成两层相互竞争的几何来源。

新的架构里：

- tree 级问题先在 tree phase 全部解决
- node phase 只消费 tree phase 的最终几何结果

几何真相就只有一份。

### 7.4 调试会容易得多

当前要调一个 bug，往往要沿着：

- session.edit
- layout.draft
- liveMindmapLayout
- layoutBase
- nodeGeometry
- query.node.projected
- query.node.render

一路追。

新的架构里，调试只需要看：

- 输入 revision
- 脏了哪些实体
- 哪些 phase 产出了哪些 patch
- 发布后的 snapshot 是什么

调试边界会非常清楚。

---

## 8. Whiteboard 具体该怎么重构

### 8.1 第一步：冻结“中间 query 公开面”

在真正重构前，先明确：

- 现有 `query.*` 中间结果不再继续外溢
- `EditorRead` 不再新增任何中间 layer 的对外暴露

否则重构永远在移动目标。

### 8.2 第二步：先建新 snapshot runtime，不要边修边迁

不建议一边保留旧 query graph，一边在里面塞更多 phase。

建议直接新建：

- `whiteboard/packages/whiteboard-editor/src/runtime-graph/*`

里面先搭：

- snapshot schema
- working state
- dirty set
- phase orchestrator
- publisher

先不追求全部 feature 覆盖，只要能跑最关键链路即可。

### 8.3 第三步：优先迁 mindmap authoritative 几何

mindmap 是目前最容易暴露一致性问题的区域，应最先迁入新 runtime。

优先落地：

- committed graph -> tree projection
- live edit -> tree projection
- tree projection -> node render
- scene / chrome 统一从同一 snapshot 出

只要这一步完成，当前这类 owner geometry / node render 不同步问题就会从结构上消失。

### 8.4 第四步：迁 free node / edge / selection

mindmap 跑通后，再把 free node、edge、selection、chrome 逐步迁过去。

最终状态应是：

- 旧 query graph 不再承担 authoritative 几何职责
- 新 runtime 统一产出最终 render snapshot

### 8.5 第五步：删除旧中间层

最终应删除或大幅收缩这些层：

- `layout.draft`
- `layout.mindmap.nodeGeometry`
- 各种 `query.node.projected`
- 各种 owner-aware geometry patch merge
- 大量用于桥接旧链的中间 keyed store

删除这些层不是“代码变少那么简单”，而是减少几何真相竞争。

---

## 9. 是否还需要新的 store

需要，但这个“新的 store”不应该是当前 `shared/core/store` 的增量别名。

更准确地说，需要的是：

- 一个新的 whiteboard graph snapshot publisher
- 它可以对外提供 store-like 接口
- 但内部语义应基于 revisioned snapshot，而不是 lazy derived selector

推荐命名方向：

- `GraphSnapshotStore`
- `ConsistentSnapshotStore`
- `ProjectionRuntime`
- `EditorGraphRuntime`

不推荐继续把它塞回：

- `createDerivedStore`
- `createKeyedDerivedStore`
- `createProjectedKeyedStore(sync)`

因为那会把“快照发布系统”和“惰性 selector helper”继续混在一起。

---

## 10. 这次重构要明确拒绝什么

为了让系统真正变简单，下面这些方向应该明确拒绝。

### 10.1 拒绝继续补丁式修复 fanout

不要继续为单个 bug 加：

- 更多的 `ownerGeometry` fallback
- 更多的 `draft.size` 兜底
- 更多的 “如果是 mindmap 则特殊处理” 分支

这些都只会让中间层越来越多。

### 10.2 拒绝继续在 query 内部堆 store

不要把新逻辑继续做成：

- `createXxxRead()`
- `createYyyProjectedStore()`
- 再套一层 `createKeyedDerivedStore()`

这会延续当前最根本的问题：依赖链越来越隐式。

### 10.3 拒绝让 React hook 兜底一致性

React hook 只能消费已发布快照，不能承担：

- cache 修正
- stale 补偿
- 订阅顺序差异兜底

一致性只能在 runtime/publisher 层解决。

---

## 11. 重构完成后的理想结果

完成后，whiteboard 应该满足下面这些不变量：

1. 同一 revision 内，node render、mindmap scene、chrome、selection 永远来自同一份快照。
2. 任何 tree 级变化都只在 tree phase 解决，不会在 node phase 再局部补丁。
3. 任意组件都可以安全地直接读 snapshot，不需要“订阅一个 store，再 render 时用另一个 `get()` 兜底”。
4. 调试任何 bug 时，都能先定位到具体 revision，再定位 phase，再定位 changed ids，而不是一路追散落的 `store.read()`。
5. 运行时的复杂度主要体现在少数明确模块里，而不是蔓延到每个 query 文件。

这才是长期最优。

不是“再修几个 store 细节”，也不是“继续给当前 query graph 加更多等值判断”，而是把 whiteboard authoritative 派生链从现有 lazy selector 世界里完整拔出来，建立新的、一致发布的图运行时。

---

## 12. 最终建议

最后把建议压缩成一句可执行决策：

- 保留 `shared/core/store` 给轻量 UI / 局部状态使用。
- 新建 whiteboard 专用的 `EditorGraphRuntime`，以 revisioned snapshot 为唯一对外真相。
- 逐步废弃当前基于大规模 `store.read()` 串联出来的 authoritative query chain。

如果目标真的是“健壮、bug 少、复杂度低”，这是最值得做、也是最不该妥协的重构方向。
