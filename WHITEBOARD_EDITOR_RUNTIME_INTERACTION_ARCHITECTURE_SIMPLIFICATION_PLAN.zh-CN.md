# Whiteboard Editor Runtime / Interaction 架构收敛方案

## 目标

这份文档回答三个问题：

1. `whiteboard/packages/whiteboard-editor/src/runtime/edge` 与 `whiteboard/packages/whiteboard-editor/src/interactions/edge` 这种双目录拆分是否合理
2. `whiteboard-editor` 当前整体文件组织是否已经出现系统性问题
3. 如果目标是显著提升可读性、降低复杂度、减少中间层，长期终态应该收敛成什么结构

本文不讨论“最低成本兼容迁移”，只讨论长期最优结构。

约束如下：

- 不为了历史路径保留兼容壳目录
- 不把“再多一层抽象”当成优化
- 不以“拆成更多小 helper 文件”为目标
- 优先解决目录语义失真、命名冲突、反向依赖、层次跳转过多的问题

## 一句话结论

当前结构已经有明显问题，而且问题不只在 edge。

`whiteboard-editor` 现在最大的问题，不是某几个文件太大，而是：

- 同一个 feature 被拆散到多个顶层目录
- `interaction` 一词同时表示 kernel、feature start、feature session 三种含义
- `read` 混入 presentation，`commands` 混入 overlay/local write
- `runtime -> interactions` 已经出现反向依赖
- 根级 `draw/*`、`selection/*` 又形成了第三套并行命名空间

所以长期最优不是继续在现有目录里“补更多 runtime 轴”，而是直接把目录语义收正为：

- `editor/`
- `input/core/`
- `input/<feature>/`
- `model/`
- `state/`
- `read/`
- `presentation/`
- `write/`
- `overlay/`

也就是说：

- 取消 `interactions/*` 作为独立顶层语义目录
- 不再保留 `runtime/<feature>` 与 `interactions/<feature>` 的双层并行
- 让 feature input flow 在一个命名空间内闭合
- 让 read / presentation / write 回到各自明确语义

## 现状总诊断

## 1. `interactions/*` 已经不是一个单一语义目录

当前 `interactions/*` 内部混杂了几种完全不同的职责：

- feature session projector
- 完整 feature 实现
- service
- reducer / state machine
- 组装层

具体表现如下：

- `interactions/edge/*`、`interactions/selection/press.ts`、`interactions/draw/stroke.ts`、`interactions/mindmap.ts` 更像 session projector
- `interactions/transform.ts`、`interactions/draw/erase.ts`、`interactions/viewport.ts` 仍然自己承担整条 feature 流程
- `interactions/edge/hover.ts` 实际上是 hover service
- `interactions/index.ts` 只是 bindings 装配入口
- `interactions/context.ts` 只是一个类型桶

这说明 `interactions/*` 已经不再表达一个稳定层次。

继续保留这个目录，只会让“哪些逻辑应当放进 interactions”越来越靠惯性决定，而不是靠明确语义决定。

## 2. `interaction` 这个词被复用了三次，而且含义不同

当前同时存在：

1. `runtime/interaction/*`
   这里实际上是 pointer / wheel / keyboard session kernel
2. `runtime/edge/interaction.ts`
   这里实际上是 edge feature 的 start/router
3. `interactions/edge/*`
   这里实际上是 edge feature 的 session projector

这会带来持续的理解负担：

- `interaction` 到底指 kernel 还是 feature
- `startEdgeInteraction` 与 `createInteractionRuntime` 是否同层
- 哪些文件在表达输入基础设施，哪些文件在表达业务交互

命名歧义本身已经说明目录语义落后于实际演进。

## 3. 已出现明确的 `runtime -> interactions` 反向依赖

这是当前最硬的结构性证据。

已有反向依赖包括：

- `runtime/editor/createEditor.ts` 依赖 `interactions/context.ts`
- `runtime/editor/createEditor.ts` 依赖 `interactions/index.ts`
- `runtime/editor/createEditor.ts` 依赖 `interactions/edge/hover.ts`
- `runtime/editor/input.ts` 依赖 `interactions/edge/hover.ts`
- `runtime/overlay/types.ts` 依赖 `interactions/selection/marqueeState.ts`

这说明至少有三类对象被放错了地方：

- feature shared type
- feature service
- feature input 装配入口

一旦 runtime 需要从 interactions 倒拿类型和服务，这个分层就已经失真。

## 4. `read`、`presentation`、`write` 的语义被混在了一起

### `runtime/read/*` 混入了 presentation

当前 `runtime/read/*` 下不只是纯读模型，还包含：

- `runtime/read/presentation.ts`
- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`

这几类文件在做的事情包括：

- toolbar value 归一化
- selection overlay projection
- edge toolbar context projection
- mixed value / display value 整理

它们不是“纯 read”，而是“基于 read 的 UI 投影”。

### `runtime/commands/*` 混入了 overlay/local write

`runtime/commands/index.ts` 当前聚合了：

- engine document / node / edge / mindmap 写入
- session local write
- view write
- preview write

其中 preview write 实际实现放在 `runtime/overlay/preview.ts`，但又被装回 `commands` 语义里。

这不是功能错误，但会持续模糊“写引擎状态”和“写本地预览状态”的边界。

## 5. 根级 `draw/*`、`selection/*` 形成了第三套命名空间

当前除了 `runtime/*` 与 `interactions/*` 外，还存在：

- 根级 `draw.ts`
- 根级 `draw/index.ts`
- 根级 `draw/model.ts`
- 根级 `draw/state.ts`
- 根级 `selection/index.ts`

这些文件本身没有实现问题，但命名组织有问题：

- `draw` 同时出现在 root、`runtime/draw`、`interactions/draw`
- `selection/index.ts` 只是薄 re-export，却占了一个顶层 feature 名字

也就是说，单一个 feature 名称被散落到三套平行空间。

这会直接拉高检索和定位成本。

## 6. 存在只增加跳转、不增加信息的装配层

当前有几层是“存在但信息增益不高”的：

- `interactions/index.ts`
- `interactions/context.ts`
- `interactions/edge/index.ts` 再转发到 `runtime/edge/interaction.ts`

这些层的问题不是代码量，而是：

- 文件名看起来像一层
- 实际只是在把另一层再包一层

这就是中间层过多的典型表现。

## 二、分领域审计

## 1. Edge：方向对了，但停在半迁移状态

### 现状

当前 edge 相关逻辑主要分布在：

- `runtime/edge/connect.ts`
- `runtime/edge/move.ts`
- `runtime/edge/route.ts`
- `runtime/edge/interaction.ts`
- `interactions/edge/connect.ts`
- `interactions/edge/move.ts`
- `interactions/edge/routePoint.ts`
- `interactions/edge/index.ts`
- `interactions/edge/hover.ts`

### 现有优点

- connect / move / route 已经有明确 feature axis
- session projector 已经比旧实现薄很多
- edge feature 的核心领域语义比其他 feature 更清晰

### 主要问题

#### 1. `runtime/edge/interaction.ts` 语义正确，命名错误

它做的是 feature start/router，不是 generic interaction。

长期应该改成类似：

- `start.ts`
- `router.ts`
- `begin.ts`

而不是继续叫 `interaction.ts`。

#### 2. 现在形成了 router-on-router

当前链路大致是：

1. `interactions/edge/index.ts`
2. `runtime/edge/interaction.ts`
3. `runtime/edge/{connect,move,route}.ts`
4. `interactions/edge/{connect,move,routePoint}.ts`

这里真正必要的是：

- 一个 feature start/router
- 若干 axis
- 若干 session

现在的 `index.ts -> interaction.ts` 两跳并没有带来足够信息增益。

#### 3. `edge/hover.ts` 明显放错目录

`interactions/edge/hover.ts` 被 editor 入口直接依赖：

- `runtime/editor/createEditor.ts`
- `runtime/editor/input.ts`

这说明它不是 session 文件，而是 feature service。

它应当成为 edge feature 的公共能力，而不是 interactions 目录里的特例。

### 结论

edge 不是设计失败，而是迁移停在半程。

长期最优结构不是继续拆更多 helper，而是：

1. 让 edge input flow 收口到一个 feature 目录
2. 取消 `interaction` 命名歧义
3. 移出 `hover` 这类 feature service
4. 删除无收益的双 router

## 2. Selection：领域轴已经出现，但重心失衡

### 现状

selection 相关逻辑主要分布在：

- `runtime/selection/press.ts`
- `runtime/selection/edit.ts`
- `interactions/selection/press.ts`
- `interactions/selection/move.ts`
- `interactions/selection/marquee.ts`
- `interactions/selection/marqueeState.ts`
- `runtime/overlay/types.ts`

### 现有优点

- `press` 的 target / plan / match 已明显下沉到 runtime axis
- `marqueeState.ts` 作为 reducer 文件本身是合理的
- interaction 层相比旧实现已经明显变薄

### 主要问题

#### 1. `runtime/selection/press.ts` 负担过重

该文件同时承担：

- target normalize
- mode resolve
- subject resolve
- group / node / background plan resolve
- tap match

这仍属于同一领域，但已经超过单文件最佳认知体量。

这里不需要继续引入一堆微型 helper 文件，而是要按语义子块拆成 2 到 3 个近邻文件。

#### 2. `MarqueeMatch` 放错位置

`runtime/overlay/types.ts` 依赖 `interactions/selection/marqueeState.ts` 的 `MarqueeMatch`。

这说明 marquee 的共享类型被埋在 reducer 文件内部，造成 runtime 反向依赖。

共享类型应该放到 selection feature shared type 或 model 层，而不是放在 session/reducer 文件里。

#### 3. selection feature 仍跨两个顶层目录

现在理解 selection 一条链路，仍要在下面几处来回跳：

- `runtime/selection/*`
- `interactions/selection/*`
- `runtime/overlay/*`
- `runtime/read/selection.ts`

这使得 selection 成为“读起来不像一个 feature”的典型案例。

### 结论

selection 接下来应该做的不是再补一层轴，而是：

1. 把 `press` 重心拆平
2. 把 marquee shared type 移出 reducer
3. 像 edge 一样，把 feature input 相关文件收口到单一命名空间

## 3. Draw：模型、状态、输入流程三处分裂

### 现状

draw 相关逻辑当前分布在：

- 根级 `draw/model.ts`
- 根级 `draw/state.ts`
- 根级 `draw.ts`
- `runtime/draw/stroke.ts`
- `interactions/draw/stroke.ts`
- `interactions/draw/erase.ts`

### 主要问题

#### 1. `draw` 这个名字被三处复用

要读清 draw 相关能力，必须跨：

- root `draw/*`
- `runtime/draw/*`
- `interactions/draw/*`

这不是“模块化”，而是命名空间碎裂。

#### 2. `stroke` 已经轴化，`erase` 还停在旧风格

当前 draw 内部已经出现两种架构风格：

- `stroke` 走 runtime axis + session projector
- `erase` 仍在 interaction 文件里自己管完整流程

这会导致 draw feature 内部也没有统一组织原则。

#### 3. 根级 `draw.ts` 进一步放大歧义

`src/draw.ts` 只是 `./draw/index` 的再导出，但又额外占用了一个顶层入口名。

这会让外部引用与目录组织都更模糊。

### 结论

draw 的长期最优不是保留现状并继续细拆，而是：

1. 把 draw model/state 迁到明确的 `model/draw/*`
2. 把 draw input flow 迁到单一 feature 目录
3. 让 `stroke` 与 `erase` 采用同一种 input 组织方式

## 4. Transform：当前最明显的“未轴化”大文件

### 现状

`interactions/transform.ts` 仍然自己承担：

- pick -> spec resolve
- single / multi transform 分流
- text transform 特判
- session projection
- commit

虽然它会调用 `runtime/node/textTransform.ts` 等下游能力，但从 editor 内部结构上看，它仍然是 interaction 自己完成整条 feature。

### 问题判断

transform 是当前最明显的架构不一致点之一：

- edge 已有 feature axis
- selection 已有 feature axis
- draw.stroke 已有 feature axis
- mindmap.drag 已有 feature axis
- transform 仍停留在 interaction 大文件

### 结论

transform 是下一批必须补齐 axis 的 feature，而且优先级高于 viewport、mindmap 等命名整理项。

## 5. Mindmap：结构方向对，命名空间未并轨

### 现状

主要文件只有两处：

- `runtime/mindmap/drag.ts`
- `interactions/mindmap.ts`

### 判断

这条链路本身比较清楚，问题不在实现，而在全局一致性：

- 如果 edge / selection / draw / transform 都统一到 feature input 目录
- mindmap 也不应继续作为“单文件 interaction + runtime axis”的孤例存在

### 结论

mindmap 不是复杂度热点，但应该在目录收敛时一并并轨。

## 6. Viewport：逻辑简单，但命名要跟随整体收口

`interactions/viewport.ts` 本身并不是大问题。

它的问题在于：

- 当前整体要取消独立 `interactions/*`
- 那么 viewport 也应该归入统一的 input feature 目录

因此 viewport 是低优先级命名整理项，不是复杂度中心。

## 7. Read / Presentation：是 edge 之外的另一条主问题线

### 现状

当前 `runtime/read/*` 下同时存在：

- 纯读模型文件，如 `node.ts`、`edge.ts`
- UI projection 文件，如 `presentation.ts`、`selection.ts`、`edgeToolbar.ts`

### 具体问题

#### 1. `read/presentation.ts` 这个文件名已经说明层次错位

它不是纯 read，而是在做 presentation。

把它留在 `read/` 下，等于在目录层面默认“read 可以混 UI projection”。

#### 2. `createTargetRead(...)` 被重复局部构造

它至少在下列位置被构造：

- `runtime/read/index.ts`
- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`

这说明 target read 是一个共享 read service，但依赖组织仍然偏散。

这不是性能问题，是真正的结构信号：

- 同一个 shared read 能力没有稳定宿主
- presentation 子模块在各自拉起依赖

### 结论

长期最优必须把：

- 纯 read
- toolbar / overlay / mixed-value projection

拆成两个明确命名空间。

## 8. Write / Commands / Overlay：写侧命名也不纯

### 现状

`runtime/commands/index.ts` 当前聚合：

- `document`
- `node`
- `edge`
- `mindmap`
- `selection`
- `clipboard`
- `history`
- `edit`
- `session`
- `view`
- `preview`

其中 `preview` 的实际实现又在 `runtime/overlay/preview.ts`。

### 问题判断

从调用侧看它们都叫 command 没问题，但从架构语义上不是一类东西：

- engine durable write
- runtime local state write
- overlay preview write

继续把它们都塞进 `commands`，会让“写的是什么”越来越不清楚。

### 结论

长期应把 `commands` 收敛为更中性的 `write`，并明确分出：

- document / engine write
- session / local write
- view write
- overlay write

## 9. Editor 装配层：目前承担了不必要的跨层拼接

### 现状

`runtime/editor/createEditor.ts` 当前同时装配：

- interaction kernel
- read
- overlay
- state
- commands
- `InteractionContext`
- `createEditorInteractions`
- `createEdgeHoverService`

而后面三者来自 `interactions/*`。

### 问题判断

这里的问题不是 createEditor 装配太多，而是：

- 装配点必须了解 interactions 的内部结构
- editor 入口直接拿 feature service 与 feature registry
- `interactions/index.ts` 与 `interactions/context.ts` 只是“为了装配而存在”

这说明 feature input 的公共入口没有独立语义位置。

### 结论

长期应让 editor 只依赖：

- `input/core`
- `input/index`
- `read`
- `write`
- `overlay`
- `state`

而不是依赖某个叫 `interactions` 的历史目录。

## 三、真正需要优化的不是“helper 数量”，而是信息流

## 1. 当前主要问题不是纯函数 helper 多，而是目录跳转过多

理解一个 feature 往往要在以下目录反复横跳：

- `interactions/<feature>`
- `runtime/<feature>`
- `runtime/interaction`
- `runtime/read`
- 根级 `<feature>`

阅读者的真正负担是：

- 必须先定位“这条链路在哪些目录”
- 再判断每一层到底是 router、axis、session 还是 service

这比单文件内部多几个 helper 更伤可读性。

## 2. 文件内部组织的长期规则

当前一些大文件的问题，也确实需要靠内部重组解决，但原则应当非常明确。

### Axis 文件

适用于：

- edge connect / move / route
- selection press
- transform

建议规则：

- 一个主入口，按 top-down 顺序组织
- 只导出 feature 级入口，不导出一串阶段函数
- 共享状态在单个局部 state bag 中流动，不要跨十几个 helper 反复穿参
- 只有在同一逻辑被多个 axis 复用时，才提升为 shared helper
- 不要为了“看起来函数更小”把单一事务流程打散到过多文件

结论上，这类文件更适合：

- 以“一个主流程 + 少量语义辅助函数”为主
- 在需要管理明显阶段性共享状态时，使用局部闭包状态

而不是上来就做 class，也不是无止境地拆成很多平级小函数。

### Session 文件

适用于：

- edge connect/move/route session
- draw stroke / erase session
- selection marquee / move / press session

建议规则：

- 一个 session factory
- 内部按 `pointerDown / pointerMove / pointerUp / cancel` 顺序展开
- 只提取跨多个 session 共享的 gesture / autopan 辅助逻辑
- session 文件不承载领域判定，只承载输入投影和生命周期管理

### Read / Presentation 文件

建议规则：

- `read/*` 只返回模型语义，不做 toolbar / UI shape 决策
- `presentation/*` 才负责 mixed value、toolbar context、overlay-facing shape

### Write 文件

建议规则：

- 按“写到哪里”分类，不按“谁方便调”分类
- overlay preview write 归 write，不归 overlay 本体实现目录

## 四、长期目标结构

## 1. 顶层原则

长期终态建议不再保留 `runtime/` 这个总桶目录。

原因很直接：

- 所有这些代码本来就都在 runtime 中运行
- `runtime/` 同时包着 feature、kernel、editor、read、commands、overlay、state
- 这个目录名已经失去区分价值

长期更清晰的顶层是按语义分区，而不是按“都属于 runtime”分区。

## 2. 目标目录建议

```txt
src/
  editor/
    createEditor.ts
    input.ts
    state.ts
    types.ts

  input/
    index.ts
    types.ts

    core/
      runtime.ts
      types.ts
      result.ts
      autoPan.ts
      gesture.ts
      snap.ts

    edge/
      start.ts
      hover.ts
      connectAxis.ts
      connectSession.ts
      moveAxis.ts
      moveSession.ts
      routeAxis.ts
      routeSession.ts

    selection/
      shared.ts
      press/
        resolve.ts
        plan.ts
        session.ts
      marquee/
        state.ts
        session.ts
      moveSession.ts

    draw/
      strokeAxis.ts
      strokeSession.ts
      eraseAxis.ts
      eraseSession.ts

    mindmap/
      dragAxis.ts
      dragSession.ts

    transform/
      axis.ts
      text.ts
      session.ts

    viewport/
      session.ts

  model/
    draw/
      model.ts
      state.ts

  state/
    draw.ts
    edit.ts
    selection.ts
    store.ts
    index.ts

  read/
    index.ts
    node.ts
    edge.ts
    mindmap.ts
    target.ts
    selectionModel.ts

  presentation/
    selection.ts
    edgeToolbar.ts
    nodeToolbar.ts

  write/
    index.ts
    document.ts
    node.ts
    edge.ts
    mindmap.ts
    selection.ts
    session.ts
    view.ts
    overlay.ts
    edit.ts

  overlay/
    state.ts
    selectors.ts
    node.ts
    edge.ts
    types.ts

  types/
    ...
```

这套结构的关键点不是“目录更漂亮”，而是：

- feature input 只在一个命名空间里找
- core input kernel 只有一个清晰宿主
- draw model/state 有明确归属
- read / presentation / write 语义彻底分开
- editor 装配只依赖公开入口，不依赖历史目录内部实现

## 3. 目标依赖规则

终态应满足下面这些依赖方向：

- `editor -> input | read | write | overlay | state`
- `input/<feature> -> input/core | read | write | state | model`
- `presentation -> read | state | overlay | types`
- `write -> engine | state | overlay | read`
- `overlay` 不反向依赖 `input`
- `read` 不依赖 `presentation`
- `state` 不依赖 `input`

明确禁止：

- `overlay -> input/<feature>/session`
- `editor -> input/<feature>/私有文件`
- `write -> presentation`
- `read -> presentation`

## 五、必须直接删掉或合并的中间层

以下内容从长期结构上都不应该继续保留：

## 1. 顶层 `interactions/*`

原因：

- 语义已经失真
- 它不再代表单一层次
- 继续保留只会让 feature input 继续横跨两个顶层目录

## 2. `runtime/<feature>` 与 `interactions/<feature>` 的双 feature 目录

原因：

- feature 本身已经被拆成两层壳
- 阅读一个 feature 需要多次跳转
- 很容易演变成 router-on-router

## 3. `runtime/edge/interaction.ts` 这个命名

原因：

- 与 `runtime/interaction/*` 冲突
- 它表达的是 feature start/router，不是 interaction kernel

## 4. `interactions/index.ts` 与 `interactions/context.ts` 这类历史装配层

原因：

- 它们只是在给 createEditor 装配兜底
- 不应该继续作为独立架构层存在

## 5. 根级 `draw.ts`、`draw/*`、`selection/index.ts` 这类模糊顶层 feature 入口

原因：

- 会与 feature input 目录、types 目录、model 目录重复占名
- 会持续制造“这个 feature 到底在哪一层”的歧义

## 六、各领域的建议动作

## Edge

1. `runtime/edge/interaction.ts` 改为 feature start/router 命名并并入 edge feature 目录
2. `interactions/edge/hover.ts` 上收为 edge feature 公共 service
3. `connect/move/route` axis 与 session 合并到单一 `input/edge/*`
4. 删除 `interactions/edge/index.ts -> runtime/edge/interaction.ts` 的双 router

## Selection

1. 将 `runtime/selection/press.ts` 按语义拆成 2 到 3 个近邻文件
2. 将 `MarqueeMatch` 移到 selection shared type
3. `marqueeState.ts` 保留 reducer 角色，但不再承载跨层共享类型
4. selection input 相关文件全部收进同一 feature 命名空间

## Draw

1. 根级 `draw/*` 迁到 `model/draw/*`
2. `stroke` 与 `erase` 统一采用 axis + session 组织
3. 删掉根级 `draw.ts` 这种额外壳入口

## Transform

1. 从 `interactions/transform.ts` 拆出正式的 feature axis
2. 将 text transform 特判作为 transform feature 内部 specialization
3. 让 transform 与其他复杂 feature 采用一致的 input 结构

## Mindmap

1. 保持现有 axis + session 思路
2. 在目录收敛时一并迁入统一 feature 目录

## Viewport

1. 不作为复杂度优化重点
2. 仅跟随 input 目录统一命名收口

## Read / Presentation

1. `runtime/read/presentation.ts` 拆出到 `presentation/*`
2. `edgeToolbar` 与 selection overlay / toolbar projection 迁到 `presentation/*`
3. `createTargetRead(...)` 只创建一次，由 read 根入口向下分发

## Write / Overlay

1. `commands` 更名为 `write`
2. `preview` 从 `overlay/preview.ts` 的命名语义迁成 `write/overlay.ts`
3. 保留 overlay 作为状态与 selector 宿主，不再让它兼任 write 分类名

## Editor / State

1. editor 只依赖公开装配入口，不依赖 `interactions/*`
2. 本地 session state 继续保留在 `state/*`
3. `editor/state.ts` 只负责 public store 投影，不掺 feature 输入细节

## 七、推荐实施顺序

这里的“分阶段”是为了降低一次改动风险，不是为了保留兼容层。

每一阶段完成后，都应直接删除旧路径，不做长时间双轨。

## 阶段 1：命名与反向依赖清理

目标：

- 去掉最明显的结构污染点，不改行为

动作：

- `runtime/interaction/*` 更名为 `input/core/*`
- 把 `InteractionContext` 移出 `interactions/context.ts`
- 把 `createEditorInteractions` 移到 `input/index.ts`
- 把 `edgeHover` 移到 edge feature 公共目录
- 把 `MarqueeMatch` 移到 selection shared type

结果要求：

- 不再出现 `runtime -> interactions`

## 阶段 2：feature input 目录收口

目标：

- 消除 `interactions/<feature>` 与 `runtime/<feature>` 双层并行

动作：

- edge 合并到 `input/edge/*`
- selection 合并到 `input/selection/*`
- draw 合并到 `input/draw/*`
- mindmap 合并到 `input/mindmap/*`
- viewport 合并到 `input/viewport/*`

结果要求：

- 每个 feature 的 start / axis / session / service 在同一命名空间内

## 阶段 3：补齐未轴化 feature

目标：

- 统一复杂 feature 的实现风格

动作：

- transform 轴化
- erase 轴化

结果要求：

- 不再存在“有的 feature 走 axis/session，有的 feature 仍是 interaction 大文件”的明显不一致

## 阶段 4：read / presentation / write 语义拆正

目标：

- 让目录名重新对应真实职责

动作：

- 将 presentation 逻辑从 `read/*` 移出
- 将 `commands` 收敛到 `write/*`
- 将 overlay preview write 迁成 `write/overlay.ts`
- 统一 shared read service 的构造与下发

结果要求：

- `read` 只做纯读
- `presentation` 只做 UI projection
- `write` 清楚区分 engine / session / overlay / view

## 阶段 5：处理剩余大文件重心

目标：

- 清理真正还超重的轴文件

优先级建议：

1. `selection/press`
2. `presentation` 相关大文件
3. `write/edge`
4. 视情况再处理 `read/node`

结果要求：

- 拆分以“语义子块”为单位，而不是继续制造大量平级碎文件

## 八、完成后的验收标准

长期收敛完成后，`whiteboard-editor` 应满足下面标准：

1. 不再存在任何 `runtime -> interactions` 式反向依赖
2. `interaction` 一词只保留一个含义：input kernel
3. 同一 feature 的 start / axis / session / hover / reducer 尽量在同一命名空间内
4. `read` 目录不再包含 toolbar / overlay / mixed-value UI projection
5. `write` 目录能明确区分 engine write、session/local write、overlay write、view write
6. 根级不再存在与 feature 目录并行的模糊命名空间，例如当前的 `draw/*`
7. `createEditor` 只依赖公开入口，不依赖 feature 私有实现文件
8. 大型 axis 文件的拆分以“信息流清晰”为目标，而不是以“函数更小”为目标

## 最终判断

对当前问题的直接判断是：

- `runtime/edge` 与 `interactions/edge` 这种拆法，在迁移中期可以接受，但不适合作为长期终态
- `whiteboard-editor` 整体文件组织已经出现系统性问题，而且不只局限于 edge
- 真正需要减少的不是 helper 数量，而是顶层命名空间数量、层次歧义和目录跳转次数

所以长期最优方案不是继续“在现有结构里微调”，而是直接收敛为：

- `editor`
- `input/core`
- `input/<feature>`
- `model`
- `state`
- `read`
- `presentation`
- `write`
- `overlay`

只有这样，后续继续推进 selection、edge、transform、draw 的简化时，复杂度才不会再次散落到新的中间层里。
