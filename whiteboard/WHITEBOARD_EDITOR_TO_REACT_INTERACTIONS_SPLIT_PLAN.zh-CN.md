# Whiteboard Editor 交互迁移到 React 的最简拆分方案

## 目标

这份文档明确回答一个问题：

在不新开 `whiteboard-interactions` 包的前提下，如何把现在放在 `whiteboard-editor` 里的 interactions 整体迁到 `whiteboard-react`，并让整体架构变得更简单、更顺。

这份方案的前提是：

- 先不考虑非 React host
- 先不单独开 interaction orchestration 包
- 目标是最简单、最少层、最少中间概念
- 不考虑兼容和过渡

一句话：

**先把 `editor` 收成纯 runtime，把 interactions 明确搬到 `whiteboard-react`。**

---

## 结论

当前最简单、长期也足够合理的边界应该是：

### `whiteboard-core`

负责纯算法、纯数据模型、纯投影逻辑。

### `whiteboard-editor`

负责状态 runtime。

只保留：

- committed state
- transient state
- read
- commands
- query
- committed/transient 合成后的 runtime 视图

### `whiteboard-react`

负责：

- DOM / React 输入监听
- input driver
- interaction kernel
- 具体 interaction 编排
- 渲染

也就是说：

**interaction 作为“怎么操作 editor”的行为层，先整体放到 `whiteboard-react`，不要继续放在 `whiteboard-editor`。**

---

## 为什么这是当前最简单的方案

如果继续把 interactions 放在 `editor`，会有几个结构性问题：

1. `editor` 被迫理解输入语义  
   例如 `pointerdown/move/up`、hold、hover、space、wheel、blur。

2. `editor` 会继续变成行为中心  
   而不是状态 runtime。

3. `createEditor` 会继续承担事件桥接和交互装配  
   难以瘦身。

4. feature 复杂度会不断回流到 editor 中轴  
   例如 selection、edge、draw、viewport、mindmap。

如果新开一个 `whiteboard-interactions` 包，理论上边界更干净，但在当前阶段会多一层工程成本：

- 多一个包
- 多一层导出和依赖组织
- 多一层构建与类型边界

而你现在追求的是：

- 不在乎重构成本
- 但要长期最优且尽量简单

在这个前提下，**直接把 interactions 放到 `whiteboard-react` 是最朴素、最少中间层、最容易顺下来的方案。**

---

## 最终职责边界

## 1. `whiteboard-core` 放什么

放纯函数、纯算法、纯状态推进。

典型包括：

- selection press / release / marquee / move 的纯决策
- draw stroke 采样、点集处理、成形
- edge connect / reconnect / route 的纯状态推进
- node drag / resize / rotate 的纯投影
- mindmap drag / drop 的纯推演
- bounds / geometry / query helper

判断标准：

- 不依赖 React
- 不依赖 editor runtime 实例
- 不依赖 DOM
- 输入输出清晰

凡是满足这些条件的交互算法，都尽量放进 `core`。

---

## 2. `whiteboard-editor` 放什么

`editor` 应被定义为状态 runtime，而不是交互层。

### 2.1 editor 必须保留的内容

- committed state 读写
- transient state 读写
- read
- commands
- query
- viewport runtime
- selection / tool / edit / drawPreferences 等 runtime state
- overlay 或未来更窄的 transient store
- committed 与 transient 合成后的 read 视图

### 2.2 editor 可以对外暴露的内容

- `read`
- `state`
- `commands`
- `input` 可以继续保留，但应理解成“低级输入写口”
- `configure`
- `dispose`

这里有个关键点：

即使 `editor.input` 继续存在，它也不该再承载高层 interaction 编排。  
它更像底层 runtime 的输入写口，或未来甚至可以进一步收窄。

### 2.3 editor 不该再放的内容

- selection press / marquee / node drag 的交互流程
- draw / erase 的 pointer 生命周期
- edge connect / route edit 的交互编排
- viewport hand / pan 的输入策略
- mindmap drag 的启动和推进
- hold / hover / watch / keyboard policy

这些都不属于“状态 runtime”。

---

## 3. `whiteboard-react` 放什么

`whiteboard-react` 不是只负责渲染，它应该成为 React host 下的行为层。

### 3.1 React 侧必须承担的内容

- DOM / React 事件监听
- input normalization
- input driver
- interaction kernel
- feature interactions
- 平台相关能力
  - focus
  - blur
  - pointer capture
  - clipboard
  - keyboard
  - wheel
  - context menu

### 3.2 React 侧 interaction 的本质

它做的是：

- 读取 editor 当前状态
- 组合 core 的纯算法
- 决定收到某个输入时如何操作 editor

一句话：

**React 侧 interaction 是 editor 的行为编排层。**

这和“React 只是薄壳”不是一回事。  
对于当前产品形态，React 侧就是宿主层，宿主层持有 interaction 完全合理。

---

## 为什么 interaction 放 React 比放 editor 更合理

## 1. interaction 本质上是 host 行为

interaction 不是文档状态本身，而是“用户如何通过当前 host 操作文档”。

例如：

- 鼠标按下之后是否开始拖拽
- 按住空格是否转 hand 模式
- wheel 是缩放还是滚动
- blur 时是否 cancel
- pointer leave 时是否继续 hover

这些都明显更接近 host，而不是 editor kernel。

## 2. React 本来就有事件入口

既然现在 host 已经是 React，那么最自然的路径就是：

- React 收事件
- React 做交互编排
- React 调 editor

而不是：

- React 收事件
- 转进 editor
- editor 再跑交互中轴
- editor 再回写 transient
- React 再渲染

后者多了一层不必要的往返。

## 3. editor 更容易瘦身

只要 interactions 还在 editor 里，editor 就永远会长回一个行为中心。

只有把它们整体搬出去，editor 才可能真正成为：

- 状态 runtime
- 合成 runtime
- query / commands 层

---

## 最简单的最终结构

建议最终收成下面这个结构。

## `packages/whiteboard-core`

- `selection/*`
- `draw/*`
- `edge/*`
- `node/*`
- `mindmap/*`
- `geometry/*`
- 其他纯算法

## `packages/whiteboard-editor`

- `runtime/state/*`
- `runtime/read/*`
- `runtime/commands/*`
- `runtime/query/*`
- `runtime/viewport/*`
- `runtime/transient/*` 或现有 overlay 的后续演进
- `runtime/editor/*`
- `types/editor/*`

不再有：

- `src/interactions/*`
- `runtime/interaction/*`

## `packages/whiteboard-react`

建议新增明确目录：

- `src/interactions/driver/*`
- `src/interactions/kernel/*`
- `src/interactions/selection/*`
- `src/interactions/draw/*`
- `src/interactions/edge/*`
- `src/interactions/viewport/*`
- `src/interactions/mindmap/*`
- `src/interactions/shared/*`

这样语义非常直接：

- editor 是 runtime
- react 是 interaction host

---

## Interaction 在 React 里的最简模型

这里不建议继续做很重的抽象，也不建议先上 effect system。

最简单的模型是三层：

## 1. Input Driver

放在 `whiteboard-react`。

职责：

- 接 `pointerdown/move/up/cancel/leave`
- 接 `wheel`
- 接 `keydown/up`
- 接 `blur`
- 归一化输入
- 调 kernel

不做：

- 业务规则
- 复杂状态推进

## 2. Interaction Kernel

放在 `whiteboard-react`。

职责：

- 注册各 interaction
- idle 时决定谁 start
- busy 时把后续输入交给 active interaction
- 管理当前 active

不做：

- 具体 selection / edge / draw 细节
- overlay 细节
- commands 细节

## 3. Feature Interactions

放在 `whiteboard-react/src/interactions/*`

职责：

- 真正实现 selection / draw / edge / viewport / mindmap
- 允许直接：
  - 读 editor
  - 算一点
  - 写 transient
  - 再算一点
  - 发 command

这里不强行上全局 effect 对象。

只要求：

- 写法集中
- 出口稳定
- 不把复杂度再推回 kernel

---

## 什么要从 editor 搬到 React

## 1. 必搬

这些必须搬出 `whiteboard-editor`：

- `src/interactions/draw/*`
- `src/interactions/edge/*`
- `src/interactions/selection/*`
- `src/interactions/transform/*`
- `src/interactions/viewport.ts`
- `src/interactions/insert.ts`
- `src/interactions/mindmap.ts`
- `src/runtime/interaction/*`

原因：

- 它们本质上都是交互编排或输入调度
- 不属于状态 runtime

## 2. 视情况改名或重组

这些内容大概率也要跟着重组：

- `runtime/interaction/config.ts`
  - 例如 `GestureTuning`
- `runtime/interaction/ctx.ts`
- 和 interaction 强绑定的类型

它们要么迁到 `whiteboard-react`，要么下沉到 `core`。

## 3. 不搬

这些应留在 editor：

- `runtime/state/*`
- `runtime/read/*`
- `runtime/commands/*`
- `runtime/query/*`
- `runtime/viewport.ts`
- `runtime/clipboard.ts` 中真正属于 runtime 的部分
- `runtime/overlay.ts` 或未来 transient 层

---

## 哪些要下沉到 core，哪些留在 React

这是最关键的一条判断线。

## 下沉到 core 的标准

满足以下条件就尽量下沉：

- 不依赖 React
- 不依赖 editor 实例
- 不依赖 DOM
- 本质是纯算法或纯状态推进

例如：

- `resolveSelectionPressDecision`
- `matchSelectionRelease`
- `startMarqueeSession / stepMarqueeSession / finishMarqueeSession`
- draw stroke 的采样和成形
- edge connect / reconnect / route 的纯推进
- transform project / commit input 计算

## 留在 React 的标准

满足以下条件就留在 React：

- 需要读 editor runtime
- 需要直接调 commands
- 需要直接写 transient
- 需要处理 host 输入策略
- 需要协调多个 core 算法

例如：

- 哪个 interaction 先启动
- 当前 pointer 是否进入 active drag
- hover guide 的驱动
- viewport pan 的 host 逻辑
- 输入生命周期管理

---

## 对 `createEditor` 的直接影响

把 interactions 搬到 React 后，`createEditor` 应显著简化。

### 现在 `createEditor` 里不该再做的事

- 创建 interaction runtime
- 装配 feature interactions
- 把 pointer 输入直接分发给 feature
- 维护 interaction owner 列表

### `createEditor` 剩下应该做的事

- 创建 runtime state
- 创建 read
- 创建 commands
- 创建 query
- 创建 transient
- 创建 viewport runtime
- 暴露 editor facade

这样 `createEditor` 就会从“总装厂 + 输入总线”收成真正的 runtime factory。

---

## 对 React 层的直接影响

React 侧需要新增一条明确的 interaction 装配链。

建议形成下面这些模块：

## 1. `useEditorDriver` 或同等实例工厂

职责：

- 基于 editor 实例创建 input driver
- 组装 kernel 和 feature interactions
- 暴露给 canvas/container lifecycle 绑定

## 2. `useCanvasHandlers` 或同等生命周期模块

职责：

- 从 React 事件里提取语义输入
- 调 driver

## 3. interaction feature 目录

每个 feature interaction 放在 React 侧：

- draw
- edge
- selection
- transform
- viewport
- insert
- mindmap

---

## 推荐实施顺序

为了最简单，不建议一开始就混着改。

### 第 1 步

先在文档和类型上明确边界：

- editor 不再承载 interactions
- react 成为 interaction host

### 第 2 步

把 `runtime/interaction/*` 从 editor 中抽成 React 侧的：

- input driver
- interaction kernel

这一步先只搬中轴，不急着把所有 feature 一次性重写完。

### 第 3 步

把 feature interactions 按目录整体迁到 React：

- draw
- edge
- selection
- transform
- viewport
- insert
- mindmap

### 第 4 步

迁移过程中同步下沉纯算法到 core。

原则是：

- React 侧只保留 orchestration
- core 收纯算法

### 第 5 步

最后清理 editor 中残留的 interaction 类型、装配、导出。

---

## 迁移后的判断标准

拆完之后，如果架构是对的，应该能用下面几句话解释：

### 对 editor

“editor 只负责状态 runtime、read、commands、query、transient，以及 committed/transient 合成。”

### 对 React

“React 负责 host 输入、interaction 编排和渲染。”

### 对 core

“core 负责纯交互算法和纯投影函数。”

如果还需要说：

- editor 里还有 selection press runtime
- editor 里还有 edge connect owner
- editor 里还有 viewport input policy

那就说明还没拆干净。

---

## 这条方案为什么比新开包更适合当前阶段

因为它多满足了两个现实目标：

1. 最少层  
   不多引入一个 `interactions` 包。

2. 最大收益  
   直接把 editor 从行为中心里解放出来。

你们之后如果真的需要：

- 非 React host
- 插件侧复用 interaction
- 独立测试 harness

再把 React 侧 interaction 抽成独立包也完全来得及。

也就是说：

**先放到 `whiteboard-react` 不是妥协，而是当前阶段最简单、最干净的长期最优路径。**

---

## 一句话结论

当前最简单的正确拆法是：

- `core` 放纯交互算法
- `editor` 收成纯状态 runtime
- `react` 承担输入监听、interaction kernel 和具体 interaction 编排

不要继续让 `editor` 既做状态 runtime，又做具体交互行为中心。  
先把 interactions 整体搬到 `whiteboard-react`，是当前阶段最简单、也最容易把架构理顺的方案。
