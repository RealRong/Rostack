# `shared/core` Store Snapshot 契约重构方案

本文聚焦一个具体问题：

- `dataview-react` 里 `ColumnFooterBlock` 通过 `useKeyedStoreValue(table.summary, scopeId)` 会偶发拿到旧的 summary。
- 如果把 `shared/react` 的 raw store hook 直接改成 `useSyncExternalStore(subscribe, store.get, store.get)`，又会把 `usePointer` 一类依赖 `table.currentView / table.body` 的逻辑打成无限重渲染。

这两个现象表面相反，根因其实一致：

- `shared/core` 的 store 语义和 React external store 的 snapshot 语义没有对齐。

## 一、问题不在 footer，本质在 store 契约

当前链路里有两个层面：

1. `shared/core`
   负责定义 `ReadStore / KeyedReadStore / DerivedStore` 的行为。
2. `shared/react`
   负责把 store 接到 React。

当前真正的问题不是 `ColumnFooterBlock` 本身，也不是 `summary` 本身，而是下面这个不变量没有成立：

- 同一个时刻，组件里通过 hook 读到的 store 值，应该和直接 `store.get()` 读到的当前快照一致。

现在这个不变量会被破坏，原因有两个方向：

- `shared/core` 的一部分 store 即使语义没变，也可能在 `get()` 时产出一个新对象。
- `shared/react` 又在 hook 层做了一层 semantic cache，试图把“语义相等但引用不同”的情况挡掉。

这会导致：

- React hook 拿到的值和 `store.get()` 不一致。
- 一旦去掉 hook 层缓存，React 又会因为 snapshot 不稳定而持续重渲染。

## 二、两个现象为什么会同时出现

### 1. `ColumnFooterBlock` stale

现象：

- `useKeyedStoreValue(table.summary, scopeId)` 偶发返回旧 summary。
- 但同一 render 里直接 `table.summary.get(scopeId)` 又能读到新值。
- collapse 任意 section 后，footer 又恢复正常。

这说明：

- engine / runtime 的 summary 语义多数时候已经是新的。
- stale 更可能发生在 React binding 层，而不是 engine summary 计算层。

当前 workaround 本质是：

- 用 hook 只负责“订阅”
- 真正渲染时直接 `store.get()`

这能绕过 stale，但只是局部兜底，不是根因修复。

### 2. `usePointer` 无限循环

现象：

- 把 raw store hook 改成直接 `useSyncExternalStore(subscribe, store.get, store.get)` 后，
- `usePointer` 里的 `schedulePointer` 看起来像被打爆，出现无限循环。

这不是 pointer 自己有问题，而是 React 对 external store 的要求被破坏了：

- 如果没有新的订阅通知，`getSnapshot()` 必须返回稳定 snapshot。
- 但当前很多 store 的 `get()` 并不保证“语义没变时引用也稳定”。

因此 React 会不断认为 snapshot 变了，进而持续重渲染。`usePointer` 只是最先暴露出来的一条链路。

## 三、真正的根因

### 1. `shared/core` 中不同 store 的契约不统一

当前可以把 store 分成两类：

- 天然 snapshot-stable 的 store
- 语义稳定但 snapshot 不一定稳定的 store

#### 天然稳定的 store

这些 store 在 `isEqual(current, next)` 为 `true` 时，不会替换内部 `current` 引用：

- `createValueStore`
- `createKeyedStore`
- `createStagedValueStore`
- `createStagedKeyedStore`
- `createProjectedStore` 的异步模式
- `createProjectedKeyedStore` 的异步模式

它们的共同点是：

- 内部有显式 `current`
- 只有在语义变化时才替换 `current`

#### 不稳定的关键来源

真正的缺口主要在：

- `shared/core/src/store/derived.ts` 的 `createDerivedNode`
- `shared/core/src/store/family.ts` 的 `createKeyedDerivedStore`

`createDerivedNode` 当前行为是：

- 每次 `ensureFresh()` 都会重新计算 `computed.value`
- 即使 `isEqual(previous, computed.value)` 为 `true`
- 也会把 `current` 替换成新的 `computed.value`
- 只是不会发通知

这意味着：

- “是否通知” 和 “是否替换 snapshot 引用” 被拆开了
- 但 React external store 需要这两个语义保持一致

`createKeyedDerivedStore` 又是基于 `DerivedNode` 的，所以这个问题会直接传导到 keyed 场景，例如 table summary、table section、table row、table body 等。

### 2. `shared/react` 在替 store 修语义

当前 `shared/react/src/useExternalValue.ts` 会自己做一层 `equal` 缓存。

这层缓存的本意是：

- 避免 selector 每次返回一个 fresh object 时造成无意义刷新

但它同时也被 raw store hook 复用在：

- `useStoreValue`
- `useKeyedStoreValue`
- `useOptionalKeyedStoreValue`

于是问题变成：

- store 自己的 snapshot 不稳定
- hook 再尝试自己稳定它

结果就会出现两类错误：

- hook 返回值和直接 `store.get()` 不一致
- 调整 hook 策略时，很容易把其他依赖 `isEqual` 的 store 全打坏

## 四、最终设计目标

目标只有一句话：

- snapshot 稳定性必须由 `shared/core` 的 store 自己负责，不能由 `shared/react` 猜。

这句话展开后，有四条明确要求：

1. 对 React 可见的 raw store，必须满足 stable snapshot 契约。
2. `isEqual` 的拥有者只能是 store 本身，不能在 React hook 层重复定义一遍。
3. `store.get()` 和 hook 读到的值必须一致。
4. `shared/react` 的 raw hook 必须退化成极薄封装。

## 五、建议采用的契约

不建议新增一套新的 store 类型，也不建议再引入一层“React 专用 store”抽象。复杂度会更高，而且会把问题从实现层变成类型分叉。

建议做法是：

- 保持现有 `ReadStore<T>` / `KeyedReadStore<K, T>` 形状不变
- 但把语义收紧

建议收紧后的语义如下：

### `ReadStore<T>`

- `get()` 返回“当前已发布 snapshot”。
- 如果自上次发布以来没有新的语义变化，则 `get()` 必须返回与上次相同的 snapshot 引用。
- `subscribe(listener)` 只在“已发布 snapshot 语义变化”时触发。
- `isEqual` 不只是通知优化，也决定“旧 snapshot 是否应该保留”。

### `KeyedReadStore<K, T>`

- `get(key)` 返回该 key 的“当前已发布 snapshot”。
- 对同一个 key，如果没有新的语义变化，`get(key)` 必须返回与上次相同的 snapshot 引用。
- `subscribe(key, listener)` 只在该 key 的已发布 snapshot 语义变化时触发。
- `isEqual` 同时控制 key 级通知和 key 级 snapshot 保留。

### `createReadStore`

`createReadStore` 只是一个低层适配器，不可能自动保证调用者的 `get()` 稳定。

因此它需要明确文档语义：

- 如果调用方希望把这个 store 直接接到 React raw hook，上游必须自行满足 stable snapshot 契约。
- `createReadStore` 本身不负责修复不稳定 snapshot。

这意味着：

- 绝大多数应用侧应优先使用 `createValueStore / createDerivedStore / createKeyedDerivedStore / createProjectedStore`
- 不要用 `createReadStore` 包装一个“每次 `get()` 都 fresh object”的源，再直接接 React

## 六、核心实现方案

### 1. 优先修 `createDerivedNode`

这是最关键的改动点。

当前 `ensureFresh()` 的逻辑需要调整为：

- 先计算 `computed.value`
- 始终完成依赖收集与依赖重连
- 再判断 `isEqual(previous, computed.value)`

如果语义变化：

- 更新 `current = computed.value`
- 允许通知

如果语义未变化：

- 不替换 `current`
- 保留旧 snapshot 引用
- 仍然更新依赖图
- 不通知

这点非常关键：

- “依赖需要刷新”
- 和
- “值需要换引用”

是两件事，当前实现把它们绑错了。

### 2. `createKeyedDerivedStore` 自动继承修复

`family.ts` 里的 keyed family 是基于 `DerivedNode` 缓存的。

因此只要 `createDerivedNode` 修好，以下 keyed store 会自动受益：

- table.summary
- table.section
- table.column
- table.row / chrome / selection 一类 keyed store

也就是说，`ColumnFooterBlock` 的 stale 并不需要在 footer 自己修。

### 3. 审计 `projected` 与 `staged`

`projected` 和 `staged` 大体已经是 stable 的，因为它们内部只有在 `isEqual` 不成立时才替换 `current`。

但仍建议补一轮契约审计，确认：

- 单值模式是否稳定
- keyed 模式是否稳定
- sync / microtask / raf 三种调度模式下行为一致

这里重点不是大改，而是补测试，避免以后回归。

## 七、`shared/react` 应该怎么收敛

在 `shared/core` 修好之前，`shared/react` 继续承担 snapshot 修正职责，会一直处在危险状态。

在 `shared/core` 修好之后，`shared/react` 应该按职责收敛成两层：

### 1. raw store hook

这些 hook 不应该再带自己的 semantic cache：

- `useStoreValue`
- `useKeyedStoreValue`
- `useOptionalKeyedStoreValue`

它们应该只是：

- 用 `useSyncExternalStore`
- 订阅 store
- 读取 store 当前 snapshot

也就是说：

- React 只消费 store 自己已经稳定好的 snapshot
- 不再二次做“equal 复用旧值”

### 2. selector hook

`useExternalValue` 可以保留，但职责要收窄：

- 它只服务于 selector / projection 一类场景
- 也就是“源值稳定，但 selector 结果可能每次 fresh object”的情况

例如：

- `useStoreSelector`
- session selector
- lazy selector

这层可以保留 semantic cache，因为它面对的是 selector 结果，而不是 raw store snapshot。

## 八、为什么不建议继续修 footer 或继续修 hook

### 1. 不建议继续在 footer 层补丁

例如下面这类做法都不是根因修复：

- hook 只订阅，渲染时直接 `table.summary.get()`
- 额外绑一个 `section.count` 强制 footer 重渲染
- collapse 后依赖 layout remount 纠正显示

这些做法的问题是：

- 局部可用
- 全局不可推广
- 同类 bug 还会继续在别的组件上出现

### 2. 不建议继续在 `shared/react` 上堆 revision/cache 技巧

例如：

- 用内部 revision 驱动 `useSyncExternalStore`
- 用 hook 层缓存把旧值压回来

这些手段能局部规避问题，但会带来两个长期副作用：

- hook 返回值和 `store.get()` 可能不一致
- React 层承担了本应属于 store 层的语义

这会让系统越来越难推理。

## 九、最终推荐路线

推荐路线是一次性把层次理顺，不做中间兼容层：

1. 先修 `shared/core/src/store/derived.ts`
2. 再补 `family.ts`、`projected.ts`、`staged.ts` 的契约测试
3. 然后把 `shared/react` 的 raw store hook 改成薄封装
4. 最后删除 dataview-react 里的 workaround

这样会形成一个清晰边界：

- `shared/core` 负责 value 语义、依赖追踪、snapshot 稳定性
- `shared/react` 只负责把 store 接到 React
- dataview-react 组件只负责 UI，不再承担底层状态修正职责

## 十、建议的测试矩阵

### `shared/core`

需要新增的测试重点：

- derived store 在 `isEqual === true` 时，不通知且 `get()` 返回旧引用
- derived store 在依赖变化但值语义不变时，依赖关系仍会刷新
- keyed derived store 对同一 key 满足相同契约
- projected sync 模式继承 derived 契约
- projected async 模式在 flush 前后 snapshot 稳定

### `shared/react`

需要新增的测试重点：

- raw store hook 读到的值与同一时刻 direct `store.get()` 一致
- selector hook 在 selector 结果语义不变时可保留缓存
- keyed store hook 不会返回旧 key snapshot

### `dataview`

至少需要补三类回归：

- grouped + filter 后 section footer summary 不 stale
- collapse section 不再承担“修正 stale footer”的副作用
- `usePointer` / `table.body` / `table.currentView` 不出现无限重渲染

## 十一、实施 checklist

- 明确文档契约：`ReadStore / KeyedReadStore` 的 snapshot 语义收紧
- 修改 `shared/core/src/store/derived.ts`
- 验证 `shared/core/src/store/family.ts` 是否自动满足新契约
- 审计 `projected.ts` 与 `staged.ts`
- 为 `shared/core` 补 snapshot 稳定性测试
- 将 `shared/react` raw hook 收缩为薄封装
- 保留 `useExternalValue` 仅服务 selector 场景
- 删除 dataview-react 中针对 stale summary 的 workaround
- 回归验证 table footer、pointer、body、row 等关键链路

## 十二、最终结论

这次问题不能继续按组件修，也不该继续按 React hook 技巧修。

长期最优、错误最少、复杂度最低的方案只有一个：

- 把 stable snapshot 契约下沉到 `shared/core`
- 让 `shared/react` 只消费这个契约

只要这条边界建立起来：

- `ColumnFooterBlock` 的 stale 会自然消失
- `usePointer` 的无限循环也会一起消失
- `store.get()` 与 hook 返回值终于能重新一致

这才是值得落地的根因修复方案。
