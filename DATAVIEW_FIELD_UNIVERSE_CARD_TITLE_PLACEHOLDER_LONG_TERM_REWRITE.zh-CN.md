# DATAVIEW Field Universe / Card Title / Placeholder 长期最优重构方案

## 前提

- 这份文档只讨论长期最优，不讨论兼容和过渡。
- 目标不是修某一个组件里的命名，而是统一整条链的字段语言：
  - core document field model
  - engine published field artifact
  - runtime source / page model / card model
  - react 对 title / property / placeholder 的消费方式
- 优先级是：
  1. 先统一 public field universe
  2. 再把 custom-only 集合收成显式子语言
  3. 最后删除 card/title 上的假对称和 presentation 泄漏

## 直接结论

### 1. `customFields` 不能继续兼指两种不同语义，也不该再作为第二个字段根

现在代码里 `customFields` 至少在表示两种不同东西：

- document 级全部 custom schema fields
- 当前 view 可见的 custom property fields

这不是“叫法有点乱”，而是已经在 public model 上形成了两套 field universe。

长期最优里：

- `fields` 只能表示 field universe，而且应当是唯一 public field 根
- custom-only schema subset 不再单独叫 `document.customFields`
- 真正的 schema 能力应该进入 `document.schema.fields`
- `visibleCustomFields` / `schemaFields` / `viewFields` 必须按真实含义拆开

### 2. `propertyFields` 不应该继续留在 `Card` model

当前 [shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/shared.ts#L13) 的 `Card.propertyFields` 是：

- `readonly CustomField[]`

但真正的 card published artifact 已经是：

- `CardContent.title`
- `CardContent.properties`

`propertyFields` 只是 `properties` 生成前的 schema 输入，不是最终 UI artifact，也不是稳定业务概念。

长期最优里应该：

- 删除 `Card.propertyFields`
- `Card` 只保留 placement / selection / layout / interaction 状态
- property schema 只存在于 `CardContent.properties`

### 3. `title` 必须继续保留为 field，但不能再是 public 边界外的 synthetic 逃生口

现在最不稳定的地方不是 `TitleField` 这个类型本身，而是 title 在不同层被一半当 field、一半当例外。

例如：

- [document/fields.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/document/fields.ts#L64) 的 `document.fields.all` 已经把 title 放进 field universe
- [table.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table.ts#L217) 的 table column 也已经按普通 field 消费 title
- 但 [source/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts#L52) 的 `document.fields` 仍只发 custom fields
- [FieldValueEditorHost.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/hosts/FieldValueEditorHost.tsx#L54) 仍要专门补一个 synthetic title field

长期最优里：

- `title` 继续是 `Field` 联合的一种
- 但 public source / model / page route 不再绕过它
- `document.fields.get(TITLE_FIELD_ID)` 应该和其他 field 一样可走通

### 4. `placeholderText` 不该绑在 `CardTitle` 上，更不该由 view model 硬编码字符串

当前：

- [gallery/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/gallery/api.ts#L177) 直接写 `'输入名称...'`
- [kanban/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/kanban/api.ts#L191) 直接用 `item.recordId`
- [card.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/card.ts#L113) 把它塞进 `CardTitle.placeholderText`
- [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx#L227) 把它当 input placeholder
- [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx#L265) 又把它当空标题展示文案

这说明这里至少混了三层语义：

- title value
- 编辑态 placeholder
- 空标题时的展示 fallback

长期最优里，这三者必须拆开。

## 当前不统一点

## 一. public field universe 已经分叉

### A. core/document 里 title 已经属于 field universe

[document/fields.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/document/fields.ts#L64) 明确有：

- `document.fields.all.ids() -> [TITLE_FIELD_ID, ...customIds]`
- `document.fields.all.get(TITLE_FIELD_ID) -> TitleField`

也就是说 core 语言已经是：

- `Field = title + custom`

### B. runtime document source 却只发 custom fields

[source/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts#L52) 当前定义：

```ts
export interface DocumentSource {
  fields: ListedEntitySource<FieldId, CustomField>
}
```

这里有两个问题：

- 值类型是 `CustomField`
- key 却还是 `FieldId`

这等于把 title 保留在类型宇宙里，又在运行时把它排除掉。

同类问题在：

- [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts#L49)
- [createActiveSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createActiveSource.ts#L109)
- [delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/delta.ts#L50)

### C. active published fields 又回到了 all-fields 语言

[shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/shared.ts#L60) 的 `FieldList` 是：

- ordered collection of `FieldId -> Field`
- 同时带一个 `custom` subset

table model 在 [table.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table.ts#L217) 直接消费：

- `fieldIds: tableView.display.fields`
- `readField: fieldId => source.active.fields.all.get(fieldId)`

也就是说 table 这条链已经认为：

- title 就是普通 visible field

### D. page/query/settings 还在 custom-only 语言里

[page/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/page/api.ts#L167) 当前把：

- `const customFields = input.source.document.fields.list`

当成了：

- filter 可选字段
- sort 可选字段
- visible / hidden field 列表
- settings route normalization 的 field universe

这会直接导致：

- title 不在 page settings / page query 的字段全集里
- 但 title 又在 table/display/query/index 的 field universe 里

这是当前最核心的不一致。

## 二. custom-only 集合和 field-universe 集合没有类型隔离

只要一个集合语义上不包含 title，它就不应该继续用：

- `FieldId`
- `Field`

现在 runtime/source 里大量 custom-only 结构仍写成：

- `EntitySource<FieldId, CustomField>`
- `CollectionDelta<FieldId>`

这会让上层调用点自然误解为：

- “title 也是 fieldId，那我是不是也能传 title？”

答案却是运行时不行。

这不是实现细节问题，而是 API 说谎。

## 三. active fields 自身也有重复和职责重叠

当前 [source/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts#L76) 同时暴露：

- `fields.all`
- `fields.custom`
- `fields.list`
- `fields.customList`

当前 [shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/shared.ts#L60) 的 `FieldList` 又自带：

- `custom`

也就是说“visible custom fields”现在有至少三种表达：

- `active.fields.custom`
- `active.fields.customList`
- `active.fields.list.custom`

长期最优里这不应该同时存在。

## 四. card model 里 `propertyFields` 已经是重复中间层

[gallery/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/gallery/api.ts#L152) 和 [kanban/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/kanban/api.ts#L163) 还在把：

- `propertyFields: store.read(customFields)`

塞进 `Card`。

但 React card 渲染真正吃的是：

- [RecordCard.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx#L127) 的 `content.title`
- [RecordCard.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx#L154) 之后的 `content.properties`

`Card.propertyFields` 现在既不是最终数据，也没有被 React 直接使用，更多只是为了：

- equality
- 把 schema 变化挂到 `Card` 这个 artifact 上

这不是好边界。

## 五. `placeholderText` 是 presentation 泄漏，不是 title data

当前 [shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/shared.ts#L26) 里：

```ts
export interface CardTitle {
  field: TitleField
  value: string
  placeholderText: string
}
```

这里的 `placeholderText` 有三个根本问题。

### A. 它不是 data

它不是 document value，不是 schema，也不是 active published state。

### B. 它不是 field property

title field 本身不决定：

- gallery 用什么空标题文案
- kanban 用什么空标题文案

这显然是 view / presentation 决策。

### C. 它现在还是字符串硬编码

这会直接绕开：

- meta
- token
- i18n

而 dataview 其他绝大多数 UI 文案已经在 token/meta 体系里。

## 长期最优原则

### 1. field universe 只允许一种 public 语言

只要一个 public artifact 说自己是 field collection，它就必须对齐：

- `FieldId`
- `Field`
- 包含 title

不能再有：

- 名字叫 `fields`
- 类型写 `FieldId`
- 实际只发 custom fields

### 2. field universe 和 schema 能力必须分层，不能并列出两个字段根

如果某个集合只允许 custom fields，它就不该再和 `fields` 并列成第二个字段 universe。

长期最优里应该直接分成：

- `fields` 表示所有 field 的读取语言
- `schema.fields` 表示 document-backed custom field schema 的读取和编辑语言

而不是：

- `document.fields`
- `document.customFields`

这种“一个全集 + 一个子集”都挂在根上的结构。

只要某个集合仍然是 custom-only，它就应该在：

- 名字
- key type
- value type

三处同时体现。

也就是说：

- `schema.fields: ListedEntitySource<CustomFieldId, CustomField>`

是对的；

- `fields: ListedEntitySource<FieldId, CustomField>`

不是长期最优。

### 3. title 在数据语言里是 field，在 UI 语言里是独立 slot

这两件事要同时成立：

- table / query / sort / filter / value reader 语言里：title 是 field
- card / row / form 这类 UI artifact 里：title 可以保留独立 slot

真正不该做的是：

- 底层把 title 当例外
- 上层又假装 title 是 field

### 4. card artifact 只发布最终渲染所需内容

`Card` 应只保留：

- identity
- layout
- selection
- interaction

`CardContent` 应只保留：

- title value
- property values

schema 输入、placeholder、view 文案都不应该继续混在 `Card` / `CardTitle` 里。

### 5. presentation 文案必须回到 meta / token

凡是：

- placeholder
- empty label
- empty state copy

都应该回到：

- meta token
- 或 runtime presentation store

而不是继续挂在 data artifact 上。

## 最终模型

## 一. core / document field API

长期最优里，`document` 应明确分成两层，但不是两个并列字段根：

### A. field universe

```ts
document.fields: {
  ids(document): readonly FieldId[]
  list(document): readonly Field[]
  get(document, fieldId: FieldId): Field | undefined
  has(document, fieldId: FieldId): boolean
}
```

这套语言是：

- all fields
- 含 title

### B. custom field schema

```ts
document.schema.fields: {
  ids(document): readonly CustomFieldId[]
  list(document): readonly CustomField[]
  get(document, fieldId: CustomFieldId): CustomField | undefined
  has(document, fieldId: CustomFieldId): boolean
  put(...)
  patch(...)
  remove(...)
}
```

也就是说，长期最优不建议继续保留这种 shape：

- `document.fields.all`
- `document.fields.custom`
- `document.fields.title`
- `document.customFields`

对外最好直接拉平为：

- `document.fields`
- `document.schema.fields`

`document.fields.title.get()` 如果保留，也最多只是内部 helper，不该再成为 public 调用点默认路径。

`title` 的标准读取路径应该是：

- `document.fields.get(TITLE_FIELD_ID)`

## 二. runtime source field API

长期最优里 runtime source 应该直接对齐上面的两层语言。

```ts
export interface DocumentSource {
  meta: ReadStore<DataDoc['meta']>
  records: EntitySource<RecordId, DataRecord>
  values: KeyedReadStore<ValueRef, unknown>
  fields: ListedEntitySource<FieldId, Field>
  schema: {
    fields: ListedEntitySource<CustomFieldId, CustomField>
  }
  views: ListedEntitySource<ViewId, View>
}
```

这里的关键点是：

- `document.fields` = all fields
- `document.schema.fields` = custom-only schema

而不是：

- 继续让 `document.fields` 承担 custom-only 语义
- 或者再额外并列一个 `document.customFields` 根

## 三. active source field API

长期最优里 active published field artifact 也应该收成单一语言：

```ts
export interface ActiveSource {
  fields: {
    ids: ReadStore<readonly FieldId[]>
    get: KeyedReadStore<FieldId, Field | undefined>
    list: ReadStore<FieldList>
  }
}

export interface FieldList extends OrderedKeyedCollection<FieldId, Field> {}
```

也就是说：

- 删除 `active.fields.all`
- 删除 `active.fields.custom`
- 删除 `active.fields.customList`
- 删除 `FieldList.custom`

如果某个消费方真的需要 visible custom fields，它应该显式派生：

- `visibleCustomFields = filterCustomFields(active.fields.list)`

而不是让 published artifact 永久携带重复 subset。

## 四. page / settings / query 语言

page model 这条链的长期最优是：

- 统一基于 `document.fields` 这个 all-fields catalog
- 需要 schema custom-only 的地方再走 `document.schema.fields`

### A. filter / sort 可选字段

应该基于：

- all fields

而不是：

- custom-only fields

否则 title 会永远在 table/query/index 里是 field，在 page toolbar 里却不是 field。

### B. settings visible / hidden fields

应该基于：

- all document fields

这样 title 才会真正成为 view display field universe 的一部分。

### C. settings route

当前 [page.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/session/page.ts#L31) 的：

```ts
| { kind: 'fieldSchema', fieldId: CustomFieldId }
```

长期最优不够稳，因为它把 route 语言绑死在 custom-only schema 上。

长期更顺的形态应是：

```ts
type SettingsRoute =
  | { kind: 'fieldList' }
  | { kind: 'field', fieldId: FieldId }
```

然后再由 panel 自己决定：

- custom field -> schema panel
- title field -> read-only title panel / title settings panel / fallback root

这样 public route 语言才和 public field universe 一致。

如果某个页面确实是 schema 编辑页面，它再单独读取：

- `document.schema.fields.get(fieldId as CustomFieldId)`

## 五. card model

### A. `Card` 最终应去掉 `propertyFields`

```ts
export interface Card {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}
```

### B. `CardContent` 继续保留 `title + properties`

```ts
export interface CardTitle {
  field: TitleField
  value: string
}

export interface CardProperty {
  field: CustomField
  value: unknown
}

export interface CardContent {
  title: CardTitle
  properties: readonly CardProperty[]
  hasProperties: boolean
}
```

这里我不建议把 title 强塞回 `properties`。

UI artifact 上：

- title slot
- property list

这个分层本身是对的。

### C. title field 可以保留，但必须来自统一 field universe

如果底层 field universe 真统一了，那么 `CardTitle.field` 保留并不别扭。

真正别扭的是现在它来自：

- [document.fields.title.get()](/Users/realrong/Rostack/dataview/packages/dataview-core/src/document/fields.ts#L93)

这个 synthetic helper，

而不是：

- `document.fields.get(TITLE_FIELD_ID)`

这才是应该修掉的地方。

## 六. title placeholder / empty label

长期最优里，`placeholderText` 应从 `CardTitle` 删除，拆成 presentation 文案。

### A. 从 data artifact 删除

```ts
export interface CardTitle {
  field: TitleField
  value: string
}
```

### B. 单独发布 card text / card copy

最简单的长期模型可以是：

```ts
export interface CardText {
  titlePlaceholder: Token
  emptyTitle: Token
}
```

然后：

- gallery model 提供 `cardText`
- kanban model 提供 `cardText`
- React `EditableCardTitle` 同时接收：
  - `title.value`
  - `cardText.titlePlaceholder`
  - `cardText.emptyTitle`

### C. 为什么要拆成两个 token

因为现在它们是两种不同语义：

- input placeholder
- 非编辑态空标题展示

当前 [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx#L227) 和 [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx#L265) 复用了同一个字符串，只是偶然“看起来还能用”，不是好模型。

### D. `item.recordId` 不应再作为 placeholder

[kanban/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/kanban/api.ts#L191) 现在拿 `item.recordId` 当 title placeholder，这长期最优里应直接删除。

原因：

- 它不是 token
- 不能本地化
- 不是 presentation policy，而是 debug-like fallback
- 它会让“空标题”看起来像“有一段真实标题文本”

长期最优里，如果产品确实需要某种空标题展示，应该来自：

- meta token
- 或单独的 empty-title presentation policy

而不是 record id。

## 命名收敛建议

### 1. `customFields`

只保留给：

- document-backed custom schema fields

不能再拿来表示：

- visible custom fields
- card body properties

### 2. `propertyFields`

删除。

如果只是局部变量，按真实语义改成：

- `visibleCustomFields`
- `schemaFields`
- `displayFields`

### 3. `fields`

只保留给：

- all-fields universe

### 4. `title field`

保留 `TitleField` 作为 `Field` 联合的一种没有问题，
但 public 边界上不应再出现“title 不是 field catalog 成员，只能走 helper 补出来”的写法。

## 推荐落地顺序

### 1. 先统一 field universe 边界

- `document.fields` 改成 all-fields
- `document.schema.fields` 承担 custom field schema
- runtime `DocumentSource.fields` 改成 all-fields
- runtime `DocumentSource.schema.fields` 承担 custom-only schema
- 所有 custom-only source 改成 `CustomFieldId` / `CustomField`

### 2. 再收 active fields API

- `active.fields.all/custom/customList` 收成单一 `active.fields`
- `FieldList.custom` 删除
- visible custom subset 改为局部派生

### 3. 再改 page/query/settings

- `availableFilterFields`
- `availableSortFields`
- `visibleFields`
- `hiddenFields`
- settings route

全部切到统一 field universe。

### 4. 最后收 card/title/presentation

- 删除 `Card.propertyFields`
- 删除 `CardTitle.placeholderText`
- 引入 `CardText`
- gallery / kanban 改成从 meta/token 提供 title 文案

## 最终判断

针对你提的四个点，我的最终判断是：

### `customFields`

要改，而且不是简单改名。

它不该继续作为 public 顶层字段根存在。

长期最优里它需要被收回成：

- `schema.fields` 这套 custom-only schema 语言

不能再和：

- all-fields universe
- visible-properties
- page visible fields

混用。

### `propertyFields`

要删。

它现在是重复中间层，不是稳定 artifact。

### `title field`

要改，但不是删掉。

应该保留 title 作为 field，
同时删除它在 public source/page route 里的例外地位。

### `placeholderText`

必须改，而且应该彻底从 title data 上拿掉。

它属于：

- meta / token
- presentation copy

不属于：

- field schema
- title data
- card content data
