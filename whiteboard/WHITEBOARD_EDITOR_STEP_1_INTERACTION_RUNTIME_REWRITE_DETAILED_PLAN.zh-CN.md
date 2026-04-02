# Whiteboard Editor 第 1 步详细设计方案

## 主题

重写 interaction 系统的中轴模型。

这一步不再把目标定义为“薄化 `runtime/interaction/runtime.ts`”，而是直接把 interaction 系统重构为四段式结构：

1. `Input Driver`
2. `Interaction Kernel`
3. `Interaction Model`
4. `Effect Commit`

本方案只讨论设计，不写代码。

---

## 1. 为什么要推翻旧方案

上一版思路是：

- 把 runtime 收薄
- 把 observe 拆出去
- 保留 owner / session 模型

这比现在的实现已经更好，但还不够简单。

原因是它仍然默认：

- interaction 的中心是一个 runtime
- feature 的核心产物是 session 对象
- 复杂度主要靠削减 runtime 职责来解决

这仍然不够彻底。

真正的问题不是某几个职责放错地方，而是 interaction 这条链路的基本分层不对。

当前难受的根源其实是：

- 监听事件
- 决定由谁处理
- 计算业务状态
- 写 overlay / commands / viewport

这四类事情没有分层，导致无论怎么拆 helper，复杂度都会在别处重新长出来。

所以第 1 步不能只是“改 runtime”，而应该直接重建 interaction 的基本模型。

---

## 2. 最终要对齐的心智模型

这一轮重构推荐直接对齐更接近 React 的心智模型。

React 的直觉是：

- 事件先进入系统
- 系统决定谁响应
- 状态更新是纯计算
- 副作用和提交单独发生

Whiteboard Editor 的长期最优模型也应该一样：

### 2.1 `Input Driver`

只负责接输入、翻译输入、派发输入。

### 2.2 `Interaction Kernel`

只负责当前有没有 active interaction，以及把输入派发给正确的 interaction。

### 2.3 `Interaction Model`

只负责纯业务策略：

- 能不能启动
- 如何演进
- 何时结束
- 产出哪些 effect

### 2.4 `Effect Commit`

只负责执行 effect：

- 写 overlay / transient
- 发 commands
- 更新 viewport / autopan
- 清理临时态

一句话说：

不是“runtime 调 feature”，而是：

- 输入进入 driver
- kernel 决定交给谁
- model 计算 next state 和 effects
- commit 执行 effects

---

## 3. 第 1 步目标

第 1 步的目标不是把所有 feature 一次性改成最终形态，而是先把 interaction 基础设施对齐成正确分层。

必须达成的目标：

1. 事件监听层从 interaction runtime 中分离
2. runtime 不再承担策略和 observe 总线职责
3. feature 不再被鼓励通过可变 session 对象塞逻辑
4. interaction 的核心抽象改为：
   - model state
   - transition
   - effects
5. 副作用提交从业务计算中分离

---

## 4. 本步非目标

这一步先不要求所有 feature 都立刻完全 reducer 化。

先不强求：

1. `selection` 立即彻底重写
2. `edge/route` 立即彻底拆完
3. overlay 立即完全去总线化
4. read/query/types 全部同步收口

但是这一步必须先把新的地基搭好，后续 feature 才有正确落点。

---

## 5. 当前系统的问题本质

### 5.1 输入、调度、策略、副作用混在一起

当前系统里：

- `createEditor` 接输入
- `interaction runtime` 调度 owner
- feature session 在闭包里持有状态
- feature 又直接写 overlay / commands / autopan

这意味着整条链路没有稳定分层。

### 5.2 session 对象不是最终最优抽象

现在的 session 形态是：

- 一个对象
- 挂一堆 `move/up/cancel/cleanup/keydown/keyup`
- 内部用闭包保存状态

这比大杂烩文件好，但长期来看仍然有几个问题：

1. 状态藏在闭包里，不透明
2. transition 和 effect 常常混在一起
3. feature 容易在 session 里再套子 session
4. runtime 仍然要围绕“命令式对象协议”设计

### 5.3 observe 的存在说明系统里有第二条隐性输入流

`observe` / hover / passive preview 本质上不是 active interaction。

它们是另一条“空闲时旁路输入流”。

如果不把它单独建模，它就会持续以各种名字重新长回 runtime。

### 5.4 runtime 过强，导致 feature 被迫适配

一旦 runtime 负责：

- pending
- update
- wheel
- keyboard policy
- observe
- active meta

feature 就一定会围绕 runtime 的协议来写，而不是围绕业务本身来写。

---

## 6. 新的整体分层

第 1 步完成后，interaction 相关代码应对齐下面的四层。

## 6.1 Input Driver

### 职责

- 接收 host / React 层的输入事件
- 把原始事件翻译成 editor 输入语义
- 调用 kernel dispatch
- 在合适的时机触发 passive watch

### 它不负责

- 判断 tool
- 判断 feature
- 维护 active interaction
- 写 overlay
- 发 commands
- 决定业务规则

### 它的本质

它就是 input loop。

它应该非常“笨”：

- 收到输入
- 归一化
- 转发

---

## 6.2 Interaction Kernel

### 职责

- 保存当前 active interaction
- idle 时遍历 registry，决定谁 start
- busy 时把输入继续派发给 active interaction
- 暴露很薄的 interaction state

### 它不负责

- hover/watch
- wheel 策略
- Space 状态
- 具体业务规则
- overlay/command 提交

### 它的本质

它不是 runtime 平台，而是 dispatcher / arbiter。

一句话概括：

它只负责“当前这次输入应该交给谁”。

---

## 6.3 Interaction Model

### 职责

interaction model 是业务策略层。

它负责表达：

- 当前 feature 能不能启动
- 启动后的 state 是什么
- 收到输入后如何计算 next state
- 需要产出哪些 effects
- 是否结束 interaction

### 它不负责

- 监听 DOM / host 事件
- 持有全局 active state
- 直接写 editor commands / overlay

### 它的本质

interaction model 最理想的形式，不是返回一堆方法对象，而是更接近 reducer / transition system：

```ts
state + input + deps -> transition result
```

transition result 至少包含：

- `nextState`
- `effects`
- `status`

其中：

- `nextState` 是纯数据
- `effects` 是待提交描述
- `status` 表示继续、完成、取消或忽略

---

## 6.4 Effect Commit

### 职责

effect commit 层统一执行 model 产出的 effect：

- overlay/transient 更新
- commands 提交
- autopan 更新
- selection side effect
- cleanup

### 它不负责

- 业务决策
- owner 启动判断
- active interaction 生命周期判断

### 它的本质

它是 interaction world 的 commit phase。

不是在 model 里边算边写，而是：

1. model 先算
2. commit 再执行

这样状态演进和副作用才能清晰分离。

---

## 7. 第 1 步后的核心抽象

这一步应该改掉当前 `owner + session` 协议的核心方向。

不是完全禁止 session 这个词，而是要把核心抽象从“命令式 session 对象”转成“interaction model state + transition”。

---

## 7.1 Input

统一的 interaction 输入语义仍然保留，但需要明确分层：

- pointer down
- pointer move
- pointer up
- pointer cancel
- pointer leave
- wheel
- key down
- key up
- blur

这些输入先进入 driver，不直接进 feature。

---

## 7.2 Model State

每个 interaction 的运行时状态必须是显式数据，而不是默认藏在闭包里。

例如：

- draw stroke 的点集、brush、length
- edge connect 的 draft、snap target
- selection move 的当前投影
- route drag 的当前 point

它们都应该成为显式 `state`。

长期最优不是：

```ts
return {
  move() {},
  up() {}
}
```

而更像：

```ts
type ActiveInteraction = {
  key: 'draw.stroke'
  state: DrawStrokeState
  model: DrawStrokeModel
}
```

---

## 7.3 Transition Result

每次 transition 都返回统一结构。

推荐心智：

```ts
type InteractionTransitionResult<TState> = {
  state: TState
  effects?: readonly InteractionEffect[]
  status: 'active' | 'done' | 'cancelled' | 'ignored'
}
```

如果某次输入只是更新 state：

- `status = 'active'`

如果完成：

- `status = 'done'`

如果取消：

- `status = 'cancelled'`

如果不关心：

- `status = 'ignored'`

---

## 7.4 Effects

effect 是这次第 1 步里非常关键的抽象。

要避免 feature 里继续这样写：

- 算一点
- 写 overlay
- 再算一点
- 再发 command

统一改成 model 返回 effects。

推荐 effect 分类：

### transient effects

- 设置 draw preview
- 设置 edge guide
- 设置 selection preview
- 清除 transient

### command effects

- create node
- move node
- delete node
- reconnect edge
- update route

### viewport effects

- update auto pan pointer
- pan viewport

### interaction effects

- finish
- cancel

说明：

第 1 步不一定要把 effect 体系做到最终完备，但必须先把“effect 作为显式提交物”这件事建立起来。

---

## 8. 新的 registry 模型

如果参考 React 和 reducer 的心智，我不建议继续把 feature 设计成“返回 owner/session 的 runtime 工厂”，而更建议改成 interaction registry。

推荐方向：

```ts
interaction.register('draw.stroke', {
  priority: 600,
  canStart(deps, input) {},
  start(deps, input) {},
  move(deps, state, input) {},
  up(deps, state, input) {},
  cancel(deps, state) {},
  blur(deps, state) {},
  keydown(deps, state, input) {},
  keyup(deps, state, input) {}
})
```

这里的关键不是字面 API，而是设计思想：

- registry 项是静态定义
- `state` 是纯数据
- `deps` 是稳定窄依赖
- 每次 transition 返回 `state + effects`

这样 interaction kernel 才能真正保持很薄。

---

## 9. 推荐的新契约

以下是第 1 步建议建立的新契约方向。

名称可以调整，但职责不能变。

---

## 9.1 `InteractionDriver`

职责：

- 提供 dispatch 入口
- 管理 idle watch
- 在 editor input bridge 中被调用

但它不应该成为一个“有复杂业务状态的 runtime”。

它本质上更接近：

```ts
type InteractionDriver = {
  pointerDown(input): DispatchResult
  pointerMove(input): boolean
  pointerUp(input): boolean
  pointerCancel(input): boolean
  pointerLeave(): void
  wheel(input): boolean
  keyDown(input): boolean
  keyUp(input): boolean
  blur(): void
}
```

这个接口可以仍然暴露给 editor，但内部结构已经不再是旧 runtime 思路。

---

## 9.2 `InteractionKernel`

职责：

- 维护 `activeInteraction`
- 调 registry
- 调 transition
- 调 effect commit

推荐状态：

```ts
type ActiveInteraction = {
  id: number
  key: string
  pointerId?: number
  mode: InteractionSessionMode
  chrome?: boolean
  model: InteractionModel<any>
  state: unknown
}
```

这里的关键是：

- active 持有的是 `model + state`
- 不是 `move/up/cancel` 闭包对象

---

## 9.3 `InteractionModel`

推荐抽象：

```ts
type InteractionModel<TState> = {
  key: string
  priority?: number
  mode: InteractionSessionMode
  chrome?: boolean
  canStart?: (deps, input) => boolean
  start: (deps, input) => InteractionStartResult<TState>
  move?: (deps, state, input) => InteractionTransitionResult<TState>
  up?: (deps, state, input) => InteractionTransitionResult<TState>
  cancel?: (deps, state) => InteractionTransitionResult<TState>
  blur?: (deps, state) => InteractionTransitionResult<TState>
  keydown?: (deps, state, input) => InteractionTransitionResult<TState>
  keyup?: (deps, state, input) => InteractionTransitionResult<TState>
}
```

这里也可以继续拆成 start spec 和 active spec，但第 1 步不必过度设计。  
重点是把“闭包 session”转成“显式 state + 纯 transition”。

---

## 9.4 `InteractionEffectRunner`

它负责消费 model 产出的 effects。

推荐职责：

- 执行 transient effect
- 执行 command effect
- 执行 viewport effect
- 执行 interaction control effect

其中 interaction control effect 可以包括：

- `finish`
- `cancel`
- `clearTransient`

第 1 步里不一定要把所有 effect 都对象化到极致，但 effect runner 这层必须先建立起来。

---

## 9.5 `InteractionWatch`

watch 仍然需要存在，但它不再属于 runtime/owner 协议。

推荐定位：

- 它是 idle input 的旁路消费者
- 它不拥有 active state
- 它不参与 kernel 选主

推荐抽象：

```ts
type InteractionWatch = {
  move?: (deps, input) => readonly InteractionEffect[] | void
  leave?: (deps) => readonly InteractionEffect[] | void
  blur?: (deps) => readonly InteractionEffect[] | void
  cancel?: (deps) => readonly InteractionEffect[] | void
  wheel?: (deps, input) => readonly InteractionEffect[] | false | void
}
```

这也体现了同一个原则：

- watch 也不直接写 effect
- watch 也产出 effects

---

## 10. 新的输入流

这一步完成后，整条输入流应是下面这样。

### 10.1 `pointerDown`

1. Input Driver 接收输入
2. 交给 Interaction Kernel
3. Kernel 在 registry 中按优先级遍历 model
4. 找到第一个可启动 model
5. model.start 返回：
   - 初始 state
   - start effects
   - handled / ignored
6. Kernel 保存 active interaction
7. Effect Commit 执行 start effects

### 10.2 `pointerMove`

如果存在 active interaction：

1. Kernel 把输入交给当前 model.move
2. model.move 返回 `nextState + effects + status`
3. Kernel 更新 active state
4. Effect Commit 提交 effects

如果不存在 active interaction：

1. Input Driver 广播 idle watches
2. watch 返回 effects
3. Effect Commit 提交 watch effects

### 10.3 `pointerUp`

如果存在 active interaction：

1. Kernel 调用 model.up
2. model.up 返回 `nextState + effects + status`
3. Effect Commit 提交 effects
4. 若 `status = done/cancelled`，清掉 active interaction

### 10.4 `cancel / blur`

active 时：

- 进入当前 model 的 `cancel/blur`

idle 时：

- 走 idle watch cleanup

### 10.5 `wheel`

wheel 不再属于 kernel 的默认职责。

推荐流程：

1. active interaction 如果需要轮询输入，可由 driver 决定是否交给当前 model
2. 否则先走 idle watch
3. 若 watch 未处理，再 fallback 到 viewport

重点不是字面顺序，而是：

- wheel 不再长在旧 runtime 里

---

## 11. `Space` 的归属

`Space` 不应该继续挂在 interaction runtime 上。

它属于输入策略层。

更合理的归属是：

- Input Driver
- 或 editor input policy 模块

为什么：

- `Space` 是一种输入资格条件
- 它影响的是 viewport pan eligibility
- 它不是 interaction kernel 的 active state

所以第 1 步的设计要求之一是：

- `space` 迁出 interaction runtime
- viewport 是否可用 hand-mode 改为读取 input policy / input driver state

---

## 12. `EditorInteractionState` 的定位

第 1 步里 `EditorInteractionState` 可以暂时保留目前这层 facade：

- `busy`
- `chrome`
- `transforming`
- `drawing`
- `panning`
- `selecting`
- `editingEdge`
- `space`

但要明确新的来源：

- `busy / mode / chrome` 来自 kernel
- `space` 来自 input driver / input policy
- `drawing / selecting / editingEdge / panning` 是 facade 层对 mode 的二次解释

也就是说：

- facade 可以暂时不动
- 但底层来源必须改正确

---

## 13. 对 `createEditor` 的影响

这一轮改造会直接改变 `createEditor` 的内部装配方式。

虽然这一步不全面重写 `createEditor`，但必须先建立新的分层。

推荐装配顺序：

### 13.1 创建 interaction deps

包含：

- read
- runtime state
- config
- commands
- overlay/transient
- snap

### 13.2 创建 interaction registry

把各 feature 的 interaction model 注册进来，而不是只拿到 `owner`。

### 13.3 创建 effect runner

集中执行 interaction effects。

### 13.4 创建 kernel

kernel 只知道：

- registry
- effect runner

### 13.5 创建 driver

driver 只知道：

- kernel
- watches
- input policy
- pointer state bridge
- viewport fallback

一句话：

以后 `createEditor` 里真正对外的 `input`，本质上应来自 driver，而不是旧 runtime。

---

## 14. 对现有类型系统的影响

第 1 步需要改的不是一两个函数签名，而是 interaction 类型的基本方向。

### 14.1 旧类型要被废弃的部分

以下旧契约不再是长期最优：

- `InteractionOwner.observe`
- `InteractionControl.update`
- 以 `InteractionSession` 闭包对象为核心的执行模型

### 14.2 新类型需要出现的部分

至少需要新增或重定义：

- `InteractionModel`
- `InteractionModelState`
- `InteractionTransitionResult`
- `InteractionEffect`
- `InteractionEffectRunner`
- `InteractionWatch`
- `ActiveInteraction`
- `InteractionKernel`
- `InteractionDriver`

第 1 步不一定要一次把这些名字全部定死，但这些角色必须在结构上出现。

---

## 15. 对 feature 的影响方式

这一步不应该要求所有 feature 一夜之间全部完成最终形态，但要给 feature 一个统一落点。

推荐迁移顺序：

### 第一批直接适配

- `viewport`
- `insert`
- `draw`
- `edge hover guide`

原因：

- 这几条线边界更清楚
- 能帮助验证 driver / kernel / model / effect commit 的分层

### 第二批再重写

- `selection`
- `edge route / connect`
- `mindmap`

原因：

- 它们本身的业务模型也复杂
- 适合在新中轴成型后再系统收口

---

## 16. 推荐的第一步实施顺序

虽然这里不写代码，但实现上建议按下面顺序来。

### 第 1.1 步

先定义新的 interaction 类型系统：

- model
- effect
- kernel
- driver
- watch

先把核心抽象立住。

### 第 1.2 步

创建 effect runner。

先让 interaction 计算和提交分开。

### 第 1.3 步

重写 kernel。

kernel 只维护：

- registry
- active interaction
- dispatch

### 第 1.4 步

重写 input bridge / driver。

把原来 `createEditor` 里那条输入执行线收成 driver。

### 第 1.5 步

先把边界最清晰的 feature 接到新模型上：

- viewport
- insert
- draw
- edge hover watch

### 第 1.6 步

让旧 session 模型彻底退出 interaction runtime 中轴。

这时即使某些 feature 还没完全重写，也不能再让中轴围绕旧 session 对象设计。

---

## 17. 风险点

### 17.1 过渡期会同时存在旧 feature 和新中轴

如果第 1 步不是一次性把所有 feature 都改完，就会出现：

- 中轴已经新模型
- 某些 feature 还是旧式实现

这会带来适配层压力。

因为你已经明确不需要兼容和过渡，所以长期最优做法是：

- 第 1 步尽量把基础 feature 一起改掉
- 不要留下两套 interaction 主协议并存

### 17.2 effect 设计过度抽象

effect runner 是必须的，但不能把 effect 体系设计成庞大的框架。

原则是：

- 只抽取真正重复的 effect 类型
- 不做“万物 effect 化”

### 17.3 watch 与 active interaction 冲突

必须明确规则：

- busy 时 watch 默认不运行
- idle 时 watch 运行

否则 passive hover 又会重新污染 active interaction。

### 17.4 autopan 的归属

autopan 从职责上看更接近 effect / viewport side effect。

第 1 步里要避免 autopan 又重新长成 kernel 内部的一套独立策略系统。

---

## 18. 完成标准

第 1 步完成后，应满足下面这些判断标准。

### 18.1 结构标准

interaction 链路里已经能明确指出四层：

1. Input Driver
2. Interaction Kernel
3. Interaction Model
4. Effect Commit

如果这四层仍然混在一个 runtime 里，那说明第 1 步没完成。

### 18.2 类型标准

interaction 核心抽象已经变成：

- model state
- transition result
- effects

而不是以“闭包 session 对象”作为唯一中心。

### 18.3 代码标准

`runtime/interaction/runtime.ts` 不再同时出现这些职责：

- watch/observe 广播
- wheel policy
- space 管理
- pending update 协议
- keyboard 大杂烩策略

### 18.4 feature 标准

至少已有一批 feature 在新中轴上稳定运行：

- viewport
- insert
- draw
- edge hover watch

### 18.5 心智标准

开发者可以用下面一句话解释系统：

“输入先进入 driver，kernel 只决定交给哪个 interaction，interaction model 只算 state 和 effects，effect runner 再提交副作用。”

如果还不能用这句话解释，就说明架构还没对齐。

---

## 19. 第 1 步完成后，后续为什么会更简单

### 对 selection

selection 可以直接改成：

- start decision
- explicit state
- move/up transition

不再需要在 `press.ts` 里再造一个小 runtime。

### 对 edge

edge 的 connect / route / hover 会自然拆成：

- active models
- idle watch

不用再围绕 old runtime 协议组织代码。

### 对 overlay

effect commit 建立后，overlay/transient 更容易继续拆成窄 store。

### 对 `createEditor`

`createEditor` 会更容易拆成：

- graph
- driver
- public facade

而不是继续当总装厂。

---

## 一句话结论

第 1 步不应该只是“把 interaction runtime 变薄”，而应该直接把 interaction 系统改成更接近 React 心智模型的四段式结构：

- `Input Driver`
- `Interaction Kernel`
- `Interaction Model`
- `Effect Commit`

只有这样，事件监听、交互调度、业务策略、副作用提交才能真正分层，后续复杂 feature 才不会继续把复杂度反推回中轴。
