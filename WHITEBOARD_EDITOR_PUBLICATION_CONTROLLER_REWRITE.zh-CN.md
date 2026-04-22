# `whiteboard-editor` 去除“读时 flush”的最终收敛方案

## 1. 结论先说

`whiteboard/packages/whiteboard-editor/src/projection/controller.ts` 之前那类逻辑：

- `ensureFlushed()`
- `wrapReadStore(...)`
- `wrapKeyedStore(...)`
- `observedSourceCount`

都不是长期最优。

它们可以作为一次重写过程中的临时兜底，但绝不能成为最终模型。

长期最优里，`whiteboard-editor` 必须做到：

1. 任何 `read/get/subscribe` 都是纯读，绝不触发 flush。
2. flush 只能由明确的 publication boundary 触发，不能由 store 读取触发。
3. `ProjectionSources` 只建立在“已经发布完成”的 snapshot 之上，不再承担补发布职责。
4. 所有公开 editor 入口在返回前，必须已经把本轮输入完整发布。

也就是说，最终一致性机制必须从：

```txt
有人读取了 store
  -> 补一次 flush
  -> 读到最新
```

彻底改成：

```txt
入口事务开始
  -> 收集输入 delta
  -> 事务结束时统一 flush
  -> 之后所有 read 都只是纯读 published snapshot
```

这不是风格问题，而是系统边界问题。

---

## 2. 当前模型为什么不对

当前错误点不是只有 `wrapKeyedStore` 难看，而是整套关系反了。

### 2.1 读侧在反向驱动写侧

当 `get()` 里触发 `ensureFlushed()` 时，读接口已经不再是读接口，而变成：

- 先推进 publication
- 再返回值

这会导致：

- 正确性依赖“有没有读”
- 同一次 source 变化，在“读过”和“没读过”两条路径下行为不同

这是一种隐式控制流，长期一定脆。

### 2.2 观察者数量污染调度策略

当 flush 是否同步，取决于是否存在下游订阅者时，系统会变成：

- 没订阅时，microtask flush
- 有订阅时，sync flush

这意味着 publication policy 不再由 runtime/driver 控制，而由下游消费形态控制。

这是错误的依赖方向。

### 2.3 `ProjectionSources` 被迫承担一致性补丁

`ProjectionSources` 的长期职责应该只是：

- 从 published snapshot 投影出 `graph / scene / node / edge / mindmap / group`

它不应该承担：

- 补 flush
- 订阅时切换调度模式
- 读取时刷新 projection

一旦 source 层承担这些职责，后面谁在读、何时读、读几次，都会影响 publication。

### 2.4 这会让事务边界退化

如果 publication 只能在读取时被补出来，那系统就不再有真正明确的：

- 事务开始
- 收集输入
- 事务结束
- 统一发布

而会退化成：

- 先 mutate
- 什么时候有人读了，什么时候再补发

这样会让长期的 delta、fanout、性能分析全部失去稳定基础。

---

## 3. 最终目标

最终要把 `whiteboard-editor` 收敛成三层。

### 3.1 Source Collection

负责：

- 监听 engine publish
- 监听 session/preview/viewport/animation
- 把变化转成 `InputDelta`
- 调用 `controller.mark(...)`

不负责：

- 直接 `runtime.update`
- 保证读到最新
- 控制 store 行为

### 3.2 Publication Control

由一个明确的 `ProjectionController` 负责：

- `mark`
- `flush`
- `run`
- `schedule`

它是唯一可以推进 publication 的地方。

### 3.3 Published Read Graph

负责：

- 对外暴露 snapshot
- 投影出 graph / scene / ui / keyed family
- 提供纯读 store

这里必须是纯读层。

一旦 snapshot 已发布，后面的所有 `read/get/subscribe` 都只能消费它，不能再反向驱动 controller。

---

## 4. 最终核心对象：`ProjectionController`

长期最优里，`projection driver` 应该正式重命名并收敛为 `ProjectionController`。

建议 API：

```ts
interface ProjectionController {
  current(): ProjectionPublish
  subscribe(listener: (publish: ProjectionPublish) => void): () => void

  mark(delta: InputDelta): void
  flush(): ProjectionPublish

  run<T>(fn: () => T): T
  dispose(): void
}
```

其中：

```ts
interface ProjectionPublish {
  rev: number
  snapshot: ProjectionSnapshot
  change: ProjectionChange
}
```

### 4.1 `mark(delta)`

职责：

- 只把输入合并进 pending delta
- 不负责判断谁在读
- 不依赖任何下游订阅者

### 4.2 `flush()`

职责：

1. 消费当前 pending delta
2. 读取最新 engine publish 与本地状态
3. 调用一次 `runtime.update`
4. 发布一份新的 `ProjectionPublish`

它必须是唯一的 publication commit 点。

### 4.3 `run(fn)`

这是整个系统去掉“读时 flush”的关键。

`run(fn)` 的职责是：

1. 建立一个明确的同步事务边界
2. 在事务内部允许任意 source 继续 `mark`
3. 在最外层 `fn` 返回前统一 `flush()`

也就是说，对外同步 API 的最终契约必须变成：

> 一次 editor public action / input 调用返回后，projection 一定已经发布完成。

这样，下游 read 就不再需要补 flush。

### 4.4 为什么 `run(fn)` 是第一性基础设施

如果没有 `run(fn)`，系统只能在两种糟糕方案里选一个：

1. 所有输入同步立刻 flush
2. 不同步 flush，靠读取时补

前者会导致重复计算，后者会导致边界污染。

`run(fn)` 提供了第三条，也是唯一正确的路：

- 允许事务内多次 mark
- 只在事务末尾 flush 一次
- 读侧保持纯净

---

## 5. 最终调度模型

长期最优里，不是“所有 source 都同步 flush”，也不是“所有 source 都延迟到有人读时再 flush”，而是：

- 同步入口：`run(fn)` 末尾 flush
- 普通异步源：`mark` 后排一次 microtask flush
- 帧动画源：`raf` 中 `mark`，同帧 flush

### 5.1 同步入口

包括：

- `editor.actions.*`
- `editor.input.pointerDown`
- `editor.input.pointerMove`
- `editor.input.pointerUp`
- `editor.input.cancel`
- editor host 暴露给 react / bridge 的同步命令

这些入口都必须被 controller 包装成：

```ts
controller.run(() => {
  // current editor logic
})
```

注意：

- `run` 是 editor shell boundary
- 不是 graph runtime 内部机制

### 5.2 普通异步源

包括：

- engine remote publish
- 非交互态 session 变化
- 任何不在 public sync entry 内发生的宿主回调

这些源的长期最优策略是：

- source 变化时只 `mark(delta)`
- controller 自己排一轮 microtask flush

这里重要的是：

- flush 是 source 明确安排的
- 不是读取时补出来的

### 5.3 帧动画源

包括：

- mindmap enter animation
- 未来任何按帧推进的 preview animation

这些源的长期最优策略是：

- source 自己持有 `raf`
- 每帧自己决定是否产生 `tick`
- 每帧 `mark(delta)`
- 同帧显式 `flush()`

注意：

- frame cadence 由 source 决定
- publication commit 仍然只有一条 `flush` 管线

这里不允许重新引入：

- driver 内时钟
- 读时补 frame tick
- 因为有人订阅了某个 keyed store 所以改成 sync frame

---

## 6. 最终 `ProjectionSources` 边界

长期最优里，[whiteboard/packages/whiteboard-editor/src/projection/sources.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/projection/sources.ts) 只做一件事：

```ts
published snapshot
  -> projected read stores
```

它不再做：

- flush barrier
- observe barrier
- read-time repair
- subscribe-time repair

建议最终保持成：

```ts
export interface ProjectionSources {
  snapshot: ReadStore<ProjectionSnapshot>
  graph: ReadStore<GraphSnapshot>
  scene: ReadStore<SceneSnapshot>
  selection: ReadStore<SelectionView>
  chrome: ReadStore<ChromeView>
  node: KeyedReadStore<NodeId, NodeView | undefined>
  edge: KeyedReadStore<EdgeId, EdgeView | undefined>
  mindmap: KeyedReadStore<MindmapId, MindmapView | undefined>
  group: KeyedReadStore<GroupId, GroupView | undefined>
}
```

重点是：

- `ProjectionSources` 是 published read graph
- 不是 publication controller 的代理层

因此最终必须删除：

- `wrapReadStore`
- `wrapKeyedStore`
- `ensureFlushed`
- `observedSourceCount`

---

## 7. store 在最终模型里的角色

长期最优里，store 仍然可以留在 `whiteboard-editor`，但角色必须收缩成：

- 保存 session/document/projection 的已发布状态
- 提供纯读衍生
- 提供订阅传播

它不能再做：

- 自动补 flush
- 自动推导 publication phase
- 通过“有人订阅”改变 controller 调度

一句话说：

> store 只表达“已经发布的真相”，不再参与“把真相补出来”。

这条边界写死以后，整个 editor 才真正变成：

- source system
- controller
- published read graph

三层清晰结构。

---

## 8. public editor boundary 应该怎么改

要彻底赶走“读时 flush”，就必须收口 editor public API。

### 8.1 公开同步入口统一包进 `run`

最终 `createEditor(...)` 返回的对象里，所有会导致 source 变化的同步公开接口，都必须经过统一包装。

例如：

- `actions`
- `input`
- `session mutate` 若对外暴露则同样处理

建议在 editor shell 层统一做：

```ts
const withProjectionRun = <TArgs extends readonly unknown[], TResult>(
  fn: (...args: TArgs) => TResult
) => (...args: TArgs): TResult => controller.run(() => fn(...args))
```

然后：

- 所有对外 action 都走 `withProjectionRun`
- 所有对外 input entry 都走 `withProjectionRun`

这样用户态调用一返回，就天然满足：

- engine/session 已变
- projection 已发
- 读接口纯读

### 8.2 不再暴露“裸 mutate 后你自己再读”的契约

如果某些 editor 内部对象对外暴露了：

- 直接写 session
- 直接写 preview
- 直接写 viewport

那这些调用也必须收口到 controller boundary。

长期最优里，外部不应该能绕过 publication control 直接改宿主状态。

否则读时 flush 永远会死灰复燃。

---

## 9. 异步源怎么接入

为了不让 `run(fn)` 变成唯一入口，异步源必须有正式接入方式。

建议显式区分两类 adapter。

### 9.1 `ProjectionSyncSource`

用于同步 source。

职责：

- 监听状态变化
- 产出 `InputDelta`
- 仅调用 `controller.mark(...)`

这些 source 通常运行在 `run(fn)` 内部，因此最终 flush 由外层事务负责。

### 9.2 `ProjectionAsyncSource`

用于异步 source。

职责：

- 监听宿主异步事件
- 产出 `InputDelta`
- 调用 `controller.mark(...)`
- 明确选择 `flushMicrotask()` 或 `flushFrame()`

注意：

- 是 source 自己声明节奏
- 不是 read side 帮它补节奏

### 9.3 `layout draft` 与 `measure` 的特殊性

像文本编辑时的：

- `layout.draft.node`
- DOM text measure

在 `whiteboard` 当前能力边界里，这两条链不应建模成异步 source。

原因很简单：

- `editor.actions.edit.input(...)` 是同步 public entry
- `layout.draft.node` 是同步派生
- layout backend 的 `measure()` 也是同步 DOM/canvas 测量

所以长期最优里，文本编辑 draft/layout 的正确模型不是：

```txt
edit input
  -> draft store 变化
  -> source 订阅到
  -> mark
  -> microtask flush
```

而是：

```txt
edit input
  -> controller.run(...)
  -> flush 内同步读取 draft measure
  -> runtime.update
  -> publish
  -> 返回
```

这意味着：

- `layout.draft.node` 不应该作为 controller 的订阅 source
- draft measure 应该只在 flush 构造输入时同步读取
- 文本编辑调用返回前，graph/layout 必须已经发布完成

只有真正晚到的外部输入，才应该走异步 source，例如：

- engine 外部 publish
- `setTimeout` / host callback
- `raf` animation tick

---

## 10. 最终不变式

长期最优里，系统必须满足下面五条硬不变式。

### 10.1 读接口纯净

任何：

- `snapshot()`
- `store.get()`
- `store.subscribe()`
- `sources.node.get(id)`

都不允许触发：

- `mark`
- `flush`
- `runtime.update`

### 10.2 一致性来自发布边界，不来自读取

任何“读到最新”的保证，必须由：

- `run(fn)` 结束
- microtask flush 完成
- frame flush 完成

来提供。

不能由：

- “因为刚读了一次”
- “因为有人订阅了”

来提供。

### 10.3 同步 public entry 返回前一定已发布

所有同步 public editor API 都必须满足：

```txt
call returns
  => projection already published
```

### 10.4 一轮事务最多一次 runtime.update

对于一轮同步 public transaction：

- 无论内部改了多少 source
- 最终只允许一次 `runtime.update`

### 10.5 source 数量不会改变 publication policy

无论：

- 有没有订阅者
- 订阅的是 root snapshot 还是 keyed store

publication policy 都必须完全一致。

---

## 11. 最终测试契约

为了防止系统重新退回“读时 flush”，必须新增明确测试。

### 11.1 纯读不触发发布

测试形式：

1. 准备一个 idle editor
2. 记录 `runtime.update` 调用次数
3. 连续执行多次：
   - `editor.read.node.view.get(...)`
   - `editor.read.edge.view.get(...)`
   - `editor.read.panel.get()`
4. 断言没有新增 publish

### 11.2 同步 action 返回后立即可读

测试形式：

1. 调用 `editor.actions.*`
2. 不等待 microtask
3. 立即读取 `editor.read.*`
4. 断言结果已经是最新

### 11.3 订阅数量不影响行为

测试形式：

1. 在无订阅情况下执行一次交互
2. 在大量 keyed 订阅情况下执行同样交互
3. 断言 publish 次数、最终 snapshot、变更顺序一致

### 11.4 async source 不依赖读取触发

测试形式：

1. 让 engine/host callback/animation source 产生 delta
2. 在完全不读取任何 source 的情况下等待对应调度完成
3. 断言 projection 已自行发布

---

## 12. 实施顺序

这部分必须一步到位，不留兼容，不保留双轨。

### 第一步

引入正式 `ProjectionController`：

- 持有 pending delta
- 持有 published snapshot
- 暴露 `mark / flush / run / current / subscribe`

此时旧 `driver` 可以直接删除或整体改名，不保留双实现。

### 第二步

把 `ProjectionSources` 改成纯 published projection：

- 输入只接 `controller.current().snapshot`
- 删除所有 read-time flush 相关包装

这一阶段必须删除：

- `ensureFlushed`
- `wrapReadStore`
- `wrapKeyedStore`
- `observedSourceCount`

### 第三步

把 editor public sync entry 全部包进 `controller.run(...)`：

- `actions`
- `input`
- host bridge

保证同步 API 返回时 projection 已发布。

### 第四步

把 engine/session/preview/viewport/animation 统一重写成 source adapter：

- 只 `mark`
- 不直接读 side effects
- 不依赖有人读

### 第五步

把 animation source 固定为：

- source 自己持有 `raf`
- source 自己决定何时 tick
- source 显式 `mark + flush`

彻底禁止 driver 内 clock 回归。

### 第六步

补完上面的不变式测试，并删除所有残留旧逻辑。

这里的“残留旧逻辑”包括：

- 读取时补 flush
- 订阅时改变 flush 策略
- source 直接推 `runtime.update`
- public entry 裸暴露 mutate

---

## 13. 最终结论

`wrapKeyedStore` 之所以让人感觉别扭，不是因为写法不优雅，而是因为它代表了一种不该存在的系统关系：

- 读侧不应该推进发布
- store 不应该承担一致性修补
- publication 不应该依赖订阅者数量

长期最优里，`whiteboard-editor` 必须彻底收敛成：

```txt
source adapters
  -> ProjectionController(mark / flush / run)
  -> published snapshot
  -> pure ProjectionSources
  -> pure editor read graph
```

只有这样，系统才能同时满足：

- 图上一致发布
- 低复杂度
- 无隐式控制流
- 无读时副作用
- 可验证的事务边界

这才是最终应该长期固定下来的形态。
