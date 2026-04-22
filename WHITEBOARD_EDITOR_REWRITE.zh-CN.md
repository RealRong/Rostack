# Whiteboard Editor 重写方案

本文只讨论一件事：

在完全不考虑兼容、也不接受双轨共存的前提下，`whiteboard-editor` 的长期最优形态应该是什么，以及应该按什么顺序一步到位落地。

本文默认前提如下：

- `whiteboard-engine` 已收敛为 committed document engine
- `whiteboard-editor-graph` 是唯一 authoritative editor projection runtime
- concrete `store/source` 只能存在于 `whiteboard-editor`

本文不讨论：

- 如何继续修补旧 `query/*` / `layout/*` / `store.read()` 链
- 如何保留旧 editor facade 兼容层
- 如何逐步兼容旧 engine projection read

结论先行：

- `whiteboard-editor` 的最终角色是宿主编排层，不是 projection/query 层
- 它只负责输入组织、runtime 驱动、published snapshot 同步、命令与 input 宿主集成
- 它必须彻底删除当前基于 `query/*`、`layout/*`、`editor/read.ts`、`editor/store.ts` 的派生链

---

## 1. 为什么必须重写 `whiteboard-editor`

当前 editor 的根问题不是某一条 selector 写错了，而是架构边界错误。

从现有包结构看，editor 仍在同时承担下面几类职责：

- session 状态维护
- input host 与交互状态机
- layout 运行
- query 派生
- 对外 read/store 暴露
- engine read projection 拼装

这会直接导致几个结构性问题：

1. 依赖链隐藏在 `store.read()` 里

`query/*`、`layout/*`、`editor/read.ts`、`editor/store.ts` 之间通过大量 `store.read()` 横向穿透，依赖边界隐式化。出现 bug 时，很难判断到底是哪一层漏算、哪一层没 fanout、哪一层读到了 stale 状态。

2. session / draft / preview / measure / layout 不在同一条 publish 链

例如文本编辑时，draft size 先变、measure 后到、mindmap relayout 再晚一步，这些变化会分散落在不同局部 store 上，导致“局部 fresh、局部 stale” 同时对外可见。

3. editor 自己重新做了一遍 projection 语义

既读 engine committed projection，又在 editor 内部追加 draft/preview/layout/query 修正，本质上是两套 projection truth 混在一起。

4. store 被拿来当语义运行时

store 本应只是宿主同步手段，但当前 editor 把它当成了语义派生底座。这样依赖链难以看清，也无法保证一次发布内的整体一致性。

因此，`whiteboard-editor` 不是该“继续修”，而是必须重新收口成明确的 host adapter。

---

## 2. 最终定位

`whiteboard-editor` 在最终架构里的定位非常简单：

1. 维护本地输入态与资源态
2. 组装 `EditorGraphInput`
3. 驱动 `EditorGraphRuntime`
4. 持有 concrete publish runtime
5. 对外暴露稳定 editor API

它明确不负责：

- layout 语义
- query 语义
- graph 派生
- 重新定义 node/edge/mindmap/scene/chrome/selection 的最终视图

一句话：

> `whiteboard-editor` 是 `DocumentEngine + EditorGraphRuntime + concrete sources` 的唯一装配层。

---

## 3. 最终边界

长期最优的边界必须严格固定为下面三层：

### 3.1 `whiteboard-engine`

只负责 committed truth：

- document snapshot
- write transaction
- document change event
- history integration

它不再对外提供：

- projection read
- node geometry read
- mindmap layout read
- scene read
- store/source runtime

### 3.2 `whiteboard-editor-graph`

只负责 editor projection truth：

- 输入是 committed document + session/resource state
- 运行 staged projection phase
- 输出 `EditorSnapshot + EditorChange + trace`

它不持有：

- concrete store/source runtime
- React hook
- renderer adapter
- editor input host

### 3.3 `whiteboard-editor`

只负责宿主集成：

- session
- resource
- graph driver
- publication source
- command / input / events facade

这里必须坚持三条纪律：

- `whiteboard-engine` 不知道 store/source
- `whiteboard-editor-graph` 不知道 store/source
- 只有 `whiteboard-editor` 允许持有 concrete store/source runtime

---

## 4. `whiteboard-editor` 的最终内部架构

`whiteboard-editor` 应拆成 6 个明确子系统：

1. `session`
2. `resource`
3. `graph`
4. `publish`
5. `command`
6. `api`

### 4.1 `session`

`session` 只保存本地输入态。

它应包含：

- tool
- draw state
- selection state
- edit session
- draft patch
- preview patch
- interaction mode
- hover state
- viewport
- animation clock

这里的关键约束是：

- session store 可以存在
- 但 session store 只能表达原始本地态
- 不允许从 session store 直接派生 node render / edge render / mindmap layout / scene / chrome

### 4.2 `resource`

`resource` 管理宿主资源态，最重要的是 text measure。

它负责：

- measurement cache
- pending request queue
- sync/async measure execution
- measure result snapshot
- measure invalidation fan-in

必须明确：

- text measure 不再挂在旧 `layout/*`
- text measure 也不能散落在 query 里临时读取
- 它必须成为独立资源子系统

最终 editor 的 measure 闭环应是：

1. graph runtime 发布 measure request
2. editor resource 执行测量
3. measure result 写回 `EditorGraphInput.measure`
4. driver 用 `impact.measure` 触发下一轮 runtime update

这意味着一个关键设计要求：

- `whiteboard-editor` 不能自己推导 measure request
- `whiteboard-editor-graph` 必须提供稳定的 measure request contract

否则 measure spec 会在 graph 和 editor 两边重复定义，最终重新分叉。

### 4.3 `graph`

`graph` 是 editor 的 runtime bridge，不是第二个语义 runtime。

它应只包含两个部件：

- `input adapter`
- `runtime driver`

`input adapter` 负责把多路输入归一成单份不可变 `EditorGraphInput`：

- engine committed snapshot
- session snapshot
- measure snapshot
- readiness state
- merged `impact`

`runtime driver` 负责：

- 持有单个 `EditorGraphRuntime`
- 串行接收所有输入变化
- 在单批次内只调用一次 `runtime.update(input)`
- 保留最后发布结果
- 把 publish 结果转交给 `publish`

旧模型里不允许继续存在的模式：

- 各 store 自己订阅别人然后局部重算
- `store.read()` 横向拼出依赖图
- 输入变化时多个模块各自触发 relayout / rerender

最终只允许：

- 多路输入汇总
- 单次 runtime update
- 单次 publish fanout

### 4.4 `publish`

`publish` 持有 concrete store/source runtime，但不允许持有图语义。

它负责：

- 保存最后发布的 `EditorSnapshot`
- 根据 `EditorChange` 做 sink-local 同步
- 对外暴露稳定 source/store 订阅面
- 为 renderer / React / panel / devtools 维护 mirror

它允许做的事情：

- keyed source sync
- stable reference reuse
- sink-local patch apply
- renderer layer mirror
- spatial index mirror

它不允许做的事情：

- 自己再做 mindmap relayout
- 从 node/edge store 再拼 scene
- 重新计算 selection chrome
- 自己决定哪些元素可见

### 4.5 `command`

`command` 统一承载：

- `action/*`
- `input/*`
- `write/*`
- `events/*`

这些逻辑最终只能读取两类东西：

1. session 原始状态
2. 已发布的 `EditorSnapshot`

它们不能再读取：

- 旧 `query/*`
- 旧 `layout/*`
- engine projection read
- 任何依赖 store 递归派生出来的半成品视图

例如：

- hit test 建立在 published scene / published spatial index 上
- selection affordance 建立在 published selection / chrome view 上
- mindmap drag target 建立在 published tree / scene view 上
- text edit preview 建立在 session edit + published node view 上

这正是修掉“编辑中高度变了但整棵树没有一致 relayout fanout”的根手段。

### 4.6 `api`

`api` 负责对外暴露清晰、稳定、按职责分组的 editor 接口。

这里建议直接使用对象分组，不使用 TypeScript `namespace`。

不应继续保留当前混合了 `store` / `read` / `actions` 的旧接口语义。

推荐最终公开形状如下：

```ts
interface Editor {
  graph: {
    snapshot(): editorGraph.Snapshot
    subscribe(
      listener: (result: editorGraph.Result) => void
    ): () => void
  }
  sources: {
    session: EditorSessionSources
    view: EditorViewSources
  }
  commands: EditorCommands
  input: EditorInputHost
  events: EditorEvents
  dispose(): void
}

interface EditorSessionSources {
  tool: ReadStore<Tool>
  draw: ReadStore<DrawState>
  edit: ReadStore<EditSession | null>
  selection: ReadStore<SelectionState>
  viewport: ReadStore<Viewport>
  interaction: ReadStore<InteractionState>
}

interface EditorViewSources {
  document: ReadStore<EditorDocumentView>
  scene: ReadStore<EditorSceneView>
  node: ReadStoreFamily<NodeId, NodeView | null>
  edge: ReadStoreFamily<EdgeId, EdgeView | null>
  mindmap: ReadStoreFamily<MindmapId, MindmapView | null>
  selection: ReadStore<SelectionView>
  chrome: ReadStore<ChromeView>
  panel: ReadStore<PanelView>
}
```

这里的变化非常关键：

- `sources.session` 只表示 editor 本地态
- `sources.view` 全部来自 published snapshot
- `graph.snapshot()` 作为最终同步读入口
- `read` / `store` 旧二分法整体删除

---

## 5. 最终目录形态

建议目标目录直接收口为：

```text
whiteboard/packages/whiteboard-editor/src/
  api/
    createEditor.ts
    types.ts
  session/
    tool.ts
    edit.ts
    selection.ts
    preview.ts
    viewport.ts
    interaction.ts
  resource/
    measure/
      cache.ts
      runtime.ts
      requests.ts
  graph/
    input.ts
    impact.ts
    driver.ts
    subscriptions.ts
  publish/
    sources.ts
    apply.ts
    mirrors/
  command/
    actions/
    input/
    write/
    events/
  index.ts
```

与之对应，必须删除的旧实现包括：

- `src/query/`
- `src/layout/`
- 当前 `src/editor/read.ts`
- 当前 `src/editor/store.ts`
- 任何依赖 `engine.read.*` projection 的路径

现有 `session/*`、`input/*`、`action/*`、`write/*` 中如果还能改造成“只读 session + published snapshot”的模块，可以吸收进新目录；否则直接删除重写，不做过渡复用。

---

## 6. 单通道调度模型

`whiteboard-editor` 最终必须只有一个 graph driver。

所有变化都只能汇入这一个 driver：

- engine commit
- history move
- session mutation
- preview mutation
- measure ready
- viewport change
- clock tick

driver 的固定流程必须是：

1. 收集 dirty reason
2. 生成下一份 `EditorGraphInput`
3. 合并出 `impact`
4. 调用一次 `runtime.update(input)`
5. publish
6. 通知 sources

绝对不允许的行为：

- session 改完直接 patch 某个 view source
- measure ready 时直接 patch mindmap layout source
- pointer move 时局部刷新 chrome source 而不经过 graph runtime

如果输入很频繁，可以做批处理，但批处理只能发生在 driver 内部。

---

## 7. 文本编辑与测量闭环

whiteboard 当前最容易出错的地方，就是 live edit 过程中 draft、measure、layout、scene、chrome 没走同一条发布链。

最终模型里，文本编辑必须严格闭环：

1. DOM edit 事件写入 session edit
2. graph runtime 发布新的 measure request
3. measure resource 执行测量
4. driver 使用最新 session + measure 更新 runtime
5. publish 后 node/tree/scene/chrome 一起更新
6. commit 时 command 写入 engine
7. engine committed snapshot 再触发下一轮 graph update

这条闭环保证：

- 编辑中尺寸变化会持续驱动整棵 mindmap relayout
- publish 前不会出现局部 fresh、局部 stale
- commit 后不会因为切回另一条布局链而发生额外跳变

---

## 8. 对 `whiteboard-editor-graph` 的反向要求

如果 `whiteboard-editor` 要真正成为宿主层，那么 `whiteboard-editor-graph` 的 contract 必须足够完整。

editor 侧不应该重新发明下面这些语义：

- text measure request
- scene / visible item index
- hit-test 需要的空间索引输入
- selection / chrome / panel 最终视图

因此 editor 重写前，graph contract 至少要满足：

1. `EditorSnapshot` 足够完整，可直接驱动 renderer / React / command
2. `EditorChange` 足够清晰，可驱动最小 publish fanout
3. 如有必要，snapshot/change 提供 measure request publication，而不是让 editor 自己猜

如果做不到这三条，editor 侧一定会重新长出 `query/*` / `layout/*` 影子。

---

## 9. 实施顺序

这一轮重写必须一步到位，不保留兼容和双轨。

建议顺序如下：

### 9.1 建骨架

先在 `whiteboard-editor` 建立下面几层空实现：

- `graph/driver`
- `graph/input`
- `publish/*`
- `resource/measure/*`
- `api/*`

### 9.2 改写 `createEditor()`

先把装配链改成：

- engine
- session
- graph runtime
- publish runtime
- command/input facade

此时不再创建旧 query/layout runtime。

### 9.3 抽离 measure

把 text measure 从旧 `layout/*` 中彻底抽走，接成：

`resource/measure -> graph input -> runtime -> publish`

这一步完成后，editor 内不再允许任何“顺手测一下文本再局部改 layout”的路径。

### 9.4 重写对外 sources

把当前 `editor/read.ts` / `editor/store.ts` 改写成：

- `sources.session`
- `sources.view`
- `graph.snapshot()`

所有 view source 都只来自 published snapshot。

### 9.5 重写 command/input

逐个重写：

- `input/*`
- `action/*`
- `write/*`
- `events/*`

把它们的读取依赖全部改成：

- session 原始态
- published snapshot

### 9.6 删除旧链

统一删除：

- `query/*`
- `layout/*`
- 旧 `editor/read.ts`
- 旧 `editor/store.ts`
- 全部 `engine.read.*` projection 依赖

### 9.7 重建测试

围绕新 contract 重建 editor 测试矩阵，只保留新世界下的测试。

---

## 10. 不能接受的过渡做法

以下做法都必须禁止：

- 先保留旧 query，新 runtime 只接一部分
- 先把新 snapshot 暴露出来，再让 action 继续读旧 store
- 让旧 `layout/*` 暂时继续给 mindmap 提供 relayout
- 让 publish 层为了图方便再做一次语义拼装
- 让 editor 再次直接依赖 engine projection read

这些做法的共同后果是：

- 重新引入双 authoritative truth
- 重新把 stale/fresh 混在一起
- 重新把依赖链藏回 store graph

---

## 11. 验收标准

重写完成后，验收必须围绕一致发布而不是围绕旧 API 是否还能工作来制定。

至少要覆盖下面这些场景：

- text node live edit 时宽高变化连续驱动 scene/chrome 更新
- mindmap topic live edit 时高度变化连续驱动整棵树 relayout
- commit 前后的节点位置没有额外跳变
- draft/preview/measure/selection 在同一 revision 对外一致可见
- input/command 不再依赖 `query/*` / `layout/*`
- `engine.read.*` projection 依赖在 editor 包内清零

只要这些验收项有一条不成立，就说明 `whiteboard-editor` 仍然不是纯宿主层。

