# Dataview API 参数与命名审查

## 范围

本轮只看三件事：

1. API 参数形状是否统一。
2. API 命名是否冗长、重复、泄漏上下文。
3. 是否存在纯转发或几乎纯转发的中间层，可以直接删掉。

本轮不讨论：

1. 业务逻辑是否正确。
2. 性能实现。
3. 内部算法与 store 细节。

审查范围覆盖：

- `@dataview/core`
- `@dataview/engine`
- `@dataview/runtime`
- `@dataview/react`
- `@dataview/table`

重点看 package export 和跨包高频调用的半公共 API，包括：

- `dataview/packages/dataview-core/src/contracts/*`
- `dataview/packages/dataview-core/src/*/index.ts`
- `dataview/packages/dataview-engine/src/contracts/*`
- `dataview/packages/dataview-runtime/src/contracts.ts`
- `dataview/packages/dataview-runtime/src/source/contracts.ts`
- `dataview/packages/dataview-runtime/src/model/*`
- `dataview/packages/dataview-react/src/index.ts`

## 总结结论

Dataview 现在最主要的问题不是“单个名字不好”，而是 **同一个语义层上有多套入口、同一种动作有多种参数风格、同一类对象在不同包里命名粒度不一致**。

最值得先收口的点有六个：

1. `engine` 顶层 surface 明显重复，`core/read/domain` 三套入口里有大量同义 API。
2. `document` / `document reader` / `engine read` 之间有多层只换位置不增语义的封装。
3. `view.options` 和 `view.layout` 实际在描述同一类东西，但被拆成了两个命名体系。
4. 同样是“改一部分”，有的叫 `patch`，有的叫 `update`，有的叫 `changeType`，有的叫 `convert`。
5. 参数风格混乱，既有 `(id, patch)`，又有 `(id, beforeId?)`，又有 `(ids, target)`，又有 `input: { ... }` 包一层。
6. runtime/react 里很多名字仍然带着上层上下文，例如 `activeView`、`DataViewGalleryModel`、`initialPage`，读起来比必要的长。

长期最优不是继续“局部微调命名”，而是先立一套统一规则，然后按层收口。

## 统一规则

### 1. 命名作用域优先

如果 API 已经通过 namespace 表达了实体类型，参数名就不要继续重复实体名。

建议：

- `views.get(id)`，不要再强调 `viewId`
- `fields.rename(id, name)`，不要再强调 `fieldId`
- `filters.patch(id, patch)`，不要再强调 `ruleId`

但 **关系字段** 仍然保留显式 `xxxId`，因为它们不是当前实体自己的 id，而是引用别的实体。

应该保留：

- `FilterRule.fieldId`
- `SortRule.fieldId`
- `ViewGroup.fieldId`
- `ItemPlacement.sectionId`

也就是：

- API 参数名可以收短为 `id`
- 数据模型里的引用字段不要盲目收短

### 2. 参数形状规则

建议统一成下面这套：

1. 一个主实体 id，加一个直接值，保持 positional。
2. 一个主实体 id，加一个 patch，保持 `(id, patch)`。
3. 涉及两个以上实体 id，或者有三个以上参数，或者未来明显会继续扩展，改成 object。
4. “全量替换顺序”不要叫 `move`/`reorder`，应该叫 `setOrder` 或 `replaceOrder`。
5. “相对移动”才叫 `move`，并且目标统一用 object 表达。

示例：

```ts
views.rename(id, name)
fields.patch(id, patch)
history.undo()

sort.move(id, { before })
display.move(ids, { before })
items.move(ids, { section, before })
table.insertField({ anchor, side, name, kind })
```

### 3. 语义动词统一

- 局部修改统一叫 `patch`
- 整体替换统一叫 `replace`
- 设值统一叫 `set`
- 类型/种类切换统一叫 `setKind` 或 `changeKind`
- 相对位置变化统一叫 `move`
- 全量顺序替换统一叫 `setOrder` / `replaceOrder`

不要混用：

- `patch` / `update`
- `changeType` / `convert`
- `reorder` / `move`

### 4. 删掉纯转发层

如果一层 API 只是把另一个 API 改个挂载位置或改个小名字，而没有新增语义、校验、缓存、派生，就应该删。

## 一、最该先删的重复 public surface

### 1. `engine.core`、`engine.read`、顶层 domain API 明显重叠

相关文件：

- `dataview/packages/dataview-engine/src/contracts/api.ts`
- `dataview/packages/dataview-engine/src/contracts/core.ts`
- `dataview/packages/dataview-engine/src/api/read.ts`
- `dataview/packages/dataview-engine/src/createEngine.ts`

当前重复关系：

```ts
engine.read.record(id)
engine.records.get(id)

engine.read.field(id)
engine.fields.get(id)

engine.read.view(id)
engine.views.get(id)

engine.dispatch(actions)
engine.core.commit.actions(actions)

engine.document.replace(doc)
engine.core.commit.replace(doc)

engine.history.undo()
engine.core.commit.undo()

engine.history.canUndo()
engine.core.history.canUndo()
```

这套 surface 最大的问题不是多几个方法，而是使用者根本不知道：

- 哪一层是正式 public
- 哪一层是低层 escape hatch
- 哪一层只是历史残留别名

### 建议最终形态

保留一套根级 API 即可：

```ts
engine.result()
engine.subscribe(listener)
engine.dispatch(actions)

engine.document.get()
engine.document.replace(doc)

engine.views.list()
engine.views.get(id)
engine.views.open(id)

engine.fields.list()
engine.fields.get(id)

engine.records.get(id)
engine.records.create(...)
engine.records.remove(...)

engine.active
engine.history
engine.performance
```

直接删除：

- `engine.core`
- `engine.read`

如果确实要保留“底层结果流”概念，也应该提升成顶层：

```ts
engine.result()
engine.subscribe(...)
```

而不是再挂一个 `core`。

## 二、`document` / `reader` / `entityTable` 的别扭层次

### 1. `document.fields` 读写作用域不一致

相关文件：

- `dataview/packages/dataview-core/src/document/fields.ts`

当前问题：

- `document.fields.get()` 是“所有字段”读接口，包含 title
- `document.fields.put/patch/remove()` 实际只支持 custom field
- 同时又存在 `document.fields.custom.put/patch/remove()`

这会造成一个很别扭的 public 语义：

- `fields` 看上去像“全字段命名空间”
- 但写入其实偷偷退化成“只写 custom field”

### 建议最终形态

拆成显式双层：

```ts
document.fields.all.list()
document.fields.all.ids()
document.fields.all.get(id)
document.fields.all.has(id)

document.fields.custom.list()
document.fields.custom.ids()
document.fields.custom.get(id)
document.fields.custom.has(id)
document.fields.custom.put(field)
document.fields.custom.patch(id, patch)
document.fields.custom.remove(id)

document.fields.title.get()
document.fields.title.isId(id)
```

至少要做到：

- `all` 只读
- `custom` 读写
- 不要再让 `document.fields.put` 这种看似全量、实际半量的 API 存在

### 2. `document.table` 这个名字不对

相关文件：

- `dataview/packages/dataview-core/src/document/index.ts`
- `dataview/packages/dataview-core/src/document/table.ts`

`document.table` 实际不是“文档里的 table 视图”，而是 `entityTable` 辅助工具。

这是明显的名字误导。

### 建议最终形态

- 从 `document` 命名空间里移除 `table`
- 直接导出 `entityTable`
- 如果它本质上是通用工具，进一步下沉到 shared 层，而不是继续挂在 `document.*`

### 3. `DocumentReader` 有一半是纯转发

相关文件：

- `dataview/packages/dataview-engine/src/document/reader.ts`

`DocumentReader.records.get/list/ids/has`、`fields.get/list/ids/has`、`views.get/list/ids/has` 基本只是把 `document.records.*` / `document.fields.*` / `document.views.*` 重包了一层。

它真正额外提供的价值只有：

- `views.activeId()` / `views.active()`
- `records.normalize(...)`
- `createDocumentReadContext(...)` 产出的缓存集合

### 建议最终形态

两种路径里选一种，不要混着留：

1. 要么保留 reader，但删掉纯转发 entity reader，只保留真正新增语义的 helpers。
2. 要么直接保留 `DocumentReadContext`，删掉 `DocumentReader` 这一层对象式 facade。

当前这种“reader 看起来像核心 abstraction，实际一半只是套壳”的状态不够干净。

## 三、`view.options` 与 `view.layout` 应该收成一套语言

相关文件：

- `dataview/packages/dataview-core/src/view/index.ts`
- `dataview/packages/dataview-core/src/view/options.ts`

当前问题：

- `view.options.defaults/clone/same/normalize`
- `view.layout.gallery.clone/normalize/patch`
- `view.layout.kanban.clone/normalize/patch`
- `view.options.cloneTable`

也就是：

- `options` 在做 layout
- `layout` 也在做 layout
- table 还单独特判

这是同一领域被拆成两套词汇。

而且 `view.options.defaults(type, fields)` 里的 `fields` 现在根本没被使用，属于无意义参数。

### 建议最终形态

只保留一套 `view.layout`：

```ts
view.layout.defaults(type)
view.layout.normalize(type, value)
view.layout.clone(type, value)
view.layout.same(type, left, right)

view.layout.table.patch(layout, patch)
view.layout.gallery.patch(layout, patch)
view.layout.kanban.patch(layout, patch)

view.display.defaults(type, fields)
```

也就是：

- `options` 从 public 语言里去掉
- `display` 的默认值另立一处
- `defaults(type, fields)` 去掉无意义 `fields`

## 四、record / row / field kind / type 这类名词必须统一

### 1. `RowCreateInput` / `RowInsertTarget` 应改成 `Record*`

相关文件：

- `dataview/packages/dataview-core/src/contracts/actions.ts`
- `dataview/packages/dataview-core/src/contracts/operations.ts`

当前仓里主语基本都是 `record`，这里只剩：

- `RowCreateInput`
- `RowInsertTarget`

这会制造无意义的双词汇系统。

### 建议最终形态

- `RowCreateInput` -> `RecordCreateInput`
- `RowInsertTarget` -> `RecordInsertTarget`

### 2. `changeType` / `convert` / `kind` 三套词汇混用

相关文件：

- `dataview/packages/dataview-engine/src/contracts/api.ts`
- `dataview/packages/dataview-core/src/contracts/actions.ts`

字段领域的真实 discriminator 叫 `kind`，但对外 API 和 action 里同时有：

- `fields.changeType(...)`
- `field.convert`
- `kind`

### 建议最终形态

字段统一用 `kind` 语言：

```ts
fields.setKind(id, kind)
```

action 也统一：

```ts
{ type: 'field.setKind', id, kind }
```

不要再混 `type` / `convert`。

视图仍然可以保留 `type`，因为 `View.type` 已经是领域主词。

## 五、active API 的参数形状需要统一

相关文件：

- `dataview/packages/dataview-engine/src/contracts/view.ts`
- `dataview/packages/dataview-engine/src/active/api/query.ts`
- `dataview/packages/dataview-engine/src/active/api/layout.ts`
- `dataview/packages/dataview-engine/src/active/api/records.ts`
- `dataview/packages/dataview-engine/src/active/api/items.ts`

### 1. `active.records.create` 的 `set` 命名不对

当前：

```ts
active.records.create({
  sectionId?: SectionId
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
})
```

问题：

- `set` 在这里不是“动作”，而是“初始字段值”
- `engine.records.create` 用的是 `values`
- 同一语义出现了 `set` / `values` 两套命名

### 建议最终形态

```ts
active.records.create({
  section?: SectionId
  before?: ItemId
  values?: Partial<Record<FieldId, unknown>>
})
```

也就是：

- `sectionId` -> `section`
- `set` -> `values`

### 2. `MoveTarget.sectionId` 可以收成 `section`

相关文件：

- `dataview/packages/dataview-engine/src/contracts/shared.ts`

在 `items.move(...)` 的 target 对象里，`sectionId` 太重了，因为 `MoveTarget` 已经是移动目标上下文。

建议：

```ts
interface MoveTarget {
  section: SectionId
  before?: ItemId
}
```

同理，`plan.target.beforeItemId` / `beforeRecordId` 这种字段如果继续对外暴露，也可以进一步收敛。

### 3. `display.move` / `sort.move` 应统一成 object target

当前：

```ts
sort.move(id, beforeId?)
display.move(fieldIds, beforeFieldId?)
items.move(itemIds, target)
```

三种 move 的参数风格完全不同。

### 建议最终形态

```ts
sort.move(id, { before? })
display.move(ids, { before? })
items.move(ids, { section, before? })
```

这样：

- 相对移动统一都是 `move(..., { before })`
- 只有 `items.move` 多一个 `section`

### 4. `table.insertFieldLeft/Right` 不值得保留成两个 API

当前：

```ts
table.insertFieldLeft(anchorFieldId, input?)
table.insertFieldRight(anchorFieldId, input?)
```

这里只有一个语义差异：`side`。

### 建议最终形态

```ts
table.insertField({
  anchor: fieldId,
  side: 'left' | 'right',
  name,
  kind
})
```

## 六、fields / options / record fields 这几组 API 可以继续合并

### 1. `fields.update` 应改名为 `fields.patch`

相关文件：

- `dataview/packages/dataview-engine/src/contracts/api.ts`

当前 public surface：

```ts
fields.update(id, patch)
```

但仓里绝大多数同义动作都叫 `patch`。

建议直接统一成：

```ts
fields.patch(id, patch)
```

### 2. `fields.options.append` 与 `fields.options.create` 可以合并

相关文件：

- `dataview/packages/dataview-engine/src/api/fields.ts`

当前：

```ts
fields.options.append(fieldId)
fields.options.create(fieldId, name)
```

本质上都是“创建 option”，只是一个有 name，一个没有。

### 建议最终形态

```ts
fields.options.create(fieldId, input?)
```

其中：

- 不传 name = append 默认项
- 传 name = 显式创建

### 3. `fields.options.update` 应改成 `patch`

当前：

```ts
fields.options.update(fieldId, optionId, patch)
```

这里是典型 partial update，不应该叫 `update`。

建议：

```ts
fields.options.patch({
  field: fieldId,
  option: optionId,
  patch
})
```

这里我更倾向直接改成 object，因为已经同时涉及：

- field id
- option id
- patch

继续 positional 会越来越难读。

### 4. `fields.options.reorder` 实际不是 reorder，而是 setOrder

当前：

```ts
fields.options.reorder(fieldId, optionIds)
```

但参数是“完整顺序数组”，不是“相对移动操作”。

建议：

```ts
fields.options.setOrder(fieldId, optionIds)
```

或者：

```ts
fields.options.replaceOrder(fieldId, optionIds)
```

## 七、action / operation 命名需要彻底统一

相关文件：

- `dataview/packages/dataview-core/src/contracts/actions.ts`
- `dataview/packages/dataview-core/src/contracts/operations.ts`

### 1. type 名字与 payload key 的作用域重复

当前：

```ts
{ type: 'view.patch', viewId, patch }
{ type: 'field.patch', fieldId, patch }
{ type: 'view.open', viewId }
```

建议：

```ts
{ type: 'view.patch', id, patch }
{ type: 'field.patch', id, patch }
{ type: 'view.open', id }
```

只有在同一个 payload 内同时存在多种实体 id 时，才保留显式命名：

```ts
{ type: 'field.option.patch', field, option, patch }
```

### 2. `field.option.update` / `field.patch` 语言不统一

建议 action 也统一成：

```ts
field.option.patch
```

### 3. `external.bumpVersion` / `external.version.bump` 冲突

当前：

- action 里是 `external.bumpVersion`
- operation 里是 `external.version.bump`

这类名字绝对不应该双轨存在。

建议统一成一条：

```ts
external.version.bump
```

或者更短：

```ts
external.bump
```

### 4. `record.fields.writeMany` action 与 operation 的 payload 结构不一致

当前：

action：

```ts
{ type: 'record.fields.writeMany', input: { recordIds, set, clear } }
```

operation：

```ts
{ type: 'document.record.fields.writeMany', recordIds, set, clear }
```

建议统一成同一种 payload 形状，不要一层包 `input`、另一层平铺。

如果坚持保留 `input`，那两边都保留。

如果坚持平铺，那两边都平铺。

## 八、runtime source / model 的名字还可以更短更稳

相关文件：

- `dataview/packages/dataview-runtime/src/source/contracts.ts`
- `dataview/packages/dataview-runtime/src/model/types.ts`
- `dataview/packages/dataview-runtime/src/model/page/types.ts`
- `dataview/packages/dataview-runtime/src/model/gallery/types.ts`
- `dataview/packages/dataview-runtime/src/model/kanban/types.ts`

### 1. `EngineSource.doc` 应改成 `document`

`doc` 是缩写，旁边却是完整单词 `active`。

这会导致 root shape 很不协调：

```ts
source.doc
source.active
```

建议：

```ts
source.document
source.active
```

### 2. `active.view.current` 太绕

当前：

```ts
active.view.id
active.view.type
active.view.current
```

这其实是在一个命名空间里又包了一层“view object”。

建议扁平化为：

```ts
active.view
active.viewId
active.viewType
```

也就是：

- store of current view 直接叫 `view`
- `id/type` 不要再塞进 `view.*`

### 3. `ItemSource.read.recordId/sectionId` 应与 engine `ItemList.read` 对齐

当前 runtime source：

```ts
items.read.recordId
items.read.sectionId
items.read.placement
```

engine `ItemList.read`：

```ts
items.read.record(...)
items.read.section(...)
items.read.placement(...)
```

这里最好统一语言，不要 source 一套、engine 一套。

建议 runtime source 也叫：

```ts
items.read.record
items.read.section
items.read.placement
```

### 4. `DataViewGalleryModel` / `DataViewKanbanModel` 前缀不一致

当前：

- `PageModel`
- `TableModel`
- `DataViewGalleryModel`
- `DataViewKanbanModel`
- `DataViewModel`

建议最终形态：

- `PageModel`
- `TableModel`
- `GalleryModel`
- `KanbanModel`
- `DataViewModel` 或 `RuntimeModel`

不要子类型带前缀、兄弟类型不带前缀。

### 5. `PageToolbar.activeView` / `activeViewId` 过长

相关文件：

- `dataview/packages/dataview-runtime/src/model/page/types.ts`

在 page model 作用域里，`activeView` 可以直接叫 `view`，`activeViewId` 可以直接叫 `viewId`。

建议：

```ts
PageToolbar.view
PageToolbar.viewId

PageQuery.view
PageSettings.view
```

而不是：

```ts
activeView
activeViewId
```

## 九、runtime / react 的创建与 session 命名还有一层可以收

相关文件：

- `dataview/packages/dataview-runtime/src/contracts.ts`
- `dataview/packages/dataview-runtime/src/runtime.ts`
- `dataview/packages/dataview-react/src/dataview/runtime.ts`
- `dataview/packages/dataview-react/src/dataview/provider.tsx`

### 1. `initialPage` 命名不准

当前：

```ts
createDataViewRuntime({ engine, initialPage })
createDataViewReactSession({ engine, initialPage })
<EngineProvider initialPage={...} />
```

这里传入的不是“页面本体”，而是 page session 初始状态。

建议改成：

- `page`
- 或 `pageSession`

例如：

```ts
createDataViewRuntime({ engine, page })
```

### 2. `EngineProvider` 实际提供的是 dataview runtime，不是 engine

当前 provider 名字会误导使用者以为 context 里只有 engine。

但它实际注入的是：

- engine
- runtime source
- runtime session
- react drag / marquee

建议：

```ts
DataViewProvider
```

### 3. `usePageRuntime` 名字不对

当前：

```ts
usePageRuntime()
```

返回的是 `model.page`，不是 runtime controller。

建议：

```ts
usePageModel()
```

## 十、selection API 有明显的“笛卡尔积式”膨胀

相关文件：

- `dataview/packages/dataview-runtime/src/selection/types.ts`
- `dataview/packages/dataview-runtime/src/selection/controller.ts`

当前：

```ts
command.ids.replace
command.ids.add
command.ids.remove
command.ids.toggle

command.scope.replace
command.scope.add
command.scope.remove
command.scope.toggle
```

而仓里已经有：

```ts
type SelectionApplyMode = 'replace' | 'add' | 'toggle'
```

### 建议最终形态

直接把 mode 提升成参数：

```ts
command.applyIds(mode, ids, options?)
command.applyScope(mode, scope, options?)
```

如果需要删除，`mode` 可以补上 `remove`，或者单独保留 `removeIds/removeScope`。

现在这种 2 x 4 的表格式 API 太膨胀，而且与 `SelectionApplyMode` 已经重复表达。

## 十一、`@dataview/table` 的 public utility 风格也不统一

相关文件：

- `dataview/packages/dataview-table/src/index.ts`
- `dataview/packages/dataview-table/src/reorder.ts`
- `dataview/packages/dataview-table/src/paste.ts`
- `dataview/packages/dataview-table/src/fill.ts`

### 1. 同一包里混用“对象导出”和“自由函数导出”

当前：

- `paste` 既导出对象，也导出 `planPaste`
- `fill` 只导出对象
- `reorder` 只导出自由函数

建议选一种：

- 要么全自由函数
- 要么全对象 namespace

我更倾向全自由函数，因为这批都是 stateless utility。

### 2. 参数风格不统一

当前：

```ts
columnBeforeId({ ... })
rowDragIds({ ... })
reorderRows(current, moving, beforeId?)
showRowHint(hint, rowIds, dragIds)
```

同一文件里已经是两套风格。

建议最终统一成 object：

```ts
reorderRows({ rowIds, movingIds, before })
showRowHint({ hint, rowIds, dragIds })
```

### 3. `rowBeforeId(hint)` 这种 getter 没必要暴露

这类 API 没有领域语义，只是取字段，属于纯噪音 surface。

直接删除。

## 十二、可以保留、暂时不用动的 API

下面这些 API 目前已经足够清晰，不建议为了“统一而统一”再改：

- `views.open(id)`
- `views.rename(id, name)`
- `search.set(query)`
- `history.undo() / redo() / clear()`
- `filters.patch(id, patch)`
- `sort.patch(id, patch)`
- `summary.set(fieldId, metric | null)`

判断标准很简单：

- 语义单一
- 参数少
- 未来扩展面不大
- 调用点读起来已经自然

## 建议实施顺序

### 第一阶段：先砍重复 surface

1. 删 `engine.read`
2. 删 `engine.core` 对外暴露
3. 给 `engine.document` 补 `get()`
4. 收紧 `document.fields` 的读写作用域
5. 移除 `document.table`

### 第二阶段：统一参数形状

1. `active.records.create` 改成 `{ section, before, values }`
2. `MoveTarget.sectionId` 改成 `section`
3. `display.move` / `sort.move` 改成 target object
4. `table.insertFieldLeft/Right` 合并
5. `fields.options.append/create/update/reorder` 收成一组一致 API

### 第三阶段：统一命名

1. `Row*` -> `Record*`
2. `changeType` / `convert` -> `setKind`
3. page model 里的 `activeView*` 收短
4. runtime source 的 `doc/current` 收短或扁平化
5. `DataViewGalleryModel` / `DataViewKanbanModel` 去掉多余前缀

### 第四阶段：清 selection / table 这种工具包的表面积

1. 收 selection command 的 apply API
2. 统一 `@dataview/table` 导出风格
3. 删除无语义 getter / facade

## 最终建议

如果目标是“长期最优、完全不在乎兼容成本”，那这轮最核心的不是继续调单个名字，而是先强制立下面三条线：

1. `engine` 只有一套 public surface，不允许同义入口并存。
2. 作用域已明确时，API 参数名默认用 `id/ids`，只有关系字段才保留 `fieldId/viewId/...`。
3. 所有 partial write 都叫 `patch`，所有 full order replace 都叫 `setOrder/replaceOrder`，所有 relative reorder 都叫 `move(..., { before })`。

只要这三条线先立住，后面的命名收短和中间层删除就会顺很多。
