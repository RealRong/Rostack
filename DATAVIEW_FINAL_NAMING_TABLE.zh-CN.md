# Dataview 最终命名表

## 目标

这份表用于给 dataview 做最终命名定型，约束后续所有重构和新增代码。

目标只有四条：

1. 只保留一套主概念命名，避免 `field` / `property` 混用。
2. 去掉 `Group*` 前缀，避免把通用模型误导成某个特定视图或旧历史概念。
3. 让 `title` 成为真正的一等成员，而不是“特殊 property”。
4. 让类型名、变量名、API 名、UI 文案名尽量同构，减少映射成本。

## 总原则

### 1. 主概念统一叫 `field`

`field` 是系统内所有“可显示、可筛选、可排序、可分组、可编辑”的列单元总称。

包括：

- `title`
- `text`
- `number`
- `select`
- `multi-select`
- `status`
- `date`
- `boolean`
- `url`
- `email`
- `phone`
- `asset`

结论：

- 对外主模型统一叫 `Field`
- 集合统一叫 `fields`
- 标识统一叫 `fieldId`
- 查询条件统一用 `field`
- 视图显示统一用 `fieldIds`

### 2. `property` 不再作为上位概念

`property` 这个词天然暗示“用户自定义属性”。

但系统现在已经明确存在：

- `title` 这种系统内建字段
- 用户自己创建的字段

所以 `property` 不适合继续充当总概念。

最终策略：

- `property` 从主模型中退出
- 只在迁移期兼容层、旧测试、旧适配代码中短暂出现
- 新代码禁止把总概念命名为 `property`

### 3. 去掉 `Group` 前缀

`Group*` 会误导人以为这些类型只服务于 grouping 或某个旧系统边界。

实际上这些模型是 dataview 的核心基础模型，不应该带历史语义前缀。

最终策略：

- `GroupField` -> `Field`
- `GroupView` -> `View`
- `GroupRecord` -> `Record`
- `GroupSorter` -> `Sorter`
- `GroupFilterRule` -> `FilterRule`

如果某个名字过于通用，优先使用模块边界解决，而不是重新加 `Group` 前缀。

例如：

- `dataview/model/field.ts` 导出 `Field`
- `dataview/query/filter.ts` 导出 `FilterRule`
- `dataview/view/options.ts` 导出 `ViewOptions`

### 4. 类型名、变量名、API 名保持同构

禁止这种不一致：

- 类型叫 `Field`，变量叫 `property`
- 字段列表类型是 `Field[]`，变量叫 `properties`
- 查询结构里是 `field`，组件 prop 还是 `property`

最终要求：

- 类型是 `Field`，变量就叫 `field`
- 类型是 `Field[]`，变量就叫 `fields`
- 类型是 `FieldId`，变量就叫 `fieldId`

## 最终主词汇表

### 数据模型

| 旧命名 | 最终命名 | 说明 |
| --- | --- | --- |
| `GroupField` | `Field` | 总字段概念，唯一主概念 |
| `GroupProperty` | `UserField` 或直接删除 | 不再作为总概念；如必须区分“用户创建字段”，用 `UserField` |
| `GroupTitleField` | `TitleField` | 系统内建字段 |
| `GroupFieldId` | `FieldId` | 所有字段 id |
| `PropertyId` | `FieldId` 或 `UserFieldId` | 如果不再区分用户字段，可直接统一成 `FieldId` |
| `GroupFieldKind` | `FieldKind` | 字段种类 |
| `GroupPropertyKind` | `FieldKind` 或 `UserFieldKind` | 优先统一成 `FieldKind` |
| `GroupRecord` | `Record` | 记录 |
| `GroupView` | `View` | 视图 |
| `GroupDocument` | `Document` | 文档 |

### 查询模型

| 旧命名 | 最终命名 | 说明 |
| --- | --- | --- |
| `GroupFilterRule` | `FilterRule` | 单条筛选规则 |
| `GroupFilter` | `Filter` | 筛选集合 |
| `GroupSorter` | `Sorter` | 排序器 |
| `GroupSearch` | `Search` | 搜索条件 |
| `GroupGroupBy` | `Grouping` | 分组条件 |
| `group.field` | `grouping.field` 或 `group.field` | 类型名建议 `Grouping`，结构字段保留 `field` |
| `sorter.field` | `sorter.field` | 保持 |
| `rule.field` | `rule.field` | 保持 |
| `search.fields` | `search.fields` | 保持 |

### 视图模型

| 旧命名 | 最终命名 | 说明 |
| --- | --- | --- |
| `GroupViewOptions` | `ViewOptions` | 视图配置 |
| `GroupViewDisplayOptions` | `ViewDisplayOptions` | 显示配置 |
| `display.fieldIds` | `display.fieldIds` | 保持 |
| `table.widths` keyed by `GroupFieldId` | `table.widths` keyed by `FieldId` | 保持字段语义 |

### runtime / projection

| 旧命名 | 最终命名 | 说明 |
| --- | --- | --- |
| `PropertyList` | `FieldList` | 当前视图可见字段列表 |
| `Schema.properties` | `Schema.fields` | schema 应该表达字段，不是 property |
| `currentView.properties.all` | `currentView.fields.all` | 所有可见字段 |
| `currentView.properties.get(id)` | `currentView.fields.get(id)` | 按字段读取 |
| `toRecordField` | `toRecordField` | 保持，已经是正确词汇 |
| `ViewFieldRef` | `ViewFieldRef` | 保持 |
| `FieldId` | `FieldRef` 可选 | 若与标量 id 混淆，可把结构型 `FieldId` 改成 `CellRef` |

备注：

现在 runtime 里的 `FieldId` 实际上是一个二维单元格坐标：

- `appearanceId`
- `propertyId`

这其实不是“字段 id”，而是“单元格位置”。

长期最优建议：

| 现命名 | 推荐命名 | 原因 |
| --- | --- | --- |
| `FieldId` | `CellRef` | 它不是字段标识，而是一个 cell 引用 |
| `propertyId` in `FieldId` | `fieldId` | 内部成员也要统一 |

这是一个很关键的去歧义点。

## 最终类型设计建议

### 推荐总模型

```ts
type Field =
  | TitleField
  | TextField
  | UrlField
  | EmailField
  | PhoneField
  | NumberField
  | SelectField
  | MultiSelectField
  | StatusField
  | DateField
  | BooleanField
  | AssetField
```

### 推荐基础字段

```ts
type BaseField = {
  id: FieldId
  name: string
  kind: FieldKind
  meta?: Record<string, unknown>
}
```

### 推荐系统字段与用户字段分层

```ts
type SystemField = BaseField & {
  origin: 'system'
}

type UserField = BaseField & {
  origin: 'user'
}

type TitleField = SystemField & {
  kind: 'title'
}
```

说明：

- 不建议继续把 `title` 建模成 “property + 特判”
- 也不建议再额外保留 `system: true`
- 更统一的做法是 `origin: 'system' | 'user'`

这样可以在任何地方直接问：

- 这是 field 吗？一定是
- 这是系统字段还是用户字段？看 `origin`
- 这是哪种字段？看 `kind`

## 命名规则

### 类型命名

统一使用：

- `Field`
- `TitleField`
- `TextField`
- `StatusField`
- `FieldId`
- `FieldKind`
- `FieldList`
- `FieldRef`

避免使用：

- `GroupField`
- `GroupProperty`
- `PropertyId`
- `PropertyList`

### 变量命名

统一使用：

- `field`
- `fields`
- `fieldId`
- `visibleFields`
- `allFields`
- `groupField`

避免使用：

- `property` 但类型是 `Field`
- `properties` 但内容混有 `title`
- `propertyId` 实际上传的是 `title`

### 组件 Props

统一使用：

- `field: Field`
- `fields: readonly Field[]`
- `customField?: CustomField`
- `fieldId: FieldId`

避免使用：

- `property: Field`
- `properties: Field[]`

### 函数命名

统一使用：

- `getFieldById`
- `getFields`
- `getFieldDisplayValue`
- `parseFieldDraft`
- `resolveFieldPrimaryAction`
- `matchFieldFilter`
- `compareFieldValues`

避免使用：

- `getProperty*` 但允许传 `title`
- `resolveProperty*` 但允许传 `Field`

## 各层最终命名建议

### 1. core contracts

保留：

- `Field`
- `FieldId`
- `FieldKind`
- `Record`
- `View`
- `Document`

删除：

- `Group*`
- `Property*` 作为上位名词

### 2. document helpers

统一为：

- `getDocumentField`
- `getDocumentFields`
- `getDocumentFieldById`
- `isTitleFieldId`

不要再有：

- `getDocumentPropertyById`

### 3. query layer

统一为：

- `FilterRule`
- `Sorter`
- `Grouping`
- `Search`

字段名统一：

- `rule.field`
- `sorter.field`
- `group.field`
- `search.fields`

### 4. projection/runtime

统一为：

- `FieldList`
- `currentView.fields`
- `schema.fields`

并把当前的二维单元格结构改名：

- `FieldId` -> `CellRef`

### 5. React 组件

统一为：

- `FieldPicker`
- `FieldValueRenderer`
- `FieldValueEditor`
- `FieldValueContent`
- `FilterFieldPicker`

如果暂时不改组件目录名，也至少要求 props 和内部变量统一为 `field`。

### 6. schema editor

如果还需要表达“可管理的用户字段”，建议统一叫：

- `FieldSchemaEditor`
- `UserFieldEditor`
- `FieldKindPicker`

而不是继续：

- `FieldSchemaEditor`
- `FieldKindPicker`

## 允许保留 `property` 的唯一场景

只有一种情况允许保留 `property`：

当你明确在处理“旧兼容层”或“外部协议兼容字段名”时。

例如：

- 兼容旧 JSON 输入
- 兼容旧 command payload
- 兼容旧测试夹具

这时可以在边界层短暂保留：

```ts
const legacyPropertyIds = input.propertyIds
const fieldIds = normalizeLegacyPropertyIds(legacyPropertyIds)
```

但进入系统内部后，必须立即转成 `field` 词汇。

## 禁止项

以下写法一律禁止继续新增：

- `property: Field`
- `properties: Field[]`
- `getPropertyX(field)`
- `resolvePropertyX(field)`
- `PropertyList` 里包含 `title`
- `propertyId` 变量中传入 `title`

## 最终推荐迁移顺序

### Phase 1: 先统一词汇，不改行为

只做命名统一：

- `property` prop 改 `field`
- `properties` 集合改 `fields`
- `propertyId` 改 `fieldId`

### Phase 2: 再统一类型

- `GroupField` -> `Field`
- `GroupRecord` -> `Record`
- `GroupView` -> `View`

### Phase 3: 最后清掉 `Group` 和 `Property` 历史壳

- 删除旧导出
- 删除旧命名别名
- 测试和 demo 全部改成新词汇

## 最终结论

最终应当只有这一套主语言：

- 一切列单元都叫 `field`
- `title` 是 `system field`
- 其余是 `user field`
- 所有 query/display/runtime/react 主链路都只说 `field`
- `group` 前缀全部去掉

最重要的一条：

> 不要再让“类型是 field，变量却叫 property”继续存在。

这是整个系统最容易反复长回复杂度的源头。
