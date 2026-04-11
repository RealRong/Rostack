# Shared Equality 候选清单

## 1. 范围

本清单基于对以下目录的全局搜索与抽样阅读：

- `dataview/src`
- `whiteboard/packages`

搜索时排除了：

- `dist`
- `node_modules`

本次扫描覆盖约 `761` 个源码文件。


## 2. 结论

当前仓库里“可复用的 equality / compare 组件”重复非常多，尤其是下面几类：

1. 有序数组相等
2. 可选数组相等
3. `Map` 相等
4. JSON-like 稳定结构相等
5. point / rect / box 这类几何 tuple 相等
6. 浅层对象相等

其中最明显的问题有两层：

- `whiteboard` 已经在 `whiteboard/packages/whiteboard-core/src/equality/index.ts` 里沉淀出了一套不错的基础 equality，但命名和放置位置还是 whiteboard 私有，不适合直接作为全仓 shared 基础层。
- `dataview` 又在 engine / core / react / table 多处重复实现了同一批低层比较函数，尤其是 `sameIds`、`equalIds`、`stableSerialize`、`equalMap` 这几种。

因此，最合理的方向不是再在 dataview 内部横向复用一遍，而是直接补一个真正中性的 `@shared/equality`。


## 3. 推荐的 shared 分层

建议把可上提内容分成三层。

### 3.1 `@shared/equality/base`

只放最底层、无领域语义的比较原语：

- `sameValue(left, right)`：`Object.is`
- `sameOrder(left, right, equal = Object.is)`：有序数组相等
- `sameOptionalOrder(left, right, equal = Object.is)`：可选有序数组相等
- `sameIdOrder(left, right)`：按 `.id` 比较顺序
- `sameMap(left, right, equal = Object.is)`：按 key/value 比较 `Map`
- `sameMapRefs(left, right)`：`Map` value 引用相等
- `sameShallowRecord(left, right, equalValue = Object.is)`：浅层对象相等

### 3.2 `@shared/equality/geometry`

只放通用 tuple/geometry 比较：

- `samePoint`
- `sameOptionalPoint`
- `sameRect`
- `sameOptionalRect`
- `sameRectWithRotation`
- `sameBox`
- `sameOptionalBox`
- `samePointArray`

### 3.3 `@shared/equality/json`

只放 JSON-like 的结构比较，不碰领域对象：

- `stableStringify`
- `sameJsonValue`
- 或者直接只提供 `sameJsonValue`，不暴露 stringify

这层要明确限制：

- 只用于 plain object / array / primitive / `null` / `undefined`
- 不承诺支持 class instance / function / `Map` / `Set`
- 不应该默认替代领域 comparator


## 4. 最值得先上提的候选

下面这些是“收益最高、风险最低、重复最明显”的第一批。

### 4.1 有序数组相等

这是最明显的重复模式，建议第一优先级上提。

建议 API：

```ts
export const sameOrder = <T>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean = Object.is
) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!equal(left[index] as T, right[index] as T)) return false
  }
  return true
}
```

直接可替换的重复实现至少包括：

- `dataview/src/engine/index/records/index.ts`
- `dataview/src/engine/index/demand.ts`
- `dataview/src/engine/project/runtime/sections/shape.ts`
- `dataview/src/engine/project/runtime/calc/state.ts`
- `dataview/src/engine/project/runtime/query/derive.ts`
- `dataview/src/engine/state/select.ts`
- `dataview/src/engine/command/commands/record.ts`
- `dataview/src/engine/command/commands/view.ts`
- `dataview/src/engine/project/publish/sections.ts`
- `dataview/src/engine/viewmodel/move.ts`
- `dataview/src/table/reorder.ts`
- `dataview/src/react/runtime/selection/store.ts`
- `dataview/src/react/runtime/marquee/api.ts`
- `dataview/src/react/views/table/virtual/runtime.ts`
- `dataview/src/react/views/table/currentView.ts`
- `dataview/src/core/search/state.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/editor/input.ts`

说明：

- 当前仅这类“same/equal ids/order”就能扫出 `17` 处左右重复定义。
- 其中大部分其实都只是 `string[]` 或 `id[]` 的有序比较，不需要领域私有实现。


### 4.2 `Map` 相等

这类也很适合上提，因为语义足够中性。

建议 API：

```ts
export const sameMap = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean = Object.is
) => {
  if (left === right) return true
  if (left.size !== right.size) return false
  for (const [key, value] of left) {
    if (!right.has(key)) return false
    if (!equal(value, right.get(key) as V)) return false
  }
  return true
}
```

已有重复实现：

- `dataview/src/engine/project/equality.ts`
- `dataview/src/engine/viewmodel/equality.ts`
- `whiteboard/packages/whiteboard-core/src/equality/index.ts` 的 `isSameMapValueRefs`

建议处理方式：

- `sameMap` 作为通用版本
- `sameMapRefs` 作为 `Object.is` 固定版本
- 之后 dataview 的 `equalMap` 直接删掉


### 4.3 point / rect / box 这类 tuple 相等

这类在 whiteboard 已经做得比较完整，最适合直接抽成 shared 通用基础。

现有成熟实现主要在：

- `whiteboard/packages/whiteboard-core/src/equality/index.ts`

已经存在或接近成熟的能力：

- `isSameRectTuple`
- `isSameOptionalRectTuple`
- `isSameRectWithRotationTuple`
- `isSameBoxTuple`
- `isSameOptionalBoxTuple`
- `isSamePointArray`

dataview 里的重复或近似重复：

- `dataview/src/react/runtime/marquee/api.ts` 的 `samePoint` / `sameBox`
- `dataview/src/react/views/table/hover.ts` 的 `samePoint`
- `dataview/src/react/interaction/coordinator.ts` 的 pointer identity 比较里也有接近 tuple 比较的低层逻辑

建议：

- 不要把 whiteboard 版本直接暴露成全仓 shared API
- 把语义相同的 tuple compare 提到 `@shared/equality/geometry`
- whiteboard 和 dataview 都改成依赖该层


### 4.4 JSON-like 结构相等

这是 dataview 当前最重复、也最容易继续蔓延的一类。

重复位置：

- `dataview/src/core/commit/semantics.ts`
- `dataview/src/engine/project/equality.ts`
- `dataview/src/engine/viewmodel/equality.ts`
- `dataview/src/react/views/table/currentView.ts`

相关近似实现：

- `whiteboard/packages/whiteboard-collab/src/yjs/shared.ts` 的 `isDeepEqual`

建议 API：

```ts
export const sameJsonValue = (left: unknown, right: unknown): boolean
```

这里要注意：

- 这类能力可以 shared
- 但不要默认到处用
- 只应用在 `meta`、`options`、`calc config`、schema config 这类“明确是 JSON-like 配置”的地方

不建议把它作为所有 equality 的兜底，否则会掩盖领域 comparator 应该更精确表达语义的地方。


### 4.5 浅层对象相等

whiteboard 的 finalize 里已经有一版非常接近 shared 的实现：

- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`

对应实现：

- `isShallowEqual`
- `isArrayEqual`
- `isPointOptionalEqual`
- `isPointArrayEqual`

dataview 里的近似需求：

- `dataview/src/engine/command/commands/view.ts` 的 `sameWidths`
- `dataview/src/react/views/table/hooks/useColumnResize.ts` 的 `sameWidths`
- 各种 “配置对象 key/value 是否变了” 的局部逻辑

建议 API：

- `sameShallowRecord`
- `sameShallowRecordOfArrays`

注意：

- 这一层比 `sameJsonValue` 更轻
- 更适合做高频 UI state 比较


## 5. 已经有成熟参考实现，但命名/归属不对

这些并不是“重新设计”，而是“已经证明可用，只是该换位置”。

### 5.1 `whiteboard-core` 的 equality 基础件

文件：

- `whiteboard/packages/whiteboard-core/src/equality/index.ts`

这份文件里真正值得上提到 shared 的有：

- `isOrderedArrayEqual`
- `isSameRefOrder`
- `isSameIdOrder`
- `isSameMapValueRefs`
- `isSameRectTuple`
- `isSameOptionalRectTuple`
- `isSameRectWithRotationTuple`
- `isSameBoxTuple`
- `isSameOptionalBoxTuple`
- `isSamePointArray`

问题不在实现，而在归属：

- 这些函数并不依赖 whiteboard 领域模型
- 但现在白板外的模块无法自然复用


### 5.2 `whiteboard-collab` 的 `isDeepEqual`

文件：

- `whiteboard/packages/whiteboard-collab/src/yjs/shared.ts`

这版实现其实已经比 dataview 的 `stableSerialize(...) === stableSerialize(...)` 更接近一个正常 shared `sameJsonValue`。

优点：

- 直接比较结构
- 不需要字符串中转

问题：

- 现在挂在 yjs/collab 目录，不是中立层
- 名字和语义都偏 collab 辅助，不适合直接拿来做仓库统一 API


## 6. 不建议上提的内容

下面这些虽然看上去也是 “equal/same”，但不应该放进 shared。

### 6.1 领域语义 comparator

例如：

- `dataview/src/core/filter/state.ts` 的 `sameFilter` / `sameFilterRule`
- `dataview/src/core/search/state.ts` 的 `sameSearch`
- `dataview/src/core/sort/state.ts` 的 `sameSorters`
- `dataview/src/core/group/state.ts` 的 `sameGroup`
- `dataview/src/engine/project/equality.ts` 的 `sameSections` / `sameFieldList` / `sameCalculationsBySection`
- `dataview/src/react/views/table/currentView.ts` 的 `sameTableCurrentView`

原因：

- 它们表达的是 dataview 领域语义
- 这些函数应该建立在 shared base comparator 之上
- 但不应该移动到 shared

### 6.2 引用复用策略判断

例如：

- `dataview/src/engine/project/runtime/run.ts`
- `dataview/src/engine/derive/project.ts`

里面的 `Object.is(previous, next)` 并不是通用 equality 组件，而是发布层“是否复用旧引用”的运行时策略，应该留在局部。

### 6.3 复合 UI snapshot comparator

例如：

- `dataview/src/react/runtime/marquee/api.ts` 的 `sameSession`
- `dataview/src/react/views/table/virtual/runtime.ts` 的 `sameLayoutSnapshot` / `sameViewportSnapshot`
- `dataview/src/react/page/session/state.ts`

这些也不适合上提 whole comparator。

它们正确的做法是：

- 继续留在本地
- 但内部改用 shared 的低层原语


## 7. 建议的最终 API 形状

如果只保留一套最值得长期维护的基础 API，我建议是下面这组。

```ts
// @shared/equality/base
export const sameValue: typeof Object.is
export const sameOrder: <T>(
  left: readonly T[],
  right: readonly T[],
  equal?: (left: T, right: T) => boolean
) => boolean
export const sameOptionalOrder: <T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal?: (left: T, right: T) => boolean
) => boolean
export const sameIdOrder: <T extends { id: unknown }>(
  left: readonly (T | undefined)[],
  right: readonly (T | undefined)[]
) => boolean
export const sameMap: <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
  equal?: (left: V, right: V) => boolean
) => boolean
export const sameMapRefs: <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>
) => boolean
export const sameShallowRecord: (
  left: object | undefined,
  right: object | undefined
) => boolean

// @shared/equality/geometry
export const samePoint: (left: { x?: number, y?: number }, right: { x?: number, y?: number }) => boolean
export const sameOptionalPoint: (left?: { x?: number, y?: number }, right?: { x?: number, y?: number }) => boolean
export const sameRect: (left: { x?: number, y?: number, width?: number, height?: number }, right: { x?: number, y?: number, width?: number, height?: number }) => boolean
export const sameOptionalRect: (...)
export const sameRectWithRotation: (...)
export const sameBox: (...)
export const sameOptionalBox: (...)
export const samePointArray: (...)

// @shared/equality/json
export const sameJsonValue: (left: unknown, right: unknown) => boolean
```

命名上建议统一用 `sameXxx`，不要混用：

- `same`
- `equal`
- `isSame`
- `isEqual`

原因很简单：

- 现在仓库里的命名已经明显漂移
- 要收口，就应该先把低层名字收口


## 8. 建议的迁移顺序

如果后续真的要动代码，建议按这个顺序来。

### 第一批

- `sameValue`
- `sameOrder`
- `sameOptionalOrder`
- `sameMap`
- `sameMapRefs`

这批最稳，替换收益最大。

### 第二批

- `samePoint`
- `sameRect`
- `sameOptionalRect`
- `sameBox`
- `sameOptionalBox`
- `samePointArray`

这批白板已有成熟实现，迁移风险低。

### 第三批

- `sameShallowRecord`
- `sameJsonValue`

这批收益高，但要控制使用边界，避免过度滥用。


## 9. 建议优先替换的文件

如果只想先收最脏的一批，我建议优先处理这些：

- `dataview/src/engine/state/select.ts`
- `dataview/src/engine/index/demand.ts`
- `dataview/src/engine/index/records/index.ts`
- `dataview/src/engine/project/equality.ts`
- `dataview/src/engine/viewmodel/equality.ts`
- `dataview/src/core/commit/semantics.ts`
- `dataview/src/react/views/table/currentView.ts`
- `dataview/src/react/runtime/selection/store.ts`
- `dataview/src/react/runtime/marquee/api.ts`
- `dataview/src/table/reorder.ts`
- `whiteboard/packages/whiteboard-core/src/equality/index.ts`
- `whiteboard/packages/whiteboard-collab/src/yjs/shared.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/editor/input.ts`
- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`


## 10. 最终判断

最应该进入 shared 的，不是某个 dataview 或 whiteboard 的“整体 equality 文件”，而是下面这几类真正跨项目、跨层级、跨运行时都通用的基础件：

- ordered array equality
- optional ordered array equality
- map equality
- map ref equality
- point/rect/box equality
- shallow record equality
- JSON-like structural equality

而像 `sameFilter`、`sameGroup`、`sameSections`、`sameTableCurrentView` 这种函数，应该继续留在各自领域层，只把它们底下依赖的低层 comparator 收到 shared。

这是长期最稳、最不容易再长出重复实现的做法。
