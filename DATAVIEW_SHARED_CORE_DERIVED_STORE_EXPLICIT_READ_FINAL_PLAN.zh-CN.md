# Dataview / shared-core Derived Store 显式 Read 最终方案

## 1. 目标

这份文档回答四个问题：

1. dataview 现在的 store runtime 实际是怎么运行的。
2. 为什么 [api.ts](/Users/realrong/Rostack/dataview/src/react/runtime/valueEditor/api.ts) 里的 `openStore` 必须写成 `read(store)`，而不能直接写 `store.get()`。
3. 当前 `shared/core` 的 `read(...)` 是否真的带依赖跟踪。
4. 如果不考虑兼容成本、只追求长期最优，`shared/core` 与 dataview 的 store / derived API 最终应该长成什么样。

本文只给最终方案，不涉及兼容层设计。


## 2. 结论摘要

当前结论很明确：

- dataview 现在已经是“单一源 store + 大量只读派生 store”的结构。
- 当前 `read(...)` 在 `createDerivedStore(...)` 的计算上下文里，确实会做依赖跟踪。
- `store.get()` 不会做依赖跟踪，所以在 derived getter 里直接用 `get()` 是错误协议。
- [valueEditor/api.ts](/Users/realrong/Rostack/dataview/src/react/runtime/valueEditor/api.ts#L81) 里的写法是对的，但它暴露了当前协议的一个根本问题：
  - 依赖跟踪过于隐式
  - `read(...)` 的语义依赖隐藏的 active scope
  - 正确与错误写法只差一个 `read` / `get`，但没有 API 层面的强约束

长期最优不是继续保留这种隐式协议，而是直接改成：

- `createDerivedStore({ get: (read) => ... })`
- `createKeyedDerivedStore({ get: (key, read) => ... })`

也就是说：

- tracked read 只存在于 derived getter 的参数里
- 普通 `.get()` 永远只是普通读取
- 删除 `shared/core` 对外导出的 ambient `read(...)`
- 删除 `peek(...)`
- 删除 `activeReadScope` 这类对业务侧有语义外溢风险的隐式协议

一句话总结：

- 当前系统能工作，但协议不够显式。
- 长期最优是把“tracked read”从模块级隐式工具函数，升级成 derived getter 的显式参数。


## 3. 当前 runtime 是怎么跑的

## 3.1 shared/core 提供的是最基础的 store 机制

[shared/core/src/store.ts](/Users/realrong/Rostack/shared/core/src/store.ts#L7) 当前定义了三类核心 store：

- `ReadStore<T>`
- `KeyedReadStore<K, T>`
- `ValueStore<T>`

其中：

- `ReadStore<T>` 只提供 `get()` 和 `subscribe(listener)`
- `ValueStore<T>` 在 `ReadStore<T>` 基础上增加 `set(next)` 和 `update(recipe)`
- `KeyedReadStore<K, T>` 则把 `get` / `subscribe` 变成 keyed 版本

底层源 store 非常简单，本质上就是：

```ts
interface ValueStore<T> {
  get(): T
  set(next: T): void
  update(recipe: (previous: T) => T): void
  subscribe(listener: () => void): () => void
}
```

`createValueStore(...)` 自己不做任何依赖分析，只是：

- 持有一个 `current`
- 在 `set(...)` 时做 equality 检查
- 再通知订阅者


## 3.2 dataview engine 的 Store 其实就是单一 ValueStore<State>

[state.ts](/Users/realrong/Rostack/dataview/src/engine/store/state.ts#L94) 里 dataview engine 的 `Store` 本质上只是对 `createValueStore<State>` 的一层很薄的包装：

```ts
const store = createValueStore<State>({ initial })

return {
  get: store.get,
  set: store.set,
  update: store.update,
  sub: store.subscribe
}
```

这意味着 dataview engine 的真实模型已经是：

- 一个单一可写 `State` store
- 上层再从这个 store 派生各种 read store

这点很重要，因为它说明：

- dataview 今天其实已经是“单 store”架构
- 真正复杂的不是 source store
- 而是 source store 之上的 selector / derived 协议


## 3.3 dataview 的 read API 是从单 State store 派生出来的

[selectors.ts](/Users/realrong/Rostack/dataview/src/engine/store/selectors.ts#L153) 里，`createReadApi(store)` 会从这个单 `Store` 派生出：

- `read.document`
- `read.record`
- `read.customField`
- `read.view`
- `active.state`
- 各种 active projection read

今天这里同时存在两套机制：

1. 手写 selector
   - `createSelector(...)`
   - `createKeyedSelector(...)`

2. `shared/core` 的 derived store
   - `createDerivedStore(...)`
   - `createKeyedDerivedStore(...)`

这说明 dataview 现在虽然已经有单一 source store，但“派生协议”还没有完全统一。


## 4. 为什么 `openStore` 这里必须用 `read(store)`

[valueEditor/api.ts](/Users/realrong/Rostack/dataview/src/react/runtime/valueEditor/api.ts#L81) 当前写法是：

```ts
const openStore = createDerivedStore<boolean>({
  get: () => Boolean(read(store))
})
```

这里必须用 `read(store)`，原因只有一个：

- 当前 `createDerivedStore(...)` 的依赖采集只认 `read(...)`

如果写成：

```ts
const openStore = createDerivedStore<boolean>({
  get: () => Boolean(store.get())
})
```

则 `openStore` 在第一次计算后不会订阅 `store`，后续也不会在 `store.set(...)` 时自动重算。

所以：

- `read(store)` 是“tracked read”
- `store.get()` 是“plain read”


## 5. 当前 `read(...)` 到底能不能依赖跟踪

能，但这是有条件的。

### 5.1 依赖跟踪只发生在 active read scope 中

[shared/core/src/store.ts](/Users/realrong/Rostack/shared/core/src/store.ts#L108) 当前有一个隐藏上下文：

```ts
let activeReadScope: StoreRead | null = null
```

[shared/core/src/store.ts](/Users/realrong/Rostack/shared/core/src/store.ts#L140) 的 `read(...)` 实现是：

- 如果当前存在 `activeReadScope`，就用它来读取并登记依赖
- 如果没有 `activeReadScope`，就退化成普通 `get()`

也就是说：

- `read(...)` 不是永远 tracked
- 它是“在 derived 计算上下文里 tracked，否则只是普通读”

### 5.2 `createDerivedStore(...)` 会临时安装 tracked read scope

[shared/core/src/store.ts](/Users/realrong/Rostack/shared/core/src/store.ts#L323) 里的 `createDerivedStore(...)` 在每次 `recompute(...)` 时会：

1. 创建 `nextDependencies`
2. 用 `createTrackedRead(nextDependencies)` 创建一个 tracked read
3. 用 `runWithReadScope(...)` 执行 `options.get`
4. 记录这次 `get` 内发生的所有 `read(...)`
5. 对这些依赖建立订阅

所以当前系统的真实语义是：

- `read(...)` 在 `createDerivedStore(...)` 内会依赖跟踪
- `read(...)` 在普通函数里不会依赖跟踪
- `get()` 永远不会依赖跟踪

因此，对你前面那个问题，准确答案是：

- `read` 能依赖跟踪
- 但它依赖于一个隐藏的 active scope
- 这也是当前协议最大的问题


## 6. 当前协议为什么不是长期最优

## 6.1 `read(...)` 的语义过于隐式

今天同一个 API：

```ts
read(store)
```

在两个上下文里语义不同：

- 在 derived getter 里，它是 tracked read
- 在普通函数里，它只是 `get()`

这会带来几个问题：

- 代码审阅时很难一眼看出这次读取是否建立依赖
- helper 内部如果调用 `read(...)`，行为取决于调用栈外部是否恰好安装了 active scope
- 协议是正确的，但心智模型不够稳


## 6.2 `store.get()` 在 derived getter 中是静默错误

当前最大协议漏洞是：

- 在 derived getter 中写 `read(store)` 是正确的
- 写 `store.get()` 不会报错
- 但依赖会丢失

这是一种非常差的长期协议：

- 错误不会在类型层暴露
- 错误不会在运行前暴露
- 行为看似对，订阅却悄悄失效

长期最优 API 不应该允许这种静默错误继续存在。


## 6.3 `read` / `peek` / `get` 三套读语义叠在一起

今天实际上同时存在：

- `store.get()`
- `read(store)`
- `peek(store)`

这三者的边界并不干净：

- `get()` 是 plain read
- `peek()` 也是 plain read
- `read()` 在某些上下文 tracked，在某些上下文 plain

这套模型可以实现，但长期会让 API 认知复杂度持续增加。


## 6.4 隐式 active scope 是内部实现细节，却泄漏成了业务协议

理论上：

- active scope 应该只是 runtime 内部机制

但今天因为 `read(...)` 是模块级导出，业务层实际已经在直接依赖这套机制。

结果就是：

- `shared/core` 的内部 tracking 协议变成了业务侧的使用协议
- 业务层开始需要知道“什么时候 read 会 track，什么时候不会”
- 这正是长期不稳定的信号


## 7. 长期最优原则

如果不考虑兼容和迁移成本，长期最优我建议直接遵守下面五条原则。

### 原则 1：tracked read 必须显式出现在 derived getter 的参数里

也就是说：

- 只有 derived getter 拿到的 `read` 才是 tracked read
- 普通模块级工具函数不再导出 ambient `read`

### 原则 2：普通读取永远只走 `.get()`

只要不是在 derived getter 里：

- 一律用 `store.get()`
- keyed 就用 `store.get(key)`

不要再引入一套额外的 ambient untracked read helper。

### 原则 3：删除 `peek(...)`

在长期最优方案里：

- `peek(...)` 完全没有继续保留的必要
- 因为 `.get()` 已经明确承担 plain read 职责

### 原则 4：删除模块级 `read(...)`

tracked read 的生命周期必须严格受限于：

- `createDerivedStore(...)`
- `createKeyedDerivedStore(...)`

不应该再有一个可在任意文件随手导入的 ambient `read(...)`。

### 原则 5：dataview engine Store 必须与 shared/core 协议完全对齐

dataview 不应继续自造一个：

- `sub(...)`

这种只是换名字、不换语义的接口。

长期最优应该是：

- engine `Store` 直接就是 `ValueStore<State>`
- 或至少完整遵守 `ReadStore / ValueStore` 命名协议


## 8. 最终最优 API 设计

## 8.1 shared/core 最终公开 API

长期最优我建议把 `shared/core` store 协议收敛成下面这组。

```ts
export interface ReadStore<T> {
  get(): T
  subscribe(listener: () => void): () => void
  isEqual?: Equality<T>
}

export interface KeyedReadStore<K, T> {
  get(key: K): T
  subscribe(key: K, listener: () => void): () => void
  isEqual?: Equality<T>
}

export interface ValueStore<T> extends ReadStore<T> {
  set(next: T): void
  update(recipe: (previous: T) => T): void
}

export interface KeyedStore<K, T> extends KeyedReadStore<K, T> {
  all(): ReadonlyMap<K, T>
  set(key: K, value: T): void
  delete(key: K): void
  patch(next: KeyedStorePatch<K, T>): void
  clear(): void
}

export interface DerivedRead {
  <T>(store: ReadStore<T>): T
  <K, T>(store: KeyedReadStore<K, T>, key: K): T
}

export function createValueStore<T>(...): ValueStore<T>
export function createKeyedStore<K, T>(...): KeyedStore<K, T>

export function createDerivedStore<T>(options: {
  get: (read: DerivedRead) => T
  isEqual?: Equality<T>
}): ReadStore<T>

export function createKeyedDerivedStore<K, T>(options: {
  get: (key: K, read: DerivedRead) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T>
```

### 明确删除的公开导出

最终应删除：

- `read(...)`
- `peek(...)`

以及一切依赖 ambient scope 的公开 helper。


## 8.2 最终调用写法

### 非 derived 场景

直接用 `.get()`：

```ts
const session = store.get()
const view = engine.read.view.get(viewId)
const state = engine.active.state.get()
```

### derived 场景

显式用 getter 参数里的 `read`：

```ts
const openStore = createDerivedStore<boolean>({
  get: read => Boolean(read(store))
})
```

```ts
const activeSelect = (selector, isEqual) => createDerivedStore({
  get: read => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})
```

```ts
const recordStore = createKeyedDerivedStore<RecordId, Row | undefined>({
  get: (recordId, read) => {
    const document = read(documentStore)
    return getDocumentRecordById(document, recordId)
  }
})
```


## 8.3 最终实现语义

这里有一个很关键的取舍：

- 长期最优不应该只是“把现在的 ambient `read(...)` 换个语法糖”
- 而应该直接删掉 ambient scope 机制

也就是说，内部实现不再需要：

- `activeReadScope`
- `runWithReadScope(...)`
- exported `read(...)`

`createDerivedStore(...)` 在内部只需要：

1. 创建一个本次重算专用的 `DerivedRead`
2. 用它执行 `options.get(read)`
3. 收集依赖
4. 对依赖建立订阅

这一版实现比当前更干净，因为：

- tracking 生命周期只存在于 `recompute(...)` 的局部
- 没有全局隐式上下文
- 没有“同一个 `read(...)` 在不同调用栈下语义不同”的问题


## 9. Dataview 最终最优结构

## 9.1 engine Store 直接对齐 shared/core

[state.ts](/Users/realrong/Rostack/dataview/src/engine/store/state.ts#L56) 当前的：

```ts
interface Store {
  get(): State
  set(next: State): void
  update(recipe): void
  sub(fn): () => void
}
```

长期最优应该直接改成：

```ts
type Store = ValueStore<State>
```

或者至少：

```ts
interface Store extends ValueStore<State> {}
```

也就是说：

- 删除 `sub`
- 统一为 `subscribe`
- 不再保留 dataview 自己的命名分叉

这是一个很小但很关键的结构收口。


## 9.2 `createStore(...)` 不再做命名翻译

最终应直接是：

```ts
export const createStore = (initial: State): ValueStore<State> =>
  createValueStore({ initial })
```

不要再保留：

- `sub: store.subscribe`

这种只是换壳的适配层。


## 9.3 `selectors.ts` 应尽量回到统一 derived 协议

今天 [selectors.ts](/Users/realrong/Rostack/dataview/src/engine/store/selectors.ts#L84) 有：

- `createSelector(...)`
- `createKeyedSelector(...)`
- `selectDoc(...)`
- `selectDocById(...)`

长期最优不是完全禁止这些 helper，而是让它们变成真正的薄封装。

最终建议：

- `createSelector(...)` 不再手写自己的订阅生命周期
- 它只包一层 `createDerivedStore(...)`
- `createKeyedSelector(...)` 只包一层 `createKeyedDerivedStore(...)`

例如最终理想形态应该接近：

```ts
const createSelector = <T>(input: {
  store: ReadStore<State>
  read: (state: State) => T
  isEqual?: Equality<T>
}): ReadStore<T> => createDerivedStore({
  get: read => input.read(read(input.store)),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})
```

```ts
const createKeyedSelector = <K, T>(input: {
  store: ReadStore<State>
  read: (state: State, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => createKeyedDerivedStore({
  get: (key, read) => input.read(read(input.store), key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})
```

这样 selector helper 仍然可以保留，但不会再自带一套平行协议。


## 9.4 `createActiveSelectApi(...)` 的最终写法

当前 [selectors.ts](/Users/realrong/Rostack/dataview/src/engine/store/selectors.ts#L339) 里的写法是：

```ts
createDerivedStore({
  get: () => selector(read(state))
})
```

长期最优应直接改成：

```ts
createDerivedStore({
  get: read => selector(read(state))
})
```

这是你前面提的那个方向，我认为是对的，而且应该成为统一标准写法。


## 10. 对 helper 与领域 API 的约束

## 10.1 派生局部 helper 可以接受 `read`

如果某个 helper 只服务 derived getter，本身就是 reactive 计算的一部分，那么接受 `read` 是合理的：

```ts
const readVisibleRecords = (
  read: DerivedRead,
  state: ReadStore<ViewState>
) => read(state).records
```

这种 helper 的边界很清楚：

- 它是 derived 内部 helper
- 不是假装“普通业务函数”


## 10.2 业务领域 API 不应长期泄漏 `read`

但如果是领域层正式 API，就不应继续暴露 `DerivedRead`：

不建议长期保留：

```ts
readCell(read, cell)
readRecord(read, recordId)
```

更好的长期形态是：

- 要么返回 store
- 要么直接接受领域参数，在内部自己完成读取
- 要么只在 selector factory 内部使用 `read`

也就是说：

- `DerivedRead` 应该停留在 derived 组合层
- 不应该向领域 public API 外溢


## 11. 需要删除的旧实现与旧协议

如果按长期最优直接重做，下面这些都应该删除，不保留兼容。

### shared/core

- 模块级导出的 `read(...)`
- 模块级导出的 `peek(...)`
- `activeReadScope`
- `runWithReadScope(...)`

### dataview engine store

- `Store.sub(...)`
- 仅用于把 `subscribe` 改名成 `sub` 的适配层

### dataview selectors

- 手写的一整套平行 derived 生命周期实现

保留 helper 可以，但它们必须收缩成：

- `createDerivedStore(...)`
- `createKeyedDerivedStore(...)`

之上的薄包装。


## 12. 分阶段实施方案

虽然本文不讨论兼容层，但如果要一步到位落地，我建议仍按下面顺序实施。

### 阶段 1：先改 shared/core 协议

目标：

- `createDerivedStore({ get: (read) => ... })`
- `createKeyedDerivedStore({ get: (key, read) => ... })`
- 删除 ambient `read / peek`

要求：

- 先把 runtime 实现切到“局部 tracked reader”模型
- 不再依赖全局 active scope

### 阶段 2：统一 dataview engine Store

目标：

- `Store` 直接对齐 `ValueStore<State>`
- 删除 `sub`

要求：

- 所有基于 `store.sub(...)` 的代码改成 `store.subscribe(...)`
- engine source store 协议与 shared/core 完全一致

### 阶段 3：重写 selectors.ts

目标：

- 手写 selector 逻辑收回到 generic derived 协议
- `createSelector / createKeyedSelector` 只保留为薄封装

要求：

- `createReadApi(...)`
- `createActiveSelectApi(...)`
- `createActiveReadApi(...)`

全部切到新协议。

### 阶段 4：清理所有调用点

目标：

- 所有 derived getter 统一改成 `get: read => ...`
- 所有普通读取统一改成 `.get()`
- 删除所有 `import { read } from '@shared/core'`

要求：

- engine
- react runtime
- facades
- table runtime

全部统一到同一种写法。


## 13. 最终判断

你前面提的：

```ts
createDerivedStore({
  get: (read) => selector(read(state))
})
```

方向是对的。

但长期最优不应该只是把当前 API 改成“少一个导入”，而应该更彻底：

- derived getter 的 tracked read 显式参数化
- 删除 ambient `read`
- 删除 `peek`
- 删除 dataview 自己的 `sub`
- 让 engine source store 与 `shared/core` 协议完全对齐
- 让 selector 层重新统一在一套 derived runtime 之上

一句话总结最终方案：

- `read` 不应该再是一个全局导出的“上下文敏感函数”
- 它应该只作为 `createDerivedStore` / `createKeyedDerivedStore` 的 getter 参数存在
- `.get()` 才是系统里唯一的普通读取语义
