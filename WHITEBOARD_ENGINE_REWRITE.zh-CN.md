# Whiteboard Engine 重写方案

本文对应统一重构的第二步：

- 重写 `whiteboard-engine`

本文不讨论兼容方案，不讨论低风险迁移，不讨论双轨保留。

本文只回答一个问题：

如果按一步到位的方式，把 `whiteboard-engine` 直接改造成最终需要的 `DocumentEngine`，整体设计和实施顺序应该是什么。

本文默认前提：

- 第一阶段 contract 已按 [WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_RUNTIME_CONTRACTS.zh-CN.md) 冻结
- `whiteboard-engine` 只负责 committed truth
- projection truth 不再属于 engine
- 旧 `EngineRead`、旧 projection store runtime、旧 scene/layout/node geometry read 全部删除

---

## 1. 目标

第二步的唯一目标是把 `whiteboard-engine` 收敛成一个真正的 `DocumentEngine`。

它的职责只有四类：

1. 管理 committed document
2. 提供 canonical committed facts
3. 执行 write command / operation apply
4. 在每次 commit 后发布新的 `document.Snapshot`

一句话概括：

> 新 engine 只回答“文档现在是什么”，不再回答“编辑器现在该怎么显示”。

---

## 2. 非目标

下面这些都不是新 engine 的职责：

- node geometry
- node rect / bounds
- edge view
- mindmap layout
- mindmap scene
- canvas scene
- selection
- chrome
- editor hit-test geometry
- live edit
- preview
- text measurement
- editor 级 dirty planning
- editor 级 phase orchestration

这些能力一律移出 `whiteboard-engine`，进入后续的 `whiteboard-editor-graph`。

---

## 3. 对当前 engine 的判断

当前 `whiteboard-engine` 实际混了两层职责：

1. 文档引擎
2. projection runtime

其中第一层是合理的，第二层是长期最优必须删除的。

从当前目录就能看出来：

- 合理保留方向：
  - `document/normalize.ts`
  - `document/sanitize.ts`
  - `write/*`
  - `instance/document.ts`
- 必须删除方向：
  - `read/*`
  - `geometry/nodeGeometry.ts`
  - `types/projection.ts`
  - `types/read.ts`
  - `types/internal/read.ts`

当前 engine 最大的问题不是某个算法错，而是它把 committed truth 和 editor projection truth 一起对外暴露了。

这会导致：

- engine 自己已经有一套 geometry / scene 真相
- editor 又在此基础上叠 live edit / preview / layout
- 系统长期不可避免地长出“双 authoritative truth”

这条路必须彻底切断。

---

## 4. 最终形态

### 4.1 最终角色

重写后的 `whiteboard-engine` 应该是：

- 一个同步 committed document runtime
- 一个单 snapshot 发布器
- 一个 write transaction 执行器
- 一个 canonical facts builder

它不是：

- selector graph
- keyed projection store 集合
- editor query 基础设施
- scene/layout 引擎

### 4.2 最终公开 API

长期最优直接对齐第一步 contract：

```ts
// contracts/document.ts
export interface Engine {
  snapshot(): Snapshot
  subscribe(listener: (snapshot: Snapshot) => void): () => void
  execute(command: Command): CommandResult
  apply(ops: readonly Operation[]): CommandResult
}
```

最终外部拿到的 committed truth 只有：

- `document.Snapshot`
- `document.Change`

不再有：

- `engine.read.node.*`
- `engine.read.edge.*`
- `engine.read.mindmap.*`
- `engine.read.scene.*`
- `engine.index.*`
- `engine.write` 这种写入记录 store

如果后续确实需要 write log，也应作为内部调试或单独 devtools 能力，而不是 engine 主 contract。

### 4.3 最终运行时模型

新 engine 应使用最简单的运行时模型：

```ts
type EngineState = {
  snapshot: document.Snapshot
  listeners: Set<(snapshot: document.Snapshot) => void>
}
```

也就是说：

- engine 内部不需要 derived store graph
- 不需要 keyed read store
- 不需要 projection runtime
- 不需要 invalidation fanout

因为 committed engine 的工作模型本来就很简单：

1. 接收 command 或 ops
2. 归约为 next document
3. 生成 next facts
4. 生成 next change
5. 组装 next snapshot
6. 一次 publish

这类系统用简单同步 state + listener 集合就足够了。

长期最优不应为了“和旧 store 风格统一”而引入多余运行时。

---

## 5. 新 engine 的内部结构

建议把 `whiteboard-engine` 收成下面 6 个内部子域：

1. `contracts`
2. `document`
3. `facts`
4. `change`
5. `write`
6. `runtime`

### 5.1 `contracts`

职责：

- 对外稳定类型
- 只放 committed truth contract

建议文件：

```text
src/contracts/
  core.ts
  command.ts
  result.ts
  document.ts
```

注意：

- `editor.ts`
- `phase.ts`
- `source.ts`
- `trace.ts`

这些不属于 engine 包本体，可以在共享 contract 包或上层系统里定义，但不应让 engine 承担 editor contract。

### 5.2 `document`

职责：

- normalize
- sanitize
- snapshot root state

建议文件：

```text
src/document/
  normalize.ts
  sanitize.ts
  create.ts
```

### 5.3 `facts`

职责：

- 从 committed document 构建 canonical facts

建议文件：

```text
src/facts/
  build.ts
  entities.ts
  relations.ts
```

这里不要引入 projection。

`facts` 只回答：

- 文档里有哪些实体
- 它们的关系是什么

### 5.4 `change`

职责：

- 把一次 commit 的变化翻译成 `document.Change`

建议文件：

```text
src/change/
  build.ts
  fromReduce.ts
```

这里的长期最优不是对全量 document 做昂贵 diff，而是：

- 以 kernel reduce 产出的 changed footprint 为主
- 结合 facts builder 的输出，组装最终 `document.Change`

也就是说：

- 变化源由 write/reduce 提供
- 变化 contract 由 engine 明确建模

### 5.5 `write`

职责：

- command compile
- op reduce
- commit draft 生成

建议文件：

```text
src/write/
  index.ts
  apply.ts
  draft.ts
  compile/
```

这一层是当前 engine 最值得保留的资产。

长期最优不是重写所有 command compiler，而是：

- 保留语义正确的 compile 层
- 让它接到新的 snapshot runtime 上

### 5.6 `runtime`

职责：

- engine state
- publish
- listener 管理
- commit pipeline orchestration

建议文件：

```text
src/runtime/
  state.ts
  publish.ts
  engine.ts
```

这里是新 engine 的真正核心。

---

## 6. 核心数据流

新 engine 的核心流程应该固定为：

```text
command/apply
  -> compile ops
  -> kernel reduce
  -> normalize/sanitize next document
  -> build facts
  -> build change
  -> build document snapshot
  -> publish
```

### 6.1 初始化

创建 engine 时：

1. 规范化初始 document
2. 构建初始 facts
3. 生成初始 `document.Change`
   初始值可视为全量 changed
4. 组装 `document.Snapshot(revision = 0)`
5. 存入 runtime state

### 6.2 写入执行

执行 `execute(command)` 时：

1. 读取当前 committed document
2. 编译 command 为 ops
3. 调用 kernel reduce 得到 next document 和 reduce footprint
4. 对 next document 做 normalize/sanitize
5. 构建 next facts
6. 基于 reduce footprint 构建 `document.Change`
7. 组装 next snapshot
8. revision + 1
9. publish next snapshot

### 6.3 只发布一次

每次成功 commit 后：

- 只 publish 一次新的 `document.Snapshot`
- 订阅者只收到已完成的 committed truth
- 中间不允许暴露 draft / reduce / facts building 中间态

这和后续 editor runtime 的“一次输入变化只 publish 一次 `editor.Snapshot`”是完全对称的。

---

## 7. `document.Snapshot` 在 engine 内部的构成

对 engine 来说，最终 snapshot 只需要三部分：

```ts
export interface Snapshot {
  revision: core.Revision
  state: State
  change: Change
}
```

其中：

- `revision`
  committed revision
- `state.root`
  committed document
- `state.facts`
  canonical committed facts
- `change`
  相对上一 revision 的 committed change

### 7.1 `state.root`

`state.root` 保留原始 document 结构。

这是：

- 写入的输入真源
- 导出/序列化的真源
- command compiler 的语义真源

### 7.2 `state.facts`

`state.facts` 是 committed document 的归一视图。

它的作用不是给 editor 提供 projection，而是：

- 给 engine 自己和上层 runtime 提供稳定、明确的 committed graph facts
- 让后续 editor runtime 不必自己每次都从 document 重建基础关系

facts 只放：

- entities
- relations

不放：

- layout
- rect
- scene
- path

### 7.3 `change`

`change` 是 committed 改变的正式 contract。

它的作用是：

- 告诉上层 runtime 哪些 committed 事实变了
- 作为后续 editor impact planning 的起点

这意味着新 engine 并不是“只吐 document，不吐 changed 信息”，而是吐：

- committed snapshot
- committed change

但它不吐 editor projection change。

---

## 8. 应保留的东西

一步到位重写，不代表全部推倒。

下面这些能力原则上应该保留，并迁入新边界：

### 8.1 文档 normalize / sanitize

可保留：

- `document/normalize.ts`
- `document/sanitize.ts`

但要检查：

- 是否还带了旧 projection 假设
- 是否还和旧 read/invalidation 耦合

### 8.2 command compile

可保留大部分：

- `write/compile/*`

因为这些本质上是：

- command -> ops

这仍然属于 committed engine 的职责。

但需要统一整理：

- 不再依赖 projection read
- 不再产出为旧 read/runtime 服务的辅助字段

### 8.3 reduce -> draft 封装

可保留思路：

- `write/draft.ts`

但要改成围绕新 `document.Change` 和新 runtime state 工作，而不是继续产生旧 invalidation/projection 语义。

### 8.4 result / command 类型

可以保留语义，建议重组到 `contracts/` 下：

- `types/command.ts` -> `contracts/command.ts`
- `types/result.ts` -> `contracts/result.ts`

---

## 9. 必须删除的东西

一步到位的核心不是“加新模块”，而是“老边界必须删干净”。

下面这些必须整体删除：

### 9.1 `read/*`

整个：

```text
src/read/
```

都应删除。

原因：

- 这是旧 engine projection runtime 的核心
- 它代表的就是旧 `EngineRead` 世界

### 9.2 geometry projection

删除：

```text
src/geometry/nodeGeometry.ts
```

理由：

- geometry 不属于 committed engine
- 它属于 editor projection runtime

### 9.3 projection/read 类型

删除：

```text
src/types/projection.ts
src/types/read.ts
src/types/internal/read.ts
```

### 9.4 基于 invalidation 的 projection fanout 语义

当前 draft 里还保留了：

- `invalidation`
- `projections`

这整套语义是为旧 engine read runtime 服务的。

长期最优里必须删除。

如果 kernel reduce 仍然产出基础 changed footprint，可以保留；
但 engine 自己不再维护“projection invalidation”这层语言。

### 9.5 `EngineRead` 公开 API

删除：

- `types/instance.ts` 中的 `EngineRead`
- `engine.read`
- `engine.write` 这种写入记录 store

最终 engine 主接口只保留：

- `snapshot()`
- `subscribe()`
- `execute()`
- `apply()`

---

## 10. 新的目录结构

一步到位建议直接改成：

```text
whiteboard/packages/whiteboard-engine/src/
  contracts/
    core.ts
    command.ts
    result.ts
    document.ts
  document/
    normalize.ts
    sanitize.ts
    create.ts
  facts/
    build.ts
    entities.ts
    relations.ts
  change/
    build.ts
    fromReduce.ts
  write/
    index.ts
    apply.ts
    draft.ts
    compile/
      index.ts
      document.ts
      canvas.ts
      node.ts
      edge.ts
      group.ts
      mindmap.ts
      tx.ts
  runtime/
    state.ts
    publish.ts
    engine.ts
  config/
    defaults.ts
    index.ts
  index.ts
```

这意味着当前包会发生几个明确变化：

- `instance/` 合并进 `runtime/`
- `types/` 被 `contracts/` 替代
- `read/` 全部移除
- `geometry/` 从 engine 包移除

---

## 11. 新 `index.ts` 的公开边界

新的公开导出应该非常小。

建议：

```ts
export { createEngine } from './runtime/engine'
export { normalizeDocument } from './document/normalize'
export { DEFAULT_BOARD_CONFIG } from './config/defaults'

export type * from './contracts/core'
export type * from './contracts/command'
export type * from './contracts/result'
export type * from './contracts/document'
```

明确不再导出：

- projection types
- read types
- node/mindmap/scene view types

---

## 12. 实施顺序

这里说的是一步到位的真实施工顺序，不是“渐进保守迁移”。

原则非常明确：

- 同一重构分支内完成
- 新 engine 不建立在旧 read/runtime 上
- 删除与重建同步进行
- 不保留桥接层

### 12.1 第一步：先切公开边界

先在设计上把新的公开边界写死：

- `contracts/core.ts`
- `contracts/command.ts`
- `contracts/result.ts`
- `contracts/document.ts`
- `runtime/engine.ts`

这一步结束时，要能明确：

- 新 engine 对外只暴露什么
- 旧 `EngineRead` 从哪一刻起不再属于目标系统

### 12.2 第二步：实现 snapshot state

先写新的 engine runtime state：

- `state.snapshot`
- `listeners`

以及最基础的：

- `snapshot()`
- `subscribe()`

在这一阶段不要接入旧 `read/*`。

### 12.3 第三步：实现 facts builder

从 committed document 构建：

- `entities`
- `relations`

这一步做完后，engine 就已经具备“只看 committed truth”的核心骨架。

### 12.4 第四步：实现 change builder

把 kernel reduce 的 changed footprint 翻译成新 `document.Change`。

这一步是替代旧 invalidation 语言的关键。

完成后，engine 输出的 committed change contract 就稳定了。

### 12.5 第五步：接入 write pipeline

把现有 write compiler 和 kernel reduce 接到新 runtime：

- `compile command`
- `reduce ops`
- `normalize/sanitize`
- `facts`
- `change`
- `snapshot`
- `publish`

到这一步为止，新 engine 已经可以完整工作。

### 12.6 第六步：删除旧 read 世界

统一删除：

- `src/read/`
- `src/geometry/nodeGeometry.ts`
- projection/read 相关类型
- `EngineRead`
- `engine.read`

这一步不能拖到最后的“有空再删”。

必须在新 engine 能跑之后立刻删。

### 12.7 第七步：整理 exports 与测试

重写：

- `index.ts`
- package public types
- engine tests

测试重点应改成：

- 初始 snapshot 正确
- execute/apply 后 snapshot revision 正确
- facts 正确
- change 正确
- subscribe 只在 commit 后触发一次

### 12.8 第八步：再进入第三步 runtime kit / 第四步 editor graph

engine 一旦收敛完成，后续步骤才能建立在干净 committed truth 之上。

这就是为什么 engine 重写必须先于 editor graph runtime。

---

## 13. 测试重建方案

重写 engine 后，原测试体系也必须跟着收口。

### 13.1 保留的测试主题

应保留：

- command compile correctness
- execute/apply correctness
- document normalize correctness
- mindmap command semantics correctness
- history-facing result correctness

### 13.2 删除的测试主题

应删除：

- engine read projection correctness
- engine node geometry correctness
- engine scene correctness
- engine mindmap layout correctness
- engine hit-test correctness

这些以后属于 editor projection runtime 测试。

### 13.3 新增的测试主题

应新增：

- `document.Snapshot` shape tests
- `document.Change` shape tests
- facts builder tests
- subscribe publish-once tests
- revision monotonicity tests

---

## 14. 完成标准

只有满足下面这些条件，第二步才算真正完成：

1. `whiteboard-engine` 对外不再暴露任何 projection read
2. `whiteboard-engine` 只发布 `document.Snapshot`
3. `document.Snapshot` 内含 committed facts 与 committed change
4. write pipeline 完全跑在新 runtime 上
5. 旧 `read/*`、旧 projection types、旧 invalidation 语义全部删除
6. engine 测试只围绕 committed truth 展开

少一条都不算完成。

---

## 15. 一句话结论

第二步的一步到位方案，不是“保留旧 engine read，再顺手补个 snapshot API”，而是直接把 `whiteboard-engine` 砍回 committed document engine：保留 write，重建 snapshot/facts/change/runtime，删光 projection read，为后续 `whiteboard-editor-graph` 留出唯一干净的 committed truth 边界。
