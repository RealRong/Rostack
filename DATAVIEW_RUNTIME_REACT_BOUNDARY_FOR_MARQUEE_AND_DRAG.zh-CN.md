# DATAVIEW Runtime / React 边界方案：Marquee 与 Drag

## 1. 目标

本文档只回答一个问题：

- `dataview-runtime`
- `dataview-react`

在 marquee 与 drag 这两条链上，最终应该如何分层。

重点背景是这里：

- [dataview/packages/dataview-react/src/dataview/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/runtime.ts)
- [dataview/packages/dataview-runtime/src/dataview/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/dataview/runtime.ts)

尤其是这段：

```ts
const disposeBindings = joinUnsubscribes([
  bindMarqueeToView({
    activeView: runtime.read.activeView,
    marquee
  })
])
```

以及：

```ts
const drag = createDragApi()
const marquee = createMarqueeApi()
```

本文档的结论会非常明确：

- `bindMarqueeToView(...)` 这种绑定不应该继续放在 `dataview-react/src/dataview/runtime.ts`
- marquee 不该整块留在 react，也不该整块原样搬进 runtime，而应该拆层
- drag 按当前 API 形态不应该搬进 `dataview-runtime`

## 2. 当前问题

### 2.1 `dataview-react/src/dataview/runtime.ts` 现在承担了过多 headless 责任

当前这层本来名义上是 React session 装配层，但实际上它已经在做：

- headless runtime 创建
- page drag api 创建
- marquee api 创建
- marquee 生命周期绑定

这会导致一个边界问题：

- 哪些是“React/DOM 相关装配”
- 哪些是“runtime 规则与状态约束”

目前没有被拆开。

### 2.2 `bindMarqueeToView(...)` 的语义不是 React 语义

这段逻辑本质上是：

- marquee 只作用于当前 active view
- active view 一旦切换，marquee 必须立即失效

这不是组件渲染副作用，也不是 DOM 生命周期。

它属于：

- session invariant
- runtime 约束

也就是说，它和下面这些更像一类：

- `bindInlineSessionToView(...)`
- `bindInlineSessionToSelection(...)`

而这两类逻辑现在都在 `dataview-runtime`。

因此把 `bindMarqueeToView(...)` 留在 react 装配层，是边界不一致。

### 2.3 `drag` 与 `marquee` 不能一起简单地下沉

虽然这两个名字现在都挂在 react session 上，但它们并不属于同一层。

当前 `drag` API 明显带着 React/DOM 形态：

- `source: HTMLElement | null`
- `pointerRef: MutableRefObject`
- `offsetRef: MutableRefObject`

而 marquee 在新的设计里，已经明显可以拆成：

- runtime 层状态机
- react 层 DOM bridge

所以不能说“`drag` 和 `marquee` 一起搬进 runtime”。

## 3. 边界判断原则

长期最优的判断标准应该只有一个：

- 这个能力是否可以在没有 React、没有 DOM、没有 HTMLElement、没有 MutableRefObject 的前提下仍然成立

如果可以，就应该优先进入 `dataview-runtime`。

如果不可以，就应该留在 `dataview-react`。

换句话说：

- runtime 负责状态、规则、意图、提交
- react 负责事件、DOM、表现、桥接

## 4. Marquee 的最终归属

### 4.1 应该进入 `dataview-runtime` 的部分

这些能力本质上是 headless 的：

- marquee session state
- `start / update / cancel / clear`
- `baseSelection + hitIds + mode -> nextSelection`
- commit 时如何写回 selection
- cancel 时如何回退
- active view 切换时自动 cancel
- 与 inline session / value editor / page lock 的约束关系

这些都不依赖 React，也不依赖 DOM。

所以它们应该属于：

- `dataview-runtime`

### 4.2 不应该进入 `dataview-runtime` 的部分

这些仍然是 React/DOM bridge：

- `shouldStartMarquee(event: PointerEvent): boolean`
- document/window pointer 监听
- `MarqueeSceneRegistry`
- per-view `hitTest(rect)` 注册
- page-level autopan driver
- marquee overlay box 渲染

这里要特别强调：

- `hitTest(rect)` 本身不是 runtime 规则
- 它依赖具体 view 的 geometry source
- geometry source 在 table/gallery/kanban 中都明显带 UI/布局语义

因此这部分仍应保留在：

- `dataview-react`

### 4.3 结论

marquee 不应该“整块”放在任意一层。

长期最优应拆成：

`dataview-runtime`
- marquee controller / session / commit semantics

`dataview-react`
- marquee host / DOM policy / scene registry / autopan / overlay

## 5. Drag 的最终归属

### 5.1 当前 `drag` 不应该进入 `dataview-runtime`

原因很直接：

- 当前 API 直接暴露 `HTMLElement`
- 当前 API 直接暴露 `MutableRefObject`
- 当前 API 主要服务 drag overlay 与 pointer bridge

这说明它描述的是：

- React/DOM 实现态

而不是：

- headless reorder session

所以按当前形态，`createDragApi()` 不应该收进 `dataview-runtime`。

### 5.2 什么时候 drag 才值得下沉

只有当 drag 被重新拆成两层，才值得下沉其中一层。

也就是：

`dataview-runtime`
- drag session
- reorder intent
- drop semantics
- selection/drag mutual exclusion

`dataview-react`
- source element
- pointer ref
- overlay positioning
- drag preview rendering

但这已经不是“把现有 `createDragApi()` 搬家”，而是重做 drag 分层。

### 5.3 结论

当前阶段：

- drag 留在 `dataview-react`

不要为了“统一”而把一个明显带 DOM 的 API 硬塞进 runtime。

## 6. `bindMarqueeToView(...)` 应该怎么处理

最佳做法不是把它改成 React hook。

因为它本质不是：

- view render effect
- component lifecycle effect

而是：

- session validity rule

因此长期最优是：

- 把 marquee session/controller 下沉到 `dataview-runtime`
- 把 `bindMarqueeToView(...)` 也一起下沉

这样 `dataview-runtime` 会保持一致：

- inline session 的跨域约束在 runtime
- marquee session 的跨域约束也在 runtime

而 `dataview-react/src/dataview/runtime.ts` 只做真正的 React 侧装配。

## 7. 推荐的最终模块边界

### 7.1 `dataview-runtime`

建议负责：

- local state
- local state mutate
- persist write intent
- query/read
- selection
- inline session
- value editor session
- create record session
- marquee session

这里的 marquee 指：

- 纯状态
- 纯规则
- 纯提交语义

### 7.2 `dataview-react`

建议负责：

- page host
- DOM event wiring
- pointer / keyboard bridge
- `shouldStartMarquee(event)`
- `MarqueeSceneRegistry`
- autopan
- drag overlay / drag DOM bridge
- view presentation

## 8. 对 `dataview-react/src/dataview/runtime.ts` 的最终要求

长期它应该只做两件事：

1. 创建 runtime
2. 注入 React 专属能力

不应该再做：

- headless binding
- session validity rule
- 依赖 active view 的 runtime 约束同步

也就是说，这一层应从“半个 runtime”退回“React wrapper”。

## 9. 最终结论

我的判断是：

- `bindMarqueeToView(...)` 不该继续留在 `dataview-react/src/dataview/runtime.ts`
- 它应跟随 marquee session/controller 一起下沉到 `dataview-runtime`
- `createMarqueeApi()` 不该整块原样搬迁，但其 headless 部分必须下沉
- `createDragApi()` 按当前形态不该进入 `dataview-runtime`

一句话说：

- marquee 应拆层后下沉
- drag 当前应留在 react
- react 装配层不应再承载 headless runtime 绑定
