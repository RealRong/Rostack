# Whiteboard Shared Derived Read Protocol 长期最优方案

## 结论

长期最优不是继续扩展这类 API：

- `nodesFrom(readStore, target)`
- `edgesFrom(readStore, target)`
- `boundsFrom(readStore, target)`

也不是把读能力拆成这类双轨：

- `get.xxx(...)`
- `track.xxx(...)`

这两条路都会把 `shared/core` 的 store tracking 机制泄漏到业务层，最终让业务 API 长期带着底层协议的包袱。

长期最优是直接改 `shared/core` 的 derived read 协议：

- 让 tracked / untracked 的差异由 runtime 自动处理
- 让领域 read API 在任何上下文里都只保留一套写法
- 让业务代码不再显式接触 `StoreRead` / `ReadFn` / `readStore`

最终目标不是“再起一个 tracked helper 名字”，而是让下面这种调用天然成立：

```ts
editor.read.group.target(groupId)
editor.read.target.nodes(target)
editor.read.target.edges(target)
editor.read.target.bounds(target)
```

以及：

```ts
engine.read.group.target(groupId)
engine.read.target.nodes(target)
engine.read.target.edges(target)
engine.read.target.bounds(target)
```

无论这些代码运行在：

- 普通命令
- 普通事件处理
- `createDerivedStore(...)`
- `createKeyedDerivedStore(...)`

都只写这一套 API。

## 当前结构性问题

`shared/core/src/store.ts` 当前的依赖收集机制只认一种读取方式：

- derived 计算过程中，只有通过传入的 `readStore(store)` 或 `readStore(keyedStore, key)` 才会登记依赖
- reader 内部如果直接调用 `.get()`，依赖不会被追踪

这会导致几个连锁问题：

- 领域 reader 不能在 derived store 中直接复用
- 于是业务层被迫补一层 `readXxx(readStore, ...)`
- 业务代码开始理解“什么时候要 tracked”
- API 面不断裂开

whiteboard 当前的：

- `readLiveTargetNodes`
- `readLiveTargetEdges`
- `readLiveTargetBounds`

就是这种协议缺口直接外溢到业务层后的结果。

## 最终协议

### 核心原则

只保留一套“读”的语义。

- 业务代码只表达“我要读什么”
- runtime 决定“这次读取是否需要追踪依赖”

也就是说：

- 普通调用时，读取走普通 `.get()`
- 在 derived store 计算期间，读取自动登记依赖
- 调用方不需要知道当前是否处于 tracked context

### shared/core 最终公开能力

建议把 `shared/core` 收敛到下面这组基础能力：

```ts
read(store)
read(store, key)
peek(store)
peek(store, key)
createDerivedStore({ get: () => value })
createKeyedDerivedStore({ get: (key) => value })
```

语义如下：

- `read(...)`
  - 如果当前处于 derived tracking context，则自动登记依赖
  - 如果当前不在 tracking context，则退化为普通 `.get()`
- `peek(...)`
  - 永远只读，不登记依赖
  - 用于少数“明确不希望建立依赖”的场景
- `createDerivedStore(...)`
  - `get` 不再接收 `StoreRead`
  - `get` 内部直接调用 `read(...)`
- `createKeyedDerivedStore(...)`
  - 同理不再暴露 `StoreRead`

### shared/core 内部能力

`shared/core` 内部需要新增一个 active read scope 概念，但这层不应该继续泄漏到业务包。

内部大致会有：

- 当前 active tracked reader 的上下文槽
- `runWithReadScope(...)`
- `read(...)` 在内部检查当前 scope

但这些都应该停留在 `shared/core` 内部，业务包不关心。

### `StoreRead` / `ReadFn` 的最终定位

长期最优里：

- `StoreRead`
- `ReadFn`

不应该继续作为业务层常用类型传播。

最理想的完成态是：

- `StoreRead` 仅保留在 `shared/core` 内部实现
- 业务包不再写接受 `ReadFn` 的 helper
- 领域 API 的函数签名只保留领域参数

换句话说，不再出现：

```ts
readLiveTargetNodes(readStore, node, target)
readResolvedEdgeView(readStore, node, entry)
```

而应统一成：

```ts
read.target.nodes(target)
read.target.edges(target)
read.target.bounds(target)
readResolvedEdgeView(node, entry)
```

函数内部如果要读 store，直接调用 `read(...)`。

## 为什么这是长期最优

### 1. 不再让业务 API 理解底层协议

业务代码的职责是表达领域语义，不是理解 store tracking。

`nodesFrom(readStore, target)` 这类 API 一旦进入系统，后面所有 reader 都会复制这个裂口：

- `group.targetFrom(readStore, groupId)`
- `target.nodesFrom(readStore, target)`
- `target.edgesFrom(readStore, target)`
- `target.boundsFrom(readStore, target)`
- `edge.viewFrom(readStore, edgeId)`

这条路最终一定会变成 API 面膨胀。

### 2. 调用点会明显变薄

derived store 内部不再需要层层传 `readStore`：

```ts
const edges = read.target.edges(target)
const box = read.target.bounds(target)
```

而不是：

```ts
const edges = readLiveTargetEdges(readStore, edge, target)
const box = readLiveTargetBounds(readStore, node, edge, target)
```

### 3. helper 签名会大幅简化

很多当前签名复杂的 helper，本质上只是因为它们被迫兼容 tracked/untracked 两种读法。

只要 `shared/core` 把 tracking 自动化，这类 helper 都可以回到纯领域签名。

### 4. 这是全局优化，不是 target 特判

这次改造不应该只服务 whiteboard `target`。

只要协议升级成功，whiteboard、dataview、shared/react 都能一起减负。

## Whiteboard 最终形态

### Engine

最终保留：

```ts
engine.read.group.target(groupId)
engine.read.target.nodes(target)
engine.read.target.edges(target)
engine.read.target.bounds(target)
```

### Editor

最终保留：

```ts
editor.read.group.target(groupId)
editor.read.target.nodes(target)
editor.read.target.edges(target)
editor.read.target.bounds(target)
```

### Whiteboard 需要删除的旧实现

shared/core 协议升级完成后，下面这些实现都应该删除，不保留兼容：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/target.ts`
  - `readLiveTargetNodes`
  - `readLiveTargetEdges`
  - `readLiveTargetBounds`
- 所有接受 `ReadFn` / `StoreRead` 只是为了向下转发读取的 helper

如果某个 helper 的唯一复杂度来自“我要不要 tracked”，那它就应该被删除或改写成纯语义 helper。

### Whiteboard 还能一起收掉的点

#### 1. `runtime/read/selection.ts`

当前它在 derived store 中还需要显式走：

- `readLiveTargetNodes(...)`
- `readLiveTargetEdges(...)`
- `readLiveTargetBounds(...)`

协议升级后应直接写：

```ts
const target = read(source)
const nodes = readTarget.nodes(target)
const edges = readTarget.edges(target)
const bounds = readTarget.bounds(target)
```

这里的 `readTarget` 可以是局部命名，或直接用 `read.target`，重点是业务层不再传 `readStore`。

#### 2. `runtime/read/edgeToolbar.ts`

同理可直接改成：

```ts
const target = read(selection)
const edges = edgeTarget.edges(target)
const box = edgeTarget.bounds({
  nodeIds: [],
  edgeIds: edges.map((entry) => entry.id)
})
```

#### 3. `runtime/read/edge.ts`

当前仍有明显的协议泄漏：

- `readResolvedNodeSnapshot(readNode, readStore, edgeEnd)`
- `readResolvedEdgeView(readStore, node, entry)`

长期最优里，这两个 helper 都不该再把 `ReadFn` 作为参数继续往下传。

它们应该变成纯领域 helper：

```ts
readResolvedNodeSnapshot(readNode, edgeEnd)
readResolvedEdgeView(node, entry)
```

内部直接调用 `read(...)`。

#### 4. `runtime/read/node.ts`

这里现在大量 `createKeyedDerivedStore((readStore, key) => ...)` 的内部 helper 也会跟着简化。

最终形态应是：

- derived `get` 里直接调用 `read(...)`
- 内部 helper 不再层层传 `readStore`

#### 5. `runtime/read/mindmap.ts`

同样适用。  
凡是业务 helper 接受 `readStore` 只是为了读另一个 store，都应该顺手收掉。

#### 6. `runtime/read/index.ts`

现在 `target` 是专门拼装出来的一层。  
协议升级后，这层仍然可以保留，但职责应更明确：

- 只做领域 read 命名空间的组装
- 不再承载 tracked/untracked 双协议兼容

## Dataview 全局优化点

这次协议升级不应只修 whiteboard，一样应该把 dataview 里“业务 API 被迫理解 store 读取方式”的问题一起盘掉。

### 1. `dataview/src/engine/store/selectors.ts`

当前文件里自己维护了：

- `createSelector`
- `createKeyedSelector`
- `selectDoc`
- `selectDocById`

这层本身不一定要全部删除，因为 dataview 仍然需要把 document state 暴露成 store。

但协议升级后，需要重新区分两层职责：

- store 暴露层
  - 负责订阅粒度
  - 继续保留 `ReadStore` / `KeyedReadStore`
- 领域 read 层
  - 负责组合语义
  - 不再显式 `.get()` / 传 `readStore`

也就是说，这些 selector 工具可以继续作为 store 生产器存在，但不应该再逼业务层自己处理 tracked/untracked。

### 2. `createActiveReadApi(...)`

这个位置当前非常典型，里面大量是：

```ts
input.read.document.get()
input.read.record.get(recordId)
input.state.get()
```

这说明 active read facade 目前还是一个“裸 store `.get()` 的胶水层”。

长期最优里，这类 facade 应该变成真正的语义 reader：

- 对外暴露领域语义函数
- 内部统一走 `read(...)`
- 在 derived store 和普通逻辑里都复用同一套 API

也就是说，长期方向不是继续写更多 `getRecord` / `getField`，而是让 active read 自身成为可复用 reader。

### 3. dataview facade 层

例如：

- `dataview/src/engine/facade/fields.ts`
- `dataview/src/engine/facade/views.ts`
- `dataview/src/engine/facade/records.ts`

这几个文件里也有很多：

- `options.read.xxx.get(...)`
- `const readViews = () => options.read.views.get()`

这类封装有一部分是真正的领域抽象，但有一部分只是 `.get()` 转一层名字。

协议升级后应重新判断：

- 保留真正提供语义的 facade
- 删除只是替 `.get()` 改个函数名的 facade

### 4. React 侧直接 `.get()` 的业务读取

例如 dataview 某些 React 视图层目前会直接：

- `engine.read.record.get(recordId)`

这类调用本身不一定错，但长期最好统一边界：

- React 订阅路径走 store
- 业务组合路径走语义 reader

不要两边混在一起。

## shared/react 也应一起收敛

### `shared/react/src/useLazySelectorValue.ts`

这个工具现在把 `StoreRead` 直接传给 leaf：

```ts
type LazySelectorLeaf<T> = (read: StoreRead) => T
```

如果 `shared/core` 协议升级成功，这里也可以一起简化成：

```ts
type LazySelectorLeaf<T> = () => T
```

因为 leaf 内部可以直接调用 `read(...)`。

这会带来两个好处：

- React 层不再传播 `StoreRead`
- lazy selector 的语义更纯，调用者只描述“如何读”，不关心 tracking 机制

## 最终 API 设计

### shared/core

建议最终公开 API 如下：

```ts
read(store)
read(store, key)
peek(store)
peek(store, key)

createDerivedStore({
  get: () => value,
  isEqual
})

createKeyedDerivedStore({
  get: (key) => value,
  isEqual,
  keyOf
})
```

命名理由：

- `read`
  - 最短、最直接，表达“参与当前 read 协议的读取”
- `peek`
  - 直观表达“只看一眼，不建立依赖”

不建议保留这些长期对外命名：

- `StoreRead`
- `ReadFn`
- `trackedRead`
- `readStore`
- `nodesFrom`
- `boundsFrom`

### whiteboard

保持当前已经趋于正确的领域命名，不再补 tracked 变体：

```ts
engine.read.group.target(groupId)
engine.read.target.nodes(target)
engine.read.target.edges(target)
engine.read.target.bounds(target)

editor.read.group.target(groupId)
editor.read.target.nodes(target)
editor.read.target.edges(target)
editor.read.target.bounds(target)
```

### dataview

dataview 不一定要和 whiteboard 完全同形，但原则相同：

- 语义 API 不显式 `.get()`
- 不显式传 `StoreRead`
- derived / non-derived 共用同一套 reader

## 明确要删除的旧实现

这次如果正式落地，不保留兼容层，建议明确删除下面这些模式：

- 所有 `xxx(readStore, ...)` 只是为了访问另一个 store 的 helper
- 所有 `xxxFrom(readStore, ...)` 命名
- 所有只为 tracked/untracked 双模式存在的 wrapper
- 业务包里对 `StoreRead` / `ReadFn` 的直接依赖

至少包括：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/target.ts`
  - `readLiveTargetNodes`
  - `readLiveTargetEdges`
  - `readLiveTargetBounds`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts`
  - 接受 `ReadFn` 的内部 helper
- `shared/react/src/useLazySelectorValue.ts`
  - `LazySelectorLeaf<T> = (read: StoreRead) => T`

dataview 那边不一定每个 `.get()` wrapper 都立刻删，但需要按“是否真有语义”进行清理。

## 推荐实施顺序

### 阶段 1：先改 shared/core 协议

修改：

- `shared/core/src/store.ts`

目标：

- 建立 active read scope
- 提供 `read(...)` / `peek(...)`
- 让 `createDerivedStore` / `createKeyedDerivedStore` 不再向业务暴露 `StoreRead`

### 阶段 2：whiteboard 收口

重点改：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/target.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edgeToolbar.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/node.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/mindmap.ts`

目标：

- 删除所有 tracked helper
- 所有 reader helper 改成纯领域签名

### 阶段 3：shared/react 同步简化

重点改：

- `shared/react/src/useLazySelectorValue.ts`

目标：

- 不再向 React 侧继续传播 `StoreRead`

### 阶段 4：dataview 收敛

重点看：

- `dataview/src/engine/store/selectors.ts`
- `dataview/src/engine/facade/fields.ts`
- `dataview/src/engine/facade/views.ts`
- `dataview/src/engine/facade/records.ts`

目标：

- 区分“store 暴露层”和“领域 read 层”
- 删除只是重命名 `.get()` 的胶水封装
- 把真正的领域组合逻辑收进统一 reader

## 不建议做的事

### 1. 不要继续加 `From(readStore, ...)`

这是把当前缺陷制度化。

### 2. 不要增加 `track.*` / `get.*` 双命名空间

这只是在 API 层复制一遍协议复杂度。

### 3. 不要为了统一而再加一层通用 reader factory

如果 `read(...)` / `peek(...)` 已经足够表达，就不要再强行引入一层额外 factory。

长期最优应该优先减少抽象层数，而不是为了“统一”再造一个统一器。

只有当某一组 reader 的创建逻辑重复到足够明显时，才考虑在 `shared/core` 增加极薄的 helper。

## 一句话总结

长期最优不是继续发明 tracked helper，而是直接升级 `shared/core` 的 derived read 协议：

- 让 `read(...)` 自动处理 tracked / untracked
- 让业务 helper 回到纯领域签名
- 让 whiteboard、dataview、shared/react 一起删掉 `StoreRead` 泄漏和 `.get()` 胶水层

这样最终留下来的 API 才会真的短、稳、清晰。
