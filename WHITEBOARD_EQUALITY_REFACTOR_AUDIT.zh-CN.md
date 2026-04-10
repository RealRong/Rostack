# Whiteboard Equality 体系重构清单

## 目标

本文聚焦 whiteboard 中大量 `is*Equal` / `isEqual` 比较器的治理策略，目标不是简单减少函数数量，而是把比较逻辑分成几类：

1. 必须保留手写的领域语义比较器
2. 可以下沉到共享 helper 的基础比较器
3. 可以做轻量模板化的平面 DTO 比较器
4. 明确不建议使用的通用 deep-equal 工具方案

这份文档的结论面向“尽量全局优化完”，但仍然遵守一个前提：

- 不牺牲 runtime selector / overlay / read model 的语义控制
- 不为减少代码行数而引入错误抽象

## 总体结论

如果只能给一个总原则，那么应该是：

- 核心热路径比较器继续手写
- 基础形状比较统一收敛到 shared/core helper
- 平面 DTO 的重复比较可以做小范围模板化
- 不要全局引入第三方 deep-equal 工具替代现有比较器

最重要的判断是：

whiteboard 里大量 `is*Equal` 不是普通“工具函数”，而是 runtime store 更新裁剪策略的一部分。  
它们决定哪些变更会触发 selector 更新、哪些不会。这本质上是领域语义，不是结构相等。

## 为什么不能一把梭上 deep equal

不建议引入 `fast-deep-equal`、`lodash.isEqual` 或类似工具来替代现有大部分比较器。

原因如下：

### 1. 这些比较器很多是语义等价，不是结构等价

例如：

- `overlay/edge.ts` 里的 edge connect feedback 比较
- `read/edge.ts` 里的 edge view/path/handle 比较
- `read/selection.ts` 里的 selection model 比较

这些函数只比较对当前投影真正有影响的字段，而不是比较对象所有内容。

### 2. 热路径里依赖引用短路和局部字段比较

很多比较器模式都是：

- 先做 `left === right`
- 再对少量关键字段做细比较

通用 deep-equal 会放弃这种领域优化。

### 3. deep equal 会掩盖“哪些字段才重要”

当前手写比较器虽然冗长，但它有一个很重要的优点：

- 代码本身就是投影更新边界的说明书

这点在 editor runtime 中很重要。

### 4. 性能通常更差，而且失去可控性

特别是在：

- overlay keyed selectors
- derived stores
- patched item stores

这些地方，通用 deep-equal 很容易造成无意义的深层遍历。

## 当前比较器的大致分层

根据代码分布，whiteboard 里的 equality 逻辑大致可以分成四层。

## 第一层：基础几何 / 元组 / 顺序比较

代表位置：

- `whiteboard/packages/whiteboard-core/src/geometry/equality.ts`
- `whiteboard/packages/whiteboard-core/src/utils/equality.ts`

已有基础能力包括：

- point equal
- size equal
- ordered array equal
- point array equal
- rect tuple equal
- optional rect equal
- box tuple equal
- map value ref equal

这层是最适合继续抽象和补齐的地方。

## 第二层：runtime selector / projection 比较

代表位置：

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/state.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edgeToolbar.ts`

这层大多数函数承担的不是“对象比较”本身，而是：

- 更新裁剪
- 渲染失效边界
- patch/projection 语义判断

这层应该以手写为主。

## 第三层：写入归一化比较

代表位置：

- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/index.ts`

这层在判断操作前后是否真的发生有意义变化。  
本质仍然是领域语义比较，但比 editor runtime 更偏 normalize / diff。

这层不适合 deep-equal 替代，但适合补基础 helper。

## 第四层：通用 JSON deep equal

代表位置：

- `whiteboard/packages/whiteboard-collab/src/yjs/shared.ts`

这里的 `isDeepEqual` 是合理的，因为场景是：

- Yjs
- JSON-like 数据
- 没有 selector 热路径语义要求

这一层应继续局部保留，不应该上升成全局标准。

## 必须保留手写的区域

以下区域不建议工具化替代，最多只允许内部调用更底层 helper。

## A. Overlay Edge 比较器

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/edge.ts`

建议保留手写的函数：

- `isEdgeConnectFeedbackEqual`
- `isEdgeGuidePathEqual`
- `isEdgeGuideEqual`
- `isEdgeProjectionEqual`

原因：

- 包含 union / mode 分支语义
- 比较的是 overlay 投影关心的最小字段集
- 与 `createProjectedStore` / `createProjectedKeyedStore` 强绑定

## B. Overlay Node 比较器

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts`

建议保留手写的函数：

- `isNodePatchEqual`
- `isTextPreviewPatchEqual`
- `isNodeProjectionEqual`

可优化点不是工具替代，而是复用更底层 helper，例如统一的 optional point / optional size compare。

## C. Edge Read Model 比较器

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts`

建议保留手写的函数：

- `isEdgeItemEqual`
- `isEdgeAnchorEqual`
- `isEdgeEndEqual`
- `isResolvedEdgeEndEqual`
- `isEdgePathSegmentEqual`
- `isEdgeHandleEqual`
- `isEdgeViewEqual`
- `isEdgeStateEqual`

原因：

- 这是 editor edge view 的核心等价定义
- 包含 path segment、handle、anchor 等领域结构
- deep-equal 或模板化都不合适

## D. Selection Read Model 比较器

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`

建议保留手写的函数：

- `isSelectionTransformBoxEqual`
- `isSelectionModelEqual`
- `isSelectionNodeInfoEqual`

原因：

- selection model 是派生模型
- `SelectionNodeInfo` 的比较本身就是结构化业务语义

## E. Overlay State 总比较器

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/state.ts`

建议保留手写的函数：

- `isOverlayStateEqual`

原因：

- 这是 overlay store 顶层更新裁剪边界
- 比较逻辑本身具有架构意义

## F. Engine Normalize/Finalize 比较器

文件：

- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`

建议保留手写的函数：

- `isEdgeEndEqual`
- `isEdgeRouteEqual`
- `isEdgeLabelEqual`
- `isEdgeLabelsEqual`
- 与 geometry/style/data 归一化判断直接相关的比较函数

原因：

- 这些比较器决定 normalize 是否认为对象有变化
- 属于写路径语义

## 应该统一下沉到共享 helper 的区域

这一类不需要“生成器”或外部工具，只要继续补 core/shared 的 equality helper 即可。

## A. Rect / Optional Rect / Box 比较

目前重复分布在：

- `runtime/read/selection.ts`
- `runtime/read/edgeToolbar.ts`
- `runtime/overlay/node.ts`

建议统一到：

- `whiteboard/packages/whiteboard-core/src/utils/equality.ts`

建议目标 helper：

- `isSameRectTuple`
- `isSameOptionalRectTuple`
- `isSameBoxTuple`
- 可视需要补 `isSameOptionalBoxTuple`

## B. Ordered String / Id Array 比较

目前重复分布在：

- `runtime/read/edgeToolbar.ts`
- `runtime/state/index.ts`
- 其他 selection / ids 场景

建议统一到已有的：

- `isOrderedArrayEqual`
- `isSameIdOrder`

原则：

- 不要继续在文件内定义 `isOrderedEqual`
- 统一收敛成 core util

## C. Point / Size / Point Array 比较

目前状态：

- point 和 size 已有基础 helper
- point array 已有 helper
- 但 editor 层还在局部重新定义 `isSameSize`

建议：

- editor 层禁止再写本地 `isSameSize`
- 一律回收为 core geometry/util helper

## D. Same-ref / Map value ref 比较

这类适合继续集中在 util：

- `isSameRefOrder`
- `isSameMapValueRefs`

适用场景：

- value object 已经通过上层 patch 维持引用稳定
- 这里只做 cheap equality

## 可以做轻量模板化的区域

这里说的“模板化”不是上库，也不是 codegen，而是做很小的内部 helper。

适合这种策略的对象通常具备这些特点：

- 平面对象
- 以 primitive 字段为主
- 少量字段需要调用基础 helper
- 不包含复杂 union 语义

## A. EdgeToolbarContext 比较

文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/edgeToolbar.ts`

这里的 `isEdgeToolbarEqual` 基本是平面 DTO 比较。

可以考虑以后统一成这种结构：

- 先比较关键 primitive 字段
- 数组用 ordered helper
- box 用 optional box helper

是否要单独做 helper：

- 可以
- 但只建议做项目内部小 helper
- 不建议为此引入第三方库

## B. 某些 Selection 派生 DTO

例如：

- 不含 union 的 node info 汇总对象
- 平面 toolbar/filter/context 对象

适合做法：

- 统一写法
- 不一定统一成同一个函数
- 但可以使用“字段清单 + helper”风格

## C. React 面板内部的小型 equal

例如：

- `BorderPanel` 本地的 dash compare

这类如果跨文件重复明显，可以下沉。  
如果只在单文件局部使用，保留局部实现也没问题。

## 不建议做的优化

以下几种方向看起来能“简化”，但整体上不值得。

## 1. 全局替换成第三方 deep-equal

不建议。

原因：

- 丢失语义
- 热路径更慢
- 不利于更新裁剪
- 容易误导后续开发者以为“只要结构一样就行”

## 2. 做一个通用的 compare schema / field spec 框架

不建议全局化。

原因：

- 大多数复杂比较器并不是字段枚举问题
- 真正的复杂度来自 union、optional、ordered、projection 语义
- 框架化之后会出现 callback 嵌套和隐式规则

## 3. 用 codegen 自动生成等价函数

整体不建议。

只有当：

- 类型极平
- 结构极稳定
- 数量极多

时才可能有价值。  
当前 whiteboard 的核心比较器不满足这个条件。

## 全局优化建议

如果要“争取全局都优化完”，建议按下面顺序做。

## 阶段 1：建立 equality 分层规则

在团队内先明确规则：

- runtime/read/overlay 主比较器手写
- 基础 shape compare 收进 core util
- 禁止局部重复写 `isSameSize` / `isOrderedEqual` / `isOptionalRectEqual` 这类基础比较
- collab 的 `isDeepEqual` 只限 JSON/Yjs 场景

## 阶段 2：清理 editor 层重复 helper

优先目标：

- `runtime/overlay/node.ts`
- `runtime/read/edgeToolbar.ts`
- `runtime/read/selection.ts`
- `runtime/state/index.ts`

要做的不是重写主比较器，而是让它们组合统一 helper。

## 阶段 3：补 core equality helper

建议补齐或统一的 helper 列表：

- optional box equal
- optional number array equal
- ordered array equal 统一复用
- rect / optional rect / box compare 统一复用

原则：

- helper 只表达元语义
- 不表达领域语义

## 阶段 4：审计 store isEqual 热路径

重点检查：

- `createProjectedStore`
- `createProjectedKeyedStore`
- `createDerivedStore`
- `createValueStore`

所有 `isEqual` 是否满足：

- 优先引用短路
- 再比较关键字段
- 不多比较无关字段

## 阶段 5：保持 collab deep equal 隔离

`whiteboard-collab` 的 `isDeepEqual` 保留在 collab 范围内，不要外溢成 editor/runtime 默认工具。

## 具体清单

下面给出建议的执行清单。

## 应保留原样或仅做微调

- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/state.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`

优化方式：

- 保留手写主体
- 仅替换底层重复比较片段

## 应优先下沉到 core util 的重复逻辑

- `runtime/read/edgeToolbar.ts` 中的 ordered array / optional box compare
- `runtime/read/selection.ts` 中的 optional rect compare
- `runtime/overlay/node.ts` 中的 size compare
- 任何 editor 层重复出现的 point/size/rect/array compare

优化方式：

- 迁移到 `whiteboard/packages/whiteboard-core/src/utils/equality.ts`
- 统一从 core util 引用
- 不为 epsilon compare 或 normalize 语义不一致的场景强行抽象

## 可做轻量模板化的区域

- `runtime/read/edgeToolbar.ts`
- 某些平面 toolbar context compare
- 少量纯 DTO compare

优化方式：

- 使用项目内小 helper
- 不引入外部 equality 库

## 建议新增的治理规则

为了防止 equality 继续长乱，建议建立以下约束。

## 规则 1

如果比较逻辑进入 `store.isEqual` 热路径，并且对象带领域语义：

- 必须手写
- 或者手写主逻辑 + 组合基础 helper

## 规则 2

如果只是基础 shape compare：

- 一律先查 core util
- 禁止在 editor/react 层重复发明同类 helper

## 规则 3

如果对象本质是 JSON tree：

- 可以用 deep equal
- 但限制在 collab / serialization / diff 之类场景

## 规则 4

如果比较器的真正目标是“减少 rerender / store emission”：

- 优先比较真正影响投影的字段
- 不要为求通用而扩大比较范围

## 最终判断

whiteboard 里的 equality 体系不应该朝“工具统一一切”发展。  
正确方向应该是：

- 让核心比较器继续显式表达领域语义
- 把基础元语义比较收口到 core helper
- 只在平面 DTO 这类简单场景做轻量统一

换句话说，最优解不是“少写 `is*Equal`”，而是：

- 该手写的地方继续手写
- 不该重复的基础逻辑彻底统一

这是我认为在全局范围内最稳、最可维护、也最不容易牺牲性能边界的方案。

## 本轮已落地

这份清单对应的第一轮全局收敛已经完成，策略是：

- 只抽基础 helper
- 不动语义型主比较器
- 不引入 third-party deep equal

已新增的 core helper：

- `isSameOptionalBoxTuple`
- `isSameOptionalNumberArray`

已完成的重复逻辑下沉：

- `runtime/read/edgeToolbar.ts`
  - 删除本地 ordered array compare
  - 删除本地 optional box compare
  - 改为复用 core util
- `runtime/state/index.ts`
  - 删除本地 ordered array compare
  - 改为复用 `isOrderedArrayEqual`
- `runtime/read/selection.ts`
  - 删除本地 optional rect compare
  - `SelectionTransformBox` 的 box compare 改为复用 `isSameOptionalRectTuple`
- `runtime/overlay/node.ts`
  - 删除本地 exact size compare
  - 改为复用 geometry `isSizeEqual`
- `runtime/node/text.ts`
  - 删除本地 exact size compare
  - 改为复用 geometry `isSizeEqual`
- `runtime/read/selectionPresentation.ts`
  - 删除本地 dash compare
  - 通过 empty-array 归一化后复用 `isSameOptionalNumberArray`
- `runtime-react/.../BorderPanel.tsx`
  - 删除本地 dash compare
  - 与 editor 侧保持同一套归一化 + helper 语义

本轮明确保留不动的部分：

- `runtime/overlay/edge.ts`
  - 仍保留手写语义比较器
- `runtime/read/edge.ts`
  - 仍保留手写语义比较器
- `runtime/read/selection.ts`
  - `isSelectionModelEqual` / `isSelectionNodeInfoEqual` 仍保留手写主体
- `whiteboard-react/src/features/node/dom/nodeSizeObserver.ts`
  - 保留 epsilon compare，不与 exact size helper 合并
- `whiteboard-react/src/features/node/registry/default/text.tsx`
  - 保留 epsilon compare，不与 exact size helper 合并
- `whiteboard-engine/src/write/normalize/finalize.ts`
  - 保留 normalize 语义比较，不强行复用 geometry `isSizeEqual`

最终落地后的治理规则可以压缩成三条：

- 领域投影比较器继续手写，只允许组合基础 helper
- 基础 tuple / array / optional compare 统一从 core 引用
- 语义不同的 compare 不为了“统一”而合并
