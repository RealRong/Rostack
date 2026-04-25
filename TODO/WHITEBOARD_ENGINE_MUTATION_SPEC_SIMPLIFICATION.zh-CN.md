# WHITEBOARD_ENGINE_MUTATION_SPEC_SIMPLIFICATION

## 目标

在已经迁移到 `MutationEngineSpec` / `MutationEngine` 之后，继续把 `whiteboard-engine` 和 `whiteboard-core` 收敛到更简单的最终形态。

约束：

- 不保留兼容层。
- 不保留旧命名和旧分层，只保留最终实现。
- 可以接受重构过程中短期不可运行，但最终落地后要明显更简单。

本文只讨论最终重构方向，不写代码。

## 结论

可以继续明显简化，而且现在已经到了适合做这件事的时机。

当前最大的历史遗留不是 reducer，也不是 `MutationEngine` 本身，而是：

- `whiteboard-engine` 里还保留了一整层“旧 command compiler 门面”。
- `whiteboard-core` 里已经有很多真正的领域逻辑和 op builder，但命名、归属和导出方式还停留在旧结构。
- `intent type`、`intent table`、`compile dispatch`、`compile helper` 这四层存在重复和分裂。

如果直接按最终形态收敛，目标应该是：

- `whiteboard-core` 成为唯一的 whiteboard domain authority。
- `whiteboard-engine` 只负责：
  - 组装 `MutationEngineSpec`
  - 组装 publish
  - 组装 history policy
  - 暴露 engine API
- `compile commands` 这层历史遗留整体消失，统一为 `intent -> ops` 的 typed compile handlers。

## 当前问题

### 1. `whiteboard-engine` 还是太像“业务层”

虽然底层已经换成了 `MutationEngine`，但 `whiteboard-engine` 仍然保留了大量业务编译逻辑：

- [whiteboard/packages/whiteboard-engine/src/mutation/compile/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/index.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/node.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/edge.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/canvas.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/group.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/group.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/mindmap.ts)

仅 compile 目录就有大约 2500 行代码，其中：

- `edge.ts` 836 行
- `canvas.ts` 411 行
- `mindmap.ts` 409 行
- `node.ts` 388 行

这说明 `engine` 还在承担太多 whiteboard domain 语义。

最终应该反过来：

- 领域语义归 `core`
- `engine` 只做 runtime composition

### 2. `intent` 定义有双重 source of truth

[whiteboard/packages/whiteboard-engine/src/types/intent.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/intent.ts) 里同时维护了：

- `DocumentIntent / CanvasIntent / NodeIntent / ...`
- `WhiteboardIntentTable`
- `IntentKind`
- `Intent`
- `IntentData`

问题是：

- 上半部分是按 domain 分类的 union。
- 下半部分是按 `type` 平铺的 table。
- 这两层其实在描述同一件事。

这会导致：

- 同一个 intent 的结构要写两次。
- compile handler 和 execute typing 都依赖这份重复定义。
- 未来新增 intent 时，很容易忘记同步 table 或 union。

最终应该只有一份 source of truth。

### 3. compile dispatch 还是“字符串前缀 + 强制 cast”

[whiteboard/packages/whiteboard-engine/src/mutation/compile/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/index.ts) 当前是这样分发的：

- `if (current.type.startsWith('document.')) ...`
- `if (current.type.startsWith('canvas.')) ...`
- `if (current.type.startsWith('node.')) ...`
- 然后再 cast 成 `DocumentIntent / CanvasIntent / NodeIntent / ...`

这是典型旧架构残留：

- runtime 依赖字符串前缀约定
- type system 没有成为真正的 dispatch source
- handler registry 没有显式化

在已经引入 `MutationIntentTable` 的情况下，这一层应该被彻底删除。

### 4. compile context 还有一层白板专用 adapter

[whiteboard/packages/whiteboard-engine/src/mutation/compile/tx.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/tx.ts) 目前做了：

- `ctx.doc()` 包装
- `ctx.require(...)` 包装
- `fail.invalid / fail.cancelled` 包装
- entity read helper 包装
- ids 包装

它本身不是问题，但它说明当前 compile 还停留在“engine 自己有一套 compiler runtime”的思路。

最终应该要么：

- 这层直接变成 `core` 的 domain compile context

要么：

- 被更薄的 typed handler 机制替代

而不应该继续作为 `engine` 的私有业务设施。

### 5. `whiteboard-core` 已经有 op builder，但命名和归属仍然是旧的

当前 `core` 已经有很多真正属于 compile side 的纯函数：

- [whiteboard/packages/whiteboard-core/src/node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/commands.ts)
- [whiteboard/packages/whiteboard-core/src/edge/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/edge/commands.ts)
- [whiteboard/packages/whiteboard-core/src/document/slice.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/document/slice.ts)
- [whiteboard/packages/whiteboard-core/src/mindmap/mutate.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mindmap/mutate.ts)
- [whiteboard/packages/whiteboard-core/src/mindmap/query.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mindmap/query.ts)

但问题在于：

- 文件名还叫 `commands.ts`
- `node.index.ts` / `edge.index.ts` 里暴露的 namespace 还叫 `command.buildCreate`
- mindmap 的 compile 相关逻辑一部分在 `core`，一部分又留在 `engine`

这会让边界很模糊：

- 看起来 `core` 只是一部分 helper
- 实际上它已经快成为 compile authority 了

### 6. 同类 helper 在 engine compile 内重复出现

目前 compile 文件内部有明显重复：

- `hasOwn`
- `readNodeMindmapId`
- `isMindmapRoot`
- locked failure message
- record update emit helper
- canvas order move helper

典型位置：

- [whiteboard/packages/whiteboard-engine/src/mutation/compile/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/node.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/canvas.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/compile/mindmap.ts)

这不是单纯的抽函数问题，而是说明这些规则本来就不该散落在 engine compile 层。

### 7. history policy 还有重复逻辑

`history` origin 判断目前在两处重复：

- [whiteboard/packages/whiteboard-engine/src/mutation/spec.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/spec.ts)
- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts)

一处用于 `track`

一处用于 `clearHistory`

这说明 runtime/engine 仍然背着一部分 spec policy。

这不是 compile 主问题，但属于同一类“spec 已引入，旧 glue 还没收干净”的残留。

## 最终目标形态

## 1. `whiteboard-core` 拥有 whiteboard mutation domain

最终 `core` 应该拥有：

- intent 类型
- intent output 类型
- intent compile handler
- domain compile context
- op builder / planner
- reducer / normalize / schema / reconcile

也就是说，`core` 对 whiteboard mutation 的职责应该覆盖：

- `intent -> ops`
- `ops -> next doc`

而 `engine` 不应该再持有白板专用 compile 逻辑。

## 2. `whiteboard-engine` 只负责 runtime composition

最终 `engine` 只保留：

- `createEngine`
- `createWhiteboardMutationSpec`
- publish reduction
- history policy
- engine contract

也就是说：

- `engine` 是 runtime adapter
- `core` 是 domain adapter

## 3. 术语统一为 `intent`

既然已经迁移到 `MutationEngineSpec` / `MutationEngine`，内部术语就不该继续摇摆在：

- command
- compile command
- build command op

最终统一为：

- public write input: `intent`
- compile result: `ops`
- pure domain helper: `op builder` / `op planner`

`commands.ts` 这种命名建议整体删除。

## 建议的最终结构

## A. `core` 新增统一 intent 模块

建议新增：

```ts
whiteboard-core/src/intent/types.ts
whiteboard-core/src/intent/handlers.ts
whiteboard-core/src/intent/compile.ts
whiteboard-core/src/intent/context.ts
```

职责：

- `types.ts`
  - 唯一 source of truth 的 `WhiteboardIntentTable`
  - `WhiteboardIntent`
  - `WhiteboardIntentKind`
  - `WhiteboardIntentOutput`
- `handlers.ts`
  - 每个 intent kind 对应一个 handler
- `compile.ts`
  - 基于 `@shared/mutation.compile(...)` 跑 typed handler map
- `context.ts`
  - whiteboard domain compile ctx

这样做之后：

- `whiteboard-engine/src/types/intent.ts` 可以整体删除
- `whiteboard-engine/src/mutation/compile/index.ts` 可以整体删除
- `whiteboard-engine/src/mutation/compile/tx.ts` 可以整体删除

## B. domain op builder 统一收敛到 `core`

建议按 domain 收敛为：

```ts
whiteboard-core/src/document/ops.ts
whiteboard-core/src/canvas/ops.ts
whiteboard-core/src/node/ops.ts
whiteboard-core/src/edge/ops.ts
whiteboard-core/src/group/ops.ts
whiteboard-core/src/mindmap/ops.ts
```

命名规则：

- 返回单个 op：`createXxxOp`
- 返回多个 op：`createXxxOps`
- 有校验/规划语义：`planXxxOps`

不要再出现：

- `buildCreate`
- `buildAlign`
- `buildDistribute`
- `commands.ts`

因为这些名字来自旧 command layer。

## C. `engine` 只拼 spec

最终 `engine` 里保留：

- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/spec.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/spec.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/publish.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/publish.ts)
- [whiteboard/packages/whiteboard-engine/src/mutation/apply.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/apply.ts)

其中：

- `spec.ts` 负责：
  - `compile` 委托给 `core`
  - `apply` 委托给 `reduceOperations`
  - `publish` 委托给 publish reducer
  - `history` 配置
- `runtime/engine.ts` 负责：
  - new `MutationEngine`
  - 包装 subscribe/current/execute/apply

除此之外不再保留任何 whiteboard-specific compile 文件。

## 具体可重构点

## 1. 删掉 `whiteboard-engine/src/types/intent.ts` 的双层定义

当前问题：

- union 一份
- table 一份

建议最终改为：

```ts
export interface WhiteboardIntentTable {
  'node.create': {
    intent: { ... }
    output: { nodeId: NodeId }
  }
  ...
}

export type WhiteboardIntentKind = keyof WhiteboardIntentTable & string
export type WhiteboardIntent<K extends WhiteboardIntentKind = WhiteboardIntentKind> =
  WhiteboardIntentTable[K]['intent']
export type WhiteboardIntentOutput<K extends WhiteboardIntentKind = WhiteboardIntentKind> =
  WhiteboardIntentTable[K]['output']
```

如果需要按 domain 聚合，可以从 table 派生，不再手写第二套 union。

### 结果

- intent 结构只有一份定义
- output typing 和 handler typing 直接挂 table
- 新增 intent 时不会漏同步

## 2. 删掉字符串前缀 dispatch

当前问题：

- `startsWith('node.')`
- `startsWith('edge.')`
- `as NodeIntent`
- `as EdgeIntent`

建议最终改为：

```ts
const handlers: {
  [K in WhiteboardIntentKind]:
    (intent: WhiteboardIntent<K>, ctx: WhiteboardCompileContext) => WhiteboardIntentOutput<K> | void
} = {
  'node.create': ...,
  'node.update': ...,
  ...
}
```

然后 compile 直接：

```ts
return handlers[intent.type](intent as never, ctx)
```

更进一步，如果 table 和 handlers 放一起，连 `as never` 都可以消掉。

### 结果

- 不再依赖命名约定分发
- handler registry 成为显式结构
- compile surface 更清晰

## 3. `node/commands.ts` 和 `edge/commands.ts` 改名并重组

当前：

- [whiteboard/packages/whiteboard-core/src/node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/commands.ts)
- [whiteboard/packages/whiteboard-core/src/edge/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/edge/commands.ts)

这些文件现在本质上不是 command，而是：

- validate input
- normalize defaults
- create operations
- create patches

建议最终改为：

- `node/ops.ts`
- `edge/ops.ts`

并把 API 改成：

```ts
node.op.create(...)
node.op.align(...)
node.op.distribute(...)

edge.op.create(...)
edge.op.route.insert(...)
edge.op.route.move(...)
edge.op.route.remove(...)
```

不要再保留：

```ts
node.command.buildCreate
edge.command.buildCreate
```

### 结果

- 名称与职责一致
- “command layer” 残影消失
- `core` namespace 更符合当前架构

## 4. `canvas` / `group` 排序与 delete/duplicate/move 规划迁回 `core`

当前：

- `createCanvasOrderMoveOps` 在 engine compile 里
- `group.order.move` 和 `canvas.order.move` 各自做了一遍相似逻辑
- selection move 的 node/edge fanout 也在 engine compile

建议最终迁到：

- `whiteboard-core/src/canvas/ops.ts`
- `whiteboard-core/src/group/ops.ts`

至少以下函数应该进入 `core`：

- `createCanvasOrderMoveOps`
- canvas delete planner
- canvas duplicate planner
- canvas selection move planner
- group merge / ungroup planner
- group order planner

### 原因

这些规则都是纯 document domain 规则，不是 engine runtime 规则。

### 结果

- `compile/canvas.ts` 和 `compile/group.ts` 可以整体删除
- group/canvas 的顺序规则只保留一份

## 5. mindmap compile 逻辑大部分迁回 `core`

当前：

- `mindmap.query.ts` 在 core
- `mindmap.mutate.ts` 在 core
- 但 `compile/mindmap.ts` 仍然在 engine，且 400+ 行

这说明边界还没收干净。

建议最终迁移：

- topic update op emit
- branch update op emit
- create mindmap ops
- subtree clone / move / delete / collapse ops

统一进入：

- `whiteboard-core/src/mindmap/ops.ts`

同时把 `mindmap/query.ts` 改名为更明确的 tree/read 模块，例如：

- `mindmap/tree.ts`
- `mindmap/read.ts`

`mindmap/mutate.ts` 可改为：

- `mindmap/treeMutate.ts`

### 结果

- mindmap 语义不再在 core / engine 之间切裂
- `compile/mindmap.ts` 可以删除

## 6. node / edge 的 aggregate-owned 规则迁回 `core`

现在 `node.ts` compile 里有很强的领域规则：

- mindmap member 不能直接改 owner/group
- root 才能改 position
- topic update 要编译成 `mindmap.topic.*` operations

这些规则本质上属于：

- node ownership semantics
- aggregate boundary semantics

不属于 `engine`。

建议最终在 `core` 增加：

- `node/intent.ts` 或 `node/ops.ts`
- `edge/intent.ts` 或 `edge/ops.ts`

专门处理：

- 普通 node / edge update
- aggregate-owned node / edge update
- route/label/connect/reconnect 规划

### 结果

- `compile/node.ts`、`compile/edge.ts` 大幅缩小或删除
- owner 相关规则回到 domain layer

## 7. `document/query.ts` 改名为 `document/read.ts`

当前：

- [whiteboard/packages/whiteboard-core/src/document/query.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/document/query.ts)

里面并不是复杂 query，而是：

- `getNode`
- `hasNode`
- `listNodes`
- `listGroupNodeIds`

建议最终改名为：

- `document/read.ts`

并保持它只是 raw document read helper。

这样可以和 editor-graph 的 query authority 形成清晰区分：

- `core/document/read.ts` 是 raw document helper
- `editor-graph/query` 是 runtime read model

## 8. history policy 收成一处

当前 history 规则一部分在 `spec.ts`，一部分在 `runtime/engine.ts`。

建议最终只有一处 policy source：

- 要么 `spec.history` 完整描述
- 要么抽成 `createEngineHistoryPolicy(...)`

`runtime/engine.ts` 不再自己判断 origin 和 checkpoint clear。

### 结果

- runtime 继续变薄
- spec 真正成为唯一 policy 入口

## 推荐的最终 API 命名

## Core

```ts
core.intent.types
core.intent.compile

document.read.*
document.slice.*
document.op.*

canvas.op.*
group.op.*
node.op.*
edge.op.*
mindmap.op.*
mindmap.tree.*
mindmap.layout.*
mindmap.render.*
```

## Engine

```ts
createWhiteboardMutationSpec(...)
createEngine(...)

engine.execute(intent)
engine.apply(ops)
```

注意：

- `execute` 参数建议内部和文档统一叫 `intent`
- 不再继续把它叫 command

## 建议删除的旧概念

下面这些建议直接删除，不要保留别名：

- `commands.ts`
- `command.buildCreate`
- `buildAlign`
- `buildDistribute`
- compile 层的字符串前缀 dispatch
- engine 私有的 domain compile helpers
- engine 私有的 canvas/group 排序规划
- engine 私有的 mindmap topic / branch emit helper

## 推荐实施顺序

## 阶段 1. 先统一类型 source of truth

先做：

- 把 `intent` 类型和 `intent table` 收敛成一份定义
- 最好迁到 `whiteboard-core`

这是后续所有 compile 重构的前提。

## 阶段 2. 把 compile handler registry 显式化

再做：

- 删除 `startsWith(...)` 分发
- 建立 typed handler map

先不搬逻辑，也能立刻让结构变清楚。

## 阶段 3. 把 domain compile 逻辑从 engine 迁回 core

按顺序迁：

1. canvas/group
2. node/edge
3. mindmap

迁完之后删除 `whiteboard-engine/src/mutation/compile/*.ts` 旧文件。

## 阶段 4. 改名与 namespace 清理

统一改：

- `commands.ts -> ops.ts`
- `document/query.ts -> document/read.ts`
- `mindmap/query.ts -> mindmap/tree.ts` 或 `mindmap/read.ts`

并同步修改 `index.ts` 导出名。

## 阶段 5. 收薄 engine

最后收掉：

- runtime 内重复 history policy
- engine 内多余类型转发
- compile tx 私有 adapter

让 `engine` 只剩 spec/runtime/publish。

## 最终判断

这轮重构是值得做的，而且现在做是最划算的。

原因不是“代码风格更漂亮”，而是当前结构仍然有明显的历史阶段混合：

- 新 runtime 已经是 `MutationEngine`
- 但 domain compile 还停留在旧 engine 专属层
- `core` 已经有大量真正的 op builder / domain helper
- 只是没有被提升为唯一 authority

如果按最终形态收敛，最应该做的是：

1. `intent` 类型只保留一份 source of truth。
2. compile 从“按前缀分发的大文件”改成“typed handler registry”。
3. domain compile 逻辑整体迁回 `whiteboard-core`。
4. `whiteboard-engine` 缩成真正的 runtime adapter。

这样改完以后，`whiteboard-engine` 和 `whiteboard-core` 的边界会比现在清楚很多，而且 compile commands 这层历史遗留会基本消失。

## 附：如果允许顺手改 `shared/mutation`

如果这轮不限制只改 whiteboard，还可以继续顺手做两个上游收敛：

### 1. 让 compile 支持显式 fail，而不是抛异常哨兵

当前 `compile/index.ts` + `compile/tx.ts` 里有 throw / catch 包装。

如果 `@shared/mutation.compile(...)` 允许 handler 直接返回 failure / blocked 结果，那么：

- `createCompilerTx`
- `isCompilerFailure`
- try/catch 包装

都可以进一步删掉。

### 2. 让 history clear policy 进入 `MutationEngineSpec`

如果 `MutationEngineSpec.history` 支持：

- `track(write)`
- `clear(write)`

那么 `runtime/engine.ts` 里的额外订阅和清空逻辑也能消失。

这不是 whiteboard 必需项，但如果要做到“长期最优”，这是顺手值得做的两刀。
