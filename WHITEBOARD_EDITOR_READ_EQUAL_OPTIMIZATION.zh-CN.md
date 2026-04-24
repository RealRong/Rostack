# WHITEBOARD_EDITOR_READ_EQUAL_OPTIMIZATION

## 范围

本文只分析 `whiteboard/packages/whiteboard-editor/src/read` 中与 store `isEqual` 相关的优化空间，目标是回答两件事：

1. 哪些 `equal / isEqual` 现在仍然有必要保留。
2. 哪些 `equal / isEqual` 已经退化成“为包装层重新分配兜底”，应该删除、折叠或下沉。

本文不讨论 graph runtime / projection runtime 的 delta 设计，也不讨论 `panel.ts` 里纯函数内部的局部比较辅助。

本文基于一个前提：`EditorNodeView / EditorEdgeView` 在 `read` 层做重组是正确的，这部分不是这次要推翻的设计目标。

## 底层语义

`shared/core/src/store/derived.ts` 与 `shared/core/src/store/family.ts` 的语义很关键：

- `createDerivedStore` / `createKeyedDerivedStore` 每次依赖变化都会重新计算。
- 只有当 `isEqual(previous, computed.value)` 返回 `true` 时，store 才会复用旧的 `current` 引用，并且不通知订阅者。
- 如果没有显式传 `isEqual`，默认比较就是 `Object.is`。

这意味着：

- 如果 getter 会重新分配对象、数组、Map，但语义上经常“不变”，那么 `isEqual` 仍然是有价值的。
- 如果 getter 只是读取一个已经稳定的引用，再包一层 derived store，那么额外的 `isEqual` 往往就是冗余的。
- 精准 delta 只能减少“错误的上游失效”，不能自动消除 read 层因为“重新组装对象”引入的引用抖动。

## 问题本质

这个问题不能只看成“哪些 `equal` 可以删除”，更准确的说法是：

- delta 解决的是“谁应该重算”。
- 重新投影 / 重新组装解决的是“重算时会不会新分配值对象”。
- `isEqual` 解决的是“新分配之后要不要吞掉通知”。

因此，`equal` 只是最后一道止损，不是问题根因本身。

当前 `read` 层的波动来源可以分成两类：

### 1. 有语义价值的重新投影

这类投影本身就是 `read` API 的职责，不应该因为想删 `equal` 就把它们打回去：

- `node.view`
- `edge.view`
- `edge.geometry`
- `selectedEdgeChrome`
- `mindmapChrome`
- `nodeCapability`

这些值都不是“读取一个稳定引用”，而是在把 graph/runtime/ui 的值转换成 editor/read 面向订阅层的语义视图。

### 2. 没有新增语义的重新包装

这类层次没有真正提供新的读模型，只是在做 bundle、passthrough 或总包装：

- `selection.ts` 里的 `SelectionModel`
- `selection.ts` 里外层 `members / summary / affordance` wrapper
- `public.ts` 里的 `panel`
- `public.ts` 里的 `chrome`

这类地方即使 `equal` 写对了，也只是把结构问题临时压住。

## 结论总览

### 应保留

- `whiteboard/packages/whiteboard-editor/src/read/node.ts:54-86`
  `isEditorNodeViewEqual`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:119-133`
  `isEditorEdgeViewEqual`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:219-243`
  `isEdgeGeometryEqual`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:334-337`
  `bounds` 上的 `equal.sameOptionalRect`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:272-291`
  `nodeCapability` 的 `isEqual`
- `whiteboard/packages/whiteboard-editor/src/read/edgeShared.ts:89-110`
  `isSelectedEdgeChromeEqual`
- `whiteboard/packages/whiteboard-editor/src/read/mindmap.ts:19-35`
  `isMindmapChromeEqual`
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:82-125`
  `members / summary / affordance` 这三个内层 store 的 `isEqual`

### 优先删除或折叠

- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:48-55`
  `isSelectionModelEqual`
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:155-168`
  外层 `members / summary / affordance` 三个 wrapper store 的 `isEqual`

### 可简化，但不建议裸删

- `whiteboard/packages/whiteboard-editor/src/read/public.ts:232-257`
  `chrome` store 的 `isEqual`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:259-270`
  `panel` store 的 `isEqual`

### 可以连同“重新投影”一起优化

- `whiteboard/packages/whiteboard-editor/src/read/selection.ts`
  删除无语义的 bundle + passthrough 分层
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:232-270`
  收缩 `chrome / panel` 这种总包装对象
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:272-291`
  如果后续需要继续降分配，可把 `nodeCapability` 改成 canonical value
- `whiteboard/packages/whiteboard-editor/src/read/node.ts`
  `whiteboard/packages/whiteboard-editor/src/read/edge.ts`
  如果后续 profiling 证明分配本身是热点，可再评估是否要给重组视图增加更强的结构复用

### 非本次目标

- `whiteboard/packages/whiteboard-editor/src/read/panel.ts:482-485`
  `equal.sameOptionalNumberArray`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts` 和 `edgeShared.ts` 内部那些用于深比较 label / handle / routePoint 的 helper

这些不是“read store 包装层的冗余 equal”问题，而是某个具体值对象本身的比较逻辑。

## 逐项分析

### 1. `node.ts` 的 `isEditorNodeViewEqual` 应保留

位置：

- `whiteboard/packages/whiteboard-editor/src/read/node.ts:54-86`
- `whiteboard/packages/whiteboard-editor/src/read/node.ts:182-188`

原因：

- `toEditorNodeView()` 在 `whiteboard/packages/whiteboard-editor/src/read/node.ts:88-109` 每次都会重新组一个新的 `EditorNodeView` 对象。
- 这个对象把 `nodeGraph` 和 `nodeUi` 两个 source 合成成一个 React 友好的读取面。
- 即使上游 delta 已经精准，`view.get(nodeId)` 只要重算，就还是会新建对象。

结论：

- 这个 `isEqual` 不是在给“过宽失效”擦屁股，而是在稳定 read 层的重组产物。
- 不建议动。

### 2. `edge.ts` 的 `isEditorEdgeViewEqual` 与 `isEdgeGeometryEqual` 应保留

位置：

- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:119-133`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:219-243`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:318-332`

原因：

- `toEditorEdgeView()` 在 `whiteboard/packages/whiteboard-editor/src/read/edge.ts:135-168` 每次都会创建新的对象和新的 `labels` 数组。
- `geometry` store 在 `whiteboard/packages/whiteboard-editor/src/read/edge.ts:326-332` 里会重新执行 `readEdgeGeometry()`，而 `edgeApi.view.resolve()` 也会产出新的 geometry 对象。
- 这些值都不是“读取已有稳定引用”，而是实打实的重新投影。

结论：

- 这两个比较器仍然是必要的。
- 如果以后要优化这里，方向也应该是减少投影分配或局部复用，而不是简单删掉 `isEqual`。

### 3. `edge.bounds` 的 `equal.sameOptionalRect` 可以保留，优先级很低

位置：

- `whiteboard/packages/whiteboard-editor/src/read/edge.ts:334-337`

原因：

- getter 读取的是 `store.read(sources.edgeGraph, edgeId)?.route.bounds`。
- 这里只返回一个 `Rect`，比较本身很便宜。
- 即使未来上游已经让 `route.bounds` 大部分时候引用稳定，这个 `isEqual` 的运行成本也很低，不值得优先清理。

结论：

- 可以保留。
- 如果后续做极致瘦身，这一项可以最后再看，但不是主要收益点。

### 4. `selection.ts` 当前有一整层可删除的包装

位置：

- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:36-46`
  `isSelectionMembersEqual`
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:48-55`
  `isSelectionModelEqual`
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:82-125`
  内层 `members / summary / affordance`
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:128-135`
  `SelectionModel` store
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts:155-168`
  外层 `members / summary / affordance`

当前结构实际上是：

1. 先创建内层 `members` store。
2. 再创建内层 `summary` store。
3. 再创建内层 `affordance` store。
4. 然后把三者打包成一个 `SelectionModel` store。
5. 最后又从这个 `SelectionModel` store 拆出外层 `members / summary / affordance` 三个 wrapper store。

这里的问题有两层。

第一层，`SelectionModel` 这一层本身没有对外价值：

- `createSelectionModelRead()` 是私有实现，只在 `selection.ts` 内部使用。
- `SelectionModel` 类型除了 `selection.ts` 之外，没有其他使用方。
- 既然对外 API 最后还是分开的 `members / summary / affordance`，中间这层 bundle 就是纯中转。

第二层，外层三个 wrapper store 的比较器基本已经没有意义：

- 外层 `members`：
  `get: () => store.read(model).members`
  既然 `model` 在 `isSelectionModelEqual` 命中时会复用旧引用，那么 `members` 引用本身已经稳定。
- 外层 `summary`：
  `isEqual: (left, right) => left === right`
  这个和默认的 `Object.is` 对这里的对象值没有本质区别。
- 外层 `affordance`：
  同上。

结论：

- 最高收益的优化点，是直接删掉 `SelectionModel` 这一层和外层三个 wrapper。
- 最干净的做法，是让 `createGraphSelectionRead()` 直接暴露内层三个 store。
- 如果暂时不删 wrapper，至少也应该先删掉外层三处显式 `isEqual`，因为它们已经没有提供额外价值。

建议动作：

- 删除 `isSelectionModelEqual`。
- 删除 `createSelectionModelRead()` 这一层 bundle store。
- 删除外层 `members / summary / affordance` 三个 derived wrapper。
- `GraphSelectionRead` 直接持有内层 `members / summary / affordance`。

这是这次 read 层 equal 清理里收益最高、风险也最低的一组。

### 5. `public.ts` 的 `panel` 比较器是“包装层兜底”，可以简化

位置：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts:259-270`

原因：

- `panel` getter 每次都会重新返回一个新的对象：
  `selectionToolbar`、`history`、`draw` 三个字段本身已经是独立的稳定子值。
- 这个比较器只是在说：
  “如果这三个字段引用都没变，就把新对象吞掉。”

也就是说，它的存在不是因为值本身复杂，而是因为这里多包了一层对象。

结论：

- 这是一个可以优化的 equal，但不应该裸删。
- 裸删之后，`panel` 每次重算都会因为新对象引用而通知订阅者。

更合理的方向有两个：

1. 保持 API 不变，但把它改成一个“浅结构复用”的组合方式，而不是每个调用点手写 `isEqual`。
2. 如果后续允许 API 继续拆分，就直接让订阅层订阅更细的子 store，减少 `panel` 这种总包装。

### 6. `public.ts` 的 `chrome` 比较器可以优化，但本质问题是组合方式

位置：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts:232-257`

原因：

- `chrome` getter 每次都会组装一个新的 `EditorChromePresentation`。
- 其中：
  - `marquee` 需要做一次 `worldRect -> screenRect` 投影。
  - `draw` 可能包含点数组。
  - `edgeGuide`、`snap`、`selection` 更多是读取已有子值。
- 当前 `isEqual` 实际上是在手工做一个拆字段的浅比较，再对 `marquee` 和 `draw` 做局部深比较。

结论：

- 这里的 `isEqual` 不是错误的，但它暴露出 `chrome` 这个组合对象太胖。
- 真正可优化的方向不是删除比较，而是把 `chrome` 拆成更细的 store，再做统一的结构复用。

建议动作：

- 把 `marquee`、`draw`、`edgeGuide`、`snap`、`selection` 分成更细的中间 store。
- 外层只做一次浅组合，或者使用统一的 struct 组合设施。
- 这样 `isChromeMarqueeEqual` / `isChromeDrawEqual` 这类 helper 才有机会一起收掉。

在没有组合层重构之前，不建议直接删除这个 `isEqual`。

### 6.1 `panel / chrome` 适合抽成可复用的底层组合设施

如果后续不想在 `read` 层到处手写：

- “组一个新对象”
- “再写一个浅比较吞掉它”

那么这里适合下沉一个统一设施，例如“结构化组合 store / struct store / combine store”。

这个设施至少要解决两件事：

1. 用多个子 store 组合出一个对象值。
2. 当每个字段都未变化时，直接复用上一份组合对象，而不是每个调用点手写 `isEqual`。

这样 `panel` 和 `chrome` 的问题就可以从“业务层自己维护包装对象比较器”收敛成“底层组合设施负责结构复用”。

### 7. `nodeCapability` 的比较器建议保留

位置：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts:272-291`

原因：

- getter 会根据 `graph.node.graph` 当前节点重新调用 `graph.node.capability(current.base.node)`。
- 这个 capability 当前是按值重新组装的对象，不是共享引用。
- 只要 capability 仍然是现算现返，这个 `isEqual` 就仍然有意义。

结论：

- 保留。
- 如果以后想删，前提不是“delta 更精准”，而是“capability 本身改成 canonical value / 稳定引用”。

可以继续优化的方向：

- 如果 `graph.node.capability(current.base.node)` 的产物只取决于有限字段，例如 `type` 与 `owner.kind`，那它可以进一步改成 canonical value。
- 一旦 capability 变成 canonical value，这里的 `isEqual` 就会退化成低收益兜底，后续才有资格继续清理。

### 8. `selectedEdgeChrome` 与 `mindmapChrome` 的比较器都应保留

位置：

- `whiteboard/packages/whiteboard-editor/src/read/edgeShared.ts:89-110`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:293-334`
- `whiteboard/packages/whiteboard-editor/src/read/mindmap.ts:19-35`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts:336-361`

原因：

- `selectedEdgeChrome` 每次都会重建 `routePoints` 数组。
- `mindmapChrome` 每次都会重建 `addChildTargets` 数组。
- 这两类值都是真实的 UI 投影，不是简单地读取稳定引用。

结论：

- 继续保留。
- 除非未来把这些数组也改成增量复用，否则删掉只会增加订阅抖动。

## 推荐的清理顺序

### 第一优先级

清理 `selection.ts` 的冗余分层：

- 删除 `SelectionModel` store。
- 删除 `isSelectionModelEqual`。
- 删除外层 `members / summary / affordance` wrapper。
- 直接暴露内层三个 store。

这是最纯粹的“去掉无意义 equal”。

### 第二优先级

处理 `public.ts` 里两个组合包装层：

- `panel`
- `chrome`

目标不是直接去掉比较器，而是把“手写比较器兜对象分配”改成“稳定的组合设施或更细的 store 结构”。

这里建议把“组合设施”一并纳入优化范围，而不是只在两个业务点做定制修补。

### 第三优先级

其余比较器不建议再主动清理：

- `node.view`
- `edge.view`
- `edge.geometry`
- `edge.bounds`
- `nodeCapability`
- `selectedEdgeChrome`
- `mindmapChrome`

这些比较器对应的都是当前 read 层真实存在的重新投影或重新组装，不是中转层噪音。

但这不代表它们永远不能优化。这里的优化方向已经从“删 equal”切换成了“减少投影分配和临时对象创建”。

### 第四优先级

如果前三步做完以后，profiling 仍然显示 `read` 层分配和 GC 显著，那么再考虑这些更深一层的优化：

- 给 `node.view` / `edge.view` 提供更强的结构复用，而不是每次都完整重建临时对象后再靠 `isEqual` 吞掉。
- 给 `selectedEdgeChrome` / `mindmapChrome` 这类数组投影增加局部复用。
- 评估 `nodeCapability` 是否可以 canonicalize。

这一层已经不是“equal 清理”，而是“投影视图的分配优化”。

## 可以一起优化的事项

如果要把这轮工作定义成一组连贯的收缩，而不是零散删几个 `equal`，建议目标写成下面四项：

### A. 消灭无语义包装层

- 删掉 `selection.ts` 的 `SelectionModel`。
- 删掉从 `model` 再拆回 `members / summary / affordance` 的 wrapper。

这是直接减少层级、减少对象中转、减少冗余 `equal`。

### B. 收敛总包装对象

- 重构 `public.ts` 的 `panel`。
- 重构 `public.ts` 的 `chrome`。

目标是让这些对象不再依赖“每个业务点手写一个 shallow compare”才能稳定。

### C. 提供底层结构复用设施

针对 `panel` / `chrome` 这类模式，抽一层统一设施，避免后续继续出现：

- 新建包装对象
- 再给包装对象补一个定制 `isEqual`

如果不做这一步，业务层以后还会继续长出同类问题。

### D. 再决定是否深入投影视图优化

完成 A/B/C 之后，再看是否还有必要继续碰：

- `node.view`
- `edge.view`
- `edge.geometry`
- `selectedEdgeChrome`
- `mindmapChrome`
- `nodeCapability`

这里的判断标准不再是“有没有 `equal`”，而是：

- 这些投影是否真的是性能热点。
- 是否值得为了减少临时对象和 GC，引入更复杂的结构复用机制。

## 判断原则

后续在 `read` 层碰到类似问题时，可以直接套这组判断：

1. 这个 store 有没有引入新的语义视图？
   如果没有，优先删层，而不是补 `isEqual`。
2. 这个 store 是否只是把几个稳定子值重新包成一个对象？
   如果是，优先改组合方式，而不是在业务层手写 shallow compare。
3. 这个 store 是否真的在做必要投影？
   如果是，可以保留 `isEqual`，但要把它视为止损，不要误判成根因已经解决。
4. 如果还要继续优化，目标应该是减少临时分配和结构抖动，而不是盲目删掉比较器。

## 组合位置最终决策

为避免后续再次把“组合位置”做散，最终方案明确按下面分层执行：

### 1. `ProjectionSources` 继续保持 raw source

`whiteboard/packages/whiteboard-editor/src/projection/sources.ts` 只负责把 snapshot 拆成 source：

- `nodeGraph`
- `edgeGraph`
- `nodeUi`
- `edgeUi`
- `scene`
- `chrome`
- 其他 owner/source

这里不引入 editor-facing 的组合视图，不在这一层生成：

- `node.view`
- `edge.view`
- `panel`
- `chrome`
- 任何 toolbar / overlay / capability read model

原因很简单：

- `ProjectionSources` 是 snapshot 到 source store 的纯拆分层。
- 一旦在这里做 editor 组合，这层就不再是 source，而会开始掺杂具体消费方语义。
- 这样只会把组合逻辑前移，但不会减少重复，反而会让 `ProjectionSources` 变成新的混合层。

### 2. graph adapter 层作为唯一跨 source 组合点

`whiteboard/packages/whiteboard-editor/src/read/graph.ts` 及其子模块是唯一允许做“graph + ui 合成单个订阅单元”的位置。

这里应该承接：

- `node.view`
- `edge.view`
- editor 自己那一份 canonical selection model

这里不应该承接：

- screen-space 投影
- toolbar / panel 这种 public presentation 包装

原因：

- `node.view` / `edge.view` 的目标就是把多个 raw source 合成一个下游订阅面，避免 React 同时订阅两个源。
- 这种组合是 read-model adapter 的职责，不是 raw source 的职责，也不是 React 组件的职责。

### 3. `public.ts` 只做 editor-specific presentation

`whiteboard/packages/whiteboard-editor/src/read/public.ts` 只负责把 graph adapter 层和 session read 层进一步拼成 editor public read：

- `panel`
- `chrome`
- `selectedEdgeChrome`
- `mindmapChrome`
- selection toolbar / overlay / scope / stats

这一层不再重新组合 raw graph/ui source，只消费已经稳定的 adapter 结果。

### 4. React 不再直接 join raw source

React 下游只订阅：

- `editor.read.node.view`
- `editor.read.edge.view`
- `editor.read.selection.*`
- `editor.read.chrome`
- `editor.read.panel`

React 不再承担：

- 同时订阅 `nodeGraph + nodeUi`
- 同时订阅 `edgeGraph + edgeUi`
- 自己做 bundle / shallow compare / passthrough 合并

这样可以把组合次数固定在一处，而不是在 hook、component、public read 三处重复出现。

## 最终实施方案

目标是同时做到三件事：

1. 保留必要组合。
2. 删除重复组合。
3. 把剩余组合收敛到少数固定位置，并由底层设施负责结构复用。

为了尽可能减少重复和复杂度，最终方案只新增一个底层抽象，不新增并行 read 体系，也不新增第二套 public API。

### A. 新增一个通用的 struct/combine store 设施

新增位置：

- `shared/core/src/store/`

建议新增能力：

- `createStructStore(...)`
- `createStructKeyedStore(...)`

职责：

- 从多个 store 组合出一个对象值。
- 当字段值都未变化时，直接复用上一份组合对象。
- 支持按字段配置 `select` / `isEqual`，避免每个业务点都手写整对象 `isEqual`。

这一步是整个方案里唯一新增的底层抽象。

不再允许业务层继续普遍使用下面这种模式：

- `get: () => ({ ... })`
- `isEqual: (left, right) => left.a === right.a && left.b === right.b ...`

### B. 保留 `node.view / edge.view`，但把它们固定为 adapter 层唯一组合点

修改位置：

- `whiteboard/packages/whiteboard-editor/src/read/node.ts`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts`

具体做法：

- 继续保留 `EditorNodeView` / `EditorEdgeView` 这两个 editor-facing 组合视图。
- 不把这两个视图下放到 `ProjectionSources`。
- 不把这两个组合推迟到 React hook。
- 改为用 `createStructKeyedStore(...)` 统一承接 `graph + ui` 的组合与结构复用。

结果：

- React 仍然只订阅一个 keyed store。
- 组合只发生一次。
- 比较逻辑不再继续散落成手写 `isEqual`。

这部分是“必须组合，但组合位置要固定”的代表。

### C. selection 只保留 editor 自己的一份 canonical model

这是整个方案里最重要的收缩点。

当前问题不是只有 wrapper 多，而是 selection 语义本身分散在两处：

- `editor-graph` 里有一份 `SelectionView`
- `whiteboard-editor/src/read/selection.ts` 里又重新推导一份 `members / summary / affordance`

最终方案是：

- editor 侧只保留一份 canonical selection model。
- `EditorRead.selection.view`、`members`、`summary`、`affordance` 都从这同一份 model 出来。
- editor 不再透传 `graph.selection.view`。

修改位置：

- `whiteboard/packages/whiteboard-editor/src/read/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

具体做法：

- 在 `read/selection.ts` 内部直接建立 editor canonical selection model。
- 这份 model 包含：
  - `view`
  - `members`
  - `summary`
  - `affordance`
- 删除 `SelectionModel` bundle + 再拆 wrapper 的现有结构。
- `GraphSelectionRead` 直接暴露最终需要的 store，不再先打包再拆包。

为了彻底消除重复，后续同步删除 editor 对 `editor-graph` selection projection 的依赖。

对应修改位置：

- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/ui.ts`
- `whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts`

目标是：

- 如果 selection 语义最终由 editor 拥有，就不要再在 `editor-graph` 保留一份近似但不完全一致的 projection。
- 这样可以同时消掉：
  - duplicated selection projection
  - `SelectionModel` 包装层
  - `graph.selection.view` 的透传依赖

为了降低改动面，`EditorRead.selection.view` 的对外 shape 尽量保持与现有消费方兼容，优先保证 React 组件无感。

### D. `public.ts` 的 `panel / chrome` 改成 leaf store + struct combine

修改位置：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts`

具体做法：

- 先把 `panel` 和 `chrome` 里真正有独立语义的字段拆成 leaf store：
  - `marquee`
  - `draw`
  - `edgeGuide`
  - `snap`
  - `selectionOverlay`
  - `selectionToolbar`
  - `history`
  - `drawState`
- 再用 `createStructStore(...)` 组合出：
  - `EditorChromePresentation`
  - `EditorPanelPresentation`

这样做以后：

- 不再手写 `isChromeMarqueeEqual`
- 不再手写 `isChromeDrawEqual`
- 不再在 `panel` / `chrome` 上维持 ad hoc shallow compare

这里的重点不是“拆更多 store”，而是“先拆 leaf，再由统一组合设施复用对象”。

### E. `nodeCapability` 暂时保留现状，只在主线完成后再决定是否 canonicalize

修改位置：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
- 可能扩展到 `whiteboard/packages/whiteboard-editor/src/read/node.ts`

结论：

- `nodeCapability` 当前不是第一优先级。
- 主线先完成 A/B/C/D。
- 如果 profiling 证明 capability 分配仍然是热点，再把 capability 改成 canonical value。

这样可以避免把“主线收缩”与“进一步微优化”绑在一起，增加复杂度。

## 要修改的文件

为了让实施范围更清楚，最终方案对应的文件修改可以直接收敛成下面这组。

### 必改

- `shared/core/src/store/*`
  新增 `createStructStore` / `createStructKeyedStore`，并导出到 store index
- `whiteboard/packages/whiteboard-editor/src/read/node.ts`
  `node.view` 改为统一组合设施承接
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts`
  `edge.view` 改为统一组合设施承接
- `whiteboard/packages/whiteboard-editor/src/read/selection.ts`
  删除 `SelectionModel` bundle + passthrough wrapper，改成 editor canonical selection model
- `whiteboard/packages/whiteboard-editor/src/read/graph.ts`
  调整 `GraphRead.selection` 的来源和结构
- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
  `panel / chrome` 改成 leaf store + struct combine，并切到新的 selection read model
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
  调整 `EditorRead.selection.view` 的类型来源

### 同步清理

- `whiteboard/packages/whiteboard-editor/src/projection/sources.ts`
  删除 editor 不再使用的 `selection` source
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/editor.ts`
  删除 editor 已不再依赖的 `SelectionView` 暴露面
- `whiteboard/packages/whiteboard-editor-graph/src/contracts/working.ts`
  删除 `ui.selection`
- `whiteboard/packages/whiteboard-editor-graph/src/runtime/ui.ts`
  删除 selection view 构建
- `whiteboard/packages/whiteboard-editor-graph/src/phases/ui.ts`
  删除 selection publish/update 相关逻辑

### 不改

下面这些这轮不作为主线目标：

- `selectedEdgeChrome` 的语义与比较方式
- `mindmapChrome` 的语义与比较方式
- `edge.geometry` 的投影方式
- `panel.ts` 内部纯函数的局部 comparator

这些点可以等主线完成、profiling 后再决定是否深入。

## 实施后的结构

完成后，整个结构应当收敛成：

1. `editor-graph`
   发布 graph / ui / scene / chrome 等 canonical raw projection，不再承担 editor selection 语义。
2. `ProjectionSources`
   只做 snapshot -> source 拆分。
3. `read/graph/*`
   作为唯一跨 source adapter，负责：
   - `node.view`
   - `edge.view`
   - editor canonical selection model
4. `read/public.ts`
   只做 editor-specific presentation 组合：
   - `panel`
   - `chrome`
   - overlay / toolbar / selected edge chrome / mindmap chrome
5. React
   只订阅 public read 或 adapter read，不再自行 join raw source。

这样可以同时减少：

- 重复组合
- 重复比较
- 语义分叉
- 包装层级
- downstream 多源订阅

同时不会引入第二套平行 read 系统，复杂度也能控制在一条清晰主线上。

## 额外观察

在把冗余 equal 清掉之后，下一批真正值得重新评估的，反而可能是不带 `isEqual` 的包装 store，例如 `public.ts` 里的这些：

- `selectionNodeStats`
- `selectionEdgeStats`
- `selectionNodeScope`
- `selectionEdgeScope`
- `selectionOverlay`
- `selectionToolbar`

这些点不是“已有 equal 要不要删”的问题，而是“在精准 delta 已经到位以后，真正还会不会造成无意义通知”的问题。它们适合在前一批清理完成后，再做第二轮 profiling。

## 最终结论

这次 `read` 层 equal 优化里，最该动的不是 `node/edge` 的重组比较器，而是 `selection.ts` 里那层 bundle + passthrough 包装，以及 `public.ts` 里 `panel/chrome` 这种为了吞掉包装对象分配而手写的 shallow compare。

更直接地说：

- 问题不只在 `equal`，而在于重新投影和重新包装。
- `selection.ts` 是可以现在就收缩的。
- `panel/chrome` 是应该连同底层组合设施一起重构，而不是简单删比较器。
- `node/edge/selectedEdgeChrome/mindmapChrome/nodeCapability` 目前仍然是合理且必要的比较点。
