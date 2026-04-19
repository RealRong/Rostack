# Dataview React TSX 组件优化审计

## 1. 审计目标

这份文档只审计 `dataview/packages/dataview-react/src/**/*.tsx`，目标不是机械地把状态“从 React 搬到 runtime”，而是回答四个更本质的问题：

1. 哪些领域派生确实应该上提到 `runtime/model`。
2. 哪些逻辑虽然重复，但更适合留在 React 层，抽成 presenter / helper / hook，而不是下沉 runtime。
3. 哪些组件本质是中间装配层，可以合并减少层级。
4. 哪些组件 props 过宽，应该改成内部订阅 runtime/context，或者把状态局部化。

## 2. 先定分层原则

这轮审计的关键不是找“哪里有 `useMemo` / `useState`”，而是先把分层边界定清楚。

### 2.1 应该进 runtime / model 的

适合进 runtime / model 的，一般满足至少一条：

- 是稳定的领域派生，不依赖具体 UI 文案。
- 被多个组件重复消费。
- 需要 keyed / coarse-grained 订阅，避免 React 层重复组合。
- 放在 React 里会导致多个组件重复扫描、重复建图、重复 invalidation。

典型例子：

- item / section / row / card 的稳定 projection
- view settings 的字段显示/隐藏集合
- sort/filter panel 的可选字段投影
- value editor resolved session model

### 2.2 不必进 runtime，但应该抽成 React presenter / helper 的

这类逻辑虽然重复，但本质仍是展示层：

- 强依赖 `t(...)` 翻译
- 主要输出是 label / summary / menu items
- 只在 1 到 2 个相关 panel 内复用
- 逻辑和 UI 展示策略绑定比较强

典型例子：

- group summary 文案
- group mode / bucket sort 的菜单选项
- route -> panel/component 映射

这类不应机械下沉到 runtime，应该抽成 React 侧共享 helper / presenter。

### 2.3 应该继续留在组件本地的

下面这些通常应该留在组件内：

- popover / submenu open 状态
- 输入 draft
- DOM ref / measurement
- focus / blur 之类 UI 瞬时状态
- 单个组件独占的过渡状态

原则：

- 短生命周期
- 不复用
- 不需要脱离 React
- 不值得做成 store graph

## 3. 总体判断

当前 `dataview-react` 的主要问题不是“局部组件写得长”，而是三条链上的职责边界还不够清晰：

- page / view settings 链
  - 还存在不少 panel 内部自己拼 projection 的情况。
- shared card / gallery / kanban 链
  - shared card 已经收敛过一轮，但 view 壳和 shared 布局之间仍有装配层。
- table body / row 链
  - 仍有不少 table-level 状态被上层算好后层层传给 Row / Block。

同时也要明确：

- 不是所有 panel 逻辑都该搬去 runtime。
- 很多真正应该做的，不是“上提”，而是“收敛重复逻辑”和“缩短 props 链”。

## 4. 按组件族审计

## 4.1 Page / View Settings

### A. `ViewFieldsPanel` 是当前最明显的“React 层重复建图”热点

文件：

- [ViewFieldsPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/ViewFieldsPanel.tsx)

当前组件内部组合了：

- `fieldMap`
- `visibleFields`
- `hiddenFields`
- `filteredVisibleFields`
- `filteredHiddenFields`
- `visibleMenuItems`
- `reorderVisibleItems`
- `hiddenItems`

这里的问题不只是“代码长”，而是：

- 可见/隐藏字段集合是明确的领域投影
- 多个 menu 列表都依赖同一批基础集合
- React 每次 render 都在 panel 内部重新拼完整读图

结论：

- `visible / hidden / canHideAll / reorderSource` 这类基础投影应上提到 runtime/page model。
- 但 `MenuItem` 本身不必进 runtime，因为它已经是 UI 结构。
- query 输入值仍留在组件本地。

长期最优形态：

- runtime 给出 fields panel source/model
- React 只做：
  - query
  - 文案翻译
  - Menu / Reorder 组装

优先级：

- P0

### B. `RootPanel` / `GroupingPanel` 的 group 逻辑需要“React 侧收敛”，不是 runtime 下沉

文件：

- [RootPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/RootPanel.tsx)
- [GroupingPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/GroupingPanel.tsx)

当前重复逻辑包括：

- `readGroupModeLabel(...)`
- `readBucketSortLabel(...)`
- `group summary`
- panel item suffix / item visibility

这里我修正结论：

- `group.summary`
- `group.modeOptions`
- `group.bucketSortOptions`
- `group.showInterval`
- `group.intervalText`

这些大多不该下沉到 runtime。

原因：

- 强依赖翻译
- 主要是 UI 展示语义
- 当前消费面很窄
- 放到 runtime 会把展示策略和领域模型耦死

更优做法：

- 抽成 React 侧共享 helper / presenter，例如：
  - `page/features/viewSettings/groupUi.ts`
  - 或 `useGroupPanelPresenter(...)`

runtime 只继续提供原始信息：

- `group.field`
- `group.mode`
- `group.availableModes`
- `group.bucketSort`
- `group.availableBucketSorts`
- `group.supportsInterval`
- `group.bucketInterval`

React presenter 负责：

- summary 文案
- menu option label
- panel item 列表

优先级：

- P1

### C. `SortPopover` / `SortRuleRow` 的基础投影值得上提，但行内 open 状态应保留本地

文件：

- [SortPopover.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/sort/SortPopover.tsx)
- [SortRuleRow.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/sort/SortRuleRow.tsx)

当前问题：

- popover 级和 row 级都在重复组合排序上下文
- `SortRuleRow` 同时依赖：
  - `sorter`
  - `sorters`
  - `fields`
  - `index`

这说明 row projection 还没成型。

结论：

- 这里适合上提到 runtime/page model 的，是基础读模型：
  - `sortPanel.availableAddFields`
  - `sortRow(index).field`
  - `sortRow(index).availableFields`
  - `sortRow(index).direction`
- 不适合上提的，是：
  - `fieldOpen`
  - `directionOpen`

优先级：

- P1

### D. `Toolbar` 更像“装配过重”，而不是“状态该下沉”

文件：

- [Toolbar.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/Toolbar.tsx)

当前问题：

- 一个组件同时承担：
  - view tabs
  - tab menu actions
  - search UI
  - add filter
  - add sort
  - settings trigger

这里真正的问题不是 runtime 不够，而是组件职责太多。

`searchExpanded` / `toolbarRoute` / `tabMenuViewId` 这种状态留在本地没有问题。

更优做法：

- 拆成更短的 React 子组件或 presenter：
  - `ToolbarTabs`
  - `ToolbarSearch`
  - `ToolbarQueryActions`

如果未来还要继续加 create record / bulk action，这步更值得先做。

优先级：

- P1

### E. `ViewSettingsPopover` 适合做面板注册表，不必做 runtime 化

文件：

- [ViewSettingsPopover.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/ViewSettingsPopover.tsx)

当前问题：

- `route.kind -> panel` 的 switch 全写在 host 里。

更优做法：

- 抽成静态 panel registry：
  - `route.kind -> { title, component }`

这属于 React 结构收敛，不是 runtime 设计问题。

优先级：

- P2

## 4.2 Shared Card / Gallery / Kanban

### A. `RecordCard` 本身已经比之前收敛，但还不是最终形态

文件：

- [RecordCard.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)

当前 props：

- `card`
- `content`
- `interaction`
- `appearance`
- `mount`

问题不在“有 5 个 props”，而在于：

- 上层 view 组件先拼完整大对象
- `RecordCard` 自己再在内部继续做：
  - `surfaceStyle`
  - `title`
  - `visibleProperties`
  - `properties`

结论：

- `RecordCard` 作为 shared layout 保留是合理的。
- 但它现在还同时承担了 shared presenter 的一部分职责。

更优做法：

- 不建议让 `RecordCard` 直接知道 gallery / kanban runtime。
- 但建议把 `interaction` / `appearance` / 部分 derived props 收成更稳定的 shared card presentation source。
- 也就是说，减少的不是字面 props 数量，而是减少“view 壳先拼对象再传”的模式。

优先级：

- P1

### B. `gallery/Card` / `kanban/Card` 仍是较薄的 view adapter

文件：

- [gallery/components/Card.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/components/Card.tsx)
- [kanban/components/Card.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/components/Card.tsx)

当前它们主要做：

- 读 `runtime.card`
- 读 `runtime.content`
- 拼 `interaction`
- 拼 `appearance`
- 拼 `mount`
- render `RecordCard`

判断：

- 这不是“必须删除”的冗余层。
- 但确实是可以继续收缩的装配层。

长期更优方向：

- 保留 view-specific `Card`
- 但把：
  - `appearance`
  - 可能还有 `interaction`
  变成 runtime/view source 或 shared presenter 输出

这样 adapter 层只剩 very thin read + render。

优先级：

- P1

### C. `Grid` 里创建临时 derived store 是当前 shared card 链上最不合理的一点

文件：

- [Grid.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/components/Grid.tsx)

当前有：

```ts
useStoreValue(useMemo(() => createDerivedStore(...), ...))
```

这说明：

- 组件在 render 期间临时拼读图
- `sectionCountByKey` 没有合适的 runtime/model 来源

这里比起其他 card 相关点，优先级反而更高，因为它的分层明显不对。

更优做法：

- 直接使用已有 `runtime.section(sectionKey).count`
- 或让 gallery 虚拟 block 自带 count

优先级：

- P0

### D. `EditableCardTitle` 的本地状态是合理的，但内部状态机可以继续抽薄

文件：

- [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx)

当前：

- draft / enter / commit / submit / onExit 都在组件本地

判断：

- 这里不建议上 runtime store。
- 因为它是强交互、短生命周期、UI 专属的 inline title edit 状态。

但可以进一步优化为：

- `useEditableCardTitleState(...)` 和展示组件再更清晰分离

这不是当前主优先级。

优先级：

- P3

## 4.3 Table

### A. `RowProps` 是当前最该收缩的 props 面

文件：

- [Row.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/row/Row.tsx)
- 调用点：[BlockContent.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/BlockContent.tsx)

当前 `RowProps` 包含很多 table-level 信息：

- `recordId`
- `viewId`
- `showVerticalLines`
- `wrap`
- `columns`
- `template`
- `rowHeight`
- `marqueeActive`
- `dragActive`
- `isDragging`
- `onDragStart`

这说明当前 Row 还没有真正成为“只关心 row 自己”的组件。

更优做法：

- `Row` 最小输入只保留：
  - `itemId`
  - `measureRef`
  - 少量 drag 局部态
- 其余通过 table context / row projection 内部订阅

值得上提到 runtime/table model 的：

- `row(itemId).recordId`
- `row(itemId).viewId`
- `row(itemId).exists`
- `row(itemId).selected`
- `row(itemId).canDrag`

优先级：

- P0

### B. `Body` 仍然承担了较多 table 级命令装配

文件：

- [Body.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/Body.tsx)

当前它同时负责：

- currentView / body / locked / canHover 的读
- marquee scene
- pointer
- keyboard
- paste
- grid template
- row reorder / column resize / column reorder 装配

判断：

- 这里不全是坏事，因为 `Body` 本来就是 table view root。
- 但 `readCell` / `onKeyDown` / `onPaste` 这些命令装配已经偏重。

更优做法：

- 保留 `Body` 作为 view root
- 但把 table 命令装配进一步挪回 controller/runtime

优先级：

- P2

### C. `BlockContent` 更像“渲染流水线组件”，不必 runtime 化，但可进一步缩 props

文件：

- [BlockContent.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/body/BlockContent.tsx)

当前问题：

- props 较宽
- measurement ids / bucket key / sync callback 都在这个组件里

判断：

- 这里不一定要上 runtime。
- 它更像 virtualization/render pipeline 组件。

更好的方向是：

- 收缩 props
- 保持 measurement 逻辑在渲染层
- 不把它机械下沉成 runtime source

优先级：

- P2

## 4.4 Field / Option / Value Editor

### A. `FieldValueEditorHost` 适合拆 resolved session model

文件：

- [FieldValueEditorHost.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/hosts/FieldValueEditorHost.tsx)

当前一个组件里同时负责：

- session 读
- field / record 解析
- panel spec
- position
- commit / cancel / dismiss 语义

判断：

- DOM measurement 与 position 仍然应留在 React。
- 但 resolved session model 值得抽到 runtime/valueEditor model。

优先级：

- P2

### B. `useOptionPickerController` 适合拆 controller，不一定做 runtime store

文件：

- [useOptionPickerController.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/field/value/editor/pickers/option/useOptionPickerController.tsx)

当前这个 hook 里既有：

- 本地 UI 状态
- 领域命令
- menu item projection

判断：

- 这里不建议直接上 runtime。
- 更合理的是拆成：
  - 纯 controller
  - React hook 外壳

优先级：

- P2

### C. `OptionToken` 是纯中间层，可直接删

文件：

- [OptionToken.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/field/options/OptionToken.tsx)

这是纯别名组件，没有保留价值。

优先级：

- P2

## 5. 不建议继续“上提”的状态

下面这些状态或派生，当前留在 React 是合理的：

- `Toolbar.tsx`
  - `searchExpanded`
  - `toolbarRoute`
  - `tabMenuViewId`

- `GroupingPanel.tsx`
  - `intervalDraft`

- `RootPanel.tsx`
  - view name draft

- `FilterRulePopover.tsx`
  - `conditionOpen`
  - `draft`

- `SortRuleRow.tsx`
  - `fieldOpen`
  - `directionOpen`

- `FieldValueEditorHost.tsx`
  - `panelHeight`
  - DOM ref / measurement

- `RootPanel` / `GroupingPanel`
  - group summary、group mode/bucket sort label 这类强展示层逻辑
  更适合抽 React helper/presenter，而不是放进 runtime

## 6. 推荐实施顺序

### P0

- `ViewFieldsPanel`：把字段显示/隐藏基础投影上提到 runtime/page model
- `Row`：收缩 `RowProps`，改成内部订阅 table context/runtime
- `Grid`：删掉组件内临时 derived store

### P1

- `RootPanel` / `GroupingPanel`：抽 React 侧 group presenter/helper
- `SortPopover` / `SortRuleRow`：补 sort panel / row 的基础投影
- `gallery/Card` / `kanban/Card` / `RecordCard`：继续收缩 card 装配层
- `Toolbar`：拆 presenter / 子组件，降低单组件装配密度

### P2

- `FieldValueEditorHost`：拆 resolved session model
- `useOptionPickerController`：拆 controller
- `ViewSettingsPopover`：改 panel registry
- 删除 `OptionToken`
- `Body` / `BlockContent`：继续收紧 table render pipeline 的职责边界

## 7. 最终结论

这轮重新组织后的结论是：

- `dataview-react` 现在最大的结构问题，不是“React 里有太多状态”，而是“runtime、React presenter、组件本地状态”三层边界还不够稳定。

更具体地说：

- 有一部分确实该进 runtime/model：
  - fields panel / row projection / sort row projection / resolved editor session
- 有一部分不该进 runtime，而该抽成 React 侧共享 presenter/helper：
  - group summary、group option labels、view settings panel registry、toolbar command 组装
- 还有一部分问题根本不是状态归属，而是组件层级和 props 链太长：
  - shared card
  - gallery / kanban card 壳
  - table row / body 传参

如果只总结一句话：

- 下一阶段最值得做的，不是继续问“这个 state 要不要搬去 runtime”，而是先把 `runtime/model`、`React presenter`、`组件本地 UI` 三层的职责边界彻底拉开。
