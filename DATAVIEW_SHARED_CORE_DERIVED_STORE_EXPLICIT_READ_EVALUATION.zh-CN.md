# Dataview / shared-core Derived Store Explicit Read 方案评估

## 结论

[DATAVIEW_SHARED_CORE_DERIVED_STORE_EXPLICIT_READ_FINAL_PLAN.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_SHARED_CORE_DERIVED_STORE_EXPLICIT_READ_FINAL_PLAN.zh-CN.md) 技术上能做，但不适合作为当前代码库的全局长期最优方案。

更准确地说：

- 作为 dataview 局部协议收紧，它是可行的
- 作为 `shared/core` 全局终局方案，它和当前 whiteboard / shared/core 的正确收敛方向冲突
- 这份方案里有一部分值得吸收
- 也有一部分不应该做，尤其不应该反向把 tracking 机制重新暴露给领域层

一句话总结：

- 这份 explicit-read 方案“更显式”
- 但它会重新把 tracked read 泄漏到业务组合层
- 对 dataview 局部可以吸收部分思路
- 对整个仓库不应整体回退到这条路

## 为什么它能做

这份方案解决的两个核心问题都是真问题。

### 1. derived getter 里 `store.get()` 是静默错误

当前协议下：

- 在 derived getter 里写 `read(store)` 是正确的
- 写 `store.get()` 不会报错
- 但依赖不会被跟踪

这确实是一个长期风险点。

### 2. ambient `read(...)` 的语义不够显式

当前 `shared/core` 里的 `read(...)` 是：

- 在 derived 重算上下文中会 track
- 在普通上下文中退化成普通读

所以它是“上下文敏感函数”。

这意味着：

- 调用点看到 `read(...)` 时，不能只靠函数名判断这次是不是 tracked
- 需要结合调用栈语境理解

这也是这份文档想解决的问题。

因此，如果只看“显式性”和“局部可审查性”，这份方案是成立的。

## 为什么它不适合作为全局终局方案

问题不在于显式 `get(read)` 本身错，而在于它和当前整个仓库已经确定的长期方向不兼容。

### 1. 它会重新把 tracked read 暴露到业务组合层

这份方案的核心是：

- `createDerivedStore({ get: (read) => ... })`
- `createKeyedDerivedStore({ get: (key, read) => ... })`
- 删除 ambient `read(...)`

这在 store 层是显式的，但一旦进入 whiteboard 这类“领域 reader 很重”的系统，就会出现一个结果：

- reader 内部不能再透明读取 store
- reader 如果要在 derived 内保留 tracking，就必须重新显式拿到 `read`

这会让很多已经收平的领域 API 重新裂开。

### 2. 它会直接冲击 whiteboard 当前已经建立好的 reader 方向

whiteboard 当前已经明确的长期方向是：

```ts
editor.read.group.target(groupId)
editor.read.target.nodes(target)
editor.read.target.edges(target)
editor.read.target.bounds(target)
```

以及：

```ts
readResolvedEdgeView(node, entry)
```

这些 API 的核心价值是：

- tracked / untracked 调用方式一致
- 业务层只表达领域语义
- tracking 协议不再泄漏成 API 参数

如果改成 explicit-read 全局方案，那么这些 reader 会重新面临二选一：

1. 内部直接 `.get()`
   - 那 derived 场景丢依赖

2. 显式把 `read` 传下去
   - 那领域 API 重新长回 `xxx(read, ...)`

结果就会重新出现这类形式：

- `target.nodes(target, read)`
- `target.bounds(target, read)`
- `readResolvedEdgeView(read, node, entry)`

这正是之前已经明确要删除的架构裂口。

### 3. 它会让“领域 API 单一语义面”退化

当前更好的方向是：

- 领域 API 永远只收领域参数
- store tracking 是 runtime 内部问题

而 explicit-read 方案会把模型改成：

- 领域组合 helper 必须知道自己是否运行在 derived 里
- 一旦需要 tracked，就必须接 `read`

这对 dataview 的 selector 层也许还可接受，但对白板这种“read 层即领域层”的系统会明显变差。

### 4. 它解决了显式性，却破坏了跨上下文复用性

ambient `read(...)` 的最大优点不是“语法短”，而是：

- 同一个 reader 在普通逻辑里能用
- 在 derived 逻辑里也能用

只要内部统一走 `read(...)`，调用者就不用区分上下文。

这正是 whiteboard 那些 target/group/edge/node reader 能收平的根本原因。

explicit-read 方案把这个能力换成了“调用点更显式”，但代价是 reader 自身更难复用。

对整个仓库看，这个交换不划算。

## 哪些部分值得吸收

这份方案不是全盘错误，其中有几条我认为应该吸收。

### 1. dataview 的 source store 协议继续向 `ValueStore` 对齐

这点是对的。

例如 dataview 里的：

- `Store.sub(...)`

这种只是改名不改语义的接口，长期确实应删掉，统一到：

- `subscribe(...)`

source store 协议不应再分叉。

### 2. selector 层继续变薄

这点也对。

dataview 的：

- `createSelector(...)`
- `createKeyedSelector(...)`

如果只是 selector 生命周期胶水，就应继续收薄，不应长期维护一套平行 runtime。

### 3. derived getter 里误写 `.get()` 的问题必须处理

这是这份文档指出的最重要风险之一，也是事实。

但解决它不一定要删除 ambient `read(...)`。

更合理的做法是：

- 保留 ambient `read(...)`
- 同时加机制约束 derived getter 不应直接 `.get()`

例如：

- lint 规则
- 约定的 review rule
- 少量开发期断言
- 或后续引入更强的 helper 封装

### 4. dataview 的 facade / selector / active read 要继续语义化

这点也成立。

dataview 当前很多 `.get()` 胶水虽然已经收薄了一轮，但长期还可以继续收。

## 哪些部分不应该做

### 1. 不应删除 ambient `read(...)` 作为 `shared/core` 全局能力

这是我最不建议做的点。

原因不是它不能实现，而是它会把 whiteboard 侧已经收平的领域 read 重新打碎。

### 2. 不应让 `DerivedRead` 成为领域 API 的常见参数

这份文档中有一句话本身是对的：

- `DerivedRead` 应停留在 derived 组合层

但如果删除 ambient `read(...)`，实际结果通常恰好相反：

- 组合 helper 为了保持 tracking，不得不显式吃 `read`
- 最后 `DerivedRead` 会扩散到越来越多局部 helper

在 whiteboard 里这会迅速重新制造 `xxx(read, ...)` 模式。

### 3. 不应为了显式性放弃“同一 reader 跨上下文可复用”

长期最优不是只盯着 derived getter 那一层，而是看整个系统最终 API 面是否稳定。

从这个角度看：

- ambient `read(...)` 虽然更隐式
- 但它换来了领域 API 的统一和稳定

这是更高价值的性质。

## 当前代码库的长期最优

结合已经落地的 shared/core 与 whiteboard 收敛，我认为当前真正的长期最优是：

### 1. `shared/core` 继续保留 ambient `read(...)`

保留原因：

- 它允许 reader 在 tracked / untracked 场景共用同一套 API
- 它允许领域 helper 不暴露 `read`
- 它对 whiteboard 这种领域 reader 密集型系统更友好

### 2. `peek(...)` 可以继续评估，但不是当前主要问题

是否保留 `peek(...)` 不是最核心矛盾。

真正关键的是：

- 不要删除 ambient `read(...)`

如果后续发现 `peek(...)` 使用面很薄，可以单独评估是否收掉，但不应和 explicit-read 方案绑定处理。

### 3. 领域 API 继续保持“只收领域参数”

例如 whiteboard 应继续保持：

```ts
read.target.nodes(target)
read.target.edges(target)
read.target.bounds(target)
```

而不是回退成：

```ts
readTargetNodes(read, target)
readTargetBounds(read, target)
```

### 4. dataview 吸收“显式性约束”，但不反推全局协议回退

更合理的方式是：

- dataview 继续统一 source store 协议
- 继续薄化 selector 层
- 继续减少 facade 胶水
- 但不要为了解决 derived getter 中 `.get()` 的风险，把 `shared/core` 全局协议切回 explicit-read-only 模式

## 对这份文档的最终判断

### 可以做的部分

- `Store.sub(...)` -> `subscribe(...)`
- dataview source store 完全对齐 `ValueStore`
- selector helper 继续薄化
- 继续清理 dataview 的 `.get()` 胶水包装
- 增强 derived getter 中误用 `.get()` 的约束

### 不建议做的部分

- 删除 ambient `read(...)`
- 删除 `activeReadScope` 这一整套隐式 tracked runtime
- 把 `createDerivedStore` / `createKeyedDerivedStore` 改回必须显式传 `read`
- 让 whiteboard / dataview 的领域 reader 重新暴露 `DerivedRead`

## 一句话总结

`DATAVIEW_SHARED_CORE_DERIVED_STORE_EXPLICIT_READ_FINAL_PLAN` 作为“显式性优先”的局部设计可以成立，但不适合作为整个仓库的全局终局。

当前更好的长期最优是：

- 保留 `shared/core` 的 ambient `read(...)`
- 用它维持领域 API 在 tracked / untracked 场景下的单一语义面
- 同时吸收该文档里关于 source store 对齐、selector 薄化、误用 `.get()` 风险治理的部分思路

也就是说：

- 吸收它指出的问题
- 不采用它给出的全局终局协议
