# Whiteboard Write Closure

本文定义 whiteboard 写入主轴最后一段的长期最优收束方案。

前提固定为：

- `core` reducer / reconcile / footprint 主轴已成立
- `engine` compile -> reduce -> 写入事件主轴已成立
- 剩余复杂度主要收缩在 `editor`

本文不重复已有写入主轴设计，只补“最后没打顺的部分”。

History 相关设计已独立到：

- [`WHITEBOARD_HISTORY_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_HISTORY_API.zh-CN.md)

---

## 1. 固定结论

当前 whiteboard 不再需要新的底层可变 context，也不需要再引入一套新的 orchestrator。

长期最优下只需要完成两件事：

1. 把 editor 中“一次交互拆成多次 write”的提交点收成单次语义提交。
2. 把 editor `write/*` 的职责收紧成“UI 归一化 + 单次 intent dispatch”，不再承担多步语义编排。

一句话：

- `core` 继续是 reducer 真相源
- `engine` 继续是语义提交真相源
- `editor` 只保留交互预览、payload 归一化与一次 intent 提交

---

## 2. 当前剩余问题

### 2.1 selection move 仍然是 editor 侧多步编排

现在一次 selection move 的提交会被拆成多次 write：

- `node.move`
- `edge.move`
- 若干 `edge.update`
- 若干 `edge.route.set`

这会带来四个问题：

- 一次用户意图会产生多条 commit / collab change
- 中途任一步失败，前面的提交不会回滚
- editor 自己在决定最终语义拆分
- 协作日志会看到“半意图”的中间状态

这不是长期可接受的边界。

### 2.2 edge reconnect 仍然是 editor 侧多步编排

现在一次 reconnect 会被拆成：

- `edge.reconnect`
- `edge.type.set`
- `edge.route.clear`

这本质上和 selection move 是同一个问题：

- 最终语义仍在 editor 提交层被分解
- 不是一次原子语义提交

### 2.3 editor 里还残留少量小型 semantic compile

典型例子：

- `node.text.commit`

它在 editor 里承担了：

- 空文本是否删除
- text / size / fontSize / wrapWidth 合并

这还没膨胀成第二状态机，但语义职责不够纯。

这类逻辑长期最优仍应逐步下沉到 engine command compile。

---

## 3. 最终边界

### 3.1 `core`

`core` 不需要再改架构。

继续负责：

- reducer tx
- overlay draft
- inverse snapshot
- dirty / invalidation
- reconcile queue
- footprint collect

`core` 不感知 editor 交互。

### 3.2 `engine`

`engine` 继续是唯一正式语义提交轴。

继续负责：

- command -> operation compile
- reduce
- 产出统一写入结果

新增职责只有一个：

- 吸收 editor 侧仍然残留的“跨实体单次交互提交”语义

也就是：

- editor 不再把一次交互拆成多次 `engine.execute(...)`
- engine command compile 负责把这一次 intent 展开成最终 op batch

### 3.3 `editor`

长期最优下，editor 只做三类事：

1. 交互预览
2. UI payload 归一化
3. 单次 intent 提交

editor 不再做：

- 多次 write 串行提交
- 跨 commit 的最终语义拼装

允许保留在 editor 的逻辑：

- layout patch
- 当前 selection / hover / edit session 读取
- focus / selection / preview / tool session 编排

不允许继续保留在 editor 的逻辑：

- “这次交互最终应该拆成哪几条 commit”
- “先写 A，再写 B，再补 C”

---

## 4. 最终 API

## 4.1 新增 engine command

长期最优下，需要补三类 command。

### 4.1.1 `canvas.selection.move`

```ts
type CanvasCommand =
  | {
      type: 'canvas.selection.move'
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
      delta: Point
    }
```

语义：

- 表示“一次 selection move 提交”
- 不是“只移动 node”
- 不是“只移动 edge”

compiler 负责：

- 移动可提交的 root nodes / top-level nodes / mindmap roots
- 移动选中的独立 edge
- 计算并补齐受影响但未显式选中的 incident edges
- 生成一次完整 op batch

约束：

- 整次 selection move 只能形成一次 commit
- 上游消费者只能看到一条语义 change

### 4.1.2 `edge.reconnect.commit`

```ts
type EdgeCommand =
  | {
      type: 'edge.reconnect.commit'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
      patch?: {
        type?: EdgeType
        route?: EdgeRouteInput
      }
    }
```

语义：

- 表示“一次 reconnect 提交后的最终 edge 状态”

compiler 负责：

- 更新 endpoint
- 按需更新 `type`
- 按需清理或重建 `route`
- 保证整次 reconnect 只有一次 commit

### 4.1.3 `node.text.commit`

```ts
type NodeCommand =
  | {
      type: 'node.text.commit'
      nodeId: NodeId
      field: 'text' | 'title'
      value: string
      size?: Size
      fontSize?: number
      wrapWidth?: number
    }
```

语义：

- 表示一次正式文本提交

compiler 负责：

- 空文本 text node 是否转成 `deleteCascade`
- 文本字段、size、fontSize、wrapWidth 合并
- topic / generic node 的正确下沉与 owner 规则

这样以后 editor 不再自己做文本提交的语义判断。

---

## 4.2 editor write 边界

长期最优下，`editor/write/*` 只允许做：

- 调 layout / query 归一化 payload
- 把一次 intent 变成一次 `engine.execute(...)`

不允许做：

- 一次 intent 里连续调用多个 `engine.execute(...)`
- 一次 intent 里先 `execute` 再 `update` 再 `clear`
- editor 自己决定最终 commit 拆分策略

可以保留的 UI 归一化：

- `layout.patchNodeCreatePayload(...)`
- `layout.patchNodeUpdate(...)`
- 把 selection / edge label / mindmap insert 输入归一化成 command payload

必须下沉到 engine 的语义：

- selection move 最终落盘
- reconnect 最终落盘
- text commit 的 delete/merge 语义

---

## 5. 模块改造

### 5.1 `engine`

修改这些位置：

- `types/command.ts`
- `write/compile/index.ts`
- `write/compile/canvas.ts`
- `write/compile/edge.ts`
- `write/compile/node.ts`

目标：

- 新增 `canvas.selection.move`
- 新增 `edge.reconnect.commit`
- 新增 `node.text.commit`
- 编译入口不再用 `startsWith(...)`

这里不需要引入新的 public spec。

只需要一个 engine 内部私有 helper：

```ts
type CommandNamespace =
  | 'document'
  | 'canvas'
  | 'node'
  | 'group'
  | 'edge'
  | 'mindmap'
```

```ts
const readCommandNamespace = (
  type: Command['type']
): CommandNamespace => { ... }
```

用途仅限：

- compile family 路由

不要把它上升成新的全局 spec concern。

### 5.2 `editor/write`

修改这些位置：

- `write/node.ts`
- `write/edge/index.ts`
- 视需要补 `write/canvas.ts`

目标：

- `node.text.commit` 改成一次新的 engine command
- `edge.reconnect` 改成一次新的 engine command
- `write/*` 只保留一次 dispatch

### 5.3 `editor/input`

修改这些位置：

- `input/features/selection/move.ts`
- `input/features/edge/connect.ts`

目标：

- selection move 提交收成一次 `ctx.write.canvas.selection.move(...)`
- reconnect 提交收成一次 `ctx.write.edge.reconnectCommit(...)`

交互层仍可继续做：

- preview
- pointer session
- snap
- gesture

但 commit 阶段只能有一个 write 出口。

History 与 editor/react 注入改造见：

- [`WHITEBOARD_HISTORY_API.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_HISTORY_API.zh-CN.md)

---

## 6. 分阶段实施

### Phase 1

目标：消掉交互 fan-out。

实施：

- engine 新增 `canvas.selection.move`
- engine 新增 `edge.reconnect.commit`
- editor selection move 改成一次提交
- editor reconnect 改成一次提交

完成标准：

- 一次 selection move 只产生一条 commit
- 一次 reconnect 只产生一条 commit
- collab change 不再看到拆碎的中间状态

### Phase 2

目标：清掉 editor 剩余小型 semantic compile。

实施：

- engine 新增 `node.text.commit`
- editor `node.text.commit` 改成薄 wrapper
- 视需要评估 route insert-drag 是否也收成一次 command

完成标准：

- editor 不再承担文本提交 delete / merge 语义
- editor write 只剩 payload 归一化

---

## 7. 非目标

本文明确不做：

- 新的 reducer runtime 模型
- 新的 mutable context
- 再造一层 operation compiler
- editor 直接操作 reducer draft
- 引入新的 mega spec
- 把 UI preview 与正式提交合并成一套共享状态机

这些都不是当前剩余复杂度的来源。

---

## 8. 最终原则

最后把长期最优原则压缩成四句：

- 一次用户意图只能形成一次正式语义提交。
- 跨实体最终语义必须在 engine command compile 完成。
- editor 只做交互预览、payload 归一化与单次 dispatch。
- `core -> engine -> editor -> react` 必须共享同一条提交主轴，不能再在 editor 长出半套 orchestrator。
