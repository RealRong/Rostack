# Whiteboard Store Projection 收敛方案

## 背景

当前 `whiteboard-editor/src/runtime/overlay.ts` 里存在一条比较明显的异味：

- 一份 `overlay state` 作为总状态
- 再手工同步到
  - `node` keyed store
  - `edge` keyed store
  - `draw preview`
  - `edge guide`
  - `mindmap drag`
  - `snap guides`

核心代码就是 `syncStores(...)`。

这条线之所以让人觉得怪，不是因为 overlay 功能本身有问题，而是因为它暴露了底层 store 抽象还缺一层：

```text
当前 store primitives 足够做单路状态
但还不够直接表达“一份源状态 -> 多份高效投影 store”
```

于是 overlay 只能自己充当一个小型 projection runtime。

这份文档只讨论：

- `syncStores` 说明了什么
- 当前 store 能力缺口在哪里
- 长期最优应该补什么 API
- overlay 这条线后续如何收敛

不包含代码实现。

---

## 结论

### 1. `syncStores` 不是单纯的性能补丁

它的本质不是“store 太慢，所以要手动优化”。

它实际在做的是：

1. 从一份 `base overlay state` 做 fan-out
2. 为不同投影选择不同调度策略
3. 为不同投影选择不同 equality 策略
4. 把总状态投影成面向渲染层的 selector stores

也就是说：

```text
syncStores 不是在补 store 性能
而是在补 store 表达力
```

### 2. 当前缺的不是基础 store，而是 projection store

`@whiteboard/engine` 现在已经有：

- `createValueStore`
- `createKeyedStore`
- `createDerivedStore`
- `createKeyedDerivedStore`
- `createStagedValueStore`
- `createStagedKeyedStore`
- `createRafValueStore`
- `createRafKeyedStore`

这些 primitive 单独都成立，但缺少一种很常见的上层能力：

```text
给我一个 source store
再给我一个 projection
自动得到一个带 equality / schedule / keyed 能力的派生 store
```

这是 overlay 当前只能手写 `syncStores` 的根本原因。

### 3. 长期最优不是继续在 overlay 层重写，而是补底层 projection primitive

推荐新增两类高层 store：

1. `createProjectedStore`
2. `createProjectedKeyedStore`

这样 overlay、未来的 read runtime、以及其它需要 fan-out 的模块，都能直接复用。

---

## 当前问题

## 1. `derived` 和 `staged / raf` 是分裂的

现在的能力边界大概是：

- `derived`
  - 擅长自动依赖收集
  - 不带调度能力
- `staged / raf`
  - 擅长刷新调度
  - 不带上游依赖追踪
- `keyed`
  - 擅长按 key 精细订阅
  - 但不会自动从 source store 投影

overlay 这种场景实际需要的是：

- 已知唯一 source
- 从 source 投影多个下游 store
- 每个下游 store 自己决定
  - 是否 keyed
  - 是否 raf
  - equality 怎么比

但现有 primitives 里没有一个 API 能直接表达这个组合。

所以业务代码只能写成：

1. 先 `state.set(composed)`
2. 再 `syncStores(composed)`

这不是 overlay 自己想复杂，而是底层没有 projection 层。

## 2. overlay 同时承担了两层职责

当前 `runtime/overlay.ts` 实际上混了两层：

### 1. overlay source of truth

负责：

- 持有统一 overlay snapshot
- 把 gesture preview 合成进去
- normalize / equal / reset

### 2. overlay render projection

负责：

- 投影出 node keyed store
- 投影出 edge keyed store
- 投影出 draw / snap / marquee / edgeGuide / mindmapDrag
- 决定每条投影的 schedule 策略

`syncStores` 正好卡在这两层中间。

所以现在这层看起来怪，不是因为做错了，而是因为：

```text
overlay state 和 overlay selectors 被揉进了同一个 runtime
```

## 3. 这个问题会复用，不是 overlay 特例

只要以后还有类似场景：

- 一份总状态
- 多个细粒度 selector
- selector 各自有调度策略

同样的问题还会再出现。

也就是说，如果不补底层 projection primitive，`syncStores` 这种手写总线还会继续长出来。

---

## 长期最优模型

## 1. 补齐 Projection Store 这一层

推荐只新增两类高层原语：

### 1. `createProjectedStore`

用途：

- 单 source value store
- 投影成另一个 value store
- 可选 equality
- 可选 schedule

概念示意：

```ts
const next = createProjectedStore({
  source,
  select: (value) => ...,
  isEqual,
  schedule
})
```

### 2. `createProjectedKeyedStore`

用途：

- 单 source value store
- 投影成 keyed store
- 可选 equality
- 可选 schedule

概念示意：

```ts
const next = createProjectedKeyedStore({
  source,
  select: (value) => ReadonlyMap<Key, Value>,
  emptyValue,
  isEqual,
  schedule
})
```

这两类已经足够覆盖 overlay 绝大多数需求。

## 2. 保持 `derived` 和 `projected` 的职责分离

不建议把这个能力继续塞进 `createDerivedStore`。

原因很简单：

- `derived` 解决的是“自动依赖收集”
- `projected` 解决的是“单源投影”

overlay 明明只有一个明确 source，不需要自动依赖追踪。

如果强行把 `schedule`、`keyed projection` 都塞给 `derived`，只会让 `derived` 变成一个过于宽泛的万能 API。

长期最优应该是：

- `value / keyed`
  - 纯状态
- `derived`
  - 多依赖计算
- `projected`
  - 单源投影
- `staged / raf`
  - 调度底座

这样每层职责都清楚。

## 3. `staged / raf` 保留为底层，不再让业务层频繁直接使用

当前业务层直接用：

- `createRafValueStore`
- `createRafKeyedStore`
- `createStagedKeyedStore`

这会让业务代码自己承担太多调度细节。

长期更好的方式是：

- projection 层决定是否用 `sync / microtask / raf`
- `staged / raf` 作为 projection 的内部实现细节

这样 overlay 这种业务模块只表达：

```text
这个 selector 用 raf
这个 selector keyed
这个 selector 的 equality 是什么
```

而不用自己维护一条同步总线。

---

## 推荐 API

## 1. 调度选项

为了保持 API 简短，建议统一用非常短的调度选项：

```ts
type StoreSchedule = 'sync' | 'microtask' | 'raf'
```

如果未来确实需要完全自定义调度器，再扩成：

```ts
type StoreSchedule =
  | 'sync'
  | 'microtask'
  | 'raf'
  | ((flush: () => void) => () => void)
```

但第一阶段不建议一上来就做太宽。

### 2. `createProjectedStore`

建议语义：

```ts
createProjectedStore({
  source,
  select,
  isEqual,
  schedule
})
```

参数职责：

- `source`
  - 上游 `ReadStore<Base>`
- `select`
  - `Base -> Next`
- `isEqual`
  - 下游值是否变化
- `schedule`
  - 下游通知策略

输出职责：

- 返回普通 `ReadStore<Next>`
- 自动订阅 source
- 自动维护下游缓存

### 3. `createProjectedKeyedStore`

建议语义：

```ts
createProjectedKeyedStore({
  source,
  select,
  emptyValue,
  isEqual,
  schedule
})
```

参数职责：

- `source`
  - 上游 `ReadStore<Base>`
- `select`
  - `Base -> ReadonlyMap<Key, Value>`
- `emptyValue`
  - key 不存在时的默认值
- `isEqual`
  - 单 key 的值是否变化
- `schedule`
  - keyed store 的刷新策略

输出职责：

- 返回 `KeyedReadStore<Key, Value>`
- 仅通知变更的 key
- 下游组件仍然保持细粒度订阅

---

## Overlay 这条线如何收敛

如果底层 projection primitive 补齐，overlay 建议收成两层。

## 1. `overlay/state.ts`

职责：

- 持有 `EditorOverlayState`
- 对外提供 `get / subscribe / set / reset`
- 合成 gesture preview
- 做 normalize / equality

它是唯一 source of truth。

## 2. `overlay/selectors.ts`

职责：

- 从 `overlay state` 投影出：
  - `node`
  - `edge`
  - `feedback.draw`
  - `feedback.marquee`
  - `feedback.mindmapDrag`
  - `feedback.edgeGuide`
  - `feedback.snap`

这里不再需要手写 `syncStores`。

会变成纯声明式 projection：

- node: keyed + microtask
- edge: keyed + raf
- draw: value + raf
- snap guides: value + raf
- marquee: value + sync 或 derived

## 3. `overlay/index.ts`

职责：

- 组装 `state + selectors`
- 返回今天的 `EditorOverlay` 形状

这样外部 API 基本不用变，但内部边界会明显更清楚。

---

## 为什么不是“只改 overlay，不动底层 store”

这种做法短期当然可行，但长期收益有限。

因为只要不补 projection primitive：

- overlay 里会继续出现“总状态 + 多路手动同步”
- 下一个类似模块还会再写一套 `syncStores`
- 复杂度只是在不同 runtime 之间复制

所以更合理的顺序是：

1. 先补 store projection primitive
2. 再把 overlay 切成 `state + selectors`
3. 后续其它模块复用同一套原语

---

## 实施顺序

推荐按下面顺序做。

## 1. 新增 projection store primitive

目标：

- 不动现有业务语义
- 只补底层能力

建议第一步只做：

- `createProjectedStore`
- `createProjectedKeyedStore`

不急着删旧 API。

## 2. 用 overlay 作为第一条迁移线

overlay 是最好的试点，因为：

- 当前痛点最明显
- 结构相对封闭
- 迁移后收益很直观

目标：

- 删除 `syncStores`
- `runtime/overlay.ts` 拆成
  - `overlay/state.ts`
  - `overlay/selectors.ts`
  - `overlay/index.ts`

## 3. 再观察是否有第二批受益模块

例如后续如果出现下面这些场景，就应该优先复用 projection primitive：

- 一份 runtime summary 投影成多路 UI store
- 一份 selection summary 投影成 keyed visibility / patch store
- 一份 host state 投影成多个 UI selector

---

## 不建议做的事

## 1. 不建议继续增强 `createDerivedStore` 直到无所不能

这会让 `derived` 既做依赖收集，又做调度，又做 keyed 投影，最后语义会变得过重。

## 2. 不建议删掉 overlay 总状态，只保留 selector stores

这样做虽然能让 `syncStores` 消失，但会失去：

- 单一 source of truth
- 统一 reset
- 统一调试快照
- 明确的 overlay 写入边界

长期会更差。

## 3. 不建议在业务层继续直接堆更多 `raf/staged` 组合

否则复杂度只会继续留在 runtime 自己身上。

---

## 最终结论

一句话总结：

```text
overlay 里的 syncStores 不是因为 store 太慢
而是因为当前 store 系统缺少“单源投影 + 可调度 + keyed 投影”这一层原语
```

长期最优方案是：

1. 在 `@whiteboard/engine` 新增
   - `createProjectedStore`
   - `createProjectedKeyedStore`
2. 把 overlay 收敛成
   - `overlay state`
   - `overlay selectors`
3. 让 `staged / raf` 退回到底层实现细节

这样做的收益是：

- 消灭手写 `syncStores`
- store 分层更完整
- overlay 边界更干净
- 未来类似 runtime 不再重复造投影总线
