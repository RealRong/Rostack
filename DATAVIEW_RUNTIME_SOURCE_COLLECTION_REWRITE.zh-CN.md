# DATAVIEW Runtime Source Collection Rewrite

## 1. 结论

`dataview-runtime` 里这类问题本质上是同一件事：

- `source` 只发布了低层的 `ids + keyed store`
- `model` 再到处把它们重组为 UI 真正需要的 ordered collection / list / picker option

这会带来三个直接后果：

- 同一种数据在多个 model 里重复物化
- identity reuse 逻辑分散，缓存策略不一致
- `model` 和 `source` 的职责边界变脏

长期最优应该一步到位改成：

- `source` 负责把 engine `snapshot + delta` 投影成“可直接消费”的 source
- `source` 不只发布 keyed read，还发布稳定复用的 collection/list store
- `model` 只做 UI 组合，不再重建 `FieldList / SectionList / ItemList / present list`
- `queryFields.ts` 这类 UI query editor helper 继续留在 `runtime`，但收回到 `page` 内部，不再作为 runtime public API

这不是要把逻辑抬到 `engine`。

相反，这是把“复杂度下沉到 runtime/source 底层”，让上层 `model` 和 React 更干净。

前提：

- 不考虑兼容和过渡
- 任何阻碍最终形态的旧 helper / 旧 export / 旧中间层都直接删

## 2. 当前问题归类

## 2.1 `table.ts` 在做 source adapter，不是在做 table model

[table.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table.ts) 里的：

- `buildGridItems`
- `buildFieldList`
- `buildSections`

本质都不是 table 专属 UI 规则，而是在把：

- `active.items`
- `active.fields`
- `active.sections`

从 source 的低层形态重新拼成上层 collection 形态。

其中：

- `buildFieldList` 最别扭，因为它连 `custom` 视图都在恢复，已经明显超出 table 自己的局部职责
- `buildSections` 次之，它是通用 active section collection 适配
- `buildGridItems` 也属于同类问题，只是 table 对它的直接依赖更强

结论：

- 这些逻辑不该留在 `model/table.ts`
- 但也不该回到 `engine`
- 它们应该下沉到 `runtime/source`

## 2.2 同类的 list 物化在多个 model 中重复出现

当前 runtime 里至少有下面几类重复物化：

- `page/api.ts`
  `doc.views -> views list`
- `gallery/api.ts`
  `active.sections -> section list`
- `kanban/api.ts`
  `active.sections -> section list`
- `card.ts`
  `active.fields.custom -> custom field list`
- `table.ts`
  `active.fields / sections / items -> richer collections`

它们都在做同一类工作：

- 从 source 的 `ids + keyed read`
- 还原成顺序稳定、可直接消费的列表或 collection

这说明问题不是 table 特例，而是 `source` 契约本身还不完整。

## 2.3 `createPresentListStore` 是 symptom，不是最终边界

[model/list.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/list.ts) 的 `createPresentListStore()` 方向不是错的，但它暴露出一个更深层的问题：

- 现在是 `model` 自己负责把 source 变成 list

如果这个 helper 继续存在，最终通常会出现两种情况：

- 要么越来越多 model 都依赖它
- 要么每个复杂一点的 model 都开始写自己版本的 reuse 逻辑

长期最优不是“保留一个更通用的 model helper”，而是：

- 让 `source` 直接发布这些 list / collection store

## 2.4 `queryFields.ts` 是 runtime 内部 helper，不应伪装成 public model

[queryFields.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/queryFields.ts) 做的是：

- filter / sort 当前占用字段提取
- picker 可选字段计算
- `sortAt(index)` 这种编辑态选项保留规则
- sorter 对应 field 查找

这不是 engine artifact，也不是 runtime 根级 public model。

它属于：

- page query editor 的内部派生规则

所以长期最优不是把它挪到 `engine`，而是：

- 继续留在 `runtime`
- 下沉到 `model/page` 内部
- 从 runtime 根出口删除

## 3. 最终边界

## 3.1 `engine` 的职责

`engine` 继续负责：

- domain snapshot
- delta
- mutation command
- artifact-shaped projection type，例如 `FieldList / SectionList / ItemList`

`engine` 不负责：

- store
- list store / collection store 发布
- query editor picker 规则

## 3.2 `runtime/source` 的职责

`runtime/source` 负责：

- 把 engine `snapshot + delta` 投影成 store
- 发布两类 UI read 能力

第一类是细粒度 keyed source：

- 单个实体订阅
- 单个 section / field / item 读取

第二类是稳定复用的 ordered collection / list store：

- `views list`
- `custom fields list`
- `sections collection`
- `fields collection`
- `items collection`

关键点：

- 所有 identity reuse 都收口在 `source`
- `model` 不再自己决定 collection 复用策略

## 3.3 `runtime/model` 的职责

`model` 只负责：

- 把 `source + session` 组合成 UI model
- 处理 UI 可见性、选中态、编辑态、route normalization、display option 组合
- 处理 page/query editor 这种明确属于 UI 的派生规则

`model` 不再负责：

- source list 物化
- source collection rebuild
- collection identity reuse

## 4. 最终 API

下面是建议的最终形态。

注意：

- 这是最终 API，不是过渡 API
- 只保留长期要稳定存在的字段

```ts
export interface DocumentSource {
  records: EntitySource<RecordId, DataRecord>
  fields: EntitySource<FieldId, CustomField> & {
    list: store.ReadStore<readonly CustomField[]>
  }
  views: EntitySource<ViewId, View> & {
    list: store.ReadStore<readonly View[]>
  }
}

export interface ActiveSource {
  view: {
    id: store.ReadStore<ViewId | undefined>
    type: store.ReadStore<View['type'] | undefined>
    current: store.ReadStore<View | undefined>
  }
  query: store.ReadStore<ActiveViewQuery>
  table: store.ReadStore<ActiveViewTable>
  gallery: store.ReadStore<ActiveViewGallery>
  kanban: store.ReadStore<ActiveViewKanban>
  records: {
    matched: store.ReadStore<readonly RecordId[]>
    ordered: store.ReadStore<readonly RecordId[]>
    visible: store.ReadStore<readonly RecordId[]>
  }
  items: ItemSource & {
    list: store.ReadStore<ItemList>
  }
  sections: SectionSource & {
    list: store.ReadStore<SectionList>
  }
  summaries: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
    list: store.ReadStore<FieldList>
    customList: store.ReadStore<readonly CustomField[]>
  }
}
```

这个 API 的核心是：

- keyed read 继续保留，保证细粒度订阅能力
- 常用 ordered collection/list 直接由 source 发布
- `FieldList / SectionList / ItemList` 这种 richer collection 不再由 `model/table.ts` 临时拼装

## 5. 各层最终落点

## 5.1 `source/createDocumentSource.ts`

这里直接发布：

- `doc.views.list`
- `doc.fields.list`

`page model` 以后直接读：

- `source.doc.views.list`

不再通过 `createPresentListStore()` 现拼。

## 5.2 `source/createActiveSource.ts`

这里直接发布：

- `active.items.list`
- `active.sections.list`
- `active.fields.list`
- `active.fields.customList`

并且这些 store 内部负责：

- 基于 `ids` 顺序构建 list / collection
- 复用上一次对象 identity
- 把当前 `buildFieldList / buildSections / buildGridItems` 的 reuse 逻辑收口到底层

## 5.3 `model/table.ts`

最终只保留 table 自己的 UI model：

- `grid`
  只是把 source 里的 ready-made collection 组合起来
- `view`
  table option / query / width / calc 组合
- `column`
  单列状态
- `summary`
  单 section summary

`table.ts` 不再包含：

- `buildGridItems`
- `buildFieldList`
- `buildSections`
- 任何 source collection rebuild 逻辑

## 5.4 `model/page/api.ts`

最终直接使用：

- `source.doc.views.list`
- `source.active.fields.customList`

只保留 page 自己的：

- query bar state
- settings route normalization
- active view / visible fields / hidden fields 组合
- query editor 可选字段派生

## 5.5 `model/gallery/api.ts` 与 `model/kanban/api.ts`

最终直接使用：

- `source.active.sections.list`
- `source.active.fields.customList`

不再各自创建：

- `sectionList`
- `customFields`

它们只保留各自视图专属的：

- body / board state
- section row projection
- card projection

## 5.6 `model/queryFields.ts`

最终不保留这个根级文件和根级出口。

长期最优是：

- 挪到 `model/page` 目录下
- 名字收敛成 `queryFieldOptions.ts` 一类
- 只给 page/query editor 内部使用

也就是说：

- 继续属于 `runtime`
- 但不属于 `runtime public API`

## 5.7 `model/list.ts`

最终删除。

如果 source 已经直接发布：

- `views.list`
- `fields.customList`
- `sections.list`

那么 `model/list.ts` 的存在价值就没了。

## 5.8 `model/card.ts`

这里保留真正 card 专属的内容：

- `createRecordCardPropertiesStore`
- `createItemCardContentStore`

删除不属于 card 领域的：

- `createActiveCustomFieldListStore`

因为 custom field list 以后来自：

- `source.active.fields.customList`

## 6. 是否要把这些 collection shape 继续沿用 engine 类型

我的判断是：可以继续沿用，不需要为了“去 engine 依赖”而额外发明 runtime 自己的一套同构类型。

也就是说：

- `FieldList`
- `SectionList`
- `ItemList`

这些 artifact-shaped collection type 可以继续来自 `engine/contracts`。

原因：

- 它们表达的是 active artifact 的只读集合形态
- 不是 mutation planner 细节
- 问题不在类型归属，而在“由谁来物化、由谁来发布”

所以长期最优不是重造一套 runtime collection type，而是：

- 继续用 engine 已有 artifact type
- 但由 `runtime/source` 负责发布 store

这样复杂度最小，边界也清楚。

## 7. 需要直接删除的旧实现

这次重构如果要做到最终形态，下面这些东西都不该保留：

- `model/list.ts`
- `table.ts` 里的 `buildGridItems`
- `table.ts` 里的 `buildFieldList`
- `table.ts` 里的 `buildSections`
- `card.ts` 里的 `createActiveCustomFieldListStore`
- `model/queryFields.ts`
- `runtime` 根出口里的 `query` export

同时需要把所有消费点直接切到新的 source API：

- `page/api.ts`
- `gallery/api.ts`
- `kanban/api.ts`
- `table.ts`
- 任何仍然自己从 `ids + keyed store` 现拼 list 的调用点

## 8. 落地顺序

这是实现顺序，不是过渡架构。

每一步完成后，都直接删除旧实现，不保留双轨。

### 阶段 1：补齐 source 契约

在 `createDocumentSource.ts` 和 `createActiveSource.ts` 里直接补齐最终 API：

- `doc.views.list`
- `doc.fields.list`
- `active.items.list`
- `active.sections.list`
- `active.fields.list`
- `active.fields.customList`

并把 collection reuse 逻辑一起下沉进去。

### 阶段 2：切掉 model 里的 collection rebuild

同步改：

- `model/page/api.ts`
- `model/gallery/api.ts`
- `model/kanban/api.ts`
- `model/table.ts`
- `model/card.ts`

把所有 list / collection rebuild 全部改成直接消费 source。

### 阶段 3：删除旧 helper 和错误出口

直接删除：

- `model/list.ts`
- `model/queryFields.ts`
- `card.ts` 里的 `createActiveCustomFieldListStore`

并移除 runtime 根出口里的：

- `query`

同时把 page query editor helper 下沉到 `model/page` 内部文件。

## 9. 最终判断

`buildFieldList`、`buildSections`、`buildGridItems` 这些函数的问题，不是“逻辑写错”，而是“出现在错误的层”。

同类问题的统一答案也一样：

- 不上提到 `engine`
- 不继续散落在 `model`
- 统一下沉到 `runtime/source`

最终状态应该是：

- `source` 已经是可直接消费的读边界
- `model` 不再承担 source adapter 工作
- `page` 的 query editor helper 留在 `runtime/page` 内部
- runtime public API 只暴露稳定的 source / session / workflow / model

这才是这组问题的一次性最终收敛。
