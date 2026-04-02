# Whiteboard Editor 全局异味审查与长期最优重构方案

## 目标

这份文档不是列零散代码风格问题，而是从 `packages/whiteboard-editor/src` 整体出发，找出当前仍然异味较重、复杂度偏高、会持续拉高维护成本的主干模块，并给出长期最优的重构方向。

约束前提：

- 不考虑兼容层
- 不考虑过渡 API
- 不以“现在已有模块边界”为前提
- 目标是长期最优、最少概念、最薄中间层

---

## 总结

当前 `whiteboard-editor` 里真正重的，不是某几个 helper，而是下面 6 条中轴链路：

1. `runtime/interaction/runtime.ts`
2. `interactions/selection/press.ts`
3. `interactions/edge/route.ts`
4. `runtime/overlay.ts`
5. `runtime/editor/createEditor.ts`
6. `runtime/read/*` + `runtime/query/targetBounds.ts` + `types/editor.ts`

它们的问题不是“代码长”本身，而是：

- 同一个模块同时承担多种职责
- feature 内部还在自建一层 runtime
- overlay 和 read 仍然是偏总线式设计
- editor 装配链还没有收成真正的薄中轴
- public surface 仍然偏大，导致装配和内部依赖一起膨胀

相对来说，下面这些模块目前边界更清楚，不是当前第一优先级：

- `interactions/viewport.ts`
- `interactions/insert.ts`
- `interactions/draw/*`
- `interactions/transform/*`
- `runtime/clipboard.ts`

---

## 评估标准

判断一个模块是否“异味重”，本次主要看 5 个维度：

1. 是否同时承担命中解析、状态机、预览写入、命令提交、清理多个职责
2. 是否为了配合中间层协议，引入了额外概念，而不是表达业务本身
3. 是否存在 feature 内部再包一层 owner/session/runtime 的情况
4. 是否对外暴露了过宽的 surface，导致依赖传播
5. 是否大量使用“全局对象 + 局部 patch/set”的方式表示临时态

---

## 模块审查

### 1. `runtime/interaction/runtime.ts`

文件：`packages/whiteboard-editor/src/runtime/interaction/runtime.ts`

这是当前最重的总控模块。

它目前同时负责：

- owner 排序
- `pointerDown` 启动 owner
- session 生命周期
- `finish/cancel` 延迟处理
- `mode/chrome` 更新
- observe 广播
- auto-pan 协调
- `Space` / `Escape` / `blur` 键盘策略
- active state 导出

这导致它不只是一个“interaction dispatcher”，而更像一台混合状态机。

### 主要异味

1. `pendingResult / pendingMode / pendingChrome` 这套协议说明 runtime 本身过强

owner 在 `start` 阶段还没正式挂载 session，就已经允许对运行结果和展示状态做补丁，这会把 feature 写法往“适配 runtime 规则”推，而不是表达业务。

2. observe、session、keyboard policy 三类逻辑混在一起

`observeMove/Leave/Blur/Cancel` 与 active session 分发在同一个 runtime 里，会让 runtime 同时承担“悬停观察器总线”和“交互会话执行器”两种角色。

3. `space` 被直接放在 interaction runtime 中

`Space` 更像输入策略或 viewport hand-mode 的一部分，不应该成为 interaction runtime 自己持有的内建状态。

4. `chrome`/`mode` 是 runtime 协议的一部分，而不是 session 自身的静态描述

这会诱导 feature 使用 `control.update()` 在运行时不断修补 session meta，而不是在启动时明确产出稳定的 session 类型。

### 根因

当前 interaction runtime 仍然承担了“系统策略层”的职责，而不是仅承担“owner arbitration + current session dispatch”。

### 长期最优模型

interaction runtime 应缩成一个极薄中轴，只负责：

- 按优先级遍历 owner
- 找到第一个可启动 owner
- 挂载当前 session
- 将后续 pointer/key/cancel 分发给当前 session
- 在 session 结束时做 cleanup

不应该继续内建：

- `space` 状态
- hover observe 广播总线
- `pendingMode/pendingChrome`
- 太多 session 外策略

### 最优改法

1. 将 observe 体系从 runtime 主流程剥离
2. 将 `space -> viewport pan` 变成独立输入策略
3. 将 session meta 变成启动时固定，不再依赖 `control.update`
4. runtime 只保留：
   - `start`
   - `move`
   - `up`
   - `cancel`
   - `blur`
   - `cleanup`

---

### 2. `interactions/selection/press.ts`

文件：`packages/whiteboard-editor/src/interactions/selection/press.ts`

这是当前 feature 内部复杂度最高的模块之一。

它的问题不在于业务本身，而在于 `selection` 内部又实现了一层“小 runtime”。

它目前做了这些事：

- down 后解析 selection subject
- 产出 press decision
- 管理 hold timeout
- 管理 press 到 active 子 session 的切换
- 在内部转发 move/up/cancel/cleanup
- 转发 auto-pan
- 根据 release 再走 click/select/edit

### 主要异味

1. `press` 不是单纯 session，而是一个 session 容器

`active: InteractionSession | null` 说明 `press` 自己不是最终业务态，而是中间态调度器。复杂度虽然没有消失，但被藏进了 selection feature。

2. hold / drag / release 三套决策被揉进一个模块

这会让“点击选择”、“拖拽移动”、“框选”、“长按进入某种 marquee”共享太多控制流。

3. `createDragSession / createHoldSession / forwardMove / activate`

这些函数的存在，说明 selection 当前模型仍然不是一个直接的 owner -> session 映射，而是“owner -> press shim -> real session”。

### 根因

selection 仍然在表达“输入阶段上的过渡态”，而不是表达“明确业务 session”。

### 长期最优模型

selection owner 在 `pointerDown` 后，不应先进入一个复杂 `press` 中间态，而应尽快收敛成以下几类明确 session：

- click-select session
- node-move session
- marquee session
- edit-start handled result

换句话说：

- `press decision` 应该是纯决策
- 不是 `press session` 内再切换 session
- 而是 `down` 后一旦越过阈值或满足条件，直接切到明确 session

### 最优改法

1. 将 `resolveSelectionPressDecision` 保留为纯决策
2. 去掉 `press session` 里的 `active` 子 session 模型
3. 将 hold 变成更窄的输入策略，而不是 press 内部状态机
4. `selection/index.ts` 最终应直接装配几种明确 session factory，而不是把复杂度集中到 `press.ts`

---

### 3. `interactions/edge/route.ts`

文件：`packages/whiteboard-editor/src/interactions/edge/route.ts`

这是当前最大的 feature 文件之一，而且复杂度来源并不纯粹。

它同时承担：

- edge body drag
- route anchor drag
- route insert
- route remove
- selection 副作用
- overlay preview
- route origin 查找
- route handle 命中解析
- command commit

### 主要异味

1. body move 和 route edit 被塞在一个文件里

虽然都属于 edge interaction，但它们是两种不同领域动作：

- body move 是整体移动 edge
- route edit 是路径编辑

这两者在 session 结构、preview 结构、commit 结构上都不完全一致。

2. 命中解析、session 投影、command 提交混合

`readRoutePoint`、`resolveRouteState`、`createRouteDragSession`、`startEdgeBodyInteraction`、`startEdgePathInteraction` 在一个文件里，让“解析”和“执行”难以分离。

3. route insert/remove 是即时动作，route drag 是持续 session，但共用一个 start 流程

这让 `InteractionStartResult` 既承担 `handled`，又承担 `session`，而且逻辑分叉很多。

### 根因

edge 目前仍然是“按输入部件分支”的代码组织，而不是“按业务动作分支”的组织。

### 长期最优模型

edge interaction 应按动作拆开：

- `connect`
- `reconnect`
- `bodyDrag`
- `routeEdit`
- `hoverGuide`

其中 `routeEdit` 内再区分：

- insert
- remove
- dragAnchor

但对外仍应是统一 edge owner。

### 最优改法

1. `body move` 和 `route edit` 拆开
2. route handle 解析下沉到 core query 或 edge read query
3. 即时动作和持续 session 不要混在一个“route start”里
4. overlay preview 的写入也按 `body preview` / `route preview` 区分

---

### 4. `runtime/overlay.ts`

文件：`packages/whiteboard-editor/src/runtime/overlay.ts`

这条线已经比之前清楚很多，但整体仍然偏“全局临时态总线”。

当前 overlay 做的事包括：

- 维护统一 `EditorOverlayState`
- normalize 各领域 state
- equality 判断
- 维护 `current`
- 同步到 node/edge/draw/mindmap/snap 的 raf store
- 从 selection.marquee 派生屏幕态 feedback
- 对外暴露 `selectors`

### 主要异味

1. 全局大对象模型仍然过重

feature 写 overlay 的方式大量是：

```ts
ctx.overlay.set((current) => ({
  ...current,
  ...
}))
```

这意味着 feature 需要知道整个 overlay 总结构，而不是只知道自己那一小块 transient state。

2. 一个入口同时服务 patch、guide、feedback、marquee、mindmap

这些东西虽然都属于“临时渲染态”，但消费方和更新频率并不完全相同。

3. normalize/equality/syncStores 成本很高

这说明 overlay 不是一个天然简单的数据结构，而是被总线化之后不得不维护的一整套一致性机制。

### 根因

overlay 目前更像“全局渲染缓存容器”，而不是“按领域划分的 transient stores”。

### 长期最优模型

不应该继续保留一个过大的 `EditorOverlayState`。

更优的模型是：

- node transient store
- edge transient store
- selection transient store
- draw transient store
- mindmap transient store

每个 store 各自有：

- `get`
- `set`
- `subscribe`
- `reset`

如果 React 侧只消费某一个领域，就直接订阅对应 transient store，不再先写入全局 overlay 再投影。

### 最优改法

1. 逐步取消统一 `overlay.set(current => ({ ... }))`
2. feature 改为直写自己的 transient store
3. screen-space projection 只保留在真正需要的 selector 上
4. `EditorOverlay` 对外 surface 收紧成按领域访问，而不是大对象状态容器

---

### 5. `runtime/editor/createEditor.ts`

文件：`packages/whiteboard-editor/src/runtime/editor/createEditor.ts`

`createEditor` 现在仍然承担过多职责，是装配层的另一大复杂源。

它目前负责：

- runtime state 初始化
- interaction runtime 初始化
- overlay 初始化
- read 初始化
- snap 初始化
- commands 初始化
- clipboard 装配
- interactions 装配
- input bridge
- interaction state 映射
- commit 订阅与 reconcile
- configure/dispose

### 主要异味

1. 装配和 host input bridge 混在一起

`createEditor` 既是对象图装配器，又是输入入口实现者。

2. interaction state 是二次映射出来的派生语义

`drawing / selecting / editingEdge / panning` 都由 `mode` 再翻译一层，这让 public state 继续依赖 runtime mode 字符串协议。

3. `writePointer / clearPointer / wheel fallback / resetRuntimeState`

这些逻辑都说明 `createEditor` 正在承担 host adapter 的工作，而不是纯装配层。

4. `InteractionCtx` 作为大上下文在这里一次性拼装

这虽然比散传参好，但也说明很多模块仍然依赖一个偏宽的中心对象。

### 根因

editor 装配链还没有形成稳定三层：

- runtime graph
- input bridge
- public facade

### 长期最优模型

`createEditor` 应只做三件事：

1. 创建底层 graph
2. 创建 public facade
3. 注册生命周期

而输入桥接、interaction state 派生、feature registry 等应拆成独立模块。

### 最优改法

建议拆成：

- `createEditorGraph`
- `createEditorInput`
- `createEditorPublic`

最终 `createEditor` 只是很薄的一层组合。

---

### 6. `runtime/read/*`、`runtime/query/targetBounds.ts`、`types/editor.ts`

相关文件：

- `packages/whiteboard-editor/src/runtime/read/node.ts`
- `packages/whiteboard-editor/src/runtime/read/edge.ts`
- `packages/whiteboard-editor/src/runtime/read/selection.ts`
- `packages/whiteboard-editor/src/runtime/query/targetBounds.ts`
- `packages/whiteboard-editor/src/types/editor.ts`

这一组问题不如 interaction 那么炸，但会持续制造噪音。

#### 6.1 `runtime/read/selection.ts`

问题：

- `summary` derive 时会先读取全量 runtime nodes
- `targetBounds` 需要单独 query 层配合
- selection summary 同时依赖 nodes、edges、runtimeNodes、bounds

这意味着 selection read 还不是一个非常干净的聚合读取模型。

长期最优：

- `selection.summary` 依赖的 query 能更内聚
- 尽量避免“先拉全量 nodes，再用于 box target 解析”

#### 6.2 `runtime/query/targetBounds.ts`

问题：

- `get` 和 `track` 基本是两套同构实现
- editor 自己再包一层 bounds query，仍显得多余

长期最优：

- 把 bounds 统一收为基于 reader 的纯函数
- editor 只保留一套 query API

#### 6.3 `runtime/read/edge.ts`

问题：

- `connectCandidates` 仍然在 editor 层手写扫描 index
- capability、resolved、idsInRect、connectCandidates 混在一个 read 对象里

长期最优：

- `connectCandidates` 应该收成明确 query，而不是 edge read 附带方法
- read 负责稳定读取，query 负责按场景检索

#### 6.4 `types/editor.ts`

问题：

- 单文件过胖
- `EditorCommands` 太宽
- public type 和内部 runtime type 互相穿透

长期最优：

- 按领域拆类型：
  - `types/editor/base.ts`
  - `types/editor/input.ts`
  - `types/editor/state.ts`
  - `types/editor/commands.ts`
  - `types/editor/config.ts`
- `Editor` 保留非常薄的 public facade

---

## 为什么有些模块现在反而相对顺

下面这些模块虽然不一定是最终形态，但目前不是主要矛盾：

### `interactions/viewport.ts`

优点：

- 只做 pan
- 启动条件清晰
- session 模型简单

### `interactions/insert.ts`

优点：

- 纯 handled 动作
- 没有多余中间状态

### `interactions/draw/*`

优点：

- 已经按 `draw` / `erase` 拆开
- `index.ts` 已经收成装配和分发层

### `interactions/transform/*`

优点：

- start / project / commit / overlay 职责相对清楚

### `runtime/clipboard.ts`

优点：

- 逻辑集中
- 输入输出清楚
- 没有再引入额外 runtime 协议

---

## 长期最优架构判断

如果完全不考虑兼容和迁移成本，`whiteboard-editor` 的长期最优方向不是继续拆更多 helper，而是收成下面的结构：

### 1. 更薄的 interaction runtime

只做：

- owner arbitration
- current session dispatch
- cleanup

不做：

- hover 广播总线
- 键盘策略集合
- UI chrome 补丁协议
- 复杂 pending 机制

### 2. 更明确的 feature session 模型

每个 feature 都应该直接表达：

- 能不能启动
- 启动后是什么 session
- session 如何 move/up/cancel/cleanup

避免：

- feature 内部再套 session
- feature 内部再写一层 mini runtime

### 3. 更窄的 transient model

替代“大 overlay 对象 + patch set”：

- 按领域的 transient stores
- 每个 feature 只写自己的一块

### 4. 更清晰的 query model

read 和 query 分离：

- read 负责稳定读取
- query 负责场景检索
- projection/bounds/selection box 一类逻辑尽量下沉 pure function 或 query 层

### 5. 更薄的 editor facade

最终 editor 对外只保留：

- `read`
- `state`
- `commands`
- `input`
- `configure`
- `dispose`

但这些 namespace 内部也要继续收紧，避免继续长成宽大全家桶。

---

## 最优重构顺序

如果按收益排序，建议这样做：

### 第 1 步

重写 `runtime/interaction/runtime.ts`。

原因：

- 这是所有 interaction feature 的上游
- 不先砍这里，feature 复杂度还会不断回流

### 第 2 步

重写 `selection`。

重点是去掉 `press session -> active sub session` 模型，改成明确的 session 产物。

### 第 3 步

重写 `edge route`。

将 `body drag` 与 `route edit` 彻底分开，并收敛 route query。

### 第 4 步

拆 `overlay`。

把大一统 overlay bus 收成按领域 transient stores。

### 第 5 步

收 `read/query/types`。

把 selection bounds、edge connect candidates、editor public types 做一次系统瘦身。

### 第 6 步

最后收 `createEditor`。

让 editor 装配链变成真正的薄 facade，而不是巨型集成点。

---

## 一句话结论

当前 `whiteboard-editor` 最重的异味，不再是零散命名或文件组织，而是三类中轴设计还偏厚：

- interaction runtime 太厚
- feature session 模型还不够直接
- overlay/read/editor assembly 仍然偏总线化

长期最优方向不是继续加 helper，而是把这些中轴削薄，让 feature 直接表达业务 session，让 transient 和 query 各自回到更窄、更稳定的位置。
