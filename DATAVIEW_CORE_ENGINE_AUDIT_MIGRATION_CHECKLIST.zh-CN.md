# Dataview Core / Engine 审计迁移清单

日期：2026-04-14

## 落地状态

- 状态：已按本清单完成整轮迁移，不保留兼容层、过渡层或旧实现双轨。
- 完成日期：2026-04-14
- 验证结果：
  - `pnpm -C dataview typecheck`
  - `pnpm -C dataview test`
- 本轮已完成的关键收口：
  - 删除 `core/query/*` 与 `DocumentViewQuery`
  - 删除 `engine/document/*` 薄转发层
  - 收缩 `ViewSearchProjection.search`、`SortRuleProjection.fieldId`、`ViewGroupProjection.group`
  - 建立 `core/search` canonical token builder，并替换 `core` 与 `engine` 双份搜索文本逻辑
  - 合并 `planner/views.ts`、`mutate/validate/*`、`active/index/shared.ts`、`active/snapshot/*` 中的重复 helper 与 stage 骨架
  - 引入 ordered collection factory，统一 `FieldList / ItemList / SectionList` 的导航与索引逻辑
  - 回收 `document/table.ts`、`document/records.ts`、`document/fields.ts`、`document/views.ts` 中的 records-specialized 重复实现

## 审计范围

本轮只审计当前真实源码，而不是旧别名路径或构建产物。

- `dataview/packages/dataview-core/src`
- `dataview/packages/dataview-engine/src`

结论基于当前代码，不基于 `dataview/src/*`、`.tmp`、测试 dist 或历史文档。

## 总结结论

- 当前最明显的重复，不在 React，而在 `core` 与 `engine` 的边界处：`engine` 一边复写 `core` 已有的 clone / normalize / compare 逻辑，一边又为自己的 internal state 再包一层 public projection。
- 当前最明显的不必要中间层有三类：
  - `core/query` 这条线，实际上只是把 `View` 已经扁平存在的 `search / filter / sort / group` 再包成一份 `DocumentViewQuery`。
  - `engine/document/*` 这条线，基本是对 `@dataview/core/document` 的薄转发。
  - `engine/contracts/internal.ts` 与 `engine/contracts/shared.ts` 之间多组同构类型，很多只是“同一份数据的缓存态”和“发布态”两份声明。
- 当前最值得优先回收的重复逻辑有四类：
  - view patch / normalize / compare 的重复实现
  - search token 构建与默认可搜索字段判定的重复实现
  - entity existence / target validation 的重复实现
  - index stage / snapshot stage 的重复流水线模板

## 迁移原则

- `core` 只保留 canonical contracts 和纯逻辑，不保留只为 `engine` 组装方便而生的再包装类型。
- `engine` 只保留 runtime、cache、commit、selector、public API，不再重复定义 `core` 已经稳定提供的领域 helper。
- 一份数据只允许有一份 canonical shape。
- 如果一个 type 只是在重复表达另一份 type 的同一组字段，它就不是 domain model，而是待删翻译层。

## 立即可删除或可收缩的中间层

### 1. 删除 `core/query` 作为独立包

当前位置：

- `dataview/packages/dataview-core/src/contracts/state.ts`
- `dataview/packages/dataview-core/src/query/index.ts`
- `dataview/packages/dataview-core/src/query/normalize.ts`
- `dataview/packages/dataview-core/src/query/equality.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`

当前问题：

- `View` 已经直接拥有 `search / filter / sort / group`。
- `DocumentViewQuery` 只是把这四段字段重新包成一层对象。
- `normalizeViewQuery(...)` 当前唯一真实调用方是 `engine` 的 `planner/views.ts`。
- `isSameViewQuery(...)` 只是在重新组合 `sameSearch / sameFilter / sameSorters / sameGroup`。

迁移动作：

- [ ] 删除 `DocumentViewQuery`。
- [ ] 删除 `core/query/*` 整个包。
- [ ] 将 query normalize / compare 能力并回 `core/view`，或者直接让调用方组合 `core/search`、`core/filter`、`core/sort`、`core/group` 的 canonical helper。
- [ ] `planner/views.ts` 改为直接依赖 canonical helper，不再先拼出临时 query 对象。

完成标准：

- [ ] `rg "DocumentViewQuery|normalizeViewQuery|isSameViewQuery" dataview/packages` 结果为 0。

### 2. 删除 `engine/document/*` 薄转发层

当前位置：

- `dataview/packages/dataview-engine/src/document/activeView.ts`
- `dataview/packages/dataview-engine/src/document/fieldLookup.ts`
- `dataview/packages/dataview-engine/src/document/fields.ts`
- `dataview/packages/dataview-engine/src/document/records.ts`
- `dataview/packages/dataview-engine/src/document/views.ts`

当前问题：

- 这些文件绝大多数只是把 `@dataview/core/document` 再导一遍。
- `documentSelect.ts` 为了调用 selector factory，又额外引入了一层本地 read/list 包装函数。
- 这层没有新增语义，也没有做缓存、转换、校验或降噪。

迁移动作：

- [ ] `runtime/selectors/document.ts` 直接接收 `@dataview/core/document` 的函数。
- [ ] `api/documentSelect.ts` 直接引用 core 的 `getDocument* / hasDocument* / list*` helper。
- [ ] 删除 `engine/document/*` 目录。

完成标准：

- [ ] `engine` 内不再存在只返回 `core/document` 结果的 pass-through 文件。

## 重复逻辑迁移项

### 3. 回收 `planner/views.ts` 对 view helper 的重复实现

当前位置：

- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`
- `dataview/packages/dataview-core/src/search/state.ts`
- `dataview/packages/dataview-core/src/filter/state.ts`
- `dataview/packages/dataview-core/src/sort/state.ts`
- `dataview/packages/dataview-core/src/group/state.ts`
- `dataview/packages/dataview-core/src/view/state.ts`
- `dataview/packages/dataview-core/src/view/shared.ts`
- `dataview/packages/dataview-core/src/commit/semantics.ts`

重复点：

- `sameSearch`
- `sameFilter`
- `sameSorters`
- `sameGroup`
- `cloneSearch`
- `cloneFilter`
- `cloneSorters`
- `cloneGroup`
- `cloneDisplay`
- `sameFieldIds`

当前问题：

- `planner/views.ts` 在本地又实现了一套 query / group / display compare 与 clone。
- 这些规则在 `core` 已经有 canonical 版本，继续在 planner 里复制会造成语义漂移。
- `core/commit/semantics.ts` 已经依赖 canonical compare helper，但 planner 仍然在用本地版本。

迁移动作：

- [ ] `planner/views.ts` 统一改为调用 `core` 导出的 compare / clone helper。
- [ ] 缺失但本应属于 domain 的 helper，例如 `cloneSearch`，补到 `core`，不要继续留在 `engine` 私有文件。
- [ ] `sameViewOptions`、`sameCalc` 若后续仍被多个模块需要，补入 `core/view`；若只用于 planner，则收敛为最小本地 helper，不再复制 query/group/display 那几类已有能力。

完成标准：

- [ ] `planner/views.ts` 不再本地声明 query/filter/sort/group/display 的 clone / compare helper。

### 4. 合并 search token 构建逻辑

当前位置：

- `dataview/packages/dataview-core/src/search/execute.ts`
- `dataview/packages/dataview-engine/src/active/index/search.ts`

重复点：

- 默认可搜索字段判定
- field token 拼接
- all-fields token 拼接
- 文本归一化与 token 去重

当前问题：

- `core/search/execute.ts` 与 `engine/active/index/search.ts` 在维护两套“什么字段默认可搜索、如何把值转成搜索文本”的规则。
- 这类规则属于 domain 语义，不应该一份在 core，一份在 engine index。
- 一旦以后 `status / select / date / asset` 的搜索策略调整，两边很容易不同步。

迁移动作：

- [ ] 在 `core/search` 或 `core/field` 下抽出 canonical search text builder。
- [ ] `core/search/execute.ts` 和 `engine/active/index/search.ts` 都改为复用这套 builder。
- [ ] 只把 index-specific 的缓存与增量同步留在 `engine`。

完成标准：

- [ ] 默认可搜索字段判断只保留一份实现。
- [ ] record -> searchable text 的逻辑只保留一份实现。

### 5. 合并 entity existence / target validation

当前位置：

- `dataview/packages/dataview-engine/src/mutate/validate/entity.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/shared.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/records.ts`

重复点：

- record existence 校验
- field existence 校验
- view existence 校验
- batch target 非空校验
- `record.notFound` issue 构造

当前问题：

- `validateRecordExists / validateFieldExists / validateViewExists` 已存在。
- `planner/shared.ts` 又实现了 `validateTarget(...)`。
- `records.ts` 的 `lowerRecordRemove(...)` 还在第三次手写 `record.notFound` 循环。

迁移动作：

- [ ] 统一把 entity existence 与 target validation 收敛到 `mutate/validate/*`。
- [ ] `planner/shared.ts` 只保留 orchestration helper，不再负责业务校验。
- [ ] 所有 `record.notFound / field.notFound / view.notFound` issue 都经由统一 helper 产生。

完成标准：

- [ ] “Unknown record / field / view” 的 issue 文案与 path 生成逻辑只保留一套实现。

### 6. 合并 delta touched-record / touched-field 收集器

当前位置：

- `dataview/packages/dataview-engine/src/active/index/shared.ts`
- `dataview/packages/dataview-engine/src/active/index/records.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts`

重复点：

- touched record id 收集
- touched field id 收集
- `title` patch 是否纳入 field set 的判定

当前问题：

- `collectTouchedRecordIds(...)` 已经在 `active/index/shared.ts` 里实现。
- `records.ts` 仍有单独的 `collectUpdatedRecordIds(...)`。
- `summary/runtime.ts` 又局部构造了一份 `collectTouchedFields(...)`。

迁移动作：

- [ ] 将 delta 读取规则统一收敛到 `active/index/shared.ts`。
- [ ] `records.ts` 改为直接复用共享 touched collector。
- [ ] `summary/runtime.ts` 的 field 收集也改为共享 helper，只保留阶段特定的过滤条件。

完成标准：

- [ ] delta touched records / fields 的读取规则只定义一处。

### 7. 合并 index stage 的 build / ensure / sync 模板

当前位置：

- `dataview/packages/dataview-engine/src/active/index/search.ts`
- `dataview/packages/dataview-engine/src/active/index/sort.ts`
- `dataview/packages/dataview-engine/src/active/index/calculations.ts`
- `dataview/packages/dataview-engine/src/active/index/group/runtime.ts`
- `dataview/packages/dataview-engine/src/active/index/runtime.ts`

当前问题：

- `search / sort / calculations / group` 都在重复同一种 stage 模板：
  - build 初始 index
  - ensure 新 demand 被加载
  - sync 处理 delta
  - demand 变化时 rebuild，否则 sync + ensure
- `runtime.ts` 也在重复同一套 stage orchestration 分支。

迁移动作：

- [ ] 抽出统一 stage driver，最少统一 `ensure loaded fields / groups`、`should drop`、`should rebuild`、`should sync` 这类通用分支。
- [ ] `search / sort / calculations / group` 只保留各自真正不同的“单 field / 单 demand 的 build 与 sync”。
- [ ] `deriveIndex(...)` 改成表驱动或 stage descriptor，而不是手写四遍相同骨架。

完成标准：

- [ ] 新增 index stage 不需要复制 `build + ensure + sync + rev` 全模板。

### 8. 合并 snapshot stage 的 derive / publish / reuse 模板

当前位置：

- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/runtime.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/runtime.ts`

当前问题：

- 三个 stage 都在重复：
  - 解析 `DeriveAction`
  - 计时
  - derive internal state
  - reuse previous published result
  - 否则 publish public result
- 当前差异主要在 `resolveAction(...)` 与 `publish(...)`，生命周期骨架基本一致。

迁移动作：

- [ ] 抽出通用 snapshot stage runner。
- [ ] `query / sections / summary` 只保留 `resolveAction`、`deriveState`、`publishState`。
- [ ] 统一 publish reuse 判定与计时结构。

完成标准：

- [ ] `runQueryStage / runSectionsStage / runSummaryStage` 只剩各自领域差异，不再重复生命周期模板。

## 重复类型与待收缩 contracts

### 9. 合并 `QueryState` 与 `ViewRecords`

当前位置：

- `dataview/packages/dataview-engine/src/contracts/internal.ts`
- `dataview/packages/dataview-engine/src/contracts/shared.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/query/runtime.ts`

当前问题：

- `QueryState` 与 `ViewRecords` 都有同一组字段：
  - `matched`
  - `ordered`
  - `visible`
- `publishViewRecords(...)` 实际只是在把同一组三元数组重新包成 public shape。
- `visibleSet` / `order` 是 cache，不是另一份 domain shape。

迁移动作：

- [ ] 定义单一 canonical records state。
- [ ] 把 `visibleSet` 与 `order` 拆为 memo/cache 附属字段，而不是推动另一份 parallel type。
- [ ] 删除 `publishViewRecords(...)` 这种纯包装发布函数。

完成标准：

- [ ] `matched / ordered / visible` 三元结构只声明一次。

### 10. 合并 `SectionNodeState` 与 `Section`

当前位置：

- `dataview/packages/dataview-engine/src/contracts/internal.ts`
- `dataview/packages/dataview-engine/src/contracts/shared.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/derive.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts`

当前问题：

- `SectionNodeState` 与 public `Section` 绝大部分字段同构：
  - `key`
  - `title`
  - `color`
  - `bucket`
  - `recordIds`
  - `itemIds`
  - `collapsed`
- internal 只是多了 `visible`。
- 当前 publish 阶段的大量代码都在做“从一份 section node 复制成另一份 section”。

迁移动作：

- [ ] 把 section payload 抽成单一 canonical type。
- [ ] `visible` 改为独立 flag 或 section table 级状态，而不是复制整个 section shape。
- [ ] `buildSections(...)` 改为直接复用 canonical section payload，不再重组同样字段。

完成标准：

- [ ] section payload shape 只保留一份定义。

### 11. 收敛 `FieldList / ItemList / SectionList` 为通用集合协议

当前位置：

- `dataview/packages/dataview-engine/src/contracts/shared.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts`

当前问题：

- 三个 list 都在重复相似方法集合：
  - `ids`
  - `get`
  - `has`
  - `indexOf`
  - `at`
  - `range`
- `ItemList` 额外有 `prev / next`，但整体仍是 ordered lookup list。
- 当前 `createFields(...)`、`createItemList(...)`、`buildSections(...)` 都在重复索引与 range 逻辑。

迁移动作：

- [ ] 提供一个 generic ordered collection factory。
- [ ] `FieldList / ItemList / SectionList` 退化为对该 generic 协议的少量 specialization。
- [ ] `sameFieldList / sameItemList / sameSectionList` 也随之收敛。

完成标准：

- [ ] `get / has / indexOf / at / range` 的构造代码只保留一套。

### 12. 收缩 `ActiveViewQuery` 里的冗余 projection 字段

当前位置：

- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-engine/src/active/commands/items.ts`

当前问题：

- `ViewSearchProjection.search` 与 `query / fields / active` 重复表达同一事实。
- `SortRuleProjection.fieldId` 与 `sorter.field` 重复。
- `ViewGroupProjection.group` 与 `state.view.group` 重复；当前几乎只在 `items.ts` 中被拿来回推 group write。
- 这些字段把“raw source object”与“derived UI fields”同时塞进同一个 projection，使 public type 噪音增大。

迁移动作：

- [ ] `ViewSearchProjection` 删除 `search`，只保留 UI 真正读取的稳定字段。
- [ ] `SortRuleProjection` 删除 `fieldId`，统一以 `sorter.field` 读取。
- [ ] `ViewGroupProjection` 删除 `group`，需要 raw group 时从 `state.view.group` 读取。

完成标准：

- [ ] public projection 中每个字段都提供独立语义，不再存在镜像字段。

### 13. 合并 `SummaryState` 与 `ViewSummaries` 的发布边界

当前位置：

- `dataview/packages/dataview-engine/src/contracts/internal.ts`
- `dataview/packages/dataview-engine/src/contracts/shared.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/publish.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`

当前问题：

- internal `SummaryState` 与 public `ViewSummaries` 的区别主要是：
  - internal 保存 `SectionAggregateState`
  - public 再映射成 `CalculationCollection`
- 这层发布是有语义差异的，但当前 empty case 与 per-section publish 又扩出了一套额外包装。

迁移动作：

- [ ] 保留 aggregate state 与 UI collection 的边界，但消除 empty-case 的重复包装。
- [ ] `EMPTY_COLLECTION`、`EMPTY_AGGREGATES`、`emptySummaries()` 的职责重新归并。
- [ ] 若未来 UI 可直接消费 `CalculationCollection` 的 lazy getter，则考虑将 publish 步骤进一步压平。

完成标准：

- [ ] summary 的 empty / reuse / publish 规则不再在 internal、publish、contracts 三处重复声明。

## Core 内部重复与泛型化机会

### 14. 回收 `document/table.ts` 里的 record-specialized 重复

当前位置：

- `dataview/packages/dataview-core/src/document/table.ts`
- `dataview/packages/dataview-core/src/document/records.ts`
- `dataview/packages/dataview-core/src/document/fields.ts`
- `dataview/packages/dataview-core/src/document/views.ts`

当前问题：

- `cloneRecordTable(...)` 与 `normalizeRecordTable(...)` 与泛型版 `cloneEntityTable(...)`、`normalizeEntityTable(...)` 高度重复。
- `replaceDocumentFieldsTable(...)`、`replaceDocumentRecordsTable(...)`、`replaceDocumentViewsTable(...)` 也在重复同一种 document table replacement 模式。
- `records.ts` 的 `createRecordOverlay(...)` 与 `table.ts` 的 `createEntityOverlay(...)` 是同一类能力，只是特化到了 records。

迁移动作：

- [ ] 如果 record 的特殊点仅是 deep clone，改为泛型 helper 接受 clone 策略，而不是单独再维护一套 record 版本。
- [ ] 给 document 引入统一 table replace helper，避免 fields / records / views 三套相同骨架。
- [ ] 只把 record 独有的“value patch / clear / merge”留在 `records.ts`。

完成标准：

- [ ] `document/table.ts` 中不再同时维护“泛型版 + record 专版”的同类算法。

### 15. 收敛 field schema 的 normalize / validate 规则源

当前位置：

- `dataview/packages/dataview-core/src/field/schema/index.ts`
- `dataview/packages/dataview-engine/src/mutate/validate/field.ts`

当前问题：

- `normalizeCustomField(...)` 与 `validateFieldShape(...)` 在分别维护：
  - date enum 合法值
  - status option 结构
  - number format 规则
  - asset accept 规则
- 这类 schema 规则应有单一来源，否则 normalize 与 validate 极易出现“一个默认化、一个报错”的分叉。

迁移动作：

- [ ] 将 field schema 校验规则收敛为 `core` 的 canonical schema rule。
- [ ] `engine` 的 validator 改为消费 `core` schema rule 或 `core` validator 输出。
- [ ] 不再在 `engine` 里重复硬编码 enum 列表与字段 config 规则。

完成标准：

- [ ] field schema 的枚举合法值与 option shape 校验只保留一个规则源。

## 明确不应迁移的类型与逻辑

下面这些当前看起来不像“重复垃圾层”，不应为了去重而误抽：

- `RecordIndex`
- `SearchIndex`
- `GroupFieldIndex`
- `SortIndex`
- `CalculationIndex`
- `AggregateEntry`
- `ViewTrace / IndexTrace / SnapshotTrace`

原因：

- 它们不是同一份 domain data 的再包装，而是 runtime / cache / trace 专用结构。
- 它们的存在是为了性能或运行时观测，不是命名翻译层。

## 分阶段执行顺序

### Phase 1：先删除纯翻译层

- [ ] 删除 `core/query/*`
- [ ] 删除 `DocumentViewQuery`
- [ ] 删除 `engine/document/*`
- [ ] 收缩 `ViewSearchProjection.search`
- [ ] 收缩 `SortRuleProjection.fieldId`
- [ ] 收缩 `ViewGroupProjection.group`

### Phase 2：建立 canonical helper

- [ ] 把 `planner/views.ts` 用到的 canonical compare / clone helper 收回 `core`
- [ ] 把 search text builder 收回 `core`
- [ ] 把 field schema rule 收回 `core`

### Phase 3：合并同构 state / contracts

- [ ] 合并 `QueryState` 与 `ViewRecords`
- [ ] 合并 `SectionNodeState` 与 `Section`
- [ ] 收敛 `SummaryState` 与 `ViewSummaries` 的发布边界
- [ ] 引入 generic ordered collection factory

### Phase 4：清理 engine 写路径与索引模板

- [ ] 合并 entity validation
- [ ] 合并 touched-record / touched-field collector
- [ ] 抽 index stage driver
- [ ] 抽 snapshot stage runner

### Phase 5：回收 core document 重复

- [ ] 回收 `cloneRecordTable / normalizeRecordTable`
- [ ] 回收 `replaceDocument*Table`
- [ ] 回收 `createRecordOverlay`

## 最终验收规则

- [ ] `core` 中不再存在只把 `View` 局部字段重新包一层的新 contracts。
- [ ] `engine` 中不再存在对 `core/document` 的纯转发文件。
- [ ] query / section / summary 不再同时维护“同一 payload 的 internal/public 双份 type”。
- [ ] view/search/filter/sort/group/display 的 canonical helper 只保留一套实现。
- [ ] schema rule、search rule、delta touched-set rule 都只保留一套实现。
- [ ] 新增一个 view/index/snapshot 能力时，不需要再复制 stage 模板代码。
