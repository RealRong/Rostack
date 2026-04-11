# Whiteboard Translate 第二轮重构蓝图

## 结论

`whiteboard/packages/whiteboard-engine/src/write/translate` 已经完成了第一轮重要收敛：

- `index.ts` 重新变回纯 dispatch
- `document` 从入口拆出
- `groupCommands.ts` 被删除
- `group` 变成了短 translator + planner

但这一层还没有达到最优状态。

下一轮真正值得做的，不是继续机械拆文件，而是把整层统一成一种更清晰的结构：

- translator 只做 adapter
- planner 负责命令解释和 operation 规划
- shared helper 只保留跨 domain 的纯工具
- result 适配统一成一种模式

一句话：

- 第一轮解决的是“职责错位”
- 第二轮要解决的是“风格不统一”

## 当前结构的主要剩余问题

### 1. 不同 domain 仍然在用不同写法

当前几类 domain 的风格差异很明显：

- `group.ts` 已经比较像理想形态
- `mindmap.ts` 有自己的局部 runner
- `document.ts` 仍然带着 planner 味道
- `node.ts` 和 `edge.ts` 还混着大量 translator 内部计划逻辑

这会导致阅读体验很碎：

- 有些文件像 adapter
- 有些文件像 plan executor
- 有些文件是半 adapter 半 planner

### 2. `order.ts` 太重

当前 `order.ts` 同时承载：

- ref 比较工具
- ref 收集工具
- group-aware selection order 逻辑
- 实际排序算法
- frame barrier 规则

它已经不是单纯 helper，而是一套共享 policy。

这类文件如果继续膨胀，会重新成为复杂度中心。

### 3. `result.ts` 方向正确，但还没成为统一协议

当前已经有：

- `success`
- `invalid`
- `cancelled`
- `fromOp`
- `fromOps`
- `append`

但实际写法还不统一：

- 有些模块大量用 `fromOps`
- 有些模块手动翻译错误
- 有些模块自带私有 runner
- 有些模块自己做 empty operations -> cancelled

也就是说：

- helper 存在
- 但还没成为硬约束

### 4. `node.ts` 仍然是复杂度最高的 domain translator

它的问题不是太长，而是混层最明显：

- `create` 调 core builder
- `align` / `distribute` 调 builder
- `updateMany` 自己维护 next map
- `move` 自己算 operation 集合
- `deleteCascade` 自己扩展选择和边收集

它同时做了：

- validation
- planning
- operation shaping
- result adaptation

这就是下一轮最值得优先动的地方。

## 第二轮的目标结构

第二轮建议统一成下面这套目录分层。

```txt
write/translate/
  index.ts
  result.ts

  document.ts
  node.ts
  edge.ts
  group.ts
  mindmap.ts

  documentPlan.ts
  nodePlan.ts
  edgePlan.ts
  groupPlan.ts

  order/
    refs.ts
    policy.ts

  selection/
    nodeSelection.ts
```

这不是要求一步拆成这么多文件，而是表达最终意图：

- translator 文件保留 domain surface
- planner 文件承载 domain decision logic
- shared helper 不再挂在大而杂的单文件下

## 每类文件应该承担什么职责

## 1. `index.ts`

只做一件事：

- domain dispatch

不应该再包含：

- document translator
- 任何 domain planner
- 任何 command-specific helper

当前已经基本满足这个目标。

## 2. domain translator

这些文件：

- `document.ts`
- `node.ts`
- `edge.ts`
- `group.ts`
- `mindmap.ts`

统一只负责：

- `switch (command.type)`
- very-thin validation
- 调 planner
- 把 planner 结果转成 `TranslateResult`

它们不应该再长期承担：

- 大段 operation 组装
- 跨对象扫描逻辑
- 复杂排序或 selection 推导

### 理想的 domain translator 轮廓

```ts
export const translateNode = <C extends NodeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<NodeWriteOutput<C>> => {
  switch (command.type) {
    case 'create':
      return fromOp(planNodeCreate(command, ctx)) as ...
    case 'move':
      return fromOps(planNodeMove(command, ctx)) as ...
    ...
  }
}
```

重点不是形式，而是：

- translator 自己不再做核心决策

## 3. domain planner

planner 文件负责：

- 读 domain command
- 读 document
- 产出 `Result<{ operations, output? }>`

planner 不负责：

- `TranslateResult`
- `cancelled(...)`
- `invalid(...)`
- translator 泛型适配

也就是说：

- planner 只讲领域规则
- translator 才讲 write API 协议

### planner 的推荐统一协议

建议统一成：

```ts
type PlanResult<T = void> = Result<{
  operations: Operation[]
  output: T
}, 'invalid'>
```

或更简短地：

```ts
type Plan<T = void> = Result<{
  operations: Operation[]
  output?: T
}, 'invalid'>
```

重点不是具体名字，而是：

- 所有 planner 都返回同一种 shape

这样 translator 就可以用统一适配器。

## 4. shared order helper

`order.ts` 建议拆成两层：

### `order/refs.ts`

只放这些无策略工具：

- `isSameCanvasRef`
- `hasSameCanvasRefOrder`
- `serializeRef`
- `parseRef`
- `listOrderedRefs`
- `collectGroupRefs`

### `order/policy.ts`

只放这些策略逻辑：

- frame barrier 规则
- `front/back/forward/backward` 的实际算法
- `normalizeCanvasOrderTargets`
- `moveRefsIntoContiguousBlock`

这样可以把：

- 数据表示工具
- 实际排序 policy

分开。

## 5. `result.ts`

第二轮不建议继续加更多 helper，而是做两件事：

### 1. 统一使用模式

保留并主推：

- `success`
- `invalid`
- `cancelled`
- `fromOp`
- `fromOps`

明确约定：

- translator 一律通过 `fromOp` / `fromOps` 接 planner
- 不再在 domain 文件里各写各的 runner

### 2. 评估删除 `append`

如果第二轮结束后 `append` 仍然没明显使用价值，就应该删掉。

现在的问题不是工具不够，而是工具和私有模式并存。

## 建议保留的结构

### 保留

- `group.ts + groupPlan.ts`
- `mindmap.ts` 里的“统一 runner”思路
- `document.ts` 作为独立 domain surface
- `index.ts` 作为纯 dispatch

### 不建议继续扩张

- `order.ts` 单文件
- `node.ts` 当前的混层结构
- `edge.ts` 里 route 逻辑与通用 update 混在一个 switch 中

## 每个 domain 的第二轮目标

## 1. `document`

### 当前状态

已经从入口拆出，但内部仍偏“半 planner”。

### 第二轮目标

二选一：

1. 保持一个文件，但统一内部 helper 命名为 planner 风格
2. 拆出 `documentPlan.ts`

### 推荐

如果 document command 数量短期不会继续涨，可以先不拆文件。

但要统一成：

- `planDocumentDelete`
- `planDocumentDuplicate`
- `planDocumentOrder`

而不是：

- `translateDelete`
- `translateDuplicate`
- `translateOrder`

因为这些函数本质上已经不是 adapter，而是 planner。

## 2. `node`

### 当前状态

复杂度最高，最值得优先重构。

### 第二轮目标

把下面这些逻辑迁入 `nodePlan.ts`：

- `updateMany`
- `move`
- `deleteCascade`
- 可能还包括 `delete`

保留在 `node.ts` 的只应是：

- switch
- command-specific output mapping
- cancelled/invalid/result adapter

### 为什么最优先

因为 node domain 命令最多，未来最容易继续膨胀。

如果这里不收住，translate 层复杂度会再次回流。

## 3. `edge`

### 当前状态

结构比 node 好，但 route 逻辑较重。

### 第二轮目标

可以拆出：

- `edgePlan.ts`
- 或者更小的 `edgeRoutePlan.ts`

尤其这些逻辑很适合迁出：

- `toUpdateOperations`
- `updateRoute`
- route insert/move/remove/clear 的 patch planning

`edge.ts` 未来最好只保留：

- create
- updateMany
- delete
- route dispatch

而 route 细节下沉。

## 4. `group`

### 当前状态

已经接近理想。

### 第二轮目标

只做小优化：

- 让 `group.ts` 更像纯 adapter
- `groupPlan.ts` 保持业务规划中心
- 进一步减少 translator 中的显式 output shaping 重复

这里不需要大动。

## 5. `mindmap`

### 当前状态

虽然长，但结构已经比较完整。

### 第二轮目标

不一定要拆，优先做统一风格：

- 保留 `runMindmapPlan(...)`
- 但让它更接近全局 planner/result 协议

如果未来还有增长，再考虑拆 `mindmapPlan.ts`。

也就是说：

- 不是现在最优先的重构对象

## 第二轮统一约定

为了让这一层真正稳定下来，我建议明确下面几条规则。

### 规则 1：translator 不直接遍历 document 做复杂决策

允许：

- very-thin validation
- 读 command 字段
- 调 planner

不推荐：

- translator 自己扫描节点、边、group 后再拼很多 operations

### 规则 2：planner 返回统一 shape

所有 planner 都尽量返回：

```ts
Result<{
  operations: Operation[]
  output?: T
}, 'invalid'>
```

不要一部分返回：

- `{ operation }`

另一部分返回：

- `{ operations }`

除非真的很有必要。

### 规则 3：empty operations 的语义统一

要明确规定：

- 哪些情况是 `cancelled`
- 哪些情况是 `invalid`
- planner 是否允许返回空 operations
- translator 是否统一负责把空 operations 转成 `cancelled`

这一点如果不统一，代码会继续局部合理、整体松散。

### 规则 4：所有“是否已 current”判断尽量收进 planner

例如：

- 已经 current
- 已经 aligned
- 已经 distributed
- background 已一致
- order 已一致

不应一部分在 translator，一部分在 planner。

统一收进 planner 更利于行为一致。

## 推荐的实施顺序

## 第一阶段：`node.ts`

目标：

- 把 node translator 变成真正的短 adapter

预期动作：

- 新增 `nodePlan.ts`
- 把 `updateMany/move/deleteCascade` 下沉
- 统一 `create/duplicate/align/distribute/delete` 的 result adapter 风格

## 第二阶段：`order.ts`

目标：

- 拆掉大而杂的共享逻辑中心

预期动作：

- 按 `refs` / `policy` 拆分
- 明确哪些函数是纯工具，哪些是规则实现

## 第三阶段：`edge.ts`

目标：

- 把 route planning 从 translator 中抽离

预期动作：

- 新增 `edgePlan.ts` 或 `edgeRoutePlan.ts`
- route insert/move/remove/clear 统一下沉

## 第四阶段：统一 result 协议

目标：

- 让所有 domain 都使用同一套 adapter 风格

预期动作：

- 统一 `fromOps` / `fromOp` 使用方式
- 删除无价值 helper
- 清掉私有 runner 和重复错误翻译

## 第五阶段：评估 `document` / `mindmap`

目标：

- 不是为了拆而拆
- 只在复杂度真的上升时再拆

换句话说：

- `document` 和 `mindmap` 不一定要立刻继续拆文件
- 先把 node / order / edge 做干净，收益更大

## 不建议做的事

### 1. 不要继续把 translate 变成“小文件森林”

如果没有清晰职责边界，只是为了把文件拆小，会得到：

- 文件更多
- 跳转更多
- 认知成本更高

### 2. 不要把所有 planner 都下沉到 core

core 应该保留真正稳定、可复用的领域规则。

translate 第二轮里很多 planner 更像：

- write-side planning
- UI command to operation planning

这不一定都适合挪进 core。

### 3. 不要一边统一 planner，一边同时大改类型系统

第二轮主目标是：

- 统一结构

不是：

- 做复杂类型体操

否则会把可读性优化做成类型系统重构。

## 最终目标

第二轮结束后，理想状态是：

- 看任一 domain translator，都像在看同一种代码
- planner 文件只讲领域规则，不讲 API 协议
- shared helper 文件只讲工具，不讲业务
- `index.ts` 永远是纯 dispatch

一句话总结：

`translate` 下一轮最值得追求的不是“更少文件”，而是“同一种写法”。
