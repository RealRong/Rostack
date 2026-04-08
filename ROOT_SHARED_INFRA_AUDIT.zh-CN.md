# Root Shared Infra Audit

## 背景

当前仓库已经有一个根目录共享包 `ui/`，但运行时基础设施还分散在两个子生态里：

- `dataview` 自己维护了一套 `runtime/store`、`react/store`、`dom`
- `whiteboard` 则把一部分通用能力沉淀在 `@whiteboard/engine`、`@whiteboard/react`、`@whiteboard/core`

从代码现状看，已经存在一批明显可以跨包复用的基础设施，尤其是 store 抽象、React store bridge、调度器和部分 DOM 工具。这个文档先做归类和边界判断，不改代码。

## 本次查看范围

- `dataview/src/runtime/store`
- `dataview/src/react/store`
- `dataview/src/dom`
- `ui/src/dom.ts`
- `whiteboard/packages/whiteboard-engine/src/store`
- `whiteboard/packages/whiteboard-engine/src/scheduler`
- `whiteboard/packages/whiteboard-react/src/runtime/hooks/useStoreValue.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/selectionLock.ts`
- `whiteboard/packages/whiteboard-core/src/geometry`

## 结论摘要

最值得先抽成根共享包的，不是视图层组件，而是下面四组运行时基础设施：

1. `store core`
2. `react-store bridge`
3. `scheduler`
4. `dom low-level utilities`

其中前 3 组已经具备比较强的“跨包基础设施”特征，收益高，边界也最清晰。`dom` 组需要拆成“通用 DOM 工具”和“dataview 领域 DOM 语义”两层再抽，否则会把业务语义一起带进共享包。

## 现状判断

### 1. Store core 已经重复实现，优先级最高

`dataview/src/runtime/store/index.ts` 和 `whiteboard/packages/whiteboard-engine/src/store` 本质上都在实现同一类能力：

- 可订阅只读 store
- keyed store
- value store
- derived store
- keyed derived store

两边的抽象差异主要在这里：

- `dataview` 的 `ReadStore` / `KeyedReadStore` 带 `isEqual?`
- `whiteboard` 的类型更轻，但在工厂实现里也普遍支持 `isEqual`
- `whiteboard` 在基础 store 之上又扩了 `keyed / projected / staged / raf` 这些更完整的运行时能力

这说明两边并不是不同范式，而是同一套范式的两个演化版本。适合收口到一个根共享包。

建议判断：

- `createValueStore`
- `createDerivedStore`
- `createKeyedDerivedStore`
- `ReadStore` / `KeyedReadStore` / `ValueStore`
- `StoreRead` / `ReadFn`

这些都属于“立即可抽”的共享基础设施。

### 2. React store bridge 也已经重复，且 API 非常接近

`dataview/src/react/store` 和 `whiteboard/packages/whiteboard-react/src/runtime/hooks/useStoreValue.ts` 也是同一层能力：

- `useStoreValue`
- `useKeyedStoreValue`
- `useSyncExternalStore` 封装
- snapshot 缓存

两边差异：

- `dataview` 有通用 `useExternalValue`
- `dataview` 还有 `useLazySelectorValue`
- `whiteboard-react` 额外有 `useOptionalKeyedStoreValue`
- `dataview` 读取 store 的 equality 来做 snapshot 复用，`whiteboard-react` 目前统一用 `Object.is`

这组能力天然应该跟 store core 配套沉淀到同一个根共享包里，只是建议通过子路径单独导出，避免非 React 包被动带上 React 依赖。

### 3. Scheduler 在 whiteboard 已经成熟，dataview 里则存在分散的手写调度逻辑

`whiteboard/packages/whiteboard-engine/src/scheduler` 已经有：

- `createRafTask`
- `createTimeoutTask`

同时 `whiteboard/packages/whiteboard-engine/src/store/projected.ts` 已经把 `sync / microtask / raf` 作为 store 调度策略使用。

对比之下，`dataview` 里存在多处直接手写 `requestAnimationFrame` 的逻辑，分散在交互、虚拟列表、overlay、拖拽等位置。也就是说，whiteboard 这套 scheduler 已经不仅是 whiteboard 私有能力，而是更接近仓库级 runtime primitive。

建议判断：

- `createRafTask`
- `createTimeoutTask`
- 以及从 `projected.ts` 里拆出来的通用 schedule helper

这些都适合进根共享包。

### 4. DOM 工具可以共享，但要拆边界

`dataview/src/dom` 里混了三类东西：

- 纯通用 DOM helpers
- 偏通用但带页面约定的 scroll helpers
- 明显 dataview 领域专用的 DOM 语义

这里最明显的重复点是：

- `dataview/src/dom/interactive.ts` 里的 `targetElement` / `closestTarget`
- `ui/src/dom.ts` 里的 `targetElement` / `closestTarget`

这说明仓库已经出现了低阶 DOM helper 的跨包重复。

但 `dataview/src/dom` 不是整包都适合外提，因为其中混入了 dataview 自己的实体标识和页面约定。

## 建议抽到根共享包的能力

### A. 立即可抽

#### A1. Store core

建议来源：

- `dataview/src/runtime/store/index.ts`
- `whiteboard/packages/whiteboard-engine/src/store/value.ts`
- `whiteboard/packages/whiteboard-engine/src/store/derived.ts`
- `whiteboard/packages/whiteboard-engine/src/store/keyed.ts`

建议进入共享层的内容：

- `Equality<T>`
- `ReadStore<T>`
- `KeyedReadStore<K, T>`
- `ValueStore<T>`
- `KeyedStore<K, T>`
- `StoreRead` / `ReadFn`
- `createReadStore`
- `createKeyedReadStore`
- `createValueStore`
- `createKeyedStore`
- `createDerivedStore`
- `createKeyedDerivedStore`
- `joinUnsubscribes`

推荐说明：

- 抽象基线建议以 `dataview` 的 `isEqual?` 能力为准，因为它更完整
- `whiteboard` 现有工厂函数基本已经支持 equality，只是类型和 hook 没完全对齐
- 这样可以让两个子生态最终共享同一份 store contract

#### A2. Store advanced operators

建议来源：

- `whiteboard/packages/whiteboard-engine/src/store/projected.ts`
- `whiteboard/packages/whiteboard-engine/src/store/staged.ts`
- `whiteboard/packages/whiteboard-engine/src/store/raf.ts`

建议进入共享层的内容：

- `StoreSchedule`
- `createProjectedStore`
- `createProjectedKeyedStore`
- `createStagedValueStore`
- `createStagedKeyedStore`
- `createRafValueStore`
- `createRafKeyedStore`

推荐说明：

- 这批 API 目前只在 whiteboard 大量使用，但抽象本身没有 whiteboard 领域依赖
- 反而 dataview 里后续如果要治理虚拟列表、拖拽、hover、overlay 更新节流，这批能力很可能会直接复用
- 因此它们应被视作“共享能力但目前主要由 whiteboard 使用”，不是 whiteboard 领域代码

#### A3. React store bridge

建议来源：

- `dataview/src/react/store/useExternalValue.ts`
- `dataview/src/react/store/useStoreValue.ts`
- `dataview/src/react/store/useLazySelectorValue.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/hooks/useStoreValue.ts`

建议进入共享层的内容：

- `useExternalValue`
- `useStoreValue`
- `useKeyedStoreValue`
- `useOptionalKeyedStoreValue`
- `useLazySelectorValue`
- `createLazySelectorSnapshot`

推荐说明：

- 这一层必须与 store core 配套设计
- `useStoreValue` 应优先支持从 store 上读取 `isEqual?`
- `useOptionalKeyedStoreValue` 可以成为共享 hook 的标准能力，不必继续只留在 whiteboard-react
- `useLazySelectorValue` 目前只有 dataview 在用，但从模型上看也不是 dataview 专属

#### A4. Scheduler

建议来源：

- `whiteboard/packages/whiteboard-engine/src/scheduler/raf.ts`
- `whiteboard/packages/whiteboard-engine/src/scheduler/timeout.ts`

建议进入共享层的内容：

- `createRafTask`
- `createTimeoutTask`

推荐说明：

- 这是最标准的 runtime primitive
- 迁出后可以反向收敛 dataview 里分散的 RAF 调度逻辑

### B. 需要先拆边界，再抽

#### B1. DOM event / focus / selection low-level helpers

建议来源：

- `dataview/src/dom/interactive.ts`
- `dataview/src/dom/focus.ts`
- `dataview/src/dom/selection.ts`
- `ui/src/dom.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/selectionLock.ts`

建议先拆成两层：

- 通用 low-level DOM helpers
- 带产品语义的 host/document helpers

适合抽成共享层的内容：

- `targetElement`
- `closestTarget`
- `containsRelatedTarget`
- `focusWithoutScroll`
- `focusInputWithoutScroll`
- 基础版 `disableUserSelect`

需要先重构再决定是否共享的内容：

- `interactiveSelector`
- `hasInteractiveTarget`
- `shouldCapturePointer`
- `createDocumentSelectionLock`

推荐说明：

- `interactiveSelector` 看起来通用，但它本质上包含一套产品交互假设，不一定适合作为最低层 API
- `createDocumentSelectionLock` 比 `disableUserSelect` 更完整，说明 whiteboard 已经有更成熟的版本
- 更稳妥的做法不是直接搬 dataview 代码，而是先统一出一套共享选择锁模型，再让 dataview / whiteboard 共用

#### B2. DOM scroll helpers

建议来源：

- `dataview/src/dom/scroll.ts`

适合拆成共享层的部分：

- `viewportRect`
- `scrollMetrics`
- `scrollByClamped`
- `revealX`
- `revealY`
- `revealRect`
- `revealElement`

不适合直接抽出的部分：

- `closestPageScrollContainer`
- `pageScrollNode`
- `scrollViewport`

推荐说明：

- `[data-page-scroll]` 是 dataview 页面约定，不应进入共享基础包
- 共享层应该只保留纯 DOM / scroll 算法
- 页面级滚动容器查找逻辑仍应留在业务包

#### B3. DOM geometry

建议来源：

- `dataview/src/dom/geometry.ts`
- `whiteboard/packages/whiteboard-core/src/geometry`

这组能力有潜力共享，但现在不建议直接抽整包，原因有两个：

- `dataview/src/dom/geometry.ts` 偏 DOM 坐标和命中测试
- `@whiteboard/core/geometry` 已经是成熟的白板世界坐标/图形几何层

更合理的边界是：

- 根共享包只容纳非常基础的屏幕矩形 / 点 / hit-test helpers
- `@whiteboard/core/geometry` 继续保留白板领域几何

适合未来共享的低阶内容：

- `Point`
- `Rect`
- `normalizeRect`
- `rectFromPoints`
- `containsPoint`
- `intersects`

建议暂缓的内容：

- `pointIn`
- `rectIn`
- `elementRectIn`
- `idsInRect`

推荐说明：

- `pointIn` / `rectIn` 这种 API 虽然通用，但偏“DOM 容器坐标系转换”，和 whiteboard 现有 geometry 体系不是一层
- 如果现在强行统一，容易把“DOM 屏幕几何”和“白板世界几何”混成一层

### C. 不建议抽到根共享包

#### C1. Dataview 领域 DOM 语义

不建议抽出的内容：

- `dataview/src/dom/appearance.ts`
- `dataview/src/dom/field.ts`

原因：

- 明确依赖 dataview 的 DOM attr 约定
- `field.ts` 还直接依赖 `ViewFieldRef`
- 这不是基础设施，而是 dataview 的 DOM 协议

#### C2. Whiteboard world/domain geometry

不建议抽出的内容：

- `whiteboard/packages/whiteboard-core/src/geometry`

原因：

- 它已经是一个独立且边界清楚的领域 core
- 里面包含 viewport、node、rotation、collision 等白板模型语义
- 这更像 `@whiteboard/core` 的价值，不是根共享运行时的职责

## 推荐的根共享包形态

如果目标是“像 `ui` 一样有一个根目录公共包”，建议直接使用：

- 新包目录：`shared/`
- 包名：`@shared`

导入风格也建议和 `ui` 保持一致，不加 `rostack` 前缀。

但即便包名叫 `@shared`，也不建议做成一个巨型平铺入口，而是做成一个根包加子路径导出。

推荐子路径：

- `@shared/store`
- `@shared/react`
- `@shared/scheduler`
- `@shared/dom`

这样做的好处：

- 导入风格和 `ui` 保持一致，仓库观感更统一
- React 依赖不会污染纯运行时包
- DOM helpers 和 store helpers 可以分层演进
- dataview / whiteboard 可以逐步迁移，不必一次性全量重写 import
- `@shared` 这个名字本身很泛，用子路径能避免它退化成“什么都往里放”的杂物包

其中 `@shared/react` 的定位建议明确为“共享 React 基础设施层”，优先承载 store bridge、外部状态绑定、少量跨包通用 hooks，不作为通用业务 hooks 的收纳箱。

## 推荐的收口原则

### 原则 1

共享包不能依赖 dataview 领域类型，也不能依赖 whiteboard 领域类型。

### 原则 2

共享包只放“运行时基础设施”，不放页面协议、DOM attr 协议、业务实体协议。

### 原则 3

如果一段能力已经在两个子生态里以相似形式重复出现，优先收口。

### 原则 4

如果某段能力虽然目前只有一个子生态在用，但抽象本身无领域依赖，而且明显是 runtime primitive，也可以提前沉淀。

## 推荐迁移顺序

### 第一阶段

先抽 store core、react-store bridge、scheduler。

原因：

- 重复最明显
- API 边界最清晰
- 迁移后立刻能减少两边重复维护

### 第二阶段

抽 DOM low-level helpers。

原因：

- 已经有 `ui` / `dataview` 的重复
- 但要先把通用 helper 和产品语义拆开

### 第三阶段

再评估 geometry 是否需要有一个根共享的“屏幕几何”小层。

原因：

- 这一步最容易跟 `@whiteboard/core/geometry` 发生职责重叠
- 应该等前两阶段稳定后再做

## 一句话判断清单

可以直接进根共享包：

- `dataview/src/runtime/store`
- `dataview/src/react/store`
- `whiteboard/packages/whiteboard-engine/src/scheduler`
- `whiteboard/packages/whiteboard-engine/src/store/value.ts`
- `whiteboard/packages/whiteboard-engine/src/store/derived.ts`
- `whiteboard/packages/whiteboard-engine/src/store/keyed.ts`
- `whiteboard/packages/whiteboard-engine/src/store/projected.ts`
- `whiteboard/packages/whiteboard-engine/src/store/staged.ts`
- `whiteboard/packages/whiteboard-engine/src/store/raf.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/hooks/useStoreValue.ts`

拆一下再进：

- `dataview/src/dom/interactive.ts`
- `dataview/src/dom/focus.ts`
- `dataview/src/dom/selection.ts`
- `dataview/src/dom/scroll.ts`
- `dataview/src/dom/geometry.ts`
- `ui/src/dom.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/selectionLock.ts`

继续留在原包：

- `dataview/src/dom/appearance.ts`
- `dataview/src/dom/field.ts`
- `whiteboard/packages/whiteboard-core/src/geometry`

## 当前最合理的目标状态

不是把 dataview 或 whiteboard 的某一套原样上提，而是收敛出一个根共享 runtime 包，形成下面这个职责结构：

- `ui` 负责通用 UI 组件和样式基础
- 新的根共享 runtime 包负责 store / react / scheduler / low-level dom
- `dataview` 保留数据视图领域协议和页面语义
- `@whiteboard/core` 保留白板领域模型和几何
- `@whiteboard/engine` / `@whiteboard/react` 退回到 whiteboard 特有能力，减少“顺带承载共享基础设施”的职责

如果后面真的开始收口，第一刀应该切 store，而不是先切 dom。
