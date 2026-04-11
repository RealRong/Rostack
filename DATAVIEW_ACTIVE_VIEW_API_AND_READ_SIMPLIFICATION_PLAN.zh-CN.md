# Dataview Active View API 与 Read 能力收口方案

## 1. 目标

这份文档回答三个问题：

1. 现在 React/UI 侧大量出现的 `const view = engine.view(currentView.view.id)` 是否还有存在必要。
2. `dataview/src/engine/facade/view/index.ts`、`dataview/src/engine/facade/view/commands.ts` 里大量 `readXxx`、`resolveXxx`、`withXxx` helper，是否说明底层读取能力不够。
3. 如果继续按长期最优收口，engine API、read API、view facade 还应该怎么重排。

本文只给最终方案，不涉及兼容层设计。


## 2. 结论摘要

我的结论是：

- `engine.view(currentView.view.id)` 在当前产品形态下已经过于啰嗦，默认路径不应该再要求 UI 反复回传 active view id。
- 这不是单纯的调用写法问题，而是 engine 的 public API 还没有把“当前只有一个 active view”这个运行时事实提升成一等公民。
- “active view projection read” 应该明确从 `project` 收回，不再作为 `project` 名义暴露。
- 但收回后的最终 public 形态不应该停在 `engine.read.active.*`，而应该继续提升为顶层 `engine.active.*`。
- `facade/view/index.ts`、`facade/view/commands.ts` 里 helper 偏多，确实说明底层 read/write 能力还不够成体系。
- 但问题不在于“缺更多零散的 `readXxx` 函数”，而在于缺一份纯 `ActiveViewState` 快照，以及一层独立的 `ActiveViewReadApi`。
- 同时底层写能力也还差一层：现在 `view.cells` 仍然要自己区分 title field 和 normal field，说明缺一个统一的 `record field write` API。
- 当前 `Engine` 顶层 API 也确实太多了，而且最常用的 active 反而埋得最深，主次关系是反的。

一句话总结：

- active 应该成为 engine 的一等公民和默认主入口。
- active projection read 的所有权先从 `project` 收回到 active read runtime。
- 然后 public API 再把它直接提升成 `engine.active`，而不是继续埋在 `engine.read.active`。
- `state` 只应该表示快照，不应该再混入 getter。
- 对内 facade 应该依赖 `ActiveViewState + ActiveViewReadApi`，而不是继续堆 `readCurrentXxx` / `withXxx` helper。
- `ActiveViewState` 不需要把每个属性继续 store 化；订阅粒度问题应该通过 `engine.active.select(...)` 解决，而不是继续把 public API 打碎。
- `view.cells` 应该只负责把 cell 定位到 record-field，再委托给底层统一写入能力。


## 3. 当前问题到底在哪里

## 3.1 UI 每次把 active view id 传回 engine，本质上是在重复表达已知状态

现在大量调用是这种形态：

```ts
const view = engine.view(currentView.view.id)
view.items.move(...)
view.cells.set(...)
view.display.move(...)
```

问题不在于这一行代码多写了几个字，而在于：

- 当前 UI 调用方已经持有 `currentView`
- engine 自己也有 active view 状态
- project runtime 也只维护 active view 的 projection

也就是说，engine 和 UI 都知道“当前正在操作的是哪一个 view”，但 public service API 仍要求调用方再把 id 传回去一次。

这会带来几个结构问题：

- UI 被迫把“active view 的身份”手动串到每个操作点。
- `engine.view(id)` 看似通用，实际上今天绝大多数调用都不是“任意 view by id”，而只是“当前 active view”。
- `createEngine.ts` 里 `engine.view` 每次调用都会重新创建一个 `ViewEngineApi` facade，这在语义上也不够直接。

所以这里真正缺的不是局部变量 `const view = ...`，而是缺一个 active view 专用入口。


## 3.2 当前 read 层是“碎片足够”，但“组合不够”

今天 engine 已经有不少原子读能力：

- `engine.read.document`
- `engine.read.activeView`
- `engine.read.view`
- `engine.project.group`
- `engine.project.sections`
- `engine.project.appearances`
- `engine.project.fields`

这些原子读能力本身并不算少。

真正的问题是：

- facade 每次要做一个 view 操作时，仍然要自己把这些碎片拼起来。

例如现在 `facade/view/index.ts` 里有：

- `readCurrentView`
- `readCurrentProjection`
- `readGroupWriteContext`
- `readVisibleFieldIds`
- `resolveInsertBeforeId`

`facade/view/commands.ts` 里又有：

- `withCurrentView`
- `withField`
- `withFilterRuleField`
- `withGroupField`

这说明当前缺的不是更多单点读取函数，而是缺一个统一的、面向 view 领域的读取上下文。


## 3.3 helper 爆炸的根因不是实现懒，而是缺少一等的 ViewState

今天 facade 内部的逻辑大致都在重复做三件事：

1. 先确认当前 view 存在，且和传入 `viewId` 一致。
2. 再把 active projection 拼成一份运行态上下文。
3. 然后在这份上下文上做一些局部派生：
   - 找 group field
   - 找 filter 对应 field
   - 把 `CellRef` 解析成 `recordId + fieldId`
   - 读取 section 内 record order

这类逻辑如果一直留在 facade 文件里，就一定会继续长出更多：

- `readXxx`
- `resolveXxx`
- `withXxx`
- `createXxxContext`

这不是编码风格问题，而是缺一个稳定的 view runtime state object。


## 3.4 底层写能力也还不够统一

当前 `view.cells` 虽然已经从 `items` 里拆出来了，但实现上仍然要自己区分：

- title field 走 `record.patch`
- custom field 走 `value.set` / `value.clear`

这说明底层现在只有：

- `records.setValue`
- `records.clearValue`

但没有一个真正统一的：

- `record field write`

也就是说，底层可以写“custom field value”，但不能统一写“任意 field，包括 title”。

所以今天 `view.cells` 虽然位置对了，但还没完全收干净。


## 4. 最终目标结构

## 4.1 顶层 Public Engine API：active 必须是一等公民

长期最优我建议直接重排顶层 `Engine` API。

今天的问题不是只有 `view(id)` 啰嗦，而是整个顶层分组主次不对：

- `active` 是产品主路径，但没有独立顶层入口
- `project` 本质是 active projection，却被放成了一个独立大类
- `read`、`project`、`view` 三层同时存在，读写职责不够直观
- `action` 这种偏底层 escape hatch 却占据顶层高频名字

所以最终不应该只是把：

- `engine.view(id)` 改成 `engine.view`

而应该进一步改成：

- `engine.active`

也就是说，active 不只是“一个 view service”，而是 engine 顶层最核心的对象。

建议最终顶层形态直接收成：

```ts
interface Engine {
  active: ActiveEngineApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  document: EngineDocumentApi
  history: EngineHistoryApi
  perf: EnginePerfApi
  read: EngineReadApi
}
```

这里的排序也是有含义的：

- `active` 放第一位，明确它是默认交互入口
- `views / fields / records` 是领域 service
- `document / history / perf` 是系统 service
- `read` 放最后，作为底层订阅/快照能力，而不是默认业务入口

如果还要继续压缩顶层数量，我建议第一个被降级的不是 `active`，而是：

- `action`
- `project`
- callable `view`

这三个都不应该继续保留在最终 public 顶层。

## 4.2 `engine.active`：默认业务入口

```ts
engine.active
engine.views
engine.read
```

其中：

### `engine.active`

语义：

- 当前 active view 的完整 service + state API
- 不再需要传 `viewId`
- 不再只是“某个 view 的 facade”，而是 engine 顶层第一入口
- 对 UI 来说，它同时提供：
  - 少数高频显式 store
  - 完整快照
  - 细粒度 selector 订阅
  - 同步派生读取
  - 写入 service

调用形态：

```ts
engine.active.items.move(...)
engine.active.cells.set(...)
engine.active.display.move(...)
engine.active.group.toggleCollapse(...)
engine.active.state.get()
engine.active.select(state => state?.group)
```

这应该成为 UI 侧默认用法。


### `engine.views`

语义：

- view collection 管理
- 非 active 场景下的显式 by-id 访问

建议形态：

```ts
engine.views.list()
engine.views.get(viewId)
engine.views.create(...)
engine.views.rename(viewId, ...)
engine.views.duplicate(viewId)
engine.views.remove(viewId)
engine.views.open(viewId)
engine.views.api(viewId)
```

这里的 `engine.views.api(viewId)` 用来承接少数真正需要“显式指定 view”的场景。

也就是说，长期结构不应该是：

- `engine.view(viewId)`
- `engine.read.active.*`

而应该是：

- `engine.active` 负责 active view 的服务与状态
- `engine.views.api(viewId)` 负责显式 by-id
- `engine.read` 只保留底层原子读取，不承载 active 主路径

这样语义更直接。


## 4.3 Active Read 所有权：先从 `project` 收回，再提升到 `active`

当前 `engine.project.*` 本质上全是 active view projection，但命名叫 `project`，语义并不聚焦。

这件事我建议分成两层理解：

### 第一层：内部所有权

active projection read 明确从：

- `project`

收回到：

- active read runtime

也就是说，在内部设计上，它不再属于“project API”。

### 第二层：public 暴露

收回之后，不建议最终停在：

```ts
engine.read.active
```

因为这仍然会把 active 埋在 `read` 下面。

长期对外建议直接提升为：

```ts
engine.active.id
engine.active.view
engine.active.state
engine.active.read
engine.active.select
```

其中最核心的是：

```ts
engine.active.state
```

它返回一份纯 `ActiveViewState` 快照。

而一切派生读取能力统一挂在：

```ts
engine.active.read
```


## 4.4 `ActiveViewState` 应该是什么

这份对象应该是纯状态快照，不带 getter，不带读取服务能力。

它只负责回答：

- 当前 active view 的运行态数据是什么

而不负责回答：

- 如何从这份状态里推导出某个 field / record / section 结果

建议至少包含：

```ts
interface ActiveViewState {
  view: View
  filter: ViewFilterProjection | undefined
  group: ViewGroupProjection | undefined
  search: ViewSearchProjection | undefined
  sort: ViewSortProjection | undefined
  sections: readonly Section[]
  appearances: AppearanceList
  fields: FieldList
}
```

这里的原则是：

- `state` 必须保持纯数据语义
- `state` 必须适合订阅、缓存、相等性判断和调试
- `state` 必须保持单一真相源
- 不应该为了 React 订阅粒度，把 `state` 的每个属性继续顶层 store 化
- facade 自己不再负责把 document/project/read 三套来源拼起来，但这件事应该由 `read api` 来做，不是塞进 `state`


## 4.5 `ActiveViewReadApi` 应该替代掉今天绝大多数 `readXxx / withXxx`

有了纯 `ActiveViewState` 之后，今天这些 helper 都可以明显收掉：

- `readCurrentView`
- `readCurrentProjection`
- `readGroupWriteContext`
- `withCurrentView`
- `withField`
- `withFilterRuleField`
- `withGroupField`

但这些能力不应该塞回 `state` 本身，而应该独立成：

```ts
interface ActiveViewReadApi {
  getRecord(recordId: RecordId): Row | undefined
  getField(fieldId: FieldId): Field | undefined
  getGroupField(): Field | undefined
  getFilterField(index: number): Field | undefined
  getRecordField(cell: CellRef): RecordFieldRef | undefined
  getSectionRecordIds(section: SectionKey): readonly RecordId[]
}
```

最终不是再造一堆新的 `resolveField` / `resolveGroup`，而是改成：

```ts
const state = engine.active.state.get()
if (!state) {
  return
}

const field = engine.active.read.getField(fieldId)
const groupField = engine.active.read.getGroupField()
const target = engine.active.read.getRecordField(cell)
const sectionRecordIds = engine.active.read.getSectionRecordIds(sectionKey)
```

这样边界会清楚很多：

- `state` 表示“当前是什么”
- `read` 表示“如何读取和派生”

这比 callback 式 `withXxx` 更平，也更接近业务语义。


## 4.6 `engine.active.select(...)` 才是 UI 主订阅入口

如果 public API 只有：

```ts
engine.active.state
```

然后 UI 大量直接订阅整份 state，那么确实会导致订阅过宽，带来不必要的重渲染。

但这不代表应该把下面这些全部继续做成顶层 store：

- `active.filter`
- `active.group`
- `active.search`
- `active.sort`
- `active.sections`
- `active.appearances`
- `active.fields`

因为这样会重新把 public API 打散，回到“碎片很多、组合很差”的状态。

长期最优我建议引入：

```ts
engine.active.select(selector, isEqual?)
```

语义：

- 从单一 `ActiveViewState` 中做细粒度订阅
- 通过 selector 控制订阅范围
- 通过 `isEqual` 控制变更比较

建议形态：

```ts
interface ActiveSelectApi {
  <T>(
    selector: (state: ActiveViewState | undefined) => T,
    isEqual?: Equality<T>
  ): ReadStore<T>
}
```

使用方式：

```ts
engine.active.select(state => state?.group)
engine.active.select(state => state?.sections, sameValue)
engine.active.select(state => state?.fields.get(fieldId))
```

这样结构才平衡：

- `state` 统一
- `select` 切片订阅
- `read` 做同步派生读取

而不是：

- 只有一个大 state store

或者：

- 每个属性都拆成单独 public store


## 4.7 哪些字段需要保留显式 store

虽然我不建议把每个属性都继续 store 化，但我认为可以保留少数高频且语义稳定的显式入口：

- `engine.active.id`
- `engine.active.view`
- `engine.active.state`

这三个保留的理由很简单：

- 高频
- 稳定
- 语义直接

除此之外，其他 active 运行态字段默认不再继续顶层展开，而是统一走：

- `engine.active.select(...)`
- `engine.active.read`

这比继续增加：

- `active.sections`
- `active.appearances`
- `active.fields`
- `active.group`

这类顶层字段更收敛。


## 4.8 `EngineReadApi` 本身也要收窄

既然 active 要成为一等公民，那么 `read` 就不应该继续承载“默认业务读取入口”。

长期我建议把 `EngineReadApi` 收成两类：

### 保留在 `read` 的

- document 级原子读取
- record / field / view by-id 原子读取
- 面向订阅系统的通用 store 能力

例如：

```ts
engine.read.document
engine.read.record
engine.read.customField
engine.read.view
```

### 从 `read` 中拿走的

- 一切 active projection 组合读取
- 一切 UI 主路径高频读取

这些都应该转移到：

```ts
engine.active
```

这样 `read` 才会回到“低层原子读能力”的位置，而不是和 `active` 抢主入口。


## 4.9 底层写 API：补上统一的 record-field write

如果继续只保留：

- `records.setValue`
- `records.clearValue`

那么 `view.cells` 永远都要自己知道 title field 是特殊字段。

长期更合理的是底层直接提供统一写入：

```ts
engine.records.fields.set(recordId, fieldId, value)
engine.records.fields.clear(recordId, fieldId)
```

或者更短一点：

```ts
engine.records.field.set(recordId, fieldId, value)
engine.records.field.clear(recordId, fieldId)
```

这个 API 的含义是：

- field 可以是 title
- 也可以是 custom field
- 调用方不关心最后落成 `record.patch` 还是 `value.set`

这样之后：

- `view.cells` 只负责 `CellRef -> RecordFieldRef`
- 真正的字段写入语义统一收在 `records.field`

这才是完整收口。


## 5. 对现有文件结构的最终重排建议

## 5.1 `engine/api/public/engine.ts`

最终目标：

- `engine.active` 成为顶层默认入口
- `engine.views` 承担 collection 管理和 `api(viewId)` 访问
- `engine.project` 从 public 顶层移除
- `engine.view` callable accessor 从 public 顶层移除
- `engine.action` 从默认 public 顶层移除或降级为低层入口

建议方向：

```ts
interface Engine {
  active: ActiveEngineApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  document: EngineDocumentApi
  history: EngineHistoryApi
  perf: EnginePerfApi
  read: EngineReadApi
}
```

`ViewsEngineApi` 再补：

```ts
open(viewId: ViewId): void
api(viewId: ViewId): ViewEngineApi
```

### `ActiveEngineApi` 建议形态

```ts
interface ActiveEngineApi extends ViewEngineApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveViewReadApi
}
```

这样 active 的“服务”和“状态”被放在同一个顶层对象里，不会再出现：

- service 走 `engine.view`
- projection 走 `engine.project`
- state 又藏在 `engine.read.active`

这种三头分裂。

同时也避免了另一种新的混乱：

- `ActiveViewState` 既像数据，又像带行为的 context

也就是说：

- `ActiveEngineApi` 可以既有 service，也有 read 能力
- 但 `ActiveViewState` 自身必须保持纯数据
- `ActiveEngineApi` 还应该有 `select`，承接 UI 的细粒度订阅


### `action` 怎么处理

我不建议继续把：

```ts
engine.action(...)
```

放在最终顶层默认 public surface。

原因：

- 它是低层 escape hatch
- 它不是产品主路径
- 它会把顶层 API 重心拉回“底层 mutation”而不是“领域 service”

长期更合适的处理有两个方向：

1. 直接内部化，不再作为默认 public API。
2. 如果必须保留，降到低层命名空间，例如：

```ts
engine.raw.action(...)
```

这里我更偏向第一种。


## 5.2 `engine/api/public/project.ts`

这里应该直接明确：

- `project` 不应该继续作为 public API 存在。

因为今天这个接口名和真实语义已经不一致了。

它暴露的不是 project 全域数据，而是 active view projection。

长期更建议把“active view projection read”从 `project` 收回 active read runtime。

原因：

- 现在这一层不是在读“project 全域状态”
- 而是在读“当前 active view 的派生运行态”

也就是说，今天的：

- `project.filter`
- `project.group`
- `project.search`
- `project.sort`
- `project.sections`
- `project.appearances`
- `project.fields`

最终更适合成为：

- `active.state`
- `active.select(...)`
- `active.read`

如果要保留“内部 read runtime”这一层，那么它也只应该是内部结构，例如：

- `read.active`

但对外 public API，我不建议继续暴露这层中间路径。


## 5.3 `engine/facade/view/index.ts`

这个文件当前同时承担了三种职责：

- active view 上下文读取
- item/cell/order runtime 编排
- field / group / section 的局部派生计算

长期应该拆成更清楚的两层：

### 第一层：读取与派生

例如：

- `facade/view/state.ts`

职责：

- 产出 `ActiveViewState`
- 产出 `ActiveViewReadApi`
- 封装 `getRecordField`、`getSectionRecordIds`、`getGroupField` 这些读派生

### 第二层：service 编排

例如：

- `facade/view/index.ts`

职责：

- 基于 `state` 做 `items / cells / order / table`
- 不再自己拼 read context

最终 `index.ts` 里不应该再看到很多：

- `readCurrent...`
- `resolve...`
- `create...Context`

而应该主要是：

- 读 state
- 下 action
- 组装少量业务流程


## 5.4 `engine/facade/view/commands.ts`

这个文件今天的 `withCurrentView`、`withField`、`withFilterRuleField`、`withGroupField` 也应该收掉。

长期更合理的是：

- 先拿到一份 `ViewPatchState`
- 再直接在 state 上读需要的数据

建议方向：

```ts
const state = readViewPatchState(viewId)
if (!state) {
  return
}

const field = readViewPatchField(state, fieldId)
const filterField = readViewPatchFilterField(state, index)
const groupField = readViewPatchGroupField(state)
```

也就是说：

- `commands.ts` 应该依赖 state object
- 不应该自己再维持一套 callback 风格的 mini read framework


## 6. 最终 API 形态示例

下面是我认为最符合当前产品事实的最终 public 形态：

```ts
engine.active.id
engine.active.view
engine.active.state
engine.active.select(state => state?.group)

engine.active.items.move(ids, target)
engine.active.items.create({ section, title, values })
engine.active.items.remove(ids)

const state = engine.active.state.get()

engine.active.cells.set(cell, value)
engine.active.cells.clear(cell)

engine.active.display.move(fieldIds, beforeFieldId)
engine.active.group.toggleCollapse(sectionKey)
engine.active.table.setWidths(widths)

engine.views.open(viewId)
engine.views.api(viewId).display.move(...)
```

对应 read：

```ts
const state = engine.active.state.get()
if (!state) {
  return
}

engine.active.read.getRecordField(cell)
engine.active.read.getSectionRecordIds(sectionKey)
engine.active.read.getGroupField()
```

对应底层写：

```ts
engine.records.field.set(recordId, fieldId, value)
engine.records.field.clear(recordId, fieldId)
```


## 7. 取舍说明

## 7.1 为什么不建议继续把 `engine.view(id)` 作为默认主入口

因为这会让 public API 默认站在“任意 view by id”的抽象上。

但当前产品现实是：

- 交互只围绕 active view
- project runtime 也只产 active view projection
- UI 侧几乎所有写操作都发生在 active view

既然如此，public API 的默认主入口就应该对齐这个事实。

更进一步说，连 `engine.view` 这个名字本身都不够强。

因为它只是强调“这是一个 view API”，没有强调：

- 它是当前 active view
- 它是整个 engine 的主入口

所以长期我更建议直接改成：

- `engine.active`


## 7.2 为什么不建议只是在 React 层加个 `useViewApi()` hook 了事

那只能减少 UI 重复写法，不能解决 engine 结构本身的问题。

如果 engine 里仍然是：

- `view(id)` by-id 为主
- facade 自己拼 active projection
- cells 自己分叉 title/value write

那本质复杂度并没有下降，只是被 hook 藏起来了。


## 7.3 为什么不建议继续加更多 `readXxx` helper

因为问题不是“某个读取点拿不到数据”，而是：

- 当前读取语义没有统一对象承载

继续加零散 helper，只会从：

- `readCurrentProjection`
- `readGroupWriteContext`

变成：

- `readCurrentCellTarget`
- `readCurrentSectionRecords`
- `readCurrentGroupField`

helper 会继续扩散，不会真正变平。


## 8. 分阶段实施顺序

这里的“分阶段”只是实施顺序，不代表保留长期兼容。

每一阶段完成后，旧入口就应该直接删掉。

### 阶段 1：顶层 API 收口为 `engine.active`

目标：

- `engine.active` 成为顶层 active service + state
- `engine.active.read` 成为顶层 active read 入口
- `engine.views.open(viewId)`、`engine.views.api(viewId)` 补齐
- `engine.project`、callable `engine.view` 从 public 顶层删掉
- UI 默认全部改走 `engine.active`

结果：

- 全部 `engine.view(currentView.view.id)` 消失
- `engine.read.active.*` 不再作为 public 主路径出现
- active 相关订阅统一收口到 `engine.active.state` 和 `engine.active.select(...)`


### 阶段 2：内部 active read runtime 成型

目标：

- 在内部建立组合好的 active read runtime
- 明确 active projection read 从 `project` 收回
- facade 不再自己拼 `activeView + appearances + sections + group + fields`

结果：

- `readCurrentProjection` 这类 helper 大幅消失
- 对外统一暴露为 `engine.active.state + engine.active.read + engine.active.select(...)`


### 阶段 3：`view/commands.ts` 改为 state-based

目标：

- 删掉 `withCurrentView` / `withField` / `withGroupField`
- 改成先读 `ViewPatchState`，再直接读取需要的 field/group/filter context

结果：

- callback 风格 helper 消失
- patch 逻辑更平


### 阶段 4：底层补 `records.field`

目标：

- 增加统一的 record-field write API
- `view.cells` 不再分叉 title / value

结果：

- `view.cells` 彻底变成轻量定位层


## 9. 最终判断

如果只给一句判断：

- 是的，`const view = engine.view(currentView.view.id)` 已经没必要继续作为默认写法。
- 是的，`active view projection read` 应该明确从 `project` 收回，不再以 `project` 的名义长期存在。
- 是的，`engine.read.active.state` 作为内部结构可以存在，但作为 public 主路径太深了，active 必须被提升成顶层一等公民。
- 是的，`ActiveViewState` 不应该同时既是数据快照又带 getter；`state` 和 `read` 应该拆开。
- 是的，`ActiveViewState` 也不应该因为担心重渲染就把每个属性继续 store 化；订阅粒度应该由 `engine.active.select(...)` 负责。
- 是的，`facade/view` 里 today 的大量 `readXxx / resolveXxx / withXxx`，说明底层 read/write 能力还没有形成完整的 view state 与 field write 抽象。

长期最优不是继续局部内联几个 helper，而是做四件事：

1. 把 active 明确提升为顶层 `engine.active`。
2. 把 active projection read 从 `project` 收回到 active read runtime。
3. 把 active view 的快照、订阅、读取服务拆成 `ActiveViewState + ActiveSelectApi + ActiveViewReadApi`。
4. 把 record-field 写入下沉成统一底层 API。

做到这四件事之后，view facade 才会真正从“自己拼上下文的编排层”，收成“直接面向 active state / select / read 和领域 service 的薄层 API”。
