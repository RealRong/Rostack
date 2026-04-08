# Dataview React 状态链重构方案

## 背景

当前 `dataview` React 侧的复杂度，并不主要来自自定义 hooks 数量本身，而是来自状态所有权分散：

- `engine` 持有 document、projection 与基础 command。
- `react runtime` 持有 `currentView`、`selection`、`marquee`、`inlineSession`、`valueEditor`、`page` 等 session 状态。
- `table / gallery / kanban` 各自又在 controller hooks 里重复做交互编排、派生状态和副作用绑定。

结果是多个 `useXxx` hooks 不再只是“订阅状态”，而是在承担：

- 语义写操作封装
- 跨 store 约束同步
- DOM 交互状态机
- 不同视图之间重复的 controller 拼装

这会导致：

- React 层成为真正的业务中轴
- 同类逻辑在 table / gallery / kanban 中重复出现
- `currentView` 的只读 projection 和写语义混在一起
- session 状态机散落在 runtime 绑定和 page hosts 中

## 这次走查后的核心判断

### 1. 问题不是“hook 太多”，而是“hook 承担了错误职责”

仓库中导出的自定义 hooks 总数并不算异常，但真正拉高复杂度的，是少数几个大型 hooks 和 runtime 绑定：

- `dataview/src/react/dataview/runtime.ts`
- `dataview/src/react/runtime/currentView/commands.ts`
- `dataview/src/react/views/table/hooks/usePointer.ts`
- `dataview/src/react/views/gallery/useGalleryController.ts`
- `dataview/src/react/views/kanban/useKanbanController.ts`

这些模块都不只是“React 适配层”，而是在做业务语义、session 约束和交互状态机拼装。

### 2. 当前中轴被拆成了三段

当前实际运行中的中轴可以概括为：

1. `engine.read.*` 产出基础只读状态
2. `react runtime` 重新组装 `currentView + selection + page + marquee + inlineSession`
3. 各视图 controller hooks 再次拼装交互状态与 UI 派生

这意味着：

- 写路径并不直接落在 engine 的稳定能力上
- session 约束没有独立建模
- view controller 没有统一骨架

### 3. `currentView.commands` 是错误边界的明显信号

目前 `currentView` 是由 React runtime 在 projection 上外挂 `commands` 形成的“读写混合对象”。

这会带来几个问题：

- projection 原本应是只读快照，现在混入了 mutation 入口
- 相关 mutation 语义依赖 selection、grouping、appearance 等 React runtime 上下文
- engine 本身已有 `view()` service，但 `currentView.commands` 又复制了一套局部写语义

长期看，这会导致任何 view-specific 交互都倾向继续加在 React runtime，而不是回到 engine。

### 4. gallery 和 kanban 的 controller 模式高度重复

`gallery` 与 `kanban` controller 都在做几乎同一类工作：

- 读取 `currentView`
- 派生 `fields / sections / colors`
- 读取 `selection`
- 注册 `marquee adapter`
- 维护 `dragging`
- 接入拖拽 session
- 对外暴露 `selectedIdSet / select / drag / visualTargets`

这说明这里的问题不是“有两个 hook”，而是缺少统一的 `board controller` 抽象。

### 5. table 的复杂度集中在 pointer 状态机

table 侧的 `usePointer` 同时承担了：

- hover 绑定
- press / drag / fill 多态状态机
- auto pan
- grid selection 写入
- cell primary action
- cell value 写入

这是典型的“局部交互内核”，但当前仍以 React hook 形式承载，导致状态边界和副作用边界都不够清晰。

## 重构目标

这次重构的目标不是机械减少 hooks 数量，而是把状态链重新压成一条更短、更稳定的中轴。

目标结构应为四层：

1. `engine`
2. `session runtime`
3. `view controller`
4. `React hooks / components`

其中每层职责固定：

### 1. engine

负责：

- document
- projection
- semantic command
- 与视图语义直接相关的写操作

不负责：

- DOM
- pointer 交互
- overlay
- portal
- editor host

### 2. session runtime

负责：

- 当前激活 view
- selection
- marquee
- inline session
- value editor session
- page query/settings route
- 这些 session 之间的互斥与失效规则

不负责：

- document mutation
- DOM hit test
- 各视图特有布局细节

### 3. view controller

负责：

- 把 engine + session 组装成具体视图可消费状态
- 把视图局部 DOM 协议收口成稳定接口
- 承接 virtual / layout / drag / hover 等 UI 级逻辑

不负责：

- 重复实现文档语义写操作
- 维护跨视图共享的 session 约束

### 4. React hooks / components

负责：

- selector 订阅
- ref 绑定
- 事件接入
- 呈现

不负责：

- 重新编排业务状态机
- 推导写语义

## 最低复杂度的方案

### 一. 把写语义下沉到 engine

这是第一优先级，因为它决定整个上层架构会不会持续失控。

当前应从 React runtime 下沉的能力主要有：

- 按 appearance 移动记录
- 按 section 创建记录
- 按 selection 删除记录
- grouped move 时的分组字段写回
- appearance / cell 到 record-field 的语义翻译

建议新增一层 view-scoped semantic API，避免 React 层继续理解 projection 细节。

示意：

```ts
engine.view(viewId).items.moveAppearances(ids, target)
engine.view(viewId).items.createInSection(sectionKey, input)
engine.view(viewId).items.removeAppearances(ids)
engine.view(viewId).items.writeCell(cellRef, value)
```

这样做的收益：

- `currentView.commands` 可以被删除
- gallery / kanban / table 的写路径统一
- grouped move / create 的分组写回逻辑回归 engine
- React 不再负责将 appearance 语义翻译成 record command

### 二. 单独建立 `DataViewSession`

当前 `selection / marquee / inlineSession / valueEditor / page` 的关系已经构成一个独立状态机，但实现仍然散在：

- runtime subscribe 绑定
- page hosts
- resolved page state

建议将其收口为非 React 对象，例如：

```ts
const session = createDataViewSession({
  engine,
  initialPage
})
```

其中 session 应该直接暴露：

- `viewId`
- `selection`
- `marquee`
- `inlineSession`
- `valueEditor`
- `page`
- `lock`

并且内部统一负责这些约束：

- 当前激活 view 变化时 selection 同步或清空
- 当前激活 view 变化时 marquee 失效
- selection 与 inline session 互斥
- value editor 打开时 page lock 生效
- query/settings route 随 document 变化自动规范化

这一步完成后，React Provider 只负责创建和销毁 session，不再承担订阅编排职责。

### 三. 抽统一的 view controller 骨架

建议引入统一模式：

- `createBoardController` 或 `useBoardController`
- `createTableController`

其中 board controller 覆盖：

- gallery
- kanban

因为它们已经共享以下骨架：

- current view 解析
- section/color 派生
- marquee adapter 注册
- drag selection 解析
- selectedIdSet / select
- visual target registry

差异只保留在：

- layout 读取方式
- drop target 规则
- indicator 计算
- kanban 专属的 record/color 读取

这样可以把 `useGalleryController` 和 `useKanbanController` 从“各写一套”变成“共享主干 + 局部注入策略”。

### 四. 把 table pointer 交互改成 plain controller + hook 绑定

`usePointer` 目前过于肥大，不适合继续作为 React hook 中轴。

建议拆成两层：

- `createTablePointerController(...)`
- `useTablePointerBindings(controller)`

其中 plain controller 负责：

- press / drag / fill 状态机
- grid selection 驱动
- hover / row rail 协调
- auto pan 刷新
- primary action 决策
- cell write dispatch

hook 只负责：

- 持有 DOM event handler
- 生命周期绑定
- 暴露 `onPointerDown/onPointerMove/onPointerLeave`

这样做的好处：

- 状态机从 React render 周期中剥离
- 逻辑更容易测试
- table controller 可以作为真实 controller，而不是 controller + hook 混合体

## 哪些 hooks 可以减少，哪些不该动

### 应优先收缩或重构的 hooks

- `useGalleryController`
- `useKanbanController`
- `usePointer`
- `useEffectiveRowSelection`

原因：

- 它们承载了控制器和状态机职责
- 它们不是轻量订阅层
- 它们最直接放大了中轴复杂度

### 明确要压缩的 selector hooks

- `usePage`
- `usePageValue`
- `useSelection`
- `useSelectionValue`
- `useInlineSession`
- `useInlineSessionValue`
- `useDocument`
- `useViewById`
- `useFieldById`
- `useCurrentView`

这些本质上都只是 store selector 包装。

目标不是保留一组平行的语义糖，而是把读取入口尽量压缩到少数统一 selector API。

建议最终只保留少量统一入口，例如：

```ts
useDataViewSelector(selector)
useSessionSelector(selector)
useEngineReadSelector(store, selector)
```

其中：

- `usePage`
- `usePageValue`
- `useSelection`
- `useSelectionValue`
- `useInlineSession`
- `useInlineSessionValue`
- `useDocument`
- `useViewById`
- `useFieldById`
- `useCurrentView`

都应视为待收口 API，而不是长期保留的稳定扩展面。

这一步属于明确的收敛目标，但不会先于 engine / session / controller 的边界重构执行。

### 不建议为了“减 hook 数量”而删掉的 hooks

- `useAutoPan`
- `usePointerDragSession`
- `useVirtualBlocks`
- `useMeasuredHeights`

这些 hooks 是较健康的 UI 基础原语。

它们的问题不在于存在，而在于上层没有稳定中轴，导致这些原语被大型 controller hooks 反复拼装。

### 明确删除或内联的 hooks

- `useEffectiveRowSelection`
  - 直接内联到 table 行相关组件或 table controller selector，不再保留独立 hook。
- `useMarquee`
  - 直接删除。当前仓库内部未见实际使用，不作为后续架构轴心保留。

## 目标架构草图

```ts
const engine = createEngine(...)
const session = createDataViewSession({ engine, initialPage })

const tableController = createTableController({
  engine,
  session,
  layout,
  dom
})

const boardController = createBoardController({
  engine,
  session,
  viewId,
  strategy
})
```

组件侧尽量只剩：

- 1 个 session selector hook
- 1 个 view controller hook
- 少量 DOM binding hooks

而不是当前这样把“语义 + session + view 交互”沿着多个 hooks 串起来。

## 分阶段落地计划

### Phase 1. engine 写语义收口

目标：

- 删除 `react/runtime/currentView/commands.ts` 的职责来源
- 建立 view-scoped semantic mutation API

具体动作：

- 将 grouped move / create-in-section / remove-selection / write-cell 迁入 engine
- `currentView` 恢复为纯 projection
- 所有视图交互改走 engine 的语义 API

完成标志：

- `CurrentView` 类型不再附带 `commands`
- gallery / kanban / table 的写操作都不依赖 React runtime 封装

### Phase 2. session runtime 独立化

目标：

- 把 runtime 订阅绑定与 page hosts 中的 session 协调集中管理

具体动作：

- 引入 `createDataViewSession`
- 把 selection / inline session / marquee / value editor / page 约束并入 session
- provider 退化为 session 实例注入层

完成标志：

- `react/dataview/runtime.ts` 不再持有复杂绑定逻辑
- page hosts 只保留 DOM 事件桥接，不再承担 session 规则定义

### Phase 3. board controller 统一

目标：

- 合并 gallery / kanban controller 的共用骨架

具体动作：

- 抽 `createBoardController` 或 `useBoardControllerBase`
- 将 selection / marquee adapter / visual target / drag selection / section color 等公共逻辑共用

完成标志：

- `useGalleryController` 与 `useKanbanController` 只保留各自差异策略
- 两者代码显著缩短

### Phase 4. table pointer 状态机下沉

目标：

- 让 table 不再依赖一个超大型 React hook 作为交互核心

具体动作：

- 将 `usePointer` 拆成 plain controller 与 bindings hook
- 将 hover binding、fill、drag、write dispatch 纳入可测试 controller

完成标志：

- `usePointer.ts` 只负责桥接
- table controller 真正成为 table 的状态中枢

### Phase 5. selector hooks API 收口

目标：

- 清理零碎 selector hooks，压缩对外 API 面

具体动作：

- 压缩 `usePage`
- 压缩 `usePageValue`
- 压缩 `useSelection`
- 压缩 `useSelectionValue`
- 压缩 `useInlineSession`
- 压缩 `useInlineSessionValue`
- 压缩 `useDocument`
- 压缩 `useViewById`
- 压缩 `useFieldById`
- 压缩 `useCurrentView`
- 将这些读取入口统一到少量 selector API
- `useEffectiveRowSelection` 内联
- `useMarquee` 删除

完成标志：

- 组件侧读取状态主要通过统一 selector 接口完成
- 上述零碎 selector hooks 不再作为主要对外读取入口
- table 行选择相关逻辑不再依赖 `useEffectiveRowSelection`
- 仓库中不再保留 `useMarquee`

## 风险与注意事项

### 1. 不要把 DOM 逻辑错误地下沉到 engine

以下内容必须留在 React / controller 层：

- `elementFromPoint`
- pointer capture
- overlay / portal
- scroll target 监听
- DOM rect 测量
- virtualization 测量缓存

engine 只应接收语义化输入，不应该理解浏览器细节。

### 2. 不要在 session 和 engine 之间重复存同一份业务状态

例如：

- `viewId` 可以是 session 状态
- 当前 view projection 必须仍然来自 engine.read

不要为了“方便 React”把 projection 副本存进 session。

### 3. 不要先做 selector hooks 合并

如果先从 `usePage/useSelection/useCurrentView` 这些外壳入手，只会得到表面上的“hook 少了”，不会解决真正的架构问题。

正确顺序必须是：

1. engine 写语义收口
2. session runtime 独立
3. controller 收敛
4. 最后才是 hooks API 收口

## 最终结论

要把 Dataview React 状态链的中轴复杂度降到最低，关键不是删除更多 hooks，而是重建状态边界：

- 让 engine 成为唯一的文档语义写入口
- 让 session runtime 成为唯一的 UI session 约束入口
- 让 controller 成为唯一的视图交互编排入口
- 让 hooks 退回到 selector 与 DOM binding

如果沿这个方向重构，最终组件层需要理解的状态链会明显缩短：

- 不再依赖 `currentView.commands`
- 不再把 session 规则散落在 runtime 绑定和 host 中
- 不再为 gallery / kanban / table 分别维护三套 controller 组装方式

这才是比“减少 hook 量”更重要的目标，也是中长期复杂度最低的方案。
