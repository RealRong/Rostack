# `whiteboard-editor` generator command 最终重构方案

## 1. 最终结论

`whiteboard-editor` 的长期最优命令模型，统一收敛为 generator command。

最终形态只接受下面这类命令：

```ts
const command = function* (ctx) {
  const result = ctx.write(...)
  const published = yield ctx.publish()
  ctx.preview.set(buildFrom(published.graph))
  return result
}
```

这不是语法偏好，而是最终的系统边界：

- public editor entry 不再手工 `flush`
- public editor entry 不再靠 wrapper 递归包事务
- action 不再碰 publication lifecycle API
- 需要 fresh published graph 的命令步骤，必须显式写成 `yield ctx.publish()`
- 需要跨时间继续执行的逻辑，必须显式写成 command continuation

整个 editor 只保留三层：

1. `ProjectionController`
2. `EditorCommandRunner`
3. pure read graph / pure published snapshot

其中：

- `ProjectionController` 只负责发布
- `EditorCommandRunner` 只负责执行 generator command
- `read graph` 只负责纯读

这就是最终方案，不保留别的命令模型，不保留双轨。

---

## 2. 最终架构

### 2.1 `ProjectionController`

`ProjectionController` 只负责图上状态发布。

最终职责：

- `mark(delta)`
- `flush()`
- `current()`
- `subscribe()`
- `dispose()`

它不再负责：

- `run(fn)`
- public action boundary
- 事务包装
- command 生命周期

换句话说，`ProjectionController` 是 publish engine，不是 command runtime。

### 2.2 `EditorCommandRunner`

`EditorCommandRunner` 是所有同步 editor public API 的唯一入口。

它负责：

- 执行 generator command
- 在 `yield ctx.publish()` 时推进一次 publish
- 把 publish 结果恢复回 generator
- 在命令结束前补最后一次必要发布
- 生成 continuation task

它不负责：

- 图计算本身
- projection delta 合成
- read graph 查询

### 2.3 Published Read Graph

graph / scene / node / edge / mindmap 的读取层保持纯读。

也就是说：

- `read/get/subscribe` 绝不触发 publish
- 所有 published graph 都来自 `ProjectionController.current()`
- command 内如果要拿最新 graph，只能通过 `yield ctx.publish()`

---

## 3. 最终命令协议

### 3.1 核心命令类型

最终统一命令类型：

```ts
export type EditorCommand<T = void> = Generator<
  EditorCommandSignal,
  T,
  EditorPublished
>
```

其中：

```ts
export type EditorCommandSignal =
  | EditorPublishRequest
  | EditorTaskRequest
```

### 3.2 `publish` 指令

`publish` 是命令协议中的一等步骤。

```ts
export type EditorPublishRequest = {
  kind: 'publish'
}
```

命令里这样写：

```ts
const published = yield ctx.publish()
```

这里的含义非常明确：

1. 命令先执行到这里
2. runner 调用 `ProjectionController.flush()`
3. runner 读取当前已发布快照
4. runner 把 `published` 恢复给 generator
5. 命令继续执行

这一步不是 callback，不是 hook，不是旁路 API，而是命令本体的显式阶段。

### 3.3 `published` 恢复值

`yield ctx.publish()` 恢复的不是 store，不是订阅器，而是一份纯 published 只读对象：

```ts
export interface EditorPublished {
  revision: number
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}
```

命令在 publish 之后只依赖这份数据，不再通过 store 去猜当前是否已发布。

### 3.4 任务指令

如果命令需要跨时间继续，不暴露一个通用 `scheduleTask(fn)`，而是继续走命令协议：

```ts
export type EditorTaskRequest = {
  kind: 'task'
  lane: 'microtask' | 'frame' | 'delay'
  delayMs?: number
  command: EditorCommand<void>
}
```

命令里只允许这样表达续跑：

```ts
yield ctx.task.delay(220, function* () {
  ctx.preview.clearEnter(id)
})
```

或者：

```ts
yield ctx.task.frame(function* () {
  ctx.animation.tick()
  const published = yield ctx.publish()
  if (published.graph.owners.mindmaps.byId.has(id)) {
    yield ctx.task.frame(/* next tick */)
  }
})
```

所以 editor 层如果需要任务机制，最终也必须服从 command 协议，而不是变成全局自由调度器。

---

## 4. `EditorCommandContext` 最终形态

命令上下文必须是“可写侧上下文 + 明确指令构造器”，而不是 runtime 杂糅对象。

建议收敛为：

```ts
export interface EditorCommandContext {
  document: {
    read: DocumentCommandRead
    write: DocumentCommandWrite
  }
  session: {
    read: SessionCommandRead
    mutate: SessionCommandMutate
  }
  preview: PreviewCommandMutate
  layout: LayoutCommandApi
  publish(): EditorPublishRequest
  task: {
    microtask(command: EditorCommand<void>): EditorTaskRequest
    frame(command: EditorCommand<void>): EditorTaskRequest
    delay(ms: number, command: EditorCommand<void>): EditorTaskRequest
  }
}
```

几个硬约束：

- `ctx.publish()` 只返回 signal，不直接做事
- `ctx.task.*()` 只返回 signal，不直接调度
- 实际执行权只在 runner
- 命令体内不允许直接碰 controller

---

## 5. `EditorCommandRunner` 执行语义

### 5.1 单条命令执行流程

runner 执行一条命令时，遵循下面固定流程：

1. 创建 generator iterator
2. 以 `undefined` 启动命令
3. 命令跑到下一个 `yield` 或 `return`
4. 如果遇到 `publish`：
   - 调用 `controller.flush()`
   - 读取 `controller.current()`
   - 构造 `EditorPublished`
   - 用它恢复 generator
5. 如果遇到 `task`：
   - 把 continuation 交给 task runtime
   - 当前命令结束
6. 如果命令 `return`：
   - 如果还有未发布变更，runner 再统一 `flush()` 一次
   - 返回结果

### 5.2 自动尾部发布

命令结束时，runner 必须自动补最后一次必要发布。

原因很简单：

- 很多命令只改 session / preview / document
- 它们不一定显式 `yield ctx.publish()`
- 但 public API 返回前，projection 仍然必须是最新

所以最终规则是：

- mid-command 需要 fresh graph 时，用 `yield ctx.publish()`
- command return 前的一致性，由 runner 自动补最后一次 publish

### 5.3 generator 内组合

命令之间的内部复用统一用 `yield*`，不用 public action 相互调用。

例如：

```ts
function* insertMindmapTopic(ctx, input) {
  const result = ctx.document.write.mindmap.insert(input)
  if (!result.ok) {
    return result
  }

  const published = yield ctx.publish()
  const preview = buildEnterPreview(published.graph, result.data.nodeId)
  if (preview) {
    ctx.preview.appendEnter(preview)
  }

  return result
}

function* insertAndFocusMindmapTopic(ctx, input) {
  const result = yield* insertMindmapTopic(ctx, input)
  if (result.ok) {
    ctx.session.mutate.selection.replace({
      nodeIds: [result.data.nodeId]
    })
  }
  return result
}
```

最终原则：

- public API 只绑定最外层 command
- 内部复用只用 `yield*`
- 不允许 public action 调另一个 public action

---

## 6. Public API 最终构造方式

### 6.1 不再使用 `wrapBoundary`

最终不允许：

- 运行时递归包装 action 对象
- 通过 wrapper 猜哪些函数是 public boundary

public API 必须在构造时显式绑定到 runner：

```ts
const actions = {
  edit: {
    input: runner.bind(commands.edit.input),
    commit: runner.bind(commands.edit.commit)
  },
  mindmap: {
    insertRelative: runner.bind(commands.mindmap.insertRelative)
  }
}
```

input 同理：

```ts
const input = {
  pointerDown: runner.bind(hostCommands.pointerDown),
  pointerMove: runner.bind(hostCommands.pointerMove),
  pointerUp: runner.bind(hostCommands.pointerUp)
}
```

这样边界是显式的、稳定的、可审计的。

### 6.2 简单命令也统一 generator

即使是简单命令，也统一 generator 形式：

```ts
function* setTool(ctx, tool) {
  ctx.session.mutate.tool.set(tool)
}
```

这样整个系统只有一种 public 命令模型，不会出现：

- 一部分是同步函数
- 一部分是 generator
- 一部分还要额外包 runtime

---

## 7. 哪些逻辑该写成 `yield ctx.publish()`

只有一种情况需要 mid-command publish：

> 当前命令后半段，必须依赖 fresh published graph 才能继续。

典型例子：

- mindmap insert 后，基于最新 tree layout 生成 enter preview
- 某些命令先写 document，再基于最新 graph 计算 selection chrome / anchor / route

不属于这一类的逻辑，不要写 `yield ctx.publish()`。

例如：

- 文本编辑 draft measure
- 普通 selection 改动
- tool 切换
- 只改 session 的交互状态

这些都应由命令结束时的自动尾部发布解决。

---

## 8. 文本编辑与同步布局的一致性

文本编辑是这套模型必须重点保证的硬场景。

最终要求：

- `editor.actions.edit.input(...)` 是 generator command
- 文本输入期间的 `layout.draft.node` 仍然是同步读取
- draft measure 不走异步 task
- draft measure 不注册成 projection source 订阅链
- 这条命令返回前，最新 draft graph 必须已经发布

也就是说，文本编辑命令只需要：

```ts
function* editInput(ctx, text) {
  ctx.session.mutate.edit.input(text)
}
```

然后由 runner 在命令 return 前自动尾部 publish。

如果命令中间根本不需要 fresh published graph，就不要 `yield ctx.publish()`。

---

## 9. 跨时间逻辑的最终做法

跨时间逻辑也必须服从 command 协议。

### 9.1 enter preview 移除

最终写法：

```ts
function* insertTopic(ctx, input) {
  const result = ctx.document.write.mindmap.insert(input)
  if (!result.ok) {
    return result
  }

  const published = yield ctx.publish()
  const preview = buildEnterPreview(published.graph, result.data.nodeId)
  if (preview) {
    ctx.preview.appendEnter(preview)
    yield ctx.task.delay(preview.durationMs + 34, function* () {
      ctx.preview.removeEnter(preview)
    })
  }

  return result
}
```

### 9.2 animation tick

最终写法也是 command continuation：

```ts
function* tickMindmapEnter(ctx, id) {
  ctx.session.mutate.animation.tick(id)
  const published = yield ctx.publish()

  if (isMindmapEnterActive(published.graph, id)) {
    yield ctx.task.frame(function* () {
      yield* tickMindmapEnter(ctx, id)
    })
  }
}
```

这样跨时间逻辑仍然是 command，不会掉出同一套一致性模型。

---

## 10. 代码组织的最终形态

建议最终落成下面这组文件边界：

```txt
whiteboard/packages/whiteboard-editor/src/
  command/
    contracts.ts
    context.ts
    runner.ts
    task.ts
    actions/
      app.ts
      tool.ts
      edit.ts
      selection.ts
      node.ts
      edge.ts
      mindmap.ts
    input/
      pointer.ts
      keyboard.ts
      viewport.ts
  projection/
    controller.ts
    input.ts
    sources.ts
```

其中：

- `command/contracts.ts` 定义 `EditorCommand`
- `command/context.ts` 定义 `EditorCommandContext`
- `command/runner.ts` 解释 generator signal
- `command/task.ts` 负责 `microtask/frame/delay`
- `command/actions/*` 只写 generator command
- `command/input/*` 只写 generator input command
- `projection/controller.ts` 只负责发布，不再有 `run`

---

## 11. 从当前状态重构到最终状态

下面的顺序必须一次到位，不留兼容，不保留双轨。

### 第一步

引入正式命令协议：

- `EditorCommand<T>`
- `EditorCommandSignal`
- `EditorPublished`
- `EditorCommandContext`

并在 `whiteboard-editor/src/command/` 下落好 contracts / runner / task 的骨架。

### 第二步

把 `ProjectionController` 收口成纯 publish controller：

- 删除 `run`
- 保留 `mark / flush / current / subscribe`
- 删除 editor public boundary 职责

### 第三步

把 `createEditor` 的 public API 改成显式 runner 绑定：

- `actions.* = runner.bind(...)`
- `input.* = runner.bind(...)`

这一阶段必须删除：

- `wrapBoundary`
- 任何运行时递归包装 public API 的逻辑

### 第四步

把现有 action 全部迁成 generator command。

迁移策略：

1. 先迁不需要 mid-command publish 的简单命令
2. 再迁需要 fresh graph 的命令
3. 最后迁 input command

这一阶段禁止保留：

- 裸同步 action
- action 里直接 `controller.flush()`
- action 里直接感知 publish lifecycle

### 第五步

把所有“写后立刻依赖最新 graph”的逻辑改成显式 `yield ctx.publish()`。

尤其包括：

- mindmap insert / insertRelative
- 任何 write 后还要读最新 graph layout / route / anchor 的命令

最终动作必须从：

```ts
const result = write(...)
publish.flush()
const graph = projection.read(...)
```

收敛成：

```ts
const result = ctx.write(...)
const published = yield ctx.publish()
const graph = published.graph
```

### 第六步

把 `setTimeout` / `raf` / 延迟清理全部改成 command continuation task：

- `ctx.task.microtask(...)`
- `ctx.task.frame(...)`
- `ctx.task.delay(...)`

这一阶段必须删除：

- action 里裸 `setTimeout`
- animation source 里的业务闭包散落
- 不受 runner 管控的 deferred side effects

### 第七步

把 action 内部复用统一改成 `yield*` 命令组合。

这一阶段必须删除：

- public action 调 public action
- input host 调 public action 再借 action 触发事务

最终内部组合只允许：

- plain helper
- `yield*` subcommand

### 第八步

补齐最终不变式测试，并删除所有过渡实现。

必须新增的测试：

1. 简单命令 return 前 graph 已发布
2. `yield ctx.publish()` 恢复的是 fresh graph
3. 一个命令内可以多次 publish
4. `yield*` 组合不破坏单命令语义
5. delay/frame continuation 作为新命令执行
6. 纯 read 永远不触发发布
7. 文本编辑输入返回前 draft graph 已更新

---

## 12. 必删清单

为了到达最终形态，下面这些东西必须删掉：

- `wrapBoundary`
- action 里的显式 `publish.flush()`
- `ProjectionController.run()`
- 任何 read-time flush
- 任何 action 生命周期 callback 风格 publish hook
- 任何裸 `setTimeout` 业务续跑
- 任何裸 `requestAnimationFrame` 业务续跑
- public action 相互调用形成的隐式事务

---

## 13. 最终不变式

系统最终必须同时满足下面几条硬不变式。

### 13.1 public API 边界显式

所有 public editor entry 都在构造时显式绑定 runner。

### 13.2 publish 是命令协议的一部分

需要 fresh graph 的地方，统一写成 `yield ctx.publish()`。

### 13.3 命令返回前一致

如果命令没有显式 task 跳出，那么 public API 返回前 projection 一定已经稳定发布。

### 13.4 读侧纯净

任何 `read/get/subscribe` 都不能推进发布。

### 13.5 跨时间逻辑仍是 command

任何 frame/delay/microtask 续跑，最终都必须回到 generator command，不允许绕过 runner。

---

## 14. 最终一句话

`whiteboard-editor` 的长期最优命令模型，不是 wrapper，不是 hook，不是手工 flush，而是：

```txt
public entry
  -> EditorCommandRunner
  -> generator command
  -> yield ctx.publish()
  -> ProjectionController.flush()
  -> resume with published graph
  -> return with final publication
```

只要收敛到这个形态，当前所有“边界不清、依赖隐藏、命令中途读 graph 很怪、局部补 flush 很怪”的问题，都会被压回一个清晰、可验证、可组合的统一模型里。
