# Whiteboard Shared Convergence

## 目标

这份文档只定义一件事：`whiteboard` 内哪些底层模型和基础设施应该被复用、下沉、保留或暂缓提取，从而把重复函数和相似抽象收敛到最少。

目标不是清理零散 helper，而是统一底层 contract：

- `shared/core` 负责领域无关、纯数据、纯调度、纯 store、纯结构变更。
- `shared/dom` 负责浏览器环境能力：输入、观察、焦点、可编辑、测量、滚动。
- `whiteboard/*` 只保留白板文档模型、图结构语义、写入语义、协作语义与布局语义。

---

## 分层 Contract

### `@shared/core`

只放可跨业务复用的纯模型，不知道什么是 node、edge、mindmap、document。

目标命名空间：

- `equal`
- `json`
- `path`
- `record`
- `collection`
- `order`
- `selection`
- `store`
- `scheduler`

进入这里的前提：

- 不依赖 whiteboard 类型。
- 不依赖 DOM。
- 不依赖 operation / reducer / history / collab 语义。
- 至少是稳定的底层模型，而不是某个局部 feature 的流程胶水。

### `@shared/dom`

只放浏览器运行时基础设施。

目标命名空间：

- `input`
- `geometry`
- `observe`
- `editable`
- `focus`
- `selection`
- `interactive`
- `scroll`
- `autoPan`

进入这里的前提：

- 明确依赖 DOM / 浏览器 API。
- 不携带 whiteboard 语义。

### `@whiteboard/core`

只放白板领域模型与白板专用底层运行时。

保留内容：

- document / node / edge / group / mindmap / canvas 语义。
- operation spec / history spec / shared-op spec。
- reducer transaction / reconcile / overlay / inverse-op 语义。
- 白板领域 query、duplicate、slice、schema。

### `@whiteboard/engine` `@whiteboard/editor` `@whiteboard/react` `@whiteboard/history` `@whiteboard/collab`

这些包应只做组合与消费，不应继续发明新的通用底层模型。

---

## 应直接复用 Shared 现有基础设施

这些能力 `shared` 已经有，whiteboard 应停止局部再造。

### `@shared/core/store`

直接作为统一 store 底座：

- `createValueStore`
- `createReadStore`
- `createKeyedStore`
- `createKeyedReadStore`
- `createDerivedStore`
- `createKeyedDerivedStore`
- `createProjectedStore`
- `createProjectedKeyedStore`
- `createStagedValueStore`
- `createStagedKeyedStore`
- `createRafValueStore`
- `createRafKeyedStore`
- `read`
- `peek`
- `batch`
- `joinUnsubscribes`

收敛要求：

- editor session state 不再自己包一层“半通用 state helper”。
- engine / history / collab 的读模型继续统一建在 shared store 上。

### `@shared/core/equal`

直接复用：

- `sameValue`
- `sameOrder`
- `sameIdOrder`
- `sameMap`
- `sameShallowRecord`
- `samePoint`
- `sameRect`
- `sameBox`
- `sameJsonValue`

收敛要求：

- whiteboard 不再保留另一套通用 deep equal。
- UI 模板比较不再用裸 `JSON.stringify(...) === JSON.stringify(...)`。

### `@shared/core/json`

直接复用：

- `isPlainObject`
- `stableStringify`
- `hasOwn`
- `hasPatchChanges`

收敛要求：

- 所有稳定序列化 key、结构值比较、对象自有字段判断，都优先从这里取。

### `@shared/core/collection`

直接复用：

- `presentValues`
- `unique`
- `uniqueBy`
- `createOrderedAccess`
- `createOrderedKeyedCollection`

### `@shared/core/order`

直接复用：

- `normalizeExistingIds`
- `applyPreferredOrder`
- `moveItem`
- `moveBlock`

### `@shared/core/selection`

直接复用：

- `createAnchorFocusPair`
- `orderedRange`
- `stepOrderedValue`

### `@shared/core/scheduler`

直接复用：

- `createRafTask`
- `createTimeoutTask`

### `@shared/dom`

直接复用：

- `input.readClientPoint`
- `input.readModifierKeys`
- pointer capture helpers
- `createPointerSession`
- `geometry.normalizeRect`
- `geometry.rectFromPoints`
- `geometry.containsPoint`
- `geometry.intersects`
- `geometry.idsInRect`
- `observe.observeElementSize`
- editable / focus / selection / scroll / auto-pan 相关 helper

---

## 应下沉到 `@shared/core` 的通用模型

这些能力现在在 whiteboard 内，但本质不是白板语义。

### 1. `json`

应把 whiteboard 里的通用值操作并入 shared 的 `json` 命名空间。

当前重复点：

- `whiteboard/packages/whiteboard-core/src/value/index.ts`
- `shared/core/src/json.ts`
- `shared/core/src/equality.ts`

长期最优 API：

```ts
import { json } from '@shared/core'

json.clone(value)
json.merge(base, override)
json.equal(left, right)
json.stableStringify(value)
json.isPlainObject(value)
json.hasOwn(record, key)
```

收敛原则：

- 只保留一套通用 deep clone / merge / equal。
- whiteboard 只保留领域对象的复制函数，比如 `duplicateNode`、`sliceDocument`，不再保留通用 JSON 值库。

### 2. `path`

应把 dotted-path 读写能力下沉到 `@shared/core/path`。

当前来源：

- `whiteboard/packages/whiteboard-core/src/utils/objectPath.ts`

长期最优 API：

```ts
import { path } from '@shared/core'

path.get(value, 'a.b.c')
path.has(value, 'a.b.c')
path.set(target, 'a.b.c', next)
path.unset(target, 'a.b.c')
```

边界：

- 这里只负责路径访问与路径写入。
- 不负责 whiteboard op 语义。
- 不负责 inverse op。

### 3. `record`

应把 record/path mutation 的通用执行器下沉到 `@shared/core/record`。

当前来源：

- `whiteboard/packages/whiteboard-core/src/utils/recordMutation.ts`

长期最优 API：

```ts
import { record } from '@shared/core'

type Mutation =
  | { op: 'set'; path?: string; value: unknown }
  | { op: 'unset'; path: string }

record.apply(current, mutation)
record.isRecordLike(value)
```

边界：

- 这里只负责纯数据 record mutation。
- `node.record.set` / `edge.record.set` / `mindmap.topic.record.set` 仍然是 whiteboard semantic op。

### 4. `collection.uniform`

`readUniformValue` 不是 editor 专属能力，应下沉为通用集合读取 helper。

当前来源：

- `whiteboard/packages/whiteboard-editor/src/query/utils.ts`

长期最优 API：

```ts
import { collection } from '@shared/core'

collection.uniform(items, read)
collection.uniform(items, read, equal)
```

### 5. `store.createNormalizedValue`

`createCommandState` 本质是“带 normalize 与 equality guard 的值 store”，不是 editor 领域模型。

当前来源：

- `whiteboard/packages/whiteboard-editor/src/session/store.ts`

长期最优 API：

```ts
import { store } from '@shared/core'

store.createNormalizedValue({
  initial,
  normalize,
  isEqual
})
```

边界：

- 这是 store 基础设施。
- 不是 command state。
- 不应该继续以 editor/session 私有 helper 形式存在。

---

## 应继续留在 Whiteboard 的底层模型

这些看起来像“基础设施”，但实际上已经带有白板语义，不应下沉。

### 1. Document / Canvas / Graph 语义

继续留在 `@whiteboard/core`：

- document query
- canvas item order
- node owner / canvas role
- top-level node 规则
- mindmap root / topic / branch 规则
- node / edge / group / mindmap duplicate 与 slice

原因：

- 这些都已经掺入“什么算画布项”“mindmap root 是否参与 canvas”“topic 如何参与 read”之类的领域规则。

### 2. OverlayTable

继续留在 `@whiteboard/core`：

- `whiteboard/packages/whiteboard-core/src/kernel/overlay.ts`

原因：

- 它虽然是通用 copy-on-write 思路，但当前实现明显服务 reducer draft/document overlay。
- 它绑定的是 whiteboard 文档表语义，而不是通用 Map 抽象。

可以借鉴，但不应现在下沉。

### 3. Reducer / Reconcile 运行时

继续留在 `@whiteboard/core`：

- reducer tx
- reconcile queue
- inverse-op 生成
- semantic op apply
- dirty/change set

原因：

- 这些是白板写入中轴本身，不是通用 infra。

### 4. Operation / History / Shared-op Spec

继续留在 `@whiteboard/core`：

- operation spec
- inverse op spec
- history footprint / merge key
- shared op spec

原因：

- 这些完全依赖 whiteboard 语义 contract。

### 5. Engine Projection / Index Orchestration

继续留在 `@whiteboard/engine`：

- 读投影编排
- rect index 编排
- 文档到读模型的投影生命周期

原因：

- 这里不只是 store，而是 whiteboard engine read model 的组合策略。

### 6. Collab Conflict / Local History Policy

继续留在 `@whiteboard/collab` 与 `@whiteboard/history`：

- remote replay 如何进入 session
- local undo/redo 与 remote op 的关系
- collab-aware history 策略

原因：

- 这是产品语义，不是 shared infra。

---

## 不要误提取的东西

这些现在看起来也许能提，但长期最优不是“先抽再说”。

### 1. Projection Runtime 特化缓存

`whiteboard-engine/src/read/store/projection.ts` 目前比 `shared/core/store/projected.ts` 多一层“按订阅 key 追踪 materialization”的语义。

结论：

- 先不要直接下沉。
- 只有出现第二个真正需要同类行为的消费者，才考虑扩成 `shared/core/store` 的新 primitive。

### 2. Spatial Bucket / Rect Index

`nodeRect` / `edgeRect` 一类索引现在仍然偏 whiteboard read model。

结论：

- 暂不下沉。
- 真正可提取的只可能是更底层的 bucket-grid primitive，而不是现有索引模块整体。

### 3. Text Metrics Resource

文本测量缓存和布局资源目前主要服务 whiteboard editor/react。

结论：

- 暂留 whiteboard。
- 只有第二个业务需要同类文本测量资源时，再考虑放到 `shared/dom`。

### 4. `clonePoint` 之类零散微 helper

不要为了消灭几处 `{ x, y }` 复制就立刻新增一个 shared util。

结论：

- 先优先消除“通用值系统”的重复。
- 点、矩形这类复制如果最终仍需要统一，应并入明确的 geometry/value 模块，而不是继续增加散 helper。

---

## 明确的收敛动作

下面这些动作是应直接执行的，不需要再做一轮设计。

### A. Whiteboard 直接改为复用 Shared

- 模板值比较统一改用 `equal.sameJsonValue` 或 `json.stableStringify`。
- `readUniformValue` 从 editor 挪到 shared collection。
- `createCommandState` 收敛成 shared store primitive。
- 各处结构值比较统一走 shared `json/equal`。

### B. Whiteboard 通用值模型下沉到 Shared

- `cloneValue` 下沉并统一到 `json.clone`。
- `mergeValue` 下沉并统一到 `json.merge`。
- `isValueEqual` 下沉并统一到 `json.equal` 或 `equal.sameJsonValue`。
- `objectPath` 下沉到 `path`。
- `recordMutation` 下沉到 `record`。

### C. Whiteboard 继续保留领域层包装

- `node.record.set`
- `edge.record.set`
- `mindmap.topic.record.set`
- `schema` 默认值注入与字段读取
- reducer inverse-op 采样

这些都不应跟 shared 的通用 path/record primitive 混在一起。

---

## 目标 API

长期最优的导入方式应尽量稳定、短、少导出面。

### `@shared/core`

```ts
import {
  collection,
  equal,
  json,
  order,
  path,
  record,
  scheduler,
  selection,
  store
} from '@shared/core'
```

### `@shared/dom`

```ts
import {
  autoPan,
  editable,
  focus,
  geometry,
  input,
  interactive,
  observe,
  scroll,
  selection
} from '@shared/dom'
```

### `@whiteboard/core`

继续只暴露白板语义模块，不再承载通用数据 helper。

---

## 分阶段实施方案

### 阶段 1

先只做“复用已有 shared”与“禁止新增重复实现”：

- editor / react / engine 中所有通用比较、通用 uniform 读取、通用稳定序列化，改为 shared。
- 新增 lint / review 规则：禁止新增 whiteboard 私有通用 deep-equal、deep-clone、path helper。

### 阶段 2

再做通用模型下沉：

- 下沉 `value/index.ts` 到 shared `json`。
- 下沉 `objectPath.ts` 到 shared `path`。
- 下沉 `recordMutation.ts` 到 shared `record`。
- 收敛 `createCommandState` 到 shared `store.createNormalizedValue`。

### 阶段 3

清理 whiteboard 内历史遗留入口：

- 删除 whiteboard 对旧通用 helper 的导出。
- 删除 whiteboard 内对通用 helper 的重复封装。
- 所有调用点改成 namespace import。

### 阶段 4

最后才评估“是否存在第二消费者”：

- projection tracked cache
- spatial bucket primitive
- text metrics resource

只有满足二次复用，再考虑继续下沉。

---

## 禁止事项

- 不把 reducer / reconcile / inverse-op 下沉到 shared。
- 不把 document / mindmap / topic / canvas 规则下沉到 shared。
- 不为了几处点复制新增更多零散 helper。
- 不把 feature 级流程胶水伪装成 shared/core 基础设施。
- 不在 engine / editor / react 中继续出现新的“局部通用模型”。

---

## 最终判断

这轮深度收敛最值得做的，不是再拆更多 helper，而是把 whiteboard 里仍然残留的三类通用模型彻底归位：

- 通用值模型：`json`
- 通用路径模型：`path`
- 通用 record mutation 模型：`record`

其余像 reducer、overlay、operation、history、collab、projection orchestration，虽然也像“基础设施”，但本质已经是 whiteboard 中轴，不应继续下沉。
