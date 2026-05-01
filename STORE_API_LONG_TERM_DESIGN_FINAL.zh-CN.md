# Shared Store API 长期最终设计

## 背景

`shared/core/src/store` 当前的主要问题不是单点实现错误，而是公共 API 心智不稳定：

- 同时存在 `createXxxStore` 长命名、`value/keyed/family/object` 短命名、`store` 聚合对象三套入口。
- 最短、最像主入口的 `store.value` / `store.keyed`，实际却只是 readonly adapter，不是主状态构造器。
- `family` 这个最重要的领域词，被一个只读包装对象占掉了，真正的 `createFamilyStore` 反而躲在长命名里。
- `object` 与 `createStructStore` 职责重叠，但类型更弱、行为更隐式。
- 一部分上层模块绕过公共入口，直接 import `shared/core/src/store/*` 内部实现，导致边界继续分叉。

这套 API 的长期最优目标不应该是“全部改短”或“全部保留长名”，而应该是：

1. 公共心智统一。
2. 最短名字留给最核心抽象。
3. 可写状态、只读派生、外部订阅包装之间边界清楚。
4. 上层只需要学习少量稳定入口。
5. `shared/core` 内部实现可以继续分层，但不把实现层术语直接暴露给业务代码。

本文给出不考虑兼容的最终方案。

## 核心设计原则

### 1. 统一入口

公共 API 只保留 `store` namespace。

不再鼓励也不再提供：

- `store/index.ts` 顶层 direct named export 作为第二套公共入口
- `createXxxStore` 直接成为上层主调用方式

最终上层应该统一写成：

```ts
import { store } from '@shared/core'
```

然后全部通过：

```ts
store.value(...)
store.keyed(...)
store.family(...)
store.projected(...)
store.combine(...)
store.read(...)
```

来构造和消费 store。

### 2. 最短名字留给主抽象

最自然的名字必须留给主心智模型：

- `value` 表示单值 store
- `keyed` 表示按 key 访问的 store
- `family` 表示 `ids + byId + write` 的实体族 store

因此：

- `store.value` 不能再表示 readonly adapter
- `store.keyed` 不能再表示 keyed readonly adapter
- `store.family` 不能再表示只读 `{ ids, byId }` wrapper

### 3. 参考 Jotai，但不机械照抄

Jotai 的优点不是名字短，而是：

- 一个统一构造器
- 根据输入形态推导 store 能力

这套思路适合当前代码库，但必须适配你现有的三类实际场景：

1. 本地可写状态
2. 内部依赖跟踪的只读派生
3. 外部 source 的 getter + subscribe 包装

因此最终 `store.value` 和 `store.keyed` 都应该支持重载分发，而不是只支持一种风格。

### 4. 公共 API 抽象导向，内部实现保持显式分层

公共 API 可以统一成少数构造器，但内部实现不需要把所有逻辑揉成一个大函数。

内部仍然可以保留：

- `createValueStore`
- `createReadStore`
- `createDerivedStore`
- `createKeyedStore`
- `createKeyedReadStore`
- `createKeyedDerivedStore`

但这些属于实现层构件，不再是业务代码的默认入口。

## 最终公共 API

### 总览

最终公共 API 建议收敛为：

```ts
store.read(source)
store.peek(source)
store.batch(fn)
store.join(unsubscribes)

store.value(...)
store.keyed(...)
store.family(...)

store.projected(...)
store.projectedKeyed(...)
store.combine(...)
```

如果未来需要，也可以补充：

```ts
store.keyedCombine(...)
```

但不应先暴露。

### `store.value`

`store.value` 是单值 store 的统一主入口。

应支持三种形态：

#### 1. 可写 value store

```ts
const count = store.value(0)
const state = store.value({ a: 1, b: 2 }, { isEqual })
```

返回：

```ts
ValueStore<T>
```

语义：

- 内部持有当前值
- 支持 `get/subscribe/set/update`

这是对当前 `createValueStore` 的公共重命名和上提。

#### 2. 依赖跟踪的 readonly derived store

```ts
const total = store.value(() => (
  store.read(left) + store.read(right)
))
```

返回：

```ts
ReadStore<T>
```

语义：

- 内部依赖跟踪
- 对应当前 `createDerivedStore`
- `get` 函数内部必须通过 `store.read(...)` 访问依赖

这是最接近 Jotai `atom(get => ...)` 的形态。

#### 3. 外部 source 包装成 readonly store

```ts
const snapshot = store.value({
  get: () => runtime.snapshot(),
  subscribe: runtime.commits.subscribe,
  isEqual
})
```

返回：

```ts
ReadStore<T>
```

语义：

- 不做内部依赖跟踪
- 由外部 `subscribe` 驱动变更
- 对应当前 `createReadStore`

这是你当前工程里 runtime snapshot、projection source、UI view adapter 这类场景必须保留的能力。

### `store.keyed`

`store.keyed` 是 keyed store 的统一主入口。

应支持三种形态：

#### 1. 可写 keyed store

```ts
const cells = store.keyed<CellId, boolean>({
  emptyValue: false
})
```

返回：

```ts
KeyedStore<Key, T>
```

语义：

- 对应当前 `createKeyedStore`
- 支持 `get/subscribe/set/delete/patch/clear/all`

#### 2. 依赖跟踪的 keyed readonly derived store

```ts
const selected = store.keyed<ItemId, boolean>((id) => (
  store.read(selectionStore).has(id)
))
```

或：

```ts
const selected = store.keyed<ItemId, boolean>({
  get: (id) => store.read(selectionStore).has(id),
  keyOf: (id) => id
})
```

返回：

```ts
KeyedReadStore<Key, T>
```

语义：

- 对应当前 `createKeyedDerivedStore`
- 允许内部依赖跟踪
- 支持 `keyOf`

#### 3. 外部 source 包装成 keyed readonly store

```ts
const values = store.keyed<RecordId, Value | undefined>({
  get: (id) => readCurrent(id),
  subscribe: (id, listener) => subscribeCurrent(id, listener),
  isEqual
})
```

返回：

```ts
KeyedReadStore<Key, T>
```

语义：

- 对应当前 `createKeyedReadStore`
- 由外部 keyed subscribe 驱动

### `store.family`

`store.family` 只表示真正的 family store。

```ts
const records = store.family<RecordId, Record>({
  initial,
  isEqual
})
```

返回：

```ts
FamilyStore<Key, Value>
```

语义必须稳定为：

- `ids: ReadStore<readonly Key[]>`
- `byId: TableStore<Key, Value>`
- `read.family()`
- `read.get(key)`
- `write.replace(...)`
- `write.apply(...)`
- `write.clear()`
- `project.field(...)`

注意：

- `family` 这个名字只给这类真正的 family 状态容器
- 不再允许 `store.family(spec)` 返回只读 `{ ids, byId }`

### `store.projected`

`store.projected` 保留显式名称，不并入 `store.value`。

原因：

- 它表达的是“基于 source 的选择与调度策略”
- 不只是一个普通 derived
- `schedule: 'sync' | 'microtask' | 'frame'` 是它独有的行为边界

因此公共 API 应保留：

```ts
store.projected({
  source,
  select,
  isEqual,
  schedule
})
```

### `store.projectedKeyed`

与 `store.projected` 相同，保留显式名称。

这是 keyed map projection，不应为了统一感而硬塞进 `keyed` 的 overload。

### `store.combine`

`store.combine` 用来表达 struct/object 组合 store。

```ts
const view = store.combine({
  fields: {
    active: {
      get: () => store.read(activeStore)
    },
    total: {
      get: () => store.read(totalStore)
    }
  }
})
```

对应当前 `createStructStore`。

之所以不叫 `object`，原因有三点：

1. `object` 过宽泛，容易与 plain object 混淆。
2. 当前 `object` 实现递归读 object/store，语义太魔法。
3. `combine` 更准确表达“由多个字段组合成新的 readonly 视图”。

### `store.read`

`store.read` 保持为 derived/compute 内部读取依赖的标准方式。

这是整个系统依赖跟踪的显式语义，不应该重命名。

### `store.peek`

`store.peek` 保持为无依赖跟踪读取。

### `store.batch`

`store.batch` 保持原语地位。

### `store.join`

`store.join` 作为公共工具函数保留，对应当前 `joinUnsubscribes`。

公共 API 不需要暴露内部术语 `joinUnsubscribes`，`join` 足够清楚。

## 不应再暴露的公共 API

以下能力可以保留在实现层，但不应继续作为长期公共 API：

- `createReadStore`
- `createKeyedReadStore`
- `createValueStore`
- `createDerivedStore`
- `createKeyedStore`
- `createKeyedDerivedStore`
- `createStructStore`
- `createStructKeyedStore`
- `createTableStore`
- `createFamilyStore`
- `joinUnsubscribes`
- `createNormalizedValue`

原因不是这些实现没价值，而是：

- 它们暴露了内部实现切分，而不是公共抽象
- 它们迫使上层先学实现术语，再学业务建模
- 长期会让 API 又回到“十几个工厂并列”的状态

## 需要删除的旧设计

### 1. 删除 `store/index.ts` 顶部 direct exports 作为公共形态

当前这种：

```ts
export {
  batch,
  createDerivedStore,
  ...
}
```

不应再作为公共 API 存在。

理由：

- 它制造了 `@shared/core.store` 之外的第二套导出心智
- 仓库上层主要也不是这么用的
- 这会让迁移后仍然有人继续 import 长命名

### 2. 删除当前版本的 `store.value`

当前 `store.value({ get, subscribe })` 不是 value store，而是 readable adapter。

这是最误导的一点，必须重写，不保留旧语义。

### 3. 删除当前版本的 `store.keyed`

当前 `store.keyed({ get, subscribe })` 不是 keyed store，而是 keyed readable adapter。

也必须重写，不保留旧语义。

### 4. 删除当前版本的 `store.family`

当前 `store.family` 返回只读 `{ ids, byId }` wrapper。

这个名字必须回归真正的 `FamilyStore`。

### 5. 删除 `store.object`

`store.object` 应直接废弃。

理由：

- 0 实际使用
- 返回类型退化为 `unknown`
- 递归读取语义不透明
- 与 `createStructStore` / 未来 `store.combine` 重叠

### 6. 删除 `createNormalizedValue`

当前仓库中没有实际使用。

长期上不建议把 normalize 语义藏在 value store 构造器里。应在领域层显式 normalize 后再写入 `store.value(...)`。

## 公共与内部边界

### 公共层

只允许业务层通过：

```ts
import { store } from '@shared/core'
```

访问 store API。

### 内部层

`shared/core/src/store/*` 下面的模块属于实现层。

这些模块允许被：

- `shared/core` 自身
- 极少数明确标注为底层基础设施的包

访问，但不再默认向上层暴露。

### 禁止事项

业务代码不应继续出现：

```ts
import { createValueStore } from '../../core/src/store/value'
import { createFamilyStore } from '../../core/src/store/familyStore'
```

这类 import。

如果必须访问内部实现，要么说明边界设计错了，要么需要新增稳定公共 API。

## TypeScript 签名建议

下面给出建议性的公共类型形态。

### `store.value`

```ts
function value<T>(
  initial: T,
  options?: {
    isEqual?: Equality<T>
  }
): ValueStore<T>

function value<T>(
  get: () => T,
  options?: {
    isEqual?: Equality<T>
  }
): ReadStore<T>

function value<T>(
  spec: {
    get: () => T
    subscribe: (listener: () => void) => () => void
    isEqual?: Equality<T>
  }
): ReadStore<T>
```

分发规则：

- 如果第一个参数是函数，走 derived
- 如果第一个参数是对象且包含 `get` 且包含 `subscribe`，走 readable adapter
- 其他情况走 writable value store

注意：

- 这里不能简单用“对象”判断 readable，因为对象本身也可能是初始值
- 必须依靠 `get` / `subscribe` 结构判断

### `store.keyed`

```ts
function keyed<Key, T>(options: {
  emptyValue: T
  initial?: ReadonlyMap<Key, T>
  isEqual?: Equality<T>
}): KeyedStore<Key, T>

function keyed<Key, T>(
  get: (key: Key) => T,
  options?: {
    isEqual?: Equality<T>
    keyOf?: (key: Key) => unknown
  }
): KeyedReadStore<Key, T>

function keyed<Key, T>(spec: {
  get: (key: Key) => T
  subscribe: (key: Key, listener: () => void) => () => void
  isEqual?: Equality<T>
}): KeyedReadStore<Key, T>
```

分发规则：

- 如果第一个参数是函数，走 keyed derived
- 如果第一个参数是对象且包含 `get` / `subscribe`，走 keyed readable adapter
- 如果第一个参数是对象且包含 `emptyValue` 或 `initial` 这类 writable 形态字段，走 keyed writable

### `store.family`

```ts
function family<Key, Value>(options?: {
  initial?: StoreFamily<Key, Value>
  isEqual?: Equality<Value>
}): FamilyStore<Key, Value>
```

### `store.combine`

```ts
function combine<TStruct extends Record<string, unknown>>(options: {
  fields: {
    [K in keyof TStruct]: {
      get: () => TStruct[K]
      isEqual?: Equality<TStruct[K]>
    }
  }
}): ReadStore<TStruct>
```

## 实现层映射

公共 API 到内部实现建议保持如下映射：

- `store.value(initial)` -> `createValueStore`
- `store.value(() => ...)` -> `createDerivedStore`
- `store.value({ get, subscribe })` -> `createReadStore`
- `store.keyed(writableSpec)` -> `createKeyedStore`
- `store.keyed((key) => ...)` -> `createKeyedDerivedStore`
- `store.keyed({ get, subscribe })` -> `createKeyedReadStore`
- `store.family(...)` -> `createFamilyStore`
- `store.projected(...)` -> `createProjectedStore`
- `store.projectedKeyed(...)` -> `createProjectedKeyedStore`
- `store.combine(...)` -> `createStructStore`
- `store.join(...)` -> `joinUnsubscribes`

这保证：

- 公共 API 简洁
- 内部实现仍然清晰可维护
- 不会为了外部优雅破坏内部边界

## 重构与迁移方案

本方案明确以“不做兼容”为前提。

### 阶段 1：先重写 `shared/core/src/store/index.ts`

第一步不是全仓替换，而是先把最终公共 API 固化。

`index.ts` 应只负责：

1. 组装 `store` namespace
2. 提供 overload
3. 分发到内部实现
4. 导出稳定类型

不再承担：

1. 直出大量 `createXxxStore`
2. 保留旧 `value/keyed/family/object`

### 阶段 2：全仓按语义硬迁移

按下列映射替换业务代码。

#### 可写 value

```ts
store.createValueStore(x)
```

改为：

```ts
store.value(x)
```

#### derived

```ts
store.createDerivedStore({ get, isEqual })
```

改为：

```ts
store.value(get, { isEqual })
```

#### readable adapter

```ts
store.value({ get, subscribe, isEqual })
```

保留写法，但语义变为新的统一主入口分支：

```ts
store.value({ get, subscribe, isEqual })
```

这里是少数不需要改调用外形，但需要改底层实现语义的地方。

#### writable keyed

```ts
store.createKeyedStore({ emptyValue, initial, isEqual })
```

改为：

```ts
store.keyed({ emptyValue, initial, isEqual })
```

#### keyed derived

```ts
store.createKeyedDerivedStore({ get, isEqual, keyOf })
```

改为：

```ts
store.keyed(get, { isEqual, keyOf })
```

或：

```ts
store.keyed({
  get,
  keyOf,
  isEqual
})
```

但长期建议统一为函数第一参数形态，减少对象样板。

#### keyed readable adapter

```ts
store.createKeyedReadStore({ get, subscribe, isEqual })
```

改为：

```ts
store.keyed({ get, subscribe, isEqual })
```

#### family

```ts
store.createFamilyStore({ initial, isEqual })
```

改为：

```ts
store.family({ initial, isEqual })
```

#### struct combine

```ts
store.createStructStore({ fields })
```

改为：

```ts
store.combine({ fields })
```

#### join

```ts
store.joinUnsubscribes(unsubscribes)
```

改为：

```ts
store.join(unsubscribes)
```

### 阶段 3：删掉死出口和多余 helper

迁移完成后，直接删除公共出口中的：

- `createNormalizedValue`
- `object`
- 旧 `family`
- 旧 `value`
- 旧 `keyed`
- 所有 `createXxxStore` 公共导出

### 阶段 4：清理内部直连 import

检查并改掉所有类似：

```ts
import { createValueStore } from '../../core/src/store/value'
```

的用法。

处理原则：

- 普通业务层全部改为 `@shared/core -> store`
- 如果确实是基础设施层需要内部原语，则单独审查并标注为内部依赖

### 阶段 5：统一测试心智

公共测试应优先测试公共 API：

- `store.value`
- `store.keyed`
- `store.family`
- `store.projected`

内部实现测试仍可保留，但要明确它们是在测内部模块，而不是公共 API。

## 为什么这套方案是长期最优

### 1. 它把 API 从实现导向改成抽象导向

调用者不再需要先理解：

- `createReadStore`
- `createDerivedStore`
- `createValueStore`

之间的技术区别，才能开始建模。

调用者只需要先理解：

- 我要一个 `value`
- 我要一个 `keyed`
- 我要一个 `family`

然后再让入参决定它的能力类型。

### 2. 它保留了你系统里真正存在的三类 store 来源

不是所有 readonly store 都是同一种来源。

这套设计同时承认并吸收：

- 本地状态
- 内部派生
- 外部订阅包装

因此不会为了追求“像 Jotai”而牺牲当前工程的真实需求。

### 3. 它避免把最短名字浪费在 adapter 上

当前最大的问题恰恰是：

- `value` 不代表 value state
- `keyed` 不代表 keyed state
- `family` 不代表 family state

这会持续误导所有后续调用点。

新方案把命名占位纠正回来了。

### 4. 它允许内部继续演化

未来即使：

- derived 依赖追踪实现变了
- projected 调度实现变了
- keyed writable 内部从 `Map` 换成别的结构

公共 API 仍然可以不动。

### 5. 它和现有仓库方向兼容

从现有使用面看：

- 业务侧大量使用 `createValueStore` / `createDerivedStore` / `createKeyedStore`
- 少数新代码已经在尝试 `store.value`

因此最合理的长期方向不是退回更长命名，而是把 `store.value` 真正扶正成统一主入口。

## 最终结论

长期最优设计应当是：

1. 只保留 `store` namespace 作为公共入口。
2. 采用 Jotai 式统一构造心智，但适配当前系统的三类来源。
3. `store.value` 与 `store.keyed` 成为真正的主入口。
4. `store.family` 回归真正的 family store。
5. `store.combine` 替代当前无类型优势的 `object`。
6. `projected` / `projectedKeyed` 保持显式能力名。
7. 所有 `createXxxStore` 下沉为实现层，不再作为长期公共 API。
8. 迁移时直接硬切，不做兼容层。

最终公共 API 的核心形态应稳定为：

```ts
store.read(...)
store.peek(...)
store.batch(...)
store.join(...)

store.value(...)
store.keyed(...)
store.family(...)

store.projected(...)
store.projectedKeyed(...)
store.combine(...)
```

这是最符合当前仓库演进方向、也最接近长期可维护状态的方案。
