# Dataview SPEC + PLAIN OBJECT + 字符串配置长期最优审计与最终方案

## 1. 结论

`dataview` 这条线同样可以继续显著简化，而且它不是 whiteboard 之外的例外，而是对 shared 长期模型的第二个强验证样本。

这轮审计覆盖了：

1. `dataview-core`
2. `dataview-engine`
3. `dataview-runtime`
4. `dataview-react`
5. `dataview-meta`

审计结果非常明确：

1. `dataview-engine` 在 projection 方向上已经接近终态。
2. `dataview-core` 在 field kind / filter / view meta 上已经形成了大量“事实上的 spec table”。
3. `dataview-runtime` 和 `dataview-react` 仍保留一批旧式中间层：
   - `Path[]`
   - `switch(kind)`
   - `getXxxSpec(...)`
   - `createXxxSpec(...)`
   - `store.createTableStore(...)`
   - `table.project.field(...)`
4. `dataview` 大量继续使用 `EntityTable<{ byId, order }>`，这直接证明 `shared/core/entityTable` 的 `order -> ids` 收敛不是 whiteboard 专属诉求，而是整个 shared 生态必须统一完成的长期工作。

最终判断只有一个：

`dataview` 必须与 `shared`、`whiteboard` 一起收敛到同一套长期模型：

1. 公共配置层统一为 plain object spec
2. 公共键统一为字符串 key / 字符串 grammar
3. kind/type 领域统一为 literal spec table + compile once
4. 公共有序实体族统一为 `ids + byId`
5. runtime 只消费编译结果与行为函数

---

## 2. 审计重点与 shared 接缝

本轮重点检查的是 `dataview` 与 `shared` 的高耦合接缝：

1. `@shared/projection`
2. `@shared/delta`
3. `@shared/core/entityTable`
4. `@shared/core/store`
5. `@shared/mutation`
6. `@shared/react`

关键文件：

- `dataview/packages/dataview-engine/src/active/projection/spec.ts`
- `dataview/packages/dataview-engine/src/active/index/projection.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/document.ts`
- `dataview/packages/dataview-engine/src/contracts/delta.ts`
- `dataview/packages/dataview-engine/src/active/publish/activeDelta.ts`
- `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`
- `dataview/packages/dataview-core/src/operations/key.ts`
- `dataview/packages/dataview-core/src/operations/spec.ts`
- `dataview/packages/dataview-core/src/field/kind/spec.ts`
- `dataview/packages/dataview-core/src/field/spec.ts`
- `dataview/packages/dataview-core/src/view/filterSpec.ts`
- `dataview/packages/dataview-core/src/document/fields.ts`
- `dataview/packages/dataview-core/src/document/records.ts`
- `dataview/packages/dataview-core/src/document/views.ts`
- `dataview/packages/dataview-runtime/src/source/patch.ts`
- `dataview/packages/dataview-runtime/src/source/createActiveSource.ts`
- `dataview/packages/dataview-runtime/src/model/page/api.ts`
- `dataview/packages/dataview-runtime/src/session/page.ts`
- `dataview/packages/dataview-react/src/field/value/kinds/registry.tsx`
- `dataview/packages/dataview-react/src/page/features/createView/catalog.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/RootPanel.tsx`
- `dataview/packages/dataview-meta/src/view.tsx`

---

## 3. 已经接近终态的部分

## 3.1 `dataview-engine` projection 方向正确

文件：

- `dataview/packages/dataview-engine/src/active/projection/spec.ts`
- `dataview/packages/dataview-engine/src/active/index/projection.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/document.ts`

当前状态：

1. `activeProjectionSpec` 已经是 plain object projection spec。
2. `indexProjectionSpec` 已经是 plain object projection spec。
3. `documentProjectionSpec` 已经是 plain object projection spec。
4. `createProjectionRuntime(spec)` 的使用边界清晰。

结论：

`dataview-engine` 在 projection runtime 这层与 `whiteboard-editor-scene` 方向一致，属于长期模型的正确样板。

## 3.2 field kind 已经形成 literal table

文件：

- `dataview/packages/dataview-core/src/field/kind/spec.ts`

当前状态：

1. `kindSpecs` 已经是 `Record<CustomFieldKind, KindSpec>`。
2. 行为函数已经收束在叶子：
   - `create.default`
   - `schema.normalize`
   - `value.display`
   - `group.entries`
3. `CUSTOM_FIELD_KINDS` 也是字符串字面量集合。

结论：

field kind 这条线已经非常接近终态，剩下的问题主要是外围 helper 包装和 title 特判中间层。

## 3.3 filter 体系已经形成按 kind 分流的对象表

文件：

- `dataview/packages/dataview-core/src/view/filterSpec.ts`

当前状态：

1. `filterSpecsByKind` 已经是 `Record<Field['kind'], FilterSpec>`。
2. preset 已经是静态对象数组。
3. field kind 到 filter 语义的映射已经固定。

结论：

这一层的业务模型已经 spec 化，问题不在业务抽象本身，而在 `define/create/get` helper 层与编译层没有完全剥离。

## 3.4 view meta 已经是静态表

文件：

- `dataview/packages/dataview-meta/src/view.tsx`

当前状态：

1. `VIEW_ITEMS` 已经是静态 literal table。
2. `meta.view.get(type)` 的消费方式已经稳定。

结论：

view type 元数据方向是对的，但它还没有扩展成“单一 view type spec source of truth”。

---

## 4. 仍未到终态的部分

## 4.1 `EntityTable` 的 `order` 在 dataview 中广泛外溢

文件：

- `dataview/packages/dataview-core/src/types/state.ts`
- `dataview/packages/dataview-core/src/document/fields.ts`
- `dataview/packages/dataview-core/src/document/records.ts`
- `dataview/packages/dataview-core/src/document/views.ts`
- `dataview/packages/dataview-core/src/view/sortState.ts`
- `dataview/packages/dataview-runtime/src/session/page.ts`
- `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`

当前状态：

1. `DataDoc['records' | 'fields' | 'views']` 直接依赖 `EntityTable`。
2. 业务层大量直接读取 `.order`。
3. view/filter/sort/document/engine/runtime 多层都在使用同一个公共字段名。

问题：

1. 这会把 `order` 固化成 dataview 的公共语义。
2. 它与 `shared/projection`、`shared/core/store.family`、`whiteboard` 已经走向的 `ids + byId` 模型冲突。
3. dataview 自己已经在部分结构里使用 `ids`，现在整条线处于双词汇并存状态。

最终状态：

1. `EntityTable` 公共字段必须改为 `ids + byId`。
2. dataview 所有 document/view/filter/sort/runtime 读取点必须一并改完。
3. `order` 只允许作为局部算法变量存在，例如：
   - 局部排序 Map
   - 插入比较索引

## 4.2 `DataviewMutationKey` 不得继续暴露 `Path[]`

文件：

- `dataview/packages/dataview-core/src/operations/key.ts`

当前状态：

1. `DataviewMutationKey = Path`
2. `dataviewMutationKey.recordsOrder()` 等 helper 直接返回 `mutationPath.of(...)`
3. `serializeDataviewMutationKey()` 再把 `Path` 转字符串

问题：

1. 这把运行时内部结构 `Path[]` 暴露成了公共键语义。
2. helper 的主要职责只是拼一段路径，不是业务行为。
3. `serialize` 的存在本身说明最终公共语义其实就是字符串。

最终状态：

`DataviewMutationKey` 必须直接改成字符串 grammar：

```ts
type DataviewMutationKey =
  | 'records'
  | `records.${RecordId}`
  | `records.${RecordId}.values.${FieldId}`
  | 'fields'
  | `fields.${FieldId}`
  | `fields.${FieldId}.values.${RecordId}`
  | 'views'
  | `views.${ViewId}`
  | 'activeView'
  | `external.${string}`
```

规则：

1. 公共层不再暴露 `Path`。
2. `serializeDataviewMutationKey` 删除。
3. `dataviewMutationKey.recordsOrder()` 这类 helper 删除。
4. 如果底层仍需 `Path[]`，由 compiler/runtime 从字符串 grammar 转换。

## 4.3 dataview delta 仍是手写接口，不是 shared change schema

文件：

- `dataview/packages/dataview-engine/src/contracts/delta.ts`
- `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`
- `dataview/packages/dataview-engine/src/active/publish/activeDelta.ts`

当前状态：

1. `DocumentDelta` / `ActiveDelta` / `DataviewDelta` 仍是手写接口。
2. `projectDocumentDelta()` / `projectActiveDelta()` 手工拼对象。
3. 没有使用统一的 change schema vocabulary。

问题：

1. dataview 的增量协议没有与 `shared/delta` 的 schema 化方向对齐。
2. `reset / meta / view / query / matched / ordered / visible` 这些变化字段已经天然满足字符串 change schema 条件。
3. 这让 dataview 在 shared 层之外维护了第二套 change language。

最终状态：

dataview delta 必须显式声明 change spec：

```ts
export const documentChangeSpec = {
  reset: 'flag',
  meta: 'flag',
  records: 'ids',
  values: 'ids',
  fields: 'ids',
  schemaFields: 'ids',
  views: 'ids'
} as const

export const activeChangeSpec = {
  reset: 'flag',
  view: 'flag',
  query: 'flag',
  table: 'flag',
  gallery: 'flag',
  kanban: 'flag',
  records: {
    matched: 'flag',
    ordered: 'flag',
    visible: 'flag'
  },
  fields: 'ids',
  sections: 'ids',
  items: 'ids',
  summaries: 'ids'
} as const
```

然后统一由 shared delta runtime 处理：

1. create
2. merge
3. empty check
4. has check

## 4.4 `shared/core/store` 旧组合器在 dataview-runtime 中直接外露

文件：

- `dataview/packages/dataview-runtime/src/source/patch.ts`
- `dataview/packages/dataview-runtime/src/source/createActiveSource.ts`
- `dataview/packages/dataview-runtime/src/model/page/api.ts`
- `dataview/packages/dataview-runtime/src/model/card.ts`

当前状态：

1. `store.createTableStore(...)`
2. `table.project.field(...)`
3. 大量 `store.createDerivedStore(...)`
4. 大量 `store.createKeyedDerivedStore(...)`

问题：

1. runtime 组装语言仍是函数式组合器，不是 declarative object grammar。
2. `table.project.field(...)` 是 shared/core 旧式特例 DSL 的直接消费者。
3. page/card/source 模型没有形成统一的 object/family/value 词汇。

最终状态：

dataview runtime 必须全部改到统一声明语法：

1. `store.value(...)`
2. `store.family(...)`
3. `store.object(...)`

例如 `createItemSourceRuntime()` 最终不再写成：

```ts
const table = store.createTableStore<ItemId, ItemPlacement>()
const recordId = table.project.field(placement => placement?.recordId)
const sectionId = table.project.field(placement => placement?.sectionId)
const placement = table.project.field(placement => placement)
```

而是统一为：

```ts
const itemPlacement = store.family({
  ids: ...,
  byId: ...
})

const itemRead = store.object({
  record: {
    kind: 'family',
    read: itemId => itemPlacement.read(itemId)?.recordId
  },
  section: {
    kind: 'family',
    read: itemId => itemPlacement.read(itemId)?.sectionId
  },
  placement: {
    kind: 'family',
    read: itemId => itemPlacement.read(itemId)
  }
})
```

## 4.5 page/card/source view model 仍是命令式装配

文件：

- `dataview/packages/dataview-runtime/src/model/page/api.ts`
- `dataview/packages/dataview-runtime/src/model/card.ts`

当前状态：

1. `createPageModel()` 内部手工创建多个 derived store。
2. `createRecordCardPropertiesStore()` / `createItemCardContentStore()` 也是命令式拼接。
3. equality、字段依赖、组合边界都散落在实现代码里。

问题：

1. 这套写法能运行，但没有形成统一配置语言。
2. 页面模型是典型适合 `store.object(...)` 的区域，却仍停留在“一个函数里手工串 N 个 store”。

最终状态：

`PageModel`、`CardModel`、`ActiveSource` 这些读模型必须改为对象 spec：

```ts
const pageModelSpec = {
  header: {
    kind: 'object',
    fields: { ... }
  },
  toolbar: {
    kind: 'object',
    fields: { ... }
  },
  settings: {
    kind: 'object',
    fields: { ... }
  }
} as const
```

然后一次编译为 read runtime。

## 4.6 field kind 仍保留 helper 和 title 包装层

文件：

- `dataview/packages/dataview-core/src/field/kind/spec.ts`
- `dataview/packages/dataview-core/src/field/spec.ts`

当前状态：

1. `createKindSpec(input)` 只是 identity helper。
2. `getKindSpec(kind)` 再做一次包装访问。
3. `field/spec.ts` 又构造了 `ResolvedFieldSpec`、`titleFieldSpec`、`readFieldSpec()` 这一层缓存/转发层。

问题：

1. `createKindSpec` 没有长期价值。
2. `ResolvedFieldSpec` 复制了 `kindSpec` 的大量结构。
3. title 特判让 field 体系没有完全纳入统一 kind/type vocabulary。

最终状态：

1. 删除 `createKindSpec`。
2. `kindSpecs` 直接作为最终公共 literal table。
3. 引入显式 compiler：
   - `compileFieldKindSpec(kindSpecs)`
4. compiler 统一产出：
   - `specByKind`
   - `specByField`
   - `titleSpec`
   - `behaviorByKind`
   - `groupMetaByKind`
5. `field/spec.ts` 退出“再次包装一层 spec”的中间角色。

## 4.7 `filterSpec.ts` 仍依赖 helper 工厂链

文件：

- `dataview/packages/dataview-core/src/view/filterSpec.ts`

当前状态：

1. `defineFilterPreset(...)`
2. `createFilterSpec(...)`
3. `createSortedFilterSpec(...)`
4. `createOptionBucketFilterSpec(...)`
5. `getFilterSpec(field)`

问题：

1. 业务事实上已经是静态对象表，但装配层仍是 helper 工厂。
2. `getFilterSpec(field)` 是运行时分发层，不是配置层。

最终状态：

1. preset 直接写 literal table。
2. filter kind 直接写 literal table。
3. 由 compiler 一次性建立索引与默认规则逻辑。

最终写法必须长成：

```ts
export const FILTER_SPEC = {
  text: {
    presets: {
      contains: { operator: 'contains', valueMode: 'editable' },
      eq: { operator: 'eq', valueMode: 'editable' },
      exists_true: { operator: 'exists', valueMode: 'fixed', fixedValue: true }
    },
    editor: 'text',
    candidate: { ... },
    plan: { ... }
  },
  number: { ... },
  status: { ... }
} as const
```

`getFilterSpec()` 最终只能是 compiler/runtime 读索引的薄封装，不能再承担装配职责。

## 4.8 field value UI registry 仍在每次 lookup 时创建 spec 对象

文件：

- `dataview/packages/dataview-react/src/field/value/kinds/registry.tsx`
- `dataview/packages/dataview-react/src/field/value/kinds/text.tsx`
- `dataview/packages/dataview-react/src/field/value/kinds/status.tsx`

当前状态：

1. `getFieldValueSpec(field)` 用 `switch (field?.kind)` 分发。
2. `createTextPropertySpec(field)` / `createStatusFieldSpec(field)` 每次都生成一个对象。
3. spec 对象里混合了：
   - 静态元数据
   - field 相关行为
   - render 逻辑

问题：

1. 这是典型的“事实 spec 已存在，但外面还包着 createXxxSpec()”。
2. 每次读取都重新分配 spec 对象，没有长期必要。

最终状态：

field value UI 必须改成静态 kind spec：

```ts
export const FIELD_VALUE_SPEC = {
  text: {
    panelWidth: 'default',
    Editor: InputEditor,
    createDraft: (field, value, seedDraft) => ...,
    parseDraft: (field, draft) => ...,
    render: (field, props) => ...,
    capability: {}
  },
  status: {
    panelWidth: 'picker',
    Editor: StatusValueEditor,
    createDraft: (field, value, seedDraft) => ...,
    parseDraft: (field, draft) => ...,
    render: (field, props) => ...,
    capability: {}
  }
} as const
```

规则：

1. spec table 静态存在。
2. `field` 作为行为函数参数传入。
3. `switch(kind)` 和 `createXxxPropertySpec()` 删除。

## 4.9 view type 信息分散在多处，必须统一成单一 spec

文件：

- `dataview/packages/dataview-meta/src/view.tsx`
- `dataview/packages/dataview-react/src/page/features/createView/catalog.tsx`
- `dataview/packages/dataview-react/src/page/Header.tsx`
- `dataview/packages/dataview-runtime/src/session/page.ts`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/LayoutPanel.tsx`
- `dataview/packages/dataview-core/src/view/options.ts`

当前状态：

1. `meta.view` 维护 label/icon。
2. `CREATE_VIEW_ITEMS` 维护 create catalog。
3. `supportsGroupSettings()` 单独维护 group capability。
4. `PageHeader` 自己再 `switch(type)` 一次 Icon。
5. `createDefaultViewOptions(type)` 自己再 `switch(type)` 一次。

问题：

view type 领域已经出现了多份平行真相：

1. 名称
2. icon
3. 是否可创建
4. 是否支持 group
5. 默认 options
6. 默认 display 策略

最终状态：

必须建立单一 `VIEW_TYPE_SPEC`：

```ts
export const VIEW_TYPE_SPEC = {
  table: {
    token: token(...),
    Icon: Table2,
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      options: { ... },
      display: { ... }
    }
  },
  gallery: {
    token: token(...),
    Icon: LayoutGrid,
    capabilities: {
      create: true,
      group: false
    },
    defaults: {
      options: { ... },
      display: { ... }
    }
  },
  kanban: {
    ...
  }
} as const
```

然后统一由这张表驱动：

1. meta view
2. create view catalog
3. header icon
4. `supportsGroupSettings`
5. default options/display

## 4.10 view settings / create view 菜单仍是局部命令式拼接

文件：

- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/RootPanel.tsx`
- `dataview/packages/dataview-react/src/page/features/createView/catalog.tsx`

当前状态：

1. RootPanel 内部临时声明 `menuItems`。
2. `CREATE_VIEW_ITEMS` 是数组，不是索引表。
3. visibility 与 capability 判定散落在组件内部。

问题：

1. 这类 UI 结构已经不再是一次性组件细节，而是公共装配语言。
2. 现在仍是“组件里边创建配置数组边消费”，不是长期最优。

最终状态：

1. create view 使用 `VIEW_TYPE_SPEC` 驱动。
2. settings root 菜单使用独立 `VIEW_SETTINGS_SPEC` 驱动。
3. `panel` / `visibility` / `suffix` / `capability gate` 必须索引化。

## 4.11 dataview publish projection 仍是手工编排壳

文件：

- `dataview/packages/dataview-engine/src/mutation/projection/runtime.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/spec.ts`

当前状态：

1. `createDataviewPublishProjectionRuntime()` 手工串联：
   - indexProjection
   - activeProjection
   - documentProjection
2. delta 合并逻辑也在 runtime 里手工拼。

问题：

这个 runtime factory 可以保留，但它不应继续承担“解释多套局部 delta 语义”的职责。

最终状态：

1. 保留 runtime orchestration factory。
2. document/active delta 统一收敛到 shared change schema。
3. publish runtime 只负责：
   - 调 phase runtime
   - 合并 capture
   - 输出 publish
4. 不再手工维护第二套 delta vocabulary。

---

## 5. dataview 对 shared 总设计的反向证明

dataview 审计后，shared 总文档需要加严的不是新抽象，而是两条更强的统一原则。

## 5.1 `ids + byId` 是 shared-wide 终态，不是 whiteboard 特例

dataview 的 document/view/filter/sort/runtime 全面依赖 `EntityTable.order`，这恰好证明：

1. 如果 `shared/core/entityTable` 不统一改成 `ids + byId`，词汇分裂会持续蔓延。
2. 这不是“有些包用 ids，有些包用 order 也可以”的问题。
3. shared 必须只保留一套公共实体族词汇。

## 5.2 字符串 grammar 必须覆盖 mutation target key

whiteboard 主要证明了 `fieldKey` 需要字符串化。

dataview 进一步证明：

1. mutation conflict key
2. operation target key
3. trace touched key

也必须统一字符串化。

`Path[]` 只能退回 compiler/runtime 内部。

## 5.3 kind/type 领域必须统一成 literal spec table + compile once

whiteboard 这边是：

1. node type
2. toolbar item/panel/layout

dataview 这边是：

1. field kind
2. filter kind
3. field value kind
4. view type

两边共同证明了一件事：

公共配置层最终不应保留这些中间层：

1. `switch(kind)`
2. `getXxxSpec(...)`
3. `createXxxSpec(...)`
4. `register(...)`

---

## 6. dataview 的最终 API 设计

## 6.1 mutation key

```ts
type DataviewMutationKey =
  | 'records'
  | `records.${RecordId}`
  | `records.${RecordId}.values.${FieldId}`
  | 'fields'
  | `fields.${FieldId}`
  | `fields.${FieldId}.values.${RecordId}`
  | 'views'
  | `views.${ViewId}`
  | 'activeView'
  | `external.${string}`
```

## 6.2 document delta spec

```ts
export const DOCUMENT_CHANGE_SPEC = {
  reset: 'flag',
  meta: 'flag',
  records: 'ids',
  values: 'ids',
  fields: 'ids',
  schemaFields: 'ids',
  views: 'ids'
} as const
```

## 6.3 active delta spec

```ts
export const ACTIVE_CHANGE_SPEC = {
  reset: 'flag',
  view: 'flag',
  query: 'flag',
  table: 'flag',
  gallery: 'flag',
  kanban: 'flag',
  records: {
    matched: 'flag',
    ordered: 'flag',
    visible: 'flag'
  },
  fields: 'ids',
  sections: 'ids',
  items: 'ids',
  summaries: 'ids'
} as const
```

## 6.4 field kind spec

```ts
export const FIELD_KIND_SPEC = {
  text: { ... },
  number: { ... },
  select: { ... },
  status: { ... },
  date: { ... },
  boolean: { ... }
} as const

const fieldKindRuntime = compileFieldKindSpec(FIELD_KIND_SPEC)
```

## 6.5 filter spec

```ts
export const FILTER_SPEC = {
  text: {
    presets: {
      contains: { operator: 'contains', valueMode: 'editable' },
      eq: { operator: 'eq', valueMode: 'editable' }
    },
    editor: 'text',
    plan: { ... },
    candidate: { ... }
  },
  number: { ... },
  status: { ... }
} as const
```

## 6.6 field value react spec

```tsx
export const FIELD_VALUE_SPEC = {
  text: {
    panelWidth: 'default',
    Editor: InputEditor,
    createDraft: (field, value, seedDraft) => ...,
    parseDraft: (field, draft) => ...,
    render: (field, props) => ...,
    capability: {}
  },
  status: {
    panelWidth: 'picker',
    Editor: StatusValueEditor,
    createDraft: (field, value, seedDraft) => ...,
    parseDraft: (field, draft) => ...,
    render: (field, props) => ...,
    capability: {}
  }
} as const
```

## 6.7 view type spec

```ts
export const VIEW_TYPE_SPEC = {
  table: {
    token: token(...),
    Icon: Table2,
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      options: { ... },
      display: { ... }
    }
  },
  gallery: {
    token: token(...),
    Icon: LayoutGrid,
    capabilities: {
      create: true,
      group: false
    },
    defaults: {
      options: { ... },
      display: { ... }
    }
  },
  kanban: {
    token: token(...),
    Icon: KanbanSquare,
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      options: { ... },
      display: { ... }
    }
  }
} as const
```

## 6.8 runtime read model spec

```ts
export const PAGE_MODEL_SPEC = {
  header: {
    kind: 'object',
    fields: { ... }
  },
  toolbar: {
    kind: 'object',
    fields: { ... }
  },
  query: {
    kind: 'object',
    fields: { ... }
  },
  settings: {
    kind: 'object',
    fields: { ... }
  }
} as const
```

---

## 7. 实施顺序

## Phase 1：shared 词汇统一落到 dataview

1. `EntityTable.order -> ids`
2. `DataviewMutationKey: Path -> string grammar`
3. document/active delta 改成 change spec
4. `shared/mutation` 与 dataview key/trace 统一字符串目标键

## Phase 2：dataview-core spec 收口

1. 删除 `createKindSpec`
2. `field/spec.ts` 改为 compile once
3. `filterSpec.ts` 从 helper 工厂链改为 literal spec table
4. view default/options/capabilities 收口到 `VIEW_TYPE_SPEC`

## Phase 3：dataview-runtime / react 装配语言统一

1. source patch/runtime 改到 `store.value/family/object`
2. page/card/source model 改成 declarative store spec
3. field value UI 改成静态 kind spec
4. create view / settings menu 改成单一 spec 驱动

## Phase 4：projection 与 publish 长期定型

1. publish runtime 只消费 schema 化 delta capture
2. document/active/index projection 只输出统一 vocabulary
3. 所有 runtime factory 只负责实例化，不负责解释 helper 链

---

## 8. 最终判断

`dataview` 不需要发明新的独立体系。长期最优只有一种：

1. 与 `shared` 使用同一套词汇
2. 与 `whiteboard` 使用同一套配置语言
3. 与 projection/delta/store 使用同一套装配边界

做完之后，dataview 的最终形态必须满足：

1. document / view / filter / sort / runtime family 全部统一 `ids + byId`
2. mutation key / conflict key / trace key 全部统一字符串 grammar
3. field kind / filter kind / view type / field value kind 全部统一 literal spec table + compile once
4. runtime read model 全部统一到 `store.object / store.value / store.family`
5. projection 与 publish 只消费 shared 级 schema 化 delta

这就是 dataview 这条线的长期最优终态。
