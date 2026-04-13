# Dataview 当前代码审计与迁移清单

日期：2026-04-14

## 审计范围

本轮审计基于当前真实源码重新扫描，不沿用旧路径、历史别名或 dist 产物结论。

- `dataview/packages/dataview-core/src`
- `dataview/packages/dataview-engine/src`
- `dataview/packages/dataview-react/src`
- `dataview/packages/dataview-table/src`

本轮重点回答 4 个问题：

1. 当前代码里还剩哪些重复可复用逻辑。
2. 哪些类型定义仍然重复表达同一个概念。
3. 哪些类型或字段已经退化成不必要的中间翻译层。
4. 如果继续按“不留兼容层、不保留双轨实现”的标准推进，剩余迁移应该怎么分阶段落地。

## 当前结论

- `core / engine` 上一轮大块重复已经基本收口，旧文档里最重的几条主线已经完成，不应该在本轮重新打开。
- 当前真实还剩下的重复，主要集中在 `react` 和 `table`：尤其是选择状态机、table ordered-list 包装层、gallery/kanban/table 的交互运行时骨架。
- `engine` 侧现在只剩少量“薄包装命令”和“internal/public 阴影类型”问题，体量远小于上一轮，但仍然值得清理。
- 当前最明确的不必要中间翻译层是：
  - `FilterRuleProjection.fieldId`
  - `TableCellRange`
  - `QueryState extends ViewRecords`
  - `SectionNodeState extends Section`
- 当前最明确的待删死代码是：
  - `dataview/packages/dataview-react/src/field/navigation.ts`

结论：

- 这轮迁移不该再围绕 `core` 做大规模改造。
- 正确方向是继续把剩余重复从 `table / react / engine projection` 三处收干净。
- 所有迁移动作都应“一次切换完成”，同阶段内删除旧实现，不保留兼容导出、别名桥接或双轨调用。

## 当前已收敛的基线

以下内容已经在当前代码中完成，不再作为本轮待办重复列出：

- [x] 删除 `core/query/*` 独立 query 包与 `DocumentViewQuery`
- [x] 删除 `engine/document/*` 薄转发层
- [x] 建立 `engine` ordered collection factory，并让 `FieldList / ItemList / SectionList` 提供 canonical 顺序访问能力
- [x] 收缩前一轮已确认的公共 projection 冗余字段：
  - `ViewSearchProjection.search`
  - `SortRuleProjection.fieldId`
  - `ViewGroupProjection.group`
- [x] 合并 `core` 与 `engine` 间的主要 clone / compare / normalize 重复逻辑

本清单只处理“当前代码里还真实存在”的问题，不回滚到已经完成的历史阶段。

## P0 必做项

### 1. `dataview-table` 仍在重复包装 `engine` 的 ordered-list 能力

位置：

- `dataview/packages/dataview-table/src/grid.ts`
- `dataview/packages/dataview-table/src/range.ts`
- `dataview/packages/dataview-table/src/paste.ts`
- `dataview/packages/dataview-react/src/views/table/cellRender.ts`
- `dataview/packages/dataview-react/src/views/table/dom/targets.ts`
- `dataview/packages/dataview-engine/src/contracts/shared.ts`

当前问题：

- `engine` 的 `ItemList / FieldList` 已经提供 `has / indexOf / at / range`。
- `grid.ts` 仍然包出一整层仅改名不改语义的 helper：
  - `appearanceIndex`
  - `fieldIndex`
  - `appearanceAt`
  - `fieldAt`
  - `containsCell`
  - `appearancesBetween`
  - `fieldsBetween`
- `range.ts` 再基于这层 wrapper 计算一次区间。
- `paste.ts`、`cellRender.ts`、`targets.ts` 又被迫依赖这套重命名 API，而不是直接消费 `engine` 已经稳定提供的有序访问协议。

迁移动作：

- [ ] 删除 `grid.ts` 里仅转发 `ItemList / FieldList` 原语的 helper。
- [ ] `range.ts` 改为直接使用 `items.range(...)` 和 `fields.range(...)`。
- [ ] `paste.ts`、`cellRender.ts`、`targets.ts` 直接依赖 canonical list protocol，不再透过 `grid.*Index / grid.*At / grid.*Between`。
- [ ] 仅保留真正 table-specific 的单元格导航逻辑；如果 `firstCell / edgeCell / stepField` 也能沉到共享 ordered-cursor helper，就一并下沉。
- [ ] 删除迁移后失去价值的旧 helper，不保留“table 版 list facade”。

完成标准：

- [ ] `dataview-table` 内不再存在“只是给 `engine` list 原语换名字”的薄包装函数。
- [ ] 表格相关调用点可以直接从 `ItemList / FieldList` 读到完整顺序导航能力。
- [ ] `range.ts` 不再通过 `grid.appearancesBetween / grid.fieldsBetween` 重新实现已有的区间切片。

### 2. 行选择与单元格选择仍在维护两套 anchor/focus 状态机

位置：

- `dataview/packages/dataview-react/src/runtime/selection/store.ts`
- `dataview/packages/dataview-react/src/runtime/selection/types.ts`
- `dataview/packages/dataview-react/src/runtime/selection/api.ts`
- `dataview/packages/dataview-table/src/gridSelection.ts`
- `dataview/packages/dataview-table/src/range.ts`
- `dataview/packages/dataview-react/src/field/navigation.ts`

当前问题：

- 行级选择和单元格选择都在维护同一类状态机骨架：
  - `anchor`
  - `focus`
  - `equal`
  - `reconcile`
  - `extend`
  - `move / step`
- `TableCellRange` 本质上只是把 `GridSelection` 再复制成一份同构 shape。
- `TableCellRangeEdges` 还在 `cellRender.ts` 里被匿名结构再表达一次。
- `dataview-react/src/field/navigation.ts` 当前无引用，且语义与 table 的导航逻辑重叠。当前扫描里，`rg -n "#react/field/navigation|stepField" dataview/packages/dataview-react/src` 仅命中文件自身。

迁移动作：

- [ ] 抽出单一的 `anchor / focus` 选择状态机内核，至少统一：
  - 归一化
  - reconcile
  - range/extend
  - step
- [ ] `Selection`、`GridSelection`、`TableCellRange` 不再各自维护一套平行 helper。
- [ ] 删除 `TableCellRange` 中间层，或者让 `range` 直接消费 `GridSelection`。
- [ ] 把 `TableCellRangeEdges` 变成单一 canonical 类型，避免在 `range.ts` 和 `cellRender.ts` 各写一次。
- [ ] 直接删除 `dataview/packages/dataview-react/src/field/navigation.ts`。

完成标准：

- [ ] `row selection` 与 `grid selection` 不再各有一套独立的 anchor/focus 状态机实现。
- [ ] `TableCellRange` 不再作为 `GridSelection` 的纯翻译层存在。
- [ ] `field/navigation.ts` 从仓库中删除，且不再有新调用方出现。

### 3. Gallery / Kanban / Table 仍在重复搭建交互运行时骨架

位置：

- `dataview/packages/dataview-react/src/views/gallery/runtime.ts`
- `dataview/packages/dataview-react/src/views/gallery/types.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime.ts`
- `dataview/packages/dataview-react/src/views/kanban/types.ts`
- `dataview/packages/dataview-react/src/views/table/components/body/Body.tsx`

当前问题：

- `gallery` 和 `kanban` 都在重复维护同一组运行时字段：
  - `selection`
  - `drag`
  - `marqueeActive`
  - `visualTargets`
- 两者都在重复做：
  - 从 `selection.store` 推导 `selectedIdSet`
  - `select(id, mode)` 包装
  - `createVisualTargetRegistry(...)`
  - `dataView.marquee.registerAdapter(...)`
  - `dragging` 期间禁用 marquee
  - `clearFrozen()` 生命周期
- `table` 的 `Body.tsx` 又为行 marquee 单独写了一套相近的 adapter 注册和启停逻辑，只是 view-specific 细节不同。

迁移动作：

- [ ] 抽出共享的 item-interaction runtime，统一处理：
  - selection projection
  - marquee adapter 注册
  - visual target registry 生命周期
  - drag/marquee 互斥
- [ ] `gallery` 和 `kanban` 只保留布局、drop-plan、section 可见性等视图专有逻辑。
- [ ] `table` 的行 marquee 也切到同一套 adapter/runtime helper，上层只提供：
  - hit-test
  - preview selection
  - clear 逻辑
  - start/end side effects
- [ ] `GalleryViewRuntime` 与 `KanbanViewRuntime` 共享相同 runtime 子结构类型，不再平行声明同构字段。

完成标准：

- [ ] `gallery` 与 `kanban` 不再各自手写一份 selection + marquee + visualTargets 骨架。
- [ ] `table` 的 marquee 逻辑不再单独维护第三套近似运行时协议。
- [ ] view runtime 的公共交互字段有单一所有者，不再在多个 `types.ts` 中复制。

### 4. Query / Filter / Sort UI 仍然存在重复 field-id 提取与可选字段计算

位置：

- `dataview/packages/dataview-react/src/page/features/filter/filterUi.ts`
- `dataview/packages/dataview-react/src/page/features/sort/sortUi.ts`
- `dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/QueryFieldPickerPanel.tsx`
- `dataview/packages/dataview-react/src/page/state/page.ts`
- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-engine/src/active/read.ts`

当前问题：

- `filterUi.ts` 和 `sortUi.ts` 分别维护两套非常相近的 helper：
  - 读取 field id
  - 收集已使用 field id
  - 计算可选字段
- `ViewQueryBar.tsx` 与 `QueryFieldPickerPanel.tsx` 又重复消费这些能力并平行拉取 query projection。
- `FilterRuleProjection.fieldId` 仍然重复表达 `rule.fieldId`。
- `active/read.ts` 的 `filterField(...)` 对 `rule.fieldId` 和 `entry.fieldId` 保留了双路兜底，这本质上是在继续维护旧镜像字段。

迁移动作：

- [ ] 删除 `FilterRuleProjection.fieldId`，所有调用方统一使用 `entry.rule.fieldId`。
- [ ] 抽出共享的 query-field utility，统一处理：
  - 从 rule/sorter 提取 field id
  - 计算 used field ids
  - 计算 available fields
- [ ] `ViewQueryBar.tsx` 与 `QueryFieldPickerPanel.tsx` 改为依赖同一组 query-field helper，而不是各自组装。
- [ ] `page/state/page.ts` 与 query route 恢复只依赖 canonical rule/sorter shape，不围绕 projection 镜像字段写逻辑。
- [ ] `active/read.ts` 删除对旧镜像字段的兼容兜底。

完成标准：

- [ ] `FilterRuleProjection` 不再声明 `fieldId`。
- [ ] filter/sort 页面字段可用性计算只保留一份实现。
- [ ] query bar、filter popover、sort picker、settings field picker 使用同一套 field-id/available-fields helper。

## P1 应做项

### 5. Value editor opener 流程仍在 table 与 card 两处重复

位置：

- `dataview/packages/dataview-react/src/views/table/openCell.ts`
- `dataview/packages/dataview-react/src/views/shared/openCardField.ts`

当前问题：

- 两处都在重复做同一条 opener 流程：
  - 解析 field anchor
  - 构造 `ValueEditorSessionPolicy`
  - 调 `valueEditor.open(...)`
  - 关闭后恢复 owner focus / selection
- table 版本只是多了：
  - grid selection 同步
  - close-action 映射
  - `requestAnimationFrame` 重试
- 这些差异不足以支撑两套完整 opener 骨架长期并存。

迁移动作：

- [ ] 抽出共享的 value-editor opener factory。
- [ ] 公共层统一负责：
  - anchor 解析
  - open payload 创建
  - session policy 框架
  - close/dismiss 回调
- [ ] table 只注入“关闭后移动光标”的策略。
- [ ] card 只注入“找不到精确 anchor 时退到 `belowFieldAnchor(...)`”的策略。
- [ ] 删除迁移后失效的 opener/policy 局部 helper。

完成标准：

- [ ] `openCell.ts` 与 `openCardField.ts` 不再各自维护一整套 `open -> policy -> restore focus` 流程。
- [ ] Value editor 的 opener/policy 框架有单一 owner。

### 6. `engine/active/commands/*` 仍有明显 patch-wrapper 样板代码

位置：

- `dataview/packages/dataview-engine/src/active/commands/query.ts`
- `dataview/packages/dataview-engine/src/active/commands/display.ts`
- `dataview/packages/dataview-engine/src/active/commands/gallery.ts`
- `dataview/packages/dataview-engine/src/active/commands/kanban.ts`
- `dataview/packages/dataview-engine/src/active/commands/sections.ts`
- `dataview/packages/dataview-engine/src/active/commands/summary.ts`

当前问题：

- 多个 command 文件都在重复同一套壳：
  - `base.withView(...)`
  - `base.withField(...)`
  - `base.withGroupField(...)`
  - `base.commitPatch({ ... })`
- 领域变换早已在 `core`，`engine` 文件本身大多只是“把 base 打开，再把 patch 提交回去”的固定模板。

迁移动作：

- [ ] 引入轻量 patch-command factory，统一：
  - `withViewPatch`
  - `withFieldPatch`
  - `withGroupFieldPatch`
  - 或等价的更小 helper
- [ ] 每个 command 文件只保留领域差异，不再重复 commit 样板。
- [ ] 删除迁移后无语义价值的本地 wrapper。

完成标准：

- [ ] `active/commands/*` 不再逐文件复制同一套 `withX + commitPatch` 骨架。
- [ ] `engine` command 层的职责只剩 orchestration，不再包含明显可抽象的重复模板。

### 7. `react` 的多类 session/controller 仍在手写同构 store 壳

位置：

- `dataview/packages/dataview-react/src/page/session/api.ts`
- `dataview/packages/dataview-react/src/runtime/inlineSession/api.ts`
- `dataview/packages/dataview-react/src/runtime/marquee/api.ts`
- `dataview/packages/dataview-react/src/runtime/valueEditor/api.ts`

当前问题：

- 多个 controller 都在重复：
  - `createValueStore(...)`
  - comparator
  - `get / set / clear`
  - 少量 listener shell
- 这类重复没有上一组问题那么重，但仍然是稳定的低层样板。

迁移动作：

- [ ] 抽出最小公共 controller/store helper。
- [ ] `inlineSession` 保留 exit-listener 语义扩展。
- [ ] `marquee` 保留 adapter registry。
- [ ] `valueEditor` 保留 `openStore` 与 dismiss 语义。
- [ ] `page/session` 保留 route clone / route equality，去掉重复 store shell。

完成标准：

- [ ] React session/controller 文件不再各自重写一遍 store/controller 壳。
- [ ] 差异点只剩各自真正的行为语义，而不是样板代码。

## P2 收尾项

### 8. `engine/contracts/internal.ts` 仍保留 internal/public 双形态阴影类型

位置：

- `dataview/packages/dataview-engine/src/contracts/internal.ts`

当前问题：

- `QueryState extends ViewRecords`，只是附加 memo 字段：
  - `visibleSet`
  - `order`
- `SectionNodeState extends Section`，只是再追加一个：
  - `visible`
- 这类写法虽然比之前轻很多，但仍然在表达“同一份数据的 public shape”和“附加缓存 shape”两套模型。

迁移动作：

- [ ] 把 `QueryState` 从“继承 `ViewRecords` 的第二套实体类型”改成“records 数据 + memo cache”的组合结构。
- [ ] 把 `SectionNodeState` 从“`Section` 的阴影扩展”改成更小的内部节点结构，或把 `visible` 还原为派生信息。
- [ ] internal cache 类型不再伪装成 public contract 的扩展版。

完成标准：

- [ ] `QueryState extends ViewRecords` 不再存在。
- [ ] `SectionNodeState extends Section` 不再存在。
- [ ] `internal.ts` 中不再把 public contract 直接复制成“加一两个缓存字段”的第二套 shape。

### 9. `gallery / kanban` 的 typed-view 和 runtime 子结构仍有平行类型定义

位置：

- `dataview/packages/dataview-react/src/views/gallery/types.ts`
- `dataview/packages/dataview-react/src/views/kanban/types.ts`

当前问题：

- `ActiveGalleryViewState` 与 `ActiveKanbanViewState` 都是：
  - `ViewState & { view: View & { type: ... } }`
- `GalleryViewRuntime.selection` 与 `KanbanViewRuntime.selection` 是同构结构。
- 这些不是最重的问题，但仍然是明显重复的 view-typed runtime type。

迁移动作：

- [ ] 提供通用的 typed active-view helper type，例如 `ActiveTypedViewState<TType>`。
- [ ] 提供共享的 selectable-item runtime 子结构类型。
- [ ] `gallery` 与 `kanban` 只保留各自独有字段。

完成标准：

- [ ] `gallery/types.ts` 和 `kanban/types.ts` 不再平行复制 typed-view narrowing 和 selection runtime shape。

### 10. summary 空态语义仍然分散

位置：

- `dataview/packages/dataview-engine/src/contracts/internal.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/publish.ts`

当前问题：

- `emptySummaries(): new Map()` 在 contract 层。
- `EMPTY_COLLECTION` 与“没有 calc fields 时如何发布空 summary”语义在 publish 层。
- 这不是大的架构问题，但属于明显可以进一步收束的空态边界。

迁移动作：

- [ ] 统一 summary 空态语义的 owner。
- [ ] `empty summary state`、`empty published summary`、`empty collection` 不再分散在多个文件各写一份。

完成标准：

- [ ] summary 空态边界只有单一实现位置。

## 重复类型与不必要中间层清单

这部分列出的是“类型本身就应该收缩”的项，而不是只靠改 helper 就能解决的问题。

### 必删

- [ ] `FilterRuleProjection.fieldId`
  - 重复 `rule.fieldId`
  - 属于典型 projection 镜像字段
- [ ] `TableCellRange`
  - 纯复制 `GridSelection` 的 `anchor / focus`
  - 没有独立领域语义
- [ ] `dataview/packages/dataview-react/src/field/navigation.ts` 内的 `FieldScope`
  - 无引用
  - 只是第三套导航上下文表达

### 必收缩

- [ ] `QueryState extends ViewRecords`
  - 不是新的领域模型，只是 records + memo cache
- [ ] `SectionNodeState extends Section`
  - 不是新的领域模型，只是 section + `visible`
- [ ] `GalleryViewRuntime.selection`
- [ ] `KanbanViewRuntime.selection`
  - 应收敛为共享 runtime 子结构类型
- [ ] `ActiveGalleryViewState`
- [ ] `ActiveKanbanViewState`
  - 应收敛为共享 typed-view helper type

### 应统一所有权

- [ ] `TableCellRangeEdges`
  - 当前在 `range.ts` 有显式类型，在 `cellRender.ts` 又被匿名 shape 再写一次
- [ ] filter/sort query field utility
  - 当前逻辑分散在 `filterUi.ts`、`sortUi.ts`、`ViewQueryBar.tsx`、`QueryFieldPickerPanel.tsx`

## 明确待删文件

- [ ] `dataview/packages/dataview-react/src/field/navigation.ts`
  - 当前无引用
  - 与 `dataview-table` 的导航逻辑重复

以下文件不是“现在立刻删”，但完成对应阶段后应一并删除旧实现，不得双轨保留：

- [ ] `dataview/packages/dataview-table/src/grid.ts`
  - 如果迁移后只剩转发/改名 helper，则整个文件应删除或彻底收缩为单一导航模块
- [ ] `dataview/packages/dataview-table/src/range.ts`
  - 如果 `GridSelection` 直接提供 canonical range 语义，则旧 `TableCellRange` 包装应一起删掉

## 分阶段迁移顺序

### 阶段 1：先收掉 table 内核重复

- [ ] 合并 ordered-list wrapper
- [ ] 合并 grid selection / range 状态机
- [ ] 删除 `field/navigation.ts`
- [ ] 删除 `TableCellRange` 及其旧 helper

阶段目标：

- table 不再围绕 `engine` list protocol 再造一层 facade
- table 选择与导航语义只有一套 canonical 实现

### 阶段 2：统一 view interaction runtime

- [ ] 抽出 gallery / kanban / table 共用的 marquee + selection + visualTargets 运行时骨架
- [ ] 收敛 `gallery/types.ts` 与 `kanban/types.ts` 的平行 runtime type

阶段目标：

- React 各视图不再复制交互运行时模板
- view-specific 文件只保留布局和 drop 细节

### 阶段 3：收掉 query projection 与页面工具重复

- [ ] 删除 `FilterRuleProjection.fieldId`
- [ ] 合并 filter/sort query-field helper
- [ ] 收敛 `ViewQueryBar` 与 `QueryFieldPickerPanel` 的重复 field picker 逻辑

阶段目标：

- query/filter/sort 页面只依赖 canonical rule/sorter shape
- query field 可选性计算只有一份实现

### 阶段 4：清理 engine 样板与 internal 阴影类型

- [ ] 抽出 `active/commands/*` patch-wrapper factory
- [ ] 收缩 `QueryState`
- [ ] 收缩 `SectionNodeState`
- [ ] 统一 summary 空态边界

阶段目标：

- engine 只保留真正 runtime 必需的 orchestration
- internal contract 不再复制 public shape

### 阶段 5：React session/controller 收尾

- [ ] 合并 session/controller store 壳
- [ ] 删除所有迁移后残留的旧 helper、旧 type、旧文件
- [ ] 做整仓类型与测试验收

阶段目标：

- 不留下第二套 controller shell
- 不留下任何兼容导出、旧别名或 dead code

## 最终验收规则

迁移完成后，必须同时满足以下条件：

- [ ] 仓库内不存在已无引用的 `dataview/packages/dataview-react/src/field/navigation.ts`
- [ ] `FilterRuleProjection` 不再携带 `fieldId` 镜像字段
- [ ] `table` 不再围绕 `ItemList / FieldList` 复制 `has / indexOf / at / range` 风格 API
- [ ] `row selection` 与 `grid selection` 不再各自维护一套 anchor/focus 状态机
- [ ] `gallery / kanban / table` 不再各自手写相同的 marquee adapter 注册骨架
- [ ] `engine/contracts/internal.ts` 不再保留 `extends public shape + cache fields` 的阴影类型
- [ ] 旧 helper、旧 wrapper、旧类型定义在同阶段内删除干净
- [ ] 不保留兼容导出、过渡桥接、deprecated alias

建议验收命令：

```bash
pnpm -C dataview typecheck
pnpm -C dataview test
```

建议人工复核点：

- query/filter/sort 页面交互是否完全保持现有行为
- table 键盘导航、扩展选择、粘贴、fill handle 是否仍一致
- gallery / kanban 拖拽、框选、自动滚动是否行为一致
- value editor 在 table / card 两类入口的关闭后焦点恢复是否一致

## 本轮审计结论

如果只看当前 `dataview` 真实代码状态：

- 主要历史债已经不在 `core`。
- 当前剩余迁移重点已经非常明确，优先级从高到低依次是：
  - `table` 的 ordered-list 与选择状态机重复
  - `react` 多视图交互运行时重复
  - query/filter/sort 的 projection 镜像字段与页面工具重复
  - `engine` 的 command wrapper 与 internal 阴影类型
- 这几类问题清完之后，`dataview` 才算真正进入“无多套实现、无中间翻译层、无明显重复运行时骨架”的收口状态。
