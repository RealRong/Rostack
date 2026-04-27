# dataview-core：`spec + plain object` 最终 API 设计与实施方案

## 1. 目标形态

`dataview-core` 最终只围绕一个核心展开：

- 一份 **plain object `DataDoc`**
- 一份 **唯一写核心 `operations`**
- 两组 **纯领域算法 `field` / `view`**

长期最优目标：

- 外部传入 `DataDoc` 可直接持有
- `document.normalize` 是固定规范化能力
- 所有写入都收口到 `operations.compile / operations.apply / operations.spec`
- `field` 只负责字段语义
- `view` 只负责视图语义，并吸收 `filter / sort / search / group / calculation`
- 删除平行顶级入口、删除 reader facade、删除 command/query 中转层、删除 contracts 命名层

最终 public surface 只保留：

```ts
import {
  document,
  operations,
  field,
  view
} from '@dataview/core'

import type * as t from '@dataview/core/types'
```

---

## 2. 最终 public API

## 2.1 根入口

```ts
export {
  document,
  operations,
  field,
  view
} from '@dataview/core'
```

只保留：

- `@dataview/core`
- `@dataview/core/types`
- `@dataview/core/document`
- `@dataview/core/operations`
- `@dataview/core/field`
- `@dataview/core/view`

不再保留：

- `@dataview/core/contracts`
- `@dataview/core/mutation`
- `@dataview/core/operation`
- `@dataview/core/command`
- `@dataview/core/query`
- `@dataview/core/read/*`
- `@dataview/core/filter`
- `@dataview/core/sort`
- `@dataview/core/search`
- `@dataview/core/group`
- `@dataview/core/calculation`
- `@dataview/core/id`

---

## 2.2 `types`

`contracts` 全部改名为 `types`。

原因：

- 这些不是 runtime contract 层
- 它们本质上就是 dataview 的领域类型
- `contracts` 这个名字只会制造中间语义层

最终：

```ts
import type {
  DataDoc,
  DataRecord,
  Field,
  View,
  Intent,
  Operation,
  CommitImpact
} from '@dataview/core/types'
```

### 类型文件建议

```txt
src/types/
  index.ts
  state.ts
  intents.ts
  operations.ts
  commit.ts
  presentation.ts
```

说明：

- `contracts/state.ts` → `types/state.ts`
- `contracts/intents.ts` → `types/intents.ts`
- `contracts/operations.ts` → `types/operations.ts`
- `contracts/commit.ts` → `types/commit.ts`
- `contracts/presentation.ts` 若仍需对外则保留在 `types`
- `card/gallery/kanban/viewOptions` 这些不再独立作为顶级 public 文件，直接并回 `types/state.ts` 或 `types/presentation.ts`

原则：

- 类型按领域聚合，不按 UI 配置文件名碎裂
- 不再有 `contracts/index.ts` 这种汇总中转层

---

## 2.3 `document`

最终 `document` 只保留 document 级能力：

```ts
export const document = {
  create,
  normalize,
  clone
}
```

### 约束

- 删除 `document.fields.*`
- 删除 `document.records.*`
- 删除 `document.views.*`
- 删除 `document.values.*`
- 删除 `document.table.*`

原始读取统一改成 plain object 直读：

- `doc.records.byId[id]`
- `doc.records.order`
- `doc.fields.byId[id]`
- `doc.views.byId[id]`
- `doc.activeViewId`
- `record.title`
- `record.values[fieldId]`

### 仍然值得保留的 document 级能力

- `create()`：创建规范空文档
- `normalize(doc)`：固定规范化
- `clone(doc)`：深拷贝

### 不再属于 `document` 的能力

- 记录字段批量写入：收口到 `operations`
- active view 解析：收口到 `view.active`
- 自定义 field 增删改：收口到 `operations`
- view put/remove/open：收口到 `operations`
- value 读取：收口到 `field.value.read(record, fieldId)` 或直接 plain object
- entity table 读写：直接使用 `@shared/core.entityTable`，删除本地 `document/table.ts`

---

## 2.4 `operations`

`operations` 是 dataview 唯一正式写核心。

```ts
export const operations = {
  definitions,
  spec,
  apply,
  compile,
  key: {
    serialize,
    conflicts
  },
  issue: {
    create,
    hasErrors
  },
  trace: {
    create,
    finalize,
    summary,
    has,
    record,
    value,
    field,
    view
  },
  plan: {
    recordCreate
  }
}
```

### 替换关系

- `@dataview/core/mutation/spec` → `operations.spec` / `operations.apply`
- `@dataview/core/mutation/compile/*` → `operations.compile`
- `@dataview/core/operation/definition` → `operations.definitions`
- `@dataview/core/mutation/key` → `operations.key`
- `@dataview/core/mutation/issues` → `operations.issue`
- `@dataview/core/mutation/trace` + `commit/*` → `operations.trace`
- `@dataview/core/command/createRecord` → `operations.plan.recordCreate`

### 目录建议

```txt
src/operations/
  index.ts
  definitions.ts
  spec.ts
  apply.ts
  compile.ts
  key.ts
  issue.ts
  trace.ts
  plan.ts
  internal/
    draft.ts
    compile-scope.ts
    field.ts
    record.ts
    view.ts
```

### 明确删除

- `src/mutation/`
- `src/operation/`
- `src/command/`
- `src/commit/`

说明：

- `mutation` 和 `operation` 是同一条写链路的人为拆分
- `commit` 不是独立公共域，它本质是 operation apply 的 impact / trace
- `command/createRecord.ts` 不是独立子系统，只是一个写规划函数

---

## 2.5 `field`

`field` 保留为独立纯领域模块。

```ts
export const field = {
  id,
  kind,
  schema,
  value,
  compare,
  search,
  group,
  display,
  draft,
  behavior,
  option,
  date,
  status,
  spec
}
```

### 保留理由

字段语义本身是稳定独立核心：

- kind / option / status / date
- value parse / compare / display / search
- group domain / bucket compare

这些不是 view 中转层，也不是 mutation 中转层。

### 需要清理的点

- `field` 内部对 `document.values` 的依赖删除
- `field.value.read(record, fieldId)` 直接读取 `record.title / record.values`
- `field/schema`、`field/options`、`field/kind` 仍可按纯算法分文件，但不额外长出 public facade

---

## 2.6 `view`

`view` 保留，但吸收所有视图查询与分组排序搜索能力。

最终：

```ts
export const view = {
  active,
  name,
  duplicate,
  demand,
  display,
  order,
  options,
  layout,
  repair,
  filter,
  sort,
  search,
  group,
  calc
}
```

### 具体收口

#### `view.active`

```ts
view.active.resolveId(doc, preferredId?)
view.active.get(doc, preferredId?)
```

替换：

- `document.views.activeId.*`
- `document.views.active.*`

#### `view.filter`

吸收当前 `filter/*` 与 `query/filterCandidate.ts`：

```ts
view.filter.state.*
view.filter.rule.*
view.filter.rules.*
view.filter.plan.candidateLookup(rule, field)
view.filter.write.*
```

删除：

- `src/filter/` 顶级 public 面
- `src/query/`

#### `view.sort`

```ts
view.sort.rule.*
view.sort.rules.*
view.sort.compare.records
view.sort.write.*
```

删除顶级 `src/sort/` public 面。

#### `view.search`

```ts
view.search.state.*
view.search.tokens.*
view.search.text.*
view.search.match.record
```

删除顶级 `src/search/` public 面。

#### `view.group`

```ts
view.group.state.*
view.group.value.write(...)
```

删除顶级 `src/group/` public 面。

#### `view.calc`

吸收当前 `calculation/*`：

```ts
view.calc.normalize(view.calc, ctx)
view.calc.metric.*
view.calc.demand.*
view.calc.reducer.*
view.calc.entry.*
view.calc.state.*
```

删除顶级 `src/calculation/` public 面。

### 保留为 `view` 顶层的能力

- `name`
- `duplicate`
- `demand`
- `display`
- `order`
- `options`
- `layout`
- `repair`

这些本来就是视图本体算法。

---

## 2.7 `id`

`src/id.ts` 不应继续保留为 dataview-core public 面。

原因：

- `createId` 是 shared 基础设施
- dataview-core 不该拥有自己的 ID facade
- ID 策略属于 engine / runtime 组合层，不属于文档模型或纯算法核心

最终：

- 删除 `@dataview/core/id`
- engine 直接使用 `@shared/core.createId`
- 如果仍需要 `record / field / view / filterRule / sortRule` 前缀映射，放到 engine/runtime 层，不放在 core public API

---

## 2.8 `read`

`read/reader.ts` 删除 public 身份。

原因：

- 它本质是 runtime facade，不是领域核心
- `DocumentReader` 把 plain object 又包成一层 OO reader，违反 `plain object` 方向
- compile / engine / projection 都可以直接基于 `doc`，最多保留内部 `createReadContext(doc)`，但不再 public export

最终：

- 删除 `@dataview/core/read/*`
- engine 不再 re-export `createDocumentReader`
- engine 直接读 `doc`，或消费 internal read context

---

## 2.9 `shared/`

`src/shared/` 这个目录名应删除。

原因：

- 仓库已经有真正的 `shared/*`
- `dataview-core/src/shared` 只是包内工具，不该再叫 `shared`

最终处理：

- 能内联就内联
- 不能内联的改到：
  - `field/value.ts`
  - `field/option.ts`
  - `view/searchTokens.ts`
  - 或 `utils/*`

目标是删掉：

- `src/shared/index.ts`
- `src/shared/option.ts`
- `src/shared/searchTokens.ts`
- `src/shared/value.ts`

---

## 3. 要删除的顶级 public 面

全部删除：

- `./command`
- `./contracts`
- `./contracts/*`
- `./id`
- `./mutation`
- `./mutation/*`
- `./query`
- `./query/*`
- `./read/*`
- `./filter`
- `./group`
- `./search`
- `./sort`
- `./calculation`

最终 exports 只保留：

- `.`
- `./types`
- `./document`
- `./operations`
- `./field`
- `./view`

---

## 4. 要删除或合并的目录

## 4.1 直接删除目录

- `src/contracts/` → 改名为 `src/types/`
- `src/mutation/` → 并入 `src/operations/`
- `src/operation/` → 并入 `src/operations/`
- `src/command/`
- `src/query/`
- `src/read/`
- `src/commit/`
- `src/shared/`

## 4.2 目录功能并回

- `src/filter/` → `src/view/filter.ts` 或 `src/view/filter/*`
- `src/sort/` → `src/view/sort.ts` 或 `src/view/sort/*`
- `src/search/` → `src/view/search.ts` 或 `src/view/search/*`
- `src/group/` → `src/view/group.ts` 或 `src/view/group/*`
- `src/calculation/` → `src/view/calc.ts` 或 `src/view/calc/*`

## 4.3 直接删除文件

- `src/id.ts`
- `src/document/table.ts`
- `src/query/filterCandidate.ts`
- `src/command/createRecord.ts`
- `src/read/reader.ts`

---

## 5. 最终目录形态

```txt
src/
  index.ts
  types/
    index.ts
    state.ts
    intents.ts
    operations.ts
    commit.ts
    presentation.ts
  document/
    index.ts
    create.ts
    normalize.ts
  operations/
    index.ts
    definitions.ts
    spec.ts
    apply.ts
    compile.ts
    key.ts
    issue.ts
    trace.ts
    plan.ts
    internal/
      draft.ts
      compile-scope.ts
      fields.ts
      records.ts
      views.ts
  field/
    index.ts
    spec.ts
    schema.ts
    option.ts
    value.ts
    kind/
      index.ts
      date.ts
      status.ts
      spec.ts
  view/
    index.ts
    active.ts
    naming.ts
    duplicate.ts
    demand.ts
    display.ts
    order.ts
    options.ts
    layout.ts
    repair.ts
    filter.ts
    sort.ts
    search.ts
    group.ts
    calc.ts
```

说明：

- 不是追求文件最少
- 而是删除“平行概念层”和“薄 facade 层”
- 只保留稳定领域块

---

## 6. dataview-engine 迁移要求

这次重构完成后，engine 需要同步调整：

### 6.1 reader

当前依赖：

- `dataview/packages/dataview-engine/src/document/reader.ts`
- `dataview/packages/dataview-engine/src/active/api/context.ts`
- `dataview/packages/dataview-engine/src/active/index/runtime.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/*`

最终改为：

- 直接读 `doc`
- 或使用 internal `createReadContext(doc)`，但不再走 `@dataview/core/read/reader`

### 6.2 record create command

当前依赖：

- `dataview/packages/dataview-engine/src/active/api/records.ts`

最终改为：

- `buildRecordCreateIntents` 删除
- engine 改走 `operations.plan.recordCreate(...)`

### 6.3 id

当前依赖：

- `dataview/packages/dataview-engine/src/active/api/records.ts`

最终改为：

- 直接使用 `@shared/core.createId`
- prefix 策略在 engine 层自行决定

---

## 7. 实施顺序

## Phase 1：先固定最终 public surface

- 新增 `src/index.ts`
- 新增 `src/types/`
- 新增 `src/operations/`
- 修改 `package.json` exports
- 定住最终根 API：`document / operations / field / view / types`

完成标准：

- 新代码不再依赖 `contracts / mutation / operation / command / query / read`
- 根入口成为正式公共入口

## Phase 2：先收口写核心

- `operation/definition.ts` → `operations/definitions.ts`
- `mutation/spec.ts` → `operations/spec.ts` + `operations/apply.ts`
- `mutation/compile/*` → `operations/compile.ts` + internal helpers
- `mutation/key.ts` → `operations/key.ts`
- `mutation/issues.ts` → `operations/issue.ts`
- `mutation/trace.ts` + `commit/*` → `operations/trace.ts`
- `command/createRecord.ts` → `operations/plan.ts`

完成标准：

- `operations` 成为唯一写入口
- 删除 `src/mutation/`
- 删除 `src/operation/`
- 删除 `src/command/`
- 删除 `src/commit/`

## Phase 3：收口 view 子域

- `filter/*` 并到 `view.filter`
- `sort/*` 并到 `view.sort`
- `search/*` 并到 `view.search`
- `group/*` 并到 `view.group`
- `calculation/*` 并到 `view.calc`
- `query/filterCandidate.ts` 并到 `view.filter.plan`

完成标准：

- 顶级 `filter / sort / search / group / calculation / query` 全删
- `view` 成为唯一视图算法域

## Phase 4：清理 document

- 新增 `document.create`
- `document` 只保留 `create / normalize / clone`
- 删除 `document.fields / schema / records / values / views / table` public facade
- `document/table.ts` 删除，统一直用 `@shared/core.entityTable`

完成标准：

- `document` 不再承担 entity facade 身份
- core 内部明显减少 `document.*` 读写包装

## Phase 5：清理 types / read / id / shared

- `contracts` → `types`
- `read/reader.ts` 删除 public 身份
- `id.ts` 删除
- `shared/` 工具内联或迁到准确域模块

完成标准：

- `contracts` 命名层消失
- `read` facade 消失
- `id` facade 消失
- `shared` 目录名消失

---

## 8. 完成标准

全部完成后，`dataview-core` 应满足：

- `DataDoc` 是 plain object，可直接持有
- `document.normalize` 是固定能力
- `operations` 是唯一 spec/apply/compile/write 核心
- `field` 是唯一字段语义核心
- `view` 是唯一视图语义核心，并吸收 filter/sort/search/group/calculation
- 不再存在 `contracts / mutation / operation / command / query / read / commit / shared`
- 不再存在多套平行入口
- 上层只需要围绕一个核心来组合：`document + operations + field + view`
