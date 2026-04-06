# DATAVIEW_PROPERTY_SYSTEM_REWRITE.zh-CN

## 目标

把 dataview 的 property system 重写成一套长期稳定、低歧义、低中间层、低重复的模型。

这份方案默认以下前提成立：

- 不考虑兼容旧数据结构
- 不考虑兼容旧 API
- 不保留 adapter、alias、双路径、过渡导出
- 允许重写 core / engine / react 三层
- 优先级是“更少的概念、更少的入口、更少的特殊分支”，不是“最小改动”

这份文档回答七件事：

- 现在为什么会让人感觉混乱
- 最终应该收敛成什么核心模型
- 哪些类型和中间层应该直接删除
- core / engine / react 分别应该如何改写
- 目录结构应该如何重组
- 重写顺序应该如何安排
- 哪些设计是长期最优，即使短期改动更大也值得做

---

## 当前问题

### 1. 同一件事有多套入口

当前 property system 在 core 内已经有一条正确主轴：

- `kind/spec.ts` 定义 kind 的 config/filter/group 能力
- `kind/index.ts` 定义 parse/display/search/compare/group runtime
- `value/index.ts` 提供 `parsePropertyDraft` / `getPropertyDisplayValue`

但外围又长出了多套旁路：

- React 层有 `optionForValue`
- core 有 `getPropertyOption`
- schema 层有 `getPropertyConfig`
- date/url/status 又各自有专用 config getter

结果是：

- “我应该从哪里拿到归一化后的 property”
- “我应该从哪里拿 option”
- “什么层负责补默认值和 sanitize”

没有单一答案。

---

### 2. `kind` 和 `config.type` 是重复判别字段

当前模型里：

```ts
type GroupProperty = {
  id: PropertyId
  name: string
  kind: GroupPropertyKind
  config?: GroupPropertyConfig
}
```

而 `GroupPropertyConfig` 里又有一份 `type`。

这会带来几个坏处：

- schema 本身允许出现 `kind !== config.type`
- 系统需要额外 validator 保证两者一致
- 各层代码都需要反复判断“kind 对不对、config.type 对不对”
- `getPropertyConfig` 被迫存在，专门修复这个重复结构

这是典型的模型层冗余。

长期最优方案不应该让“一个对象的真实类型”由两个字段共同决定。

---

### 3. option family 被拆成三套近似实现

`select`、`multiSelect`、`status` 本质上都是“option property”。

它们真正的差异只有两类：

- 值是单选还是多选
- option 集合是平铺还是按 status category 组织

但当前实现把它们建成三个 property kind，于是系统里出现大量重复：

- display 逻辑重复
- lookup 逻辑重复
- group domain / group entries 逻辑高度相似
- React value spec 重复
- schema editor 分成 plain/status 两套主分支

这不是业务复杂，而是模型切分位置不对。

---

### 4. option 模型本身也有冗余

当前 `GroupPropertyOption`：

```ts
type GroupPropertyOption = {
  id: string
  key: string
  name: string
  color?: string
  category?: GroupStatusCategory
}
```

这里至少有两个问题：

- `id` 和 `key` 在当前实现里几乎总是同值，语义重复
- `category` 只对 status 有意义，却挂在所有 option 上

这会让“普通 option”和“status option”之间的边界模糊，导致系统到处混合处理。

---

### 5. config 归一化策略不统一

当前有三种不同层级的 config 读取策略：

- `getPropertyConfig` 只做基本匹配修复
- `getDatePropertyConfig` 会补默认值并校验格式
- `getUrlPropertyConfig` 会合并默认值

也就是说，系统里没有统一的“normalized property schema”概念。

这会导致：

- 某些调用点拿到的是 raw config
- 某些调用点拿到的是 partially normalized config
- 某些调用点拿到的是 fully normalized config

这是认知复杂度的核心来源之一。

---

### 6. React draft 模型偏字符串黑箱

现在 editor contract 已经允许 `draft` 是任意类型，但大部分 property 仍然把 draft 压成字符串。

最明显的是 multi-select：

- UI 真正操作的是 `string[]`
- 但 draft 用的是 `", "` 拼接字符串
- 编辑器内部不断 split / join

这会带来无意义的中间转换，也让 editor 实现承担本不该存在的解析负担。

---

### 7. title property 是一个长期噪音源

当前 title 是一个“伪装成普通 property 的内建字段”。

结果系统里要一直维护：

- `TITLE_PROPERTY_ID`
- title 不能 convert / remove
- title config 固定为 text
- 归一化时要强行修复 title kind/config

这类特殊路径会不断污染 property system 的主流程。

长期最优模型里，title 不应该再是一条普通 property 记录。

---

## 设计原则

### 1. 单一判别源

一个 schema 的类型只能由一个字段决定。

禁止：

- `kind` 再加一份 `config.type`
- `kind` 下面再挂一层 `textKind`、`optionKind` 这类二级判别字段
- UI 层再维护一套平行判别逻辑

推荐规则：

- property schema 一律使用 `kind`
- command / operation / event 这类协议对象继续使用 `type`
- 不允许同一个 property schema 上同时出现 `kind` 和另一个判别字段共同决定真实类型

---

### 2. schema 直接表达真实语义

如果一个 kind 必然拥有某些字段，就直接放在这个 kind 的分支上。

不要为了“统一长相”把所有字段塞进嵌套 `config`，再靠 accessor 解包。

---

### 3. option family 统一建模

单选、多选、状态在 schema 层直接就是三个独立 kind：

- `kind: 'select'`
- `kind: 'multiSelect'`
- `kind: 'status'`

其中：

- `select` 和 `multiSelect` 使用普通 flat options
- `status` 使用带 category 的 status options
- “它们都属于 option family”只允许存在于实现层，不再写进 schema

---

### 4. 归一化只有一个入口

系统只能有一个 canonical normalize 流程：

- 输入是 raw schema
- 输出是 normalized schema
- 所有 display / parse / compare / group / UI 都基于 normalized schema

禁止再出现 kind-specific getter 拼凑归一化结果。

---

### 5. 行为和 schema 同层定义

当前 `kind/spec.ts` 与 `kind/index.ts` 分裂的问题，本质是：

- 一半文件定义“这个 kind 是什么”
- 另一半文件定义“这个 kind 怎么工作”

长期最优模型里，这两者必须收口。

一个 kind 的：

- 默认字段
- normalize
- convert
- parseDraft
- display
- search
- compare
- filter
- group

应该放在同一个 kind 定义里。

---

### 6. 不为了“统一”保留弱抽象

以下模式应该直接避免：

- 只转发一层参数的 accessor
- 只做一层 `find` 的 helper
- 同时存在 raw getter 和 resolved getter
- React 层重复包一层 core 已有能力

抽象只有在它真正减少分支和认知成本时才保留。

---

## 最终核心模型

## 1. property schema 直接改成判别联合，不再使用 `config`

推荐最终模型：

```ts
type PropertySchema =
  | PlainTextProperty
  | UrlProperty
  | EmailProperty
  | PhoneProperty
  | NumberProperty
  | SelectProperty
  | MultiSelectProperty
  | StatusProperty
  | DateProperty
  | BooleanProperty
  | AssetProperty

type PropertyBase = {
  id: PropertyId
  name: string
}
```

### PlainTextProperty

```ts
type PlainTextProperty = PropertyBase & {
  kind: 'text'
}
```

说明：

- `text` 只表示 plain text
- 不再通过 `textKind` 做二级判别

---

### UrlProperty

```ts
type UrlProperty = PropertyBase & {
  kind: 'url'
  displayFullUrl: boolean
}
```

说明：

- `url` 是独立根 kind
- `displayFullUrl` 只存在于 `UrlProperty`
- 不再把 URL 的显示策略挂在整个 text family 上

---

### EmailProperty

```ts
type EmailProperty = PropertyBase & {
  kind: 'email'
}
```

说明：

- `email` 是独立根 kind
- schema 直接表达真实语义

---

### PhoneProperty

```ts
type PhoneProperty = PropertyBase & {
  kind: 'phone'
}
```

说明：

- `phone` 是独立根 kind
- 仍然可以在实现层归到 text family，但 family 不进入 schema

---

### NumberProperty

```ts
type NumberProperty = PropertyBase & {
  kind: 'number'
  format: 'number' | 'integer' | 'percent' | 'currency'
  precision: number | null
  currency: string | null
  useThousandsSeparator: boolean
}
```

说明：

- 所有字段都直接放在 schema 上
- normalize 后不再存在 optional ambiguity

---

### SelectProperty

```ts
type BaseOptionItem = {
  id: string
  name: string
  color: string | null
}

type FlatOptionItem = BaseOptionItem

type StatusOptionItem = BaseOptionItem & {
  category: 'todo' | 'in_progress' | 'complete'
}

type SelectProperty = PropertyBase & {
  kind: 'select'
  options: FlatOptionItem[]
}
```

说明：

- `select` 是单值 flat option
- `options` 只允许 `FlatOptionItem[]`

---

### MultiSelectProperty

```ts
type MultiSelectProperty = PropertyBase & {
  kind: 'multiSelect'
  options: FlatOptionItem[]
}
```

说明：

- `multiSelect` 是多值 flat option
- `options` 只允许 `FlatOptionItem[]`

---

### StatusProperty

```ts
type StatusProperty = PropertyBase & {
  kind: 'status'
  options: StatusOptionItem[]
}
```

说明：

- `status` 是独立 kind
- 删除 `key`
- `options` 只允许 `StatusOptionItem[]`
- `category` 只存在于 `StatusProperty` 上
- status 的 grouping、filter、compare 可以直接基于收窄后的类型实现

---

### DateProperty

```ts
type DateProperty = PropertyBase & {
  kind: 'date'
  displayDateFormat: 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
  displayTimeFormat: '12h' | '24h'
  defaultValueKind: 'date' | 'datetime'
  defaultTimezone: string | null
}
```

说明：

- 直接是 normalize 后形态
- 不再需要单独 `getDatePropertyConfig`

---

### BooleanProperty

```ts
type BooleanProperty = PropertyBase & {
  kind: 'boolean'
}
```

说明：

- `checkbox` 改名为 `boolean`
- schema 表达数据语义，不表达控件长相

---

### AssetProperty

```ts
type AssetProperty = PropertyBase & {
  kind: 'asset'
  multiple: boolean
  accept: 'any' | 'image' | 'video' | 'audio' | 'media'
}
```

说明：

- `file` / `media` 合并
- schema 只保留资产数据语义
- UI 再决定展示形式

---

## 2. record value 类型同步简化

推荐 value 形态：

```ts
type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | DateValue
  | AssetValue[]
  | undefined
```

其中：

- option single 用 `string`
- option multi 用 `string[]`
- boolean 用 `boolean`
- asset 始终用数组，`multiple=false` 时由 UI/validator 保证长度不超过 1

这样可以减少“单个值/数组值”在 asset family 里的特殊分支。

---

## 3. title 从 property registry 中移除

长期最优目标：

```ts
type Record = {
  id: RecordId
  title: string
  values: Record<PropertyId, PropertyValue>
}
```

说明：

- `title` 是 record 的 built-in field，不是 property table 里的一项
- UI 层如果需要把 title 作为“第一列”，由 view schema 处理
- property engine 不再知道 `TITLE_PROPERTY_ID`

这是一个影响范围很大的变更，但长期收益极高：

- 删除 title 特判
- 删除 title convert/remove/normalize/validate 分支
- property system 回到纯粹的“可配置字段”模型

---

## 最终定型

这一节不是方向性建议，而是本次重写建议直接采用的最终模型。

除非后续发现明确的产品约束，否则不建议再继续摇摆以下决策。

### 1. 最终 schema

```ts
export type PropertyId = string
export type RecordId = string

export type StatusCategory = 'todo' | 'in_progress' | 'complete'
export type NumberFormat = 'number' | 'integer' | 'percent' | 'currency'
export type DateDisplayFormat = 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
export type TimeDisplayFormat = '12h' | '24h'
export type DateValueKind = 'date' | 'datetime'
export type AssetAccept = 'any' | 'image' | 'video' | 'audio' | 'media'

export type PropertyBase = {
  id: PropertyId
  name: string
}

export type PlainTextProperty = PropertyBase & {
  kind: 'text'
}

export type UrlProperty = PropertyBase & {
  kind: 'url'
  displayFullUrl: boolean
}

export type EmailProperty = PropertyBase & {
  kind: 'email'
}

export type PhoneProperty = PropertyBase & {
  kind: 'phone'
}

export type NumberProperty = PropertyBase & {
  kind: 'number'
  format: NumberFormat
  precision: number | null
  currency: string | null
  useThousandsSeparator: boolean
}

export type FlatOptionItem = {
  id: string
  name: string
  color: string | null
}

export type StatusOptionItem = {
  id: string
  name: string
  color: string | null
  category: StatusCategory
}

export type SelectProperty = PropertyBase & {
  kind: 'select'
  options: FlatOptionItem[]
}

export type MultiSelectProperty = PropertyBase & {
  kind: 'multiSelect'
  options: FlatOptionItem[]
}

export type StatusProperty = PropertyBase & {
  kind: 'status'
  options: StatusOptionItem[]
}

export type DateProperty = PropertyBase & {
  kind: 'date'
  displayDateFormat: DateDisplayFormat
  displayTimeFormat: TimeDisplayFormat
  defaultValueKind: DateValueKind
  defaultTimezone: string | null
}

export type BooleanProperty = PropertyBase & {
  kind: 'boolean'
}

export type AssetProperty = PropertyBase & {
  kind: 'asset'
  multiple: boolean
  accept: AssetAccept
}

export type PropertySchema =
  | PlainTextProperty
  | UrlProperty
  | EmailProperty
  | PhoneProperty
  | NumberProperty
  | SelectProperty
  | MultiSelectProperty
  | StatusProperty
  | DateProperty
  | BooleanProperty
  | AssetProperty
```

### 2. 最终 value 模型

```ts
export type DateValue =
  | {
      kind: 'date'
      start: string
      end?: string
    }
  | {
      kind: 'datetime'
      start: string
      end?: string
      timezone: string | null
    }

export type AssetValue = {
  id: string
  name: string
  url?: string
  mimeType?: string
  size?: number
  meta?: Record<string, unknown>
}

export type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | DateValue
  | AssetValue[]
  | undefined
```

### 3. 最终 record 模型

```ts
export type DataRecord = {
  id: RecordId
  title: string
  values: Partial<Record<PropertyId, PropertyValue>>
  meta?: Record<string, unknown>
}
```

### 4. 最终 document 模型

```ts
export type PropertyTable = {
  byId: Record<PropertyId, PropertySchema>
  order: PropertyId[]
}

export type DataDocument = {
  schemaVersion: number
  records: EntityTable<RecordId, DataRecord>
  properties: PropertyTable
  views: ViewTable
  meta?: Record<string, unknown>
}
```

### 5. 最终命名约束

- property schema 判别字段统一使用 `kind`
- command / operation / event 判别字段统一使用 `type`
- `select` / `multiSelect` / `status` 在 schema 层保持独立 kind
- “option family”只允许在实现层出现，不允许再进入 schema
- `checkbox` 统一改名为 `boolean`
- `file` / `media` 统一改名为 `asset`
- 不再出现 `config`、`config.type`、`textKind`、`mode`、`key`

### 6. normalize 后必须满足的约束

以下约束不放在调用方，不放在 UI，不放在 engine service，而是由 normalize / validator 统一保证：

- 每个 property 的 `name` 必须是非空字符串
- 每个 property 的字段形状必须完全匹配其 `kind`
- `NumberProperty.precision` 要么是 `null`，要么是非负整数
- `NumberProperty.currency` 要么是 `null`，要么是非空字符串
- `SelectProperty.options` / `MultiSelectProperty.options` 中不允许 category
- `StatusProperty.options` 中每一项都必须有合法 category
- option `id` 在同一 property 内必须唯一
- option `name` 在同一 property 内按大小写不敏感唯一
- `DateProperty.defaultTimezone` 要么是 `null`，要么是合法 IANA timezone
- `AssetProperty.multiple=false` 时，写入层必须保证 value 数组长度最多为 1

### 7. 最终是否保留 family 概念

保留，但只能是实现层派生信息：

```ts
export const propertyFamilyByKind = {
  text: 'text',
  url: 'text',
  email: 'text',
  phone: 'text',
  number: 'number',
  select: 'option',
  multiSelect: 'option',
  status: 'option',
  date: 'date',
  boolean: 'boolean',
  asset: 'asset'
} as const
```

用途只有三个：

- 共用部分 display / parse / search 逻辑
- 做 UI 分组
- 做 meta 分组

不能反向驱动 schema。

---

## 最终行为模型

## 1. 只保留一个 kind registry

最终只保留一个注册表：

```ts
const propertyKinds = {
  text: textKindDef,
  url: urlKindDef,
  email: emailKindDef,
  phone: phoneKindDef,
  number: numberKindDef,
  select: selectKindDef,
  multiSelect: multiSelectKindDef,
  status: statusKindDef,
  date: dateKindDef,
  boolean: booleanKindDef,
  asset: assetKindDef
}
```

每个 kind 定义同时包含：

- `create`
- `normalize`
- `convert`
- `parseDraft`
- `display`
- `searchTokens`
- `compare`
- `filter`
- `group`

不要再拆成：

- 一份 spec
- 一份 runtime
- 一份 schema helper
- 一份 value helper

这四层拆分在当前规模下只会增加跳转成本。

---

## 2. normalize 后的 schema 作为唯一输入

系统所有核心行为函数都接收 normalized schema：

```ts
displayValue(property: NormalizedPropertySchema, value: unknown): string | undefined
parseDraft(property: NormalizedPropertySchema, draft: PropertyDraft): ParseResult
compareValues(property: NormalizedPropertySchema, left: unknown, right: unknown): number
groupEntries(property: NormalizedPropertySchema, value: unknown, mode: string): GroupEntry[]
```

禁止：

- 某些函数吃 raw property
- 某些函数吃 partially normalized property
- 某些函数内部再去调用 kind-specific getter 进行二次修补

normalize 必须是前置步骤，不是懒修复步骤。

---

## 3. option family 的行为在实现层复用，但不回写到 schema

`select`、`multiSelect`、`status` 在 schema 层是三个独立 kind。

它们在实现层仍然可以共享同一套 option family 能力：

- option lookup
- display
- search token
- filter eq/contains/in
- manual order
- create/update/remove/reorder

其中：

- `select` 表示单值 flat option
- `multiSelect` 表示多值 flat option
- `status` 表示单值 status option，并显式携带 category

这样系统里不会再有：

- `getPropertyOptions`
- `getPropertyOption`
- `getStatusSections`
- `optionForValue`

这些分散 helper 共存的局面。

最终应该只有一套 option API，例如：

```ts
getOption(property, id)
findOption(property, token)
listOptions(property)
listOptionSections(property)
```

并且它们只接受 `SelectProperty | MultiSelectProperty | StatusProperty`。

---

## 4. draft 必须是结构化类型

最终 draft 规则：

- text: `string`
- number: `string`
- select: `string | null`
- multiSelect: `string[]`
- status: `string | null`
- date: `DateDraft`
- boolean: `boolean | null`
- asset: `AssetDraft`

说明：

- draft 是 editor 的工作形态，不应该为了“统一”强行都压成字符串
- query、hovered item、popover open state 属于组件局部 UI state，不属于 draft

`multiSelect` 当前的 `join(', ')` 是应被直接删除的实现。

---

## 目录重组方案

## 1. core/property 目录重写

推荐最终结构：

```txt
dataview/src/core/field/
  model.ts
  normalize.ts
  kinds/
    text.ts
    url.ts
    email.ts
    phone.ts
    number.ts
    select.ts
    multiSelect.ts
    status.ts
    date.ts
    boolean.ts
    asset.ts
  index.ts
```

### `model.ts`

只放：

- `PropertySchema`
- `NormalizedPropertySchema`
- `FlatOptionItem`
- `StatusOptionItem`
- `PropertyValue`
- 各 kind 的 union 类型

不放行为函数。

### `normalize.ts`

只放：

- `normalizeProperty`
- `normalizeProperties`
- `convertProperty`
- 基于 kind registry 的 normalize/convert 调度

### `kinds/*.ts`

每个文件同时放这个 kind 的：

- type helper
- defaults
- normalize
- convert
- parseDraft
- display
- search
- compare
- filter
- group

### `index.ts`

只导出真正的 public API。

禁止再用 `export *` 把多个历史层级全量铺平。

---

## 2. 必删文件

以下文件在最终态不应保留：

- `dataview/src/core/field/schema/index.ts`
- `dataview/src/core/field/option/index.ts`
- `dataview/src/core/field/kind/spec.ts`
- `dataview/src/core/field/kind/index.ts`

原因不是“这些文件一定写得差”，而是它们代表了旧模型的层次拆分方式：

- schema 一层
- option 一层
- kind spec 一层
- kind runtime 一层

这在长期会持续制造跳转和重复。

---

## 3. React properties 目录重写

推荐目标：

```txt
dataview/src/react/field/
  value/
    renderer/
      text.tsx
      url.tsx
      email.tsx
      phone.tsx
      number.tsx
      select.tsx
      multiSelect.tsx
      status.tsx
      date.tsx
      boolean.tsx
      asset.tsx
    editor/
      text.tsx
      url.tsx
      email.tsx
      phone.tsx
      number.tsx
      select.tsx
      multiSelect.tsx
      status.tsx
      date.tsx
      boolean.tsx
      asset.tsx
    registry.ts
  schema/
    editor/
      PropertyEditor.tsx
      sections/
        BasicSection.tsx
        OptionSection.tsx
        DateSection.tsx
        NumberSection.tsx
        AssetSection.tsx
```

说明：

- React 侧直接按最终 schema kind 对齐
- `select.tsx` / `multiSelect.tsx` / `status.tsx` 仍然可以共享内部 helper，但不再强行合并成一个 schema-level `option.tsx`
- `FieldOptionsSection.tsx` / `FieldStatusOptionsSection.tsx` 可以保留为 `OptionSection.tsx` 与 `StatusSection.tsx`，也可以在同一目录共享内部组件
- `OptionPickerEditor.tsx` 与 `StatusValueEditor.tsx` 是否合并，取决于 UI 差异是否足够小；不要为了“统一”而强行合并出一个过大的组件

---

## 4. engine/property 目录重写

推荐目标：

```txt
dataview/src/engine/command/property/
  model.ts
  validate.ts
  resolve.ts
  options.ts
```

但要同时做两件事：

- validator 直接校验新 schema，不再校验 `kind/config.type` 一致性
- resolver 直接操作 `kind='select' | 'multiSelect' | 'status'`

另外建议删除 UI-facing 的“弱 patch 风格”使用习惯。

长期更清晰的接口是：

- `property.create`
- `property.rename`
- `property.replaceSchema`
- `property.remove`
- `property.option.add`
- `property.option.update`
- `property.option.remove`
- `property.option.reorder`

比“给一个泛型 patch，再让 resolver 推断你到底想改什么”更清楚。

---

## React 层具体重构方案

## 1. value spec 按最终 kind 合并

当前：

- `select.tsx`
- `multiSelect.tsx`
- `status.tsx`

最终：

- 三个独立 renderer spec：`select`、`multiSelect`、`status`

参数来自 normalized schema：

- `kind`

逻辑分工：

- `kind='select'` 时渲染单值 option tag
- `kind='multiSelect'` 时渲染 tag list
- `kind='status'` 时渲染单值 status tag，并开启 category 维度的 editor/schema UI

React 层不应该再自己用 `optionForValue` 手动 lookup option。

---

## 2. schema editor 只按 capability 渲染 section

不要再写：

- “如果 kind 是 status，走这套组件”
- “如果 kind 是 url，再额外调一个 getter”

最终应该是：

```ts
const property = normalizeProperty(rawProperty)

if (supportsNumberFormat(property)) renderNumberSection()
if (supportsOptions(property)) renderOptionSection()
if (supportsDateConfig(property)) renderDateSection()
if (supportsAssetConfig(property)) renderAssetSection()
```

这里的 capability 来自 normalized schema 和 kind definition，而不是来自散落的 helper。

---

## 3. editor draft 和 UI state 分离

以 option editor 为例：

- `draft` 是最终待提交值
- `query` 是输入框搜索词
- `editingOptionId` 是局部 UI state
- `highlightedKey` 是导航状态

当前系统里 draft 和 query 的边界还不够清晰，尤其 multi-select 通过字符串桥接导致概念混在一起。

重写后应保证：

- draft 总是 value-shaped
- query 总是 local UI state

---

## Core 层具体重构方案

## 1. 删除所有 kind-specific config getter

最终不应再存在：

- `getPropertyConfig`
- `getDatePropertyConfig`
- `getUrlPropertyConfig`

取而代之的是：

- `normalizeProperty`

调用者要么拿 raw schema，要么拿 normalized schema，不存在第三种中间态。

---

## 2. option lookup 只保留一套

最终只保留：

- `getOptionById`
- `findOptionByToken`
- `listOptionSections`

这些函数只接受 `SelectProperty | MultiSelectProperty | StatusProperty`。

删除：

- React 私有 `optionForValue`
- core 层零散 `find(...option.id === ...)`
- status 文件里私有 `getStatusOptions`

---

## 3. status category 推断策略明确降级

当前 status 支持根据 id/key/name 推断 category。

长期最优模型里，status option 的 category 必须是显式字段。

也就是：

- 新模型不再推断
- status option 没有 category 就是非法 schema
- 默认 options 在 create 阶段直接写完整

这样可以删除大量“兼容旧脏数据”的分支。

---

## 4. option order 只以数组顺序为准

最终不再保留额外 manual order 字段，也不为 option 建 secondary order abstraction。

规则很简单：

- `property.options` 的数组顺序就是唯一顺序
- reorder 就是重排数组
- compare / group manual sort 都直接读数组索引

这和当前系统相同，但应该在模型层写成明确原则，而不是让多个 helper 各自隐式依赖。

---

## 5. 搜索 token 规则统一

option family 最终搜索规则：

- 只认 `id`
- 只认 `name`

删除 `key` 后，搜索语义也一起简化。

如果未来真的需要别名：

- 明确新增 `aliases: string[]`

不要再让一个含义不清的 `key` 同时承担“唯一 token、旧 id、搜索别名、显示辅助名”多种职责。

---

## 6. family 只存在于实现层，不进入 schema

重写后仍然可以在实现层保留 family 概念，例如：

```ts
const propertyFamilyByKind = {
  text: 'text',
  url: 'text',
  email: 'text',
  phone: 'text',
  number: 'number',
  select: 'option',
  multiSelect: 'option',
  status: 'option',
  date: 'date',
  boolean: 'boolean',
  asset: 'asset'
} as const
```

这类信息的作用是：

- 复用部分 display / parse / search 行为
- 在 UI 中共享某些编辑器能力
- 给 meta 或菜单系统做分组

但它不是 schema 的一部分。

禁止把它重新编码回：

- `textKind`
- `valueKind`
- `propertyType`

这类二级判别字段里。

---

## Engine 层具体重构方案

## 1. resolver 直接对最终 schema 操作

当前 resolver 的问题不是功能不对，而是它被旧模型拖着做太多补丁式修复。

重写后的目标：

- create 时直接创建 normalized schema
- replaceSchema 时直接替换完整 schema
- convert 时直接生成目标 kind 的完整 normalized schema
- option 操作时直接操作 `kind='select' | 'multiSelect' | 'status'`

不再有：

- `replacePropertyOptions`
- `convertPropertyKindConfig`
- `resolveOptionPropertyContext` 里先判断 supportsOptions 再读旧 config

---

## 2. service 层不再重复推断 command 结果

当前 `engine/services/properties.ts` 里存在大量模式：

- 先读当前 options
- dispatch command
- 再读 next options
- 然后自己推断新加了哪个 option

长期最优方案里，command result 应直接返回结构化结果，例如：

```ts
type PropertyCommandResult =
  | { applied: true; createdOption?: FlatOptionItem | StatusOptionItem; updatedProperty?: PropertySchema }
  | { applied: false; issues: ValidationIssue[] }
```

这样 service 层不再需要做二次推断。

---

## 长期最优的“删减清单”

以下概念建议直接删除：

- `config.type`
- `kind='option'`
- `mode='single' | 'multi' | 'status'`
- `textKind`
- `GroupPropertyOption.key`
- `TITLE_PROPERTY_ID`
- `getPropertyConfig`
- `getDatePropertyConfig`
- `getUrlPropertyConfig`
- `replacePropertyOptions`
- `convertPropertyKindConfig`
- React `optionForValue`
- `FieldStatusOptionsSection`
- `StatusValueEditor`

不是说这些名字今天一定有 bug，而是它们都代表旧切分方式。

如果想真正把系统收敛干净，就不能在新模型里继续保留旧边界。

---

## 推荐的最终 public API

## 1. core/property

```ts
normalizeProperty(property)
normalizeProperties(properties)

createProperty(kind, input?)
convertProperty(property, nextKind)

parsePropertyDraft(property, draft)
displayPropertyValue(property, value)
searchPropertyValue(property, value)
comparePropertyValues(property, left, right)
matchPropertyFilter(property, value, rule)
groupPropertyValue(property, value, mode)
```

option family 额外提供：

```ts
listOptions(property)
getOptionById(property, id)
findOptionByToken(property, token)
listOptionSections(property)
```

### 原则

- 所有 public API 都吃 normalized schema
- 名字表达动作，不表达历史层级

---

## 2. react/property

```ts
getPropertyRenderer(property)
getPropertyEditor(property)
getPropertySchemaSections(property)
```

不要再暴露以旧 kind 为中心的多入口工厂。

---

## 重写顺序

## 第一阶段：先定新模型，不做桥接

1. 定义新的 `PropertySchema` union。
2. 定义新的 `PropertyValue`、`OptionItem`、`DateValue`、`AssetValue`。
3. 移除 `config`、`config.type`、`key`、旧 kind 枚举。
4. 同步重写 command contracts。

这一阶段结束后，编译大面积报错是正常的。

### 第一阶段详细实施

目标：

- 让仓库里的核心类型名和字段名先统一到最终词汇表
- 允许大量编译错误，但禁止继续新增旧模型调用点

建议动作：

1. 新建 `dataview/src/core/field/model.ts`
2. 在 `model.ts` 中写入最终 `PropertySchema` / `PropertyValue` / `DateValue` / `FlatOptionItem` / `StatusOptionItem`
3. 新建 `dataview/src/core/field/ids.ts`
4. 把 `PropertyId`、`RecordId` 这类基础 ID 类型从旧 state 定义中收敛到新入口
5. 在 `dataview/src/core/contracts/state.ts` 标记旧 `GroupPropertyConfig`、旧 option 结构为待删
6. 在 command contracts 中把 `property.create`、`property.replaceSchema`、`property.option.*` 的输入结构切换到新 schema 语义
7. 明确删除 `TITLE_PROPERTY_ID` 的新引用，禁止新代码再依赖 title fake property

本阶段建议新增文件：

- `dataview/src/core/field/model.ts`
- `dataview/src/core/field/ids.ts`
- `dataview/src/engine/command/property/model.ts`

本阶段不建议做的事：

- 不要去修 React 组件
- 不要试图保留新旧类型双向转换
- 不要做兼容旧 schema 的 adapter

本阶段完成标准：

- 仓库里已经存在一份唯一的最终 schema 类型定义
- 新增代码全部依赖新 schema 类型
- 已经没有“未来准备再改”的模糊词汇

本阶段验证：

- `rg "config.type|textKind|TITLE_PROPERTY_ID"` 的新增调用必须为 0
- 类型检查允许失败，但失败点应该集中在旧调用处，不应出现在新建文件里

---

## 第二阶段：重写 core/property

1. 建新的 `core/property/model.ts`。
2. 建新的 `core/property/kinds/*.ts`。
3. 建新的 `normalizeProperty`。
4. 重写 parse/display/search/compare/filter/group。
5. 删除旧 `schema/option/kind spec/runtime` 四层结构。

这一步完成后，core 层应该已经不再依赖旧概念。

### 第二阶段详细实施

目标：

- 把 property 的所有核心行为从旧 `schema/option/kind spec/runtime` 四层结构迁到新 `model + kinds` 结构
- 让 core 成为第一批完全切到新模型的区域

建议动作：

1. 新建 `dataview/src/core/field/normalize.ts`
2. 在 `normalize.ts` 中只放：
   - `normalizeProperty`
   - `normalizeProperties`
   - `convertProperty`
3. 新建以下 kind 文件：
   - `dataview/src/core/field/kinds/text.ts`
   - `dataview/src/core/field/kinds/url.ts`
   - `dataview/src/core/field/kinds/email.ts`
   - `dataview/src/core/field/kinds/phone.ts`
   - `dataview/src/core/field/kinds/number.ts`
   - `dataview/src/core/field/kinds/select.ts`
   - `dataview/src/core/field/kinds/multiSelect.ts`
   - `dataview/src/core/field/kinds/status.ts`
   - `dataview/src/core/field/kinds/date.ts`
   - `dataview/src/core/field/kinds/boolean.ts`
   - `dataview/src/core/field/kinds/asset.ts`
4. 每个 `kinds/*.ts` 文件只定义这个 kind 的：
   - 类型守卫
   - 默认值
   - normalize
   - convert
   - parseDraft
   - display
   - searchTokens
   - compare
   - matchFilter
   - group
5. 新建 `dataview/src/core/field/registry.ts`
6. 在 `registry.ts` 中只放 `propertyKinds`
7. 新建 `dataview/src/core/field/options.ts`
8. 在 `options.ts` 中只放 option family 共享行为：
   - `listOptions`
   - `getOptionById`
   - `findOptionByToken`
   - `listOptionSections`
   - `compareOptionOrder`
9. 新建 `dataview/src/core/field/index.ts`，重新定义 public API
10. 删除以下旧文件：
   - `dataview/src/core/field/schema/index.ts`
   - `dataview/src/core/field/option/index.ts`
   - `dataview/src/core/field/kind/spec.ts`
   - `dataview/src/core/field/kind/index.ts`

本阶段必须同批完成的改动：

- `parsePropertyDraft` 和 `displayPropertyValue` 必须一起迁
- option lookup 与 status section API 必须一起迁
- date/url 的 kind-specific getter 必须一起删

本阶段完成标准：

- core/property 没有任何旧 `config` 形状参与核心逻辑
- 所有 property 行为都能通过 `propertyKinds[kind]` 找到
- option / status 的共享逻辑已经从 schema 结构里抽离到实现层

本阶段验证：

- `rg "getPropertyConfig|getDatePropertyConfig|getUrlPropertyConfig|replacePropertyOptions|convertPropertyKindConfig" dataview/src/core`
- 上述结果应为 0
- 为每个 kind 补最小单测：
  - normalize
  - parseDraft
  - display
  - compare
  - group
- 为 option family 补共享单测：
  - order
  - token search
  - status sections
  - status category grouping

---

## 第三阶段：重写 engine

1. 重写 property validator。
2. 重写 property resolver。
3. 重写 option command resolver。
4. 让 command result 直接返回结构化结果。
5. 删除 service 层的结果推断逻辑。

### 第三阶段详细实施

目标：

- 让 engine command 系统直接消费最终 schema
- 让 property 变更结果由 command resolver 显式返回，而不是 service 层二次推断

建议动作：

1. 重写 `dataview/src/engine/command/property/validate.ts`
2. 删除其中所有针对 `config.type` 一致性的校验
3. 把 option 校验改成：
   - `select` 校验 flat options
   - `multiSelect` 校验 flat options
   - `status` 校验 status options
4. 重写 `dataview/src/engine/command/property/resolve.ts`
5. 把 property 更新接口收成：
   - `property.create`
   - `property.rename`
   - `property.replaceSchema`
   - `property.remove`
   - `property.duplicate`
   - `property.option.add`
   - `property.option.update`
   - `property.option.remove`
   - `property.option.reorder`
6. 删除 resolver 内部所有“根据旧 kind/config 推断”的流程
7. 新建 `dataview/src/engine/command/property/options.ts`
8. 把 option 相关 resolver 集中到 `options.ts`
9. 重写 `dataview/src/engine/services/properties.ts`
10. 让 service 直接消费 resolver 返回的结构化结果

建议的 command 返回结构：

```ts
type PropertyCommandResult =
  | {
      applied: true
      updatedProperty?: PropertySchema
      createdProperty?: PropertySchema
      createdOption?: FlatOptionItem | StatusOptionItem
      updatedOption?: FlatOptionItem | StatusOptionItem
    }
  | {
      applied: false
      issues: ValidationIssue[]
    }
```

本阶段必须同批完成的改动：

- validator 与 resolver 要同批迁移
- `engine/services/properties.ts` 必须跟着 resolver 一起迁
- option create/update/remove/reorder 的返回值要在一轮里定死，不要分批来回改

本阶段完成标准：

- engine 层不再知道 `config`
- engine 层不再知道 `kind='option' + mode`
- service 层不再通过“前后对比数组”推断新 option

本阶段验证：

- command 单测覆盖：
  - create property
  - replace schema
  - convert property
  - add/remove/reorder/update option
  - remove option 后记录值清理
  - status option category 校验
- `rg "config\\.|replacePropertyOptions|convertPropertyKindConfig|resolveOptionPropertyContext" dataview/src/engine`
- 上述结果应只剩历史注释或为 0

---

## 第四阶段：重写 React property UI

1. 按最终 kind 重写 value spec。
2. 重写 `select` / `multiSelect` / `status` editor，并只在真正值得复用的地方抽共享 helper。
3. 重写 option 相关 schema section，避免旧的 plain/status 分叉结构。
4. 改用结构化 draft。
5. 删除 React 层所有对 raw property config 的直接访问。

### 第四阶段详细实施

目标：

- React property UI 彻底改为消费 normalized schema
- 删除 React 层自己的 schema 修补和 option lookup 逻辑

建议动作：

1. 重写 `dataview/src/react/field/value/kinds/registry.tsx`
2. 改为直接按最终 `kind` 分发 renderer / editor
3. 删除 React 私有 `optionForValue`
4. 重写：
   - `dataview/src/react/field/value/kinds/select.tsx`
   - `dataview/src/react/field/value/kinds/multiSelect.tsx`
   - `dataview/src/react/field/value/kinds/status.tsx`
5. 三个文件共享内部 helper，但不通过二级 schema 抽象去统一
6. 重写 `OptionPickerEditor.tsx`
7. 判断它是否值得与 `StatusValueEditor.tsx` 共用内部列表组件：
   - 如果只是共享 query + keyboard + reorder，可以抽 `useOptionList`
   - 如果 UI 差异明显，就保持两个 editor 文件
8. 重写 schema editor：
   - `FieldOptionsSection.tsx`
   - `FieldStatusOptionsSection.tsx`
   - `FieldFormatSection.tsx`
9. 删除所有对 `getPropertyConfig` / `getDatePropertyConfig` / `getUrlPropertyConfig` 的 React 侧依赖
10. 让 value editor draft 使用最终 draft 形态：
   - `select: string | null`
   - `multiSelect: string[]`
   - `status: string | null`

本阶段建议保留但缩小的抽象：

- `renderEmpty`
- `useDraftCommit`
- 共享 keyboard helper
- 共享 option list hook

本阶段不建议继续保留的抽象：

- 只做一层 option lookup 的 helper
- 只为统一名字存在的 “option super component”
- 旧 `FieldValueSpec<any>` 风格的弱类型入口

本阶段完成标准：

- React 层不再直接读 raw config
- React 层所有 option lookup 都走 core option API
- multiSelect 不再通过逗号字符串保存 draft

本阶段验证：

- 交互回归：
  - select 选择已有 option
  - multiSelect 增删 option
  - status 按 category 显示与选择
  - 新建 option
  - 重命名 / 改色 / 删除 option
- `rg "optionForValue|getPropertyConfig|getDatePropertyConfig|getUrlPropertyConfig" dataview/src/react`
- 上述结果应为 0 或只剩 meta/测试描述

---

## 第五阶段：移除 title fake property

1. 把 title 挪到 record built-in field。
2. 删掉 title 在 property table 中的投影。
3. 重写 table/list/gallery/kanban/calendar 中 title 的使用路径。
4. 删除所有 `TITLE_PROPERTY_ID` 相关逻辑。

这是范围最大的一步，但长期收益也最大。

### 第五阶段详细实施

目标：

- 让 title 从 property system 中彻底退出
- 让 property system 只负责用户可配置字段

建议动作：

1. 修改 record 类型，把 `title` 提升为内建字段
2. 重写 document normalize，去掉 title property 注入逻辑
3. 重写 property validator，删除 title 特判
4. 重写 property resolver，删除 title 不可 convert/remove 的特判
5. 重写 view projection：
   - table
   - list
   - gallery
   - kanban
   - calendar
6. 在 view schema 中明确 title 的显示规则
7. 删除：
   - `TITLE_PROPERTY_ID`
   - `createTitleProperty`
   - `isTitlePropertyId`
   - title 相关 normalize 分支

本阶段完成标准：

- property table 内不再存在 title
- record 读写 title 与 property system 解耦
- view 层把 title 当作 built-in field 渲染

本阶段验证：

- 新建记录
- 修改 title
- table 第一列显示 title
- 复制 / 删除 / 排序 / 搜索 title
- `rg "TITLE_PROPERTY_ID|createTitleProperty|isTitlePropertyId" dataview/src`
- 上述结果应为 0

---

## 详细实施方案

这部分按“文件级重构蓝图”来写，目的是让执行时不需要再现场决定边界。

### A. 需要新增的核心文件

- `dataview/src/core/field/model.ts`
- `dataview/src/core/field/ids.ts`
- `dataview/src/core/field/normalize.ts`
- `dataview/src/core/field/registry.ts`
- `dataview/src/core/field/options.ts`
- `dataview/src/core/field/kinds/text.ts`
- `dataview/src/core/field/kinds/url.ts`
- `dataview/src/core/field/kinds/email.ts`
- `dataview/src/core/field/kinds/phone.ts`
- `dataview/src/core/field/kinds/number.ts`
- `dataview/src/core/field/kinds/select.ts`
- `dataview/src/core/field/kinds/multiSelect.ts`
- `dataview/src/core/field/kinds/status.ts`
- `dataview/src/core/field/kinds/date.ts`
- `dataview/src/core/field/kinds/boolean.ts`
- `dataview/src/core/field/kinds/asset.ts`
- `dataview/src/engine/command/property/model.ts`
- `dataview/src/engine/command/property/options.ts`

### B. 需要删除的核心文件

- `dataview/src/core/field/schema/index.ts`
- `dataview/src/core/field/option/index.ts`
- `dataview/src/core/field/kind/spec.ts`
- `dataview/src/core/field/kind/index.ts`

### C. 需要重写而不是修补的文件

- `dataview/src/core/contracts/state.ts`
- `dataview/src/core/field/index.ts`
- `dataview/src/core/field/value/index.ts`
- `dataview/src/engine/command/property/validate.ts`
- `dataview/src/engine/command/property/resolve.ts`
- `dataview/src/engine/services/properties.ts`
- `dataview/src/react/field/value/kinds/registry.tsx`
- `dataview/src/react/field/value/kinds/select.tsx`
- `dataview/src/react/field/value/kinds/multiSelect.tsx`
- `dataview/src/react/field/value/kinds/status.tsx`
- `dataview/src/react/field/value/editor/FieldValueEditor.tsx`
- `dataview/src/react/field/value/editor/pickers/option/OptionPickerEditor.tsx`
- `dataview/src/react/field/value/editor/pickers/status/StatusValueEditor.tsx`
- `dataview/src/react/field/schema/editor/FieldOptionsSection.tsx`
- `dataview/src/react/field/schema/editor/FieldStatusOptionsSection.tsx`
- `dataview/src/react/field/schema/editor/FieldFormatSection.tsx`

### D. 推荐的最终 public API 形状

```ts
export interface PropertyKindDef<TProperty extends PropertySchema> {
  kind: TProperty['kind']
  createDefault: (input?: Partial<TProperty>) => TProperty
  normalize: (input: unknown) => TProperty
  convert: (property: PropertySchema) => TProperty
  parseDraft: (property: TProperty, draft: unknown) => ParseResult
  display: (property: TProperty, value: unknown) => string | undefined
  searchTokens: (property: TProperty, value: unknown) => string[]
  compare: (property: TProperty, left: unknown, right: unknown) => number
  matchFilter: (property: TProperty, value: unknown, rule: FilterRule) => boolean
  group: {
    domain: (property: TProperty, mode: string) => GroupBucket[]
    entries: (property: TProperty, value: unknown, mode: string) => GroupBucket[]
  }
}
```

这不是要求实现时严格逐字一致，而是要求 public surface 满足以下结构特征：

- kind 行为定义集中
- normalize 是前置步骤
- group 行为挂在 kind 定义下
- 不再有横向散落的“半层 helper”

### E. 实施过程中的强规则

- 每迁一个 kind，就删掉对应旧 helper，不允许新旧并存超过一个阶段
- 不先写 façade 再慢慢迁，直接替换
- 不写兼容 schema 的 normalize 分支，旧数据由一次性迁移脚本处理
- 不为了“统一”把三个 option kind 再套回一个 schema 超类型
- 不为了“减少文件数”把多个 kind 塞回单个大文件

### F. 推荐的回归测试清单

- property create / rename / replace schema / remove
- select add option / remove option / reorder option
- multiSelect add option / remove option / reorder option
- status add option / move category / remove option
- filter:
  - text contains
  - select eq/in
  - multiSelect contains/in
  - status eq/in
- group:
  - select by option
  - multiSelect by option
  - status by option
  - status by category
  - number by range
  - date by month/year
- value editor:
  - select commit
  - multiSelect apply
  - status commit
  - date parse invalid
  - boolean toggle
- title:
  - create record
  - update title
  - title render in table/list/gallery

### G. 预计最容易返工的点

- option editor 是否真的值得统一成一套大组件
- status schema section 是否要单独保留独立文件
- asset accept 模型是否需要拆成更细的 union
- title 从 property table 中移除后，view 层的 built-in field 表达方式

这些点可以在实施时边做边定，但不应反向影响已经定死的 schema 决策。

## 实施约束

### 1. 不做兼容层

禁止：

- `legacyPropertyToNewProperty`
- `getPropertyConfigCompat`
- `statusOrOptionProperty`
- `old/new` 双实现同时保留

原因很简单：

- 兼容层会把旧概念长期留在系统里
- 这次重写的核心收益就是删除旧概念

---

### 2. 不做“先抽象一层包住旧实现”的过渡方案

很多重构会先加一层 façade，把旧代码包起来再慢慢迁。

这次不推荐这样做。

原因：

- 当前问题本来就是中间层太多
- 再加 façade 只会让中间层更多
- 最终还是要删，等于多走一遍弯路

---

### 3. 不保留无意义统一

例如：

- 为了让所有 property 都有 `config` 而保留 `config`
- 为了让所有 option 长得一样而保留可选 `category`
- 为了让所有 kind 名字更“平行”而保留 `checkbox/file/media`

这些“统一”都不是简化，而是噪音。

---

## 风险与取舍

## 1. 一次性变更会很大

这是确定的。

但这个系统如果继续在旧模型上修补，后面每加一个 property feature，复杂度都会继续堆。

如果现在明确追求长期最优，一次性重写比持续增量修补更划算。

---

## 2. title 脱离 property table 会波及 view 系统

这是最大外溢风险。

但它也是最值得做的结构性优化之一。

如果范围必须控制，可以把 title 拆出放到最后一阶段；  
如果完全不在乎成本，建议纳入本次总重写目标。

---

## 3. 合并 kind 后，部分 UI 命名需要同步变化

例如：

- `checkbox` -> `boolean`
- `file/media` -> `asset`

这会影响 meta、文案、菜单、icon 映射。

但这是正常且值得接受的成本。

---

## 最终结论

dataview property system 的长期最优解不是继续在现有结构上做“整理”，而是直接重写成：

- 更少的根概念和更直接的判别
- 没有 `config.type`
- 没有 `config` 包装层
- 没有 `kind='option' + mode` 这类二级 option 判别
- 没有 `textKind` 这类二级判别字段
- 没有 title fake property
- 没有多套 accessor 和 kind-specific getter

最终应收敛成一条非常明确的主线：

1. `PropertySchema` 是唯一 schema 模型。
2. `normalizeProperty` 是唯一归一化入口。
3. `propertyKinds[kind]` 是唯一行为定义入口。
4. React 和 engine 都直接消费 normalized schema。
5. option family 只在实现层复用，不再回写成 schema 的二级判别结构。

如果只用一句话概括这次重写目标，就是：

**把 property system 从“围绕旧历史结构不断补丁”改成“由少数清晰判别联合直接驱动的系统”。**
