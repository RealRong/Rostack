# Whiteboard Command 分层与 Edge Move 最终重构方案

## 1. 目标

这一轮要解决的问题不是单独补一个 `edge.moveMany`，而是把整条 command 线的抽象层级彻底拉齐。

当前最大问题是：

- `node` 侧大量 API 是“意图命令”
- `edge` 侧部分 API 是“意图命令”，部分又直接暴露成“patch 提交”
- interaction session 在提交时有时调用高层命令，有时直接调用 patch writer

这导致：

- API 看起来不对称
- 代码读起来有“半中轴、半透传”的别扭感
- 后续新增批量 edge 行为时，很难判断应加命令还是直接塞 patch

目标是把这条线重构成清晰的三层：

1. `intent command`
   表达稳定、可复用、用户可理解的操作语义。
2. `patch writer`
   表达“我已经算出了最终 patch，请帮我提交”。
3. `interaction solver commit`
   表达交互求解器的最终输出，决定应该走 intent command 还是 patch writer。

---

## 2. 当前现状

## 2.1 Node 侧

当前 `node` 侧是比较清晰的。

入口见：

- [types/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/commands.ts)
- [command/node/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/command/node/types.ts)
- [command/node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/command/node/commands.ts)

有两类清楚的 API：

- 意图命令
  - `node.move({ ids, delta })`
  - `node.align(ids, mode)`
  - `node.distribute(ids, mode)`
- patch writer
  - `node.update(id, update)`
  - `node.updateMany(updates, options?)`

这里的分层是对的：

- “整体平移一组 node”是稳定意图
- “提交一批字段 patch”是低层写接口

## 2.2 Edge 侧

入口见：

- [types/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/commands.ts)
- [command/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/command/edge.ts)

改造前 edge 侧是：

- 意图命令
  - `edge.move({ ids, delta })` 改造前是单条 `edge.move(edgeId, delta)`
  - `edge.reconnect(edgeId, end, target)`
  - `edge.route.insert/move/remove/clear`
- patch writer
  - `edge.update(id, patch)`
  - `edge.updateMany(updates)`
  - `edge.patch(edgeIds, patch)`

问题有两个：

1. `edge.move` 还是单条 edge 版本，不对称于 `node.move({ ids, delta })`
2. `edge.patch(edgeIds, patch)` 和 `edge.updateMany(updates)` 都在写 patch，但抽象边界不够清楚

## 2.3 Interaction 提交层

### 单条 edge 拖拽

见 [input/edge/move/session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/edge/move/session.ts)

现在它的提交应该是：

```ts
ctx.command.edge.move({
  ids: [commit.edgeId],
  delta: commit.delta
})
```

这说明：

- 单边整体拖动目前有明确“纯位移”语义

### selection move

见 [input/selection/move/session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/selection/move/session.ts)

提交是：

```ts
if (commit.delta) {
  ctx.command.node.move({
    ids: state.move.rootIds,
    delta: commit.delta
  })
}

if (commit.edges.length > 0) {
  ctx.command.edge.updateMany(commit.edges)
}
```

这里别扭的根因不是“少一个 `edge.move`”，而是：

- `node` 提交的是“意图命令”
- `edge` 提交的是“求解后的最终 patch”

二者抽象层级不同。

但这并不代表 `selection move` 错了。相反，它暴露了一个更真实的事实：

**selection move 的 edge 更新并不总是“纯平移”。**

它可能是：

1. 两端都跟着选区移动，等价于整体平移
2. 一端跟着移动，另一端不动，本质是 endpoint 重算
3. route / source / target 同时变化，本质是复合 patch

所以 `selection move` 交互求解器输出 `commit.edges[]` patch 是合理的。

---

## 3. 核心判断

## 3.1 `edge.move` 应该批量化

是的。

`edge.move` 的最终 API 应该与 `node.move` 对齐：

```ts
edge.move({
  ids: readonly EdgeId[],
  delta: Point
})
```

原因：

- 语义清晰：这是“纯平移”
- 与 `node.move` 对齐
- 单条 edge 也可自然写成 `ids: [edgeId]`
- 避免再引入 `edge.moveMany` 这种额外命名层

不建议长期保留：

```ts
edge.move(edgeId, delta)
edge.moveMany({ ids, delta })
```

因为这会让 node/edge 中轴再次分裂成两套风格。

## 3.2 `edge.move` 不应该吞掉 `edge.updateMany`

即使把 `edge.move` 改成批量版，也不应该拿它替代所有 edge 几何提交。

原因：

- `edge.move` 表达的是“纯平移”
- `edge.updateMany` 表达的是“我已经算好了最终 patch”

这两者都是必要的。

## 3.3 `selection move` 仍然应该允许直接提交 edge patch

`selection move` 是 interaction solver。

它的本质不是“调用一个单一意图命令”，而是：

- 先求解 node root 如何移动
- 再求解相关 edge 应该如何变化
- 再把求解结果提交

因此：

- `node` 这边如果求出来的是统一 `delta`，可以用 `node.move`
- `edge` 这边如果求出来的是 `patch[]`，就应该继续用 `edge.updateMany`

这不是妥协，而是正确分层。

---

## 4. 最终分层模型

## 4.1 Intent Command 层

这层只放稳定、可复用、可命名的语义动作。

### Node

```ts
node.create(payload)
node.move({ ids, delta })
node.align(ids, mode)
node.distribute(ids, mode)
node.delete(ids)
node.duplicate(ids)
```

### Edge

```ts
edge.create(payload)
edge.move({ ids, delta })
edge.reconnect(edgeId, end, target)
edge.delete(ids)
edge.route.insert(edgeId, point)
edge.route.move(edgeId, index, point)
edge.route.remove(edgeId, index)
edge.route.clear(edgeId)
```

约束：

- `edge.move` 只表达纯平移
- 不承担 reconnect
- 不承担复杂 route/source/target patch 合并

## 4.2 Patch Writer 层

这层只做“提交我已经算好的 patch”，不承担高层语义解释。

### Node

```ts
node.update(id, update)
node.updateMany(updates, options?)
```

### Edge

```ts
edge.update(id, patch)
edge.updateMany(updates)
```

### 关于 `edge.patch(edgeIds, patch)`

长期最优建议：

- 保留，但明确把它归为“批量同构 patch helper”
- 它本质仍然属于 patch writer 辅助接口

即：

```ts
edge.patch(edgeIds, patch)
```

语义不是高层 command，而是：

`把同一个 patch 施加到一组 edge`

它适合：

- toolbar style 改色
- 批量 marker 修改
- 批量 width / dash / textMode 修改

不适合：

- 复杂几何交互提交

## 4.3 Interaction Solver Commit 层

这层是最关键的。

它的职责是：

- 读取交互状态
- 求解最终几何结果
- 决定交给 intent command 还是 patch writer

### 典型规则

#### 单条 edge 本体拖动

如果求解结果是：

```ts
{ ids, delta }
```

就走：

```ts
edge.move({ ids, delta })
```

#### selection move

如果 node 求解结果是统一 delta：

```ts
node.move({ ids, delta })
```

如果 edge 求解结果是逐条 patch：

```ts
edge.updateMany(updates)
```

#### transform / text resize / route edit

这类通常直接输出 patch，就继续走 updateMany。

---

## 5. 最终 API 设计

## 5.1 Editor Types

最终建议把 [types/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/commands.ts) 调整为：

```ts
export type EdgeApi = {
  create: (payload: EdgeInput) => CommandResult<{ edgeId: EdgeId }>
  patch: (
    edgeIds: readonly EdgeId[],
    patch: EdgePatch
  ) => CommandResult | undefined
  move: (input: {
    ids: readonly EdgeId[]
    delta: Point
  }) => CommandResult
  reconnect: (
    edgeId: EdgeId,
    end: 'source' | 'target',
    target: EdgeEnd
  ) => CommandResult
  remove: (ids: EdgeId[]) => CommandResult
  ...
}
```

## 5.2 Editor Command Runtime

最终建议把 [command/edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/command/edge.ts) 收敛成：

```ts
export type EdgeCommands = {
  create: EdgeApi['create']
  move: EdgeApi['move']
  reconnect: EdgeApi['reconnect']

  update: (id: EdgeId, patch: EdgePatch) => CommandResult
  updateMany: (updates: readonly { id: EdgeId; patch: EdgePatch }[]) => CommandResult
  patch: (edgeIds: readonly EdgeId[], patch: EdgePatch) => CommandResult | undefined

  delete: (ids: EdgeId[]) => CommandResult
  route: ...
  label: ...
  style: ...
  type: ...
  lock: ...
  textMode: ...
}
```

并明确分类：

- `move / reconnect / route.* / delete` 是 intent command
- `update / updateMany / patch` 是 patch writer/helper

## 5.3 Engine Command

最终建议把 engine command 也统一成批量形式。

当前 [types/command.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/command.ts) 里是：

```ts
{
  type: 'edge.move'
  edgeId: EdgeId
  delta: Point
}
```

建议改为：

```ts
{
  type: 'edge.move'
  ids: readonly EdgeId[]
  delta: Point
}
```

这样和：

```ts
{
  type: 'node.move'
  ids: readonly NodeId[]
  delta: Point
}
```

完全对齐。

---

## 6. Interaction 提交准则

为了避免未来继续混乱，interaction 提交层应遵守下面的统一准则。

## 6.1 准则一

**如果最终结果能自然表达为一个稳定意图，就走 intent command。**

例如：

- 批量 node 平移
- 批量 edge 平移
- edge reconnect
- route point move

## 6.2 准则二

**如果最终结果本质是求解器算出的逐对象 patch，就走 updateMany。**

例如：

- selection move 中的 edge 跟随
- transform 期间的批量 node geometry 提交
- 某些复合 geometry 修正

## 6.3 准则三

**不要为了 API 对称而强行把 solver patch 降级成伪意图命令。**

错误示例：

- selection move 明明求出来的是每条 edge 的不同 patch，却硬改成 `edge.move({ ids, delta })`

这会丢失真正语义，并把后续复杂情况藏进 `edge.move` 内部，反而更糟。

---

## 7. 对 `selection move` 的最终判断

当前这段：

```ts
if (commit.delta) {
  ctx.command.node.move({
    ids: state.move.rootIds,
    delta: commit.delta
  })
}

if (commit.edges.length > 0) {
  ctx.command.edge.updateMany(commit.edges)
}
```

语义上并不错误。

它的问题只在于：

- `edge.move` 目前没有批量版
- command 分层没有被正式命名

长期最优不是把这段强行改成“所有东西都用 move”，而是：

1. 正式确立 command 分层
2. 把 `edge.move` 改成批量版
3. 保留 `edge.updateMany` 作为 solver commit 目标

所以最终它仍然可能长这样：

```ts
if (commit.delta) {
  ctx.command.node.move({
    ids: state.move.rootIds,
    delta: commit.delta
  })
}

if (commit.edges.length > 0) {
  ctx.command.edge.updateMany(commit.edges)
}
```

这不是“不对齐”，而是“interaction solver 正确选择了 patch writer”。

---

## 8. 最终命名原则

为了长期保持清晰，建议统一采用下面的命名原则：

### Intent

- `create`
- `move`
- `reconnect`
- `delete`
- `align`
- `distribute`

### Writer

- `update`
- `updateMany`
- `patch`

其中：

- `update / updateMany` = 逐对象 patch writer
- `patch(ids, patch)` = 同构 patch helper

这两个名字要在文档和代码里明确分工，避免都被当成“通用命令”。

---

## 9. 实施方案

## 阶段 1

统一 editor API：

1. 把 `EdgeApi.move` 改为批量输入
2. 把 `EdgeCommands.move` 改为批量输入
3. 调整 [input/edge/move/session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/edge/move/session.ts) 走：

```ts
ctx.command.edge.move({
  ids: [commit.edgeId],
  delta: commit.delta
})
```

## 阶段 2

统一 engine command：

1. 把 engine `edge.move` command 改为 `ids + delta`
2. 调整 translate plan 以批量方式生成 edge move operations

## 阶段 3

文档化 command 分层：

1. 在 editor types 中明确注释哪类是 intent，哪类是 writer
2. 在 interaction 层统一遵循“意图优先，patch 次之”的提交准则

## 阶段 4

收口 helper：

1. 保留 `edge.patch(ids, patch)`，但在实现和注释里明确它是 helper，不是高层 intent
2. 避免未来再引入 `edge.moveMany` 这类重复别名

---

## 10. 最终结论

长期最优方案不是把所有 interaction 提交都包装成同一种 command，而是正式确立三层：

- `intent command`
- `patch writer`
- `interaction solver commit`

在这个模型下：

- `edge.move` 应该升级为批量、并与 `node.move` 对齐
- `edge.updateMany` 必须继续保留
- `selection move` 继续允许直接提交 edge patch

最终原则可以压缩成一句话：

**`move` 表达纯平移意图，`updateMany` 表达求解后的最终 patch；API 应对齐，但语义不能强行合并。**
