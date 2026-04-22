# Whiteboard Editor Presentation / Query / Layout 重构方案

## 1. 目标

本文只讨论 `whiteboard/packages/whiteboard-editor/src/presentation`、`whiteboard/packages/whiteboard-editor/src/query`、`whiteboard/packages/whiteboard-editor/src/layout` 三块的结构性降复杂度方案。

目标只有四个：

- 降低目录层级与文件跳转成本
- 收敛重复的 `equal`、共享类型、薄封装模块
- 让 `query` / `presentation` / `layout` 的职责边界更清晰
- 在不牺牲 runtime 语义的前提下，让后续继续重构更容易

本文不直接改代码，只定义推荐结构和实施顺序。

## 2. 当前问题

### 2.1 `query` 的组织粒度不稳定

`query` 目前同时混用了两种组织方式：

- 按对象拆目录：`query/node/read.ts`、`query/edge/read.ts`、`query/edit/read.ts`
- 按职责拆文件：`query/selection/model.ts`、`query/selection/read.ts`、`query/selection/runtime.ts`

结果是：

- 目录层级增加了，但并没有形成稳定的模块边界
- 很多文件本质上只是一层薄包装
- 阅读主链时需要不断在 `index -> 子目录 -> read.ts` 间来回跳转

### 2.2 `selection` 被拆得过细

`query/selection` 现在被拆成：

- `model.ts`
- `read.ts`
- `runtime.ts`

其中：

- `model.ts` 负责 `members / summary / affordance`
- `read.ts` 只是把 `model` 再包一层，顺便挂上 `selected`
- `runtime.ts` 只是把 `SelectionTarget` 投影成 `selected` map

这三层拆分的收益明显低于成本，尤其是：

- `SelectionMembers` equality 重复出现
- `summary` / `affordance` 只是透传
- `read.ts` 本身没有形成独立语义层

### 2.3 共享类型放在实现文件里，导致依赖方向不好看

几个典型问题：

- `NodeTypeCapability` / `NodeTypeRead` / `NodeTypeSupport` 定义在 `query/node/read.ts`
- `DraftMeasure` 定义在 `layout/runtime.ts`
- `ProjectedOwnerGeometry` 与 `MindmapNodeGeometry` 是同构类型，但分散在两个模块里

这会导致：

- `presentation` 反向依赖 `query` 的实现类型
- `query` 依赖 `layout/runtime` 的实现文件来取一个稳定数据形状
- 相同语义的类型重复命名

### 2.4 `equal` 分散且部分重复

当前 `equal` 分成两类：

- 领域专用 equality：例如 edge geometry、mindmap scene、selection chrome
- 通用 equality：例如 caret、selection members、一些简单的可复用结构

问题不在于 `equal` 多，而在于：

- 通用 `equal` 没有收敛
- 局部文件里重复写了相同逻辑

最明显的重复是：

- caret equality 在 `query/edit/read.ts` 已存在一份
- node render edit 再写了一份
- edge label content / render 再各自写了一份同类比较

### 2.5 大文件内部职责太杂

以下文件已经不只是“大”，而是内部混合了多种职责：

- `presentation/selection.ts`
- `layout/runtime.ts`
- `query/edge/read.ts`
- `query/node/read.ts`

其中最明显的两个：

- `presentation/selection.ts` 同时处理统计、样式读取、toolbar scope、mindmap selection 特殊语义
- `layout/runtime.ts` 同时处理 request 构造、draft 测量、patch 归一化、mindmap live layout 接线

## 3. 顶层目录是否要合并

结论很明确：

- 不建议把 `presentation`、`query`、`layout` 合并成一个目录

原因也很明确：

- `layout` 负责测量与布局
- `query` 负责面向运行时的 read model / store projection
- `presentation` 负责 UI 语义与展示推导

这三层虽然有交叉，但仍然是合理边界。

真正应该动的不是顶层目录，而是：

- `query` 内部层级
- 共享类型的位置
- 少量公共 helper 的位置

## 4. 推荐最终结构

### 4.1 `query` 推荐结构

把单文件子目录拍平，把 `selection` 收敛。

推荐形态：

```text
src/query/
  edge.ts
  node.ts
  edit.ts
  selection.ts
  index.ts
```

其中：

- `edge.ts` 替代 `query/edge/read.ts`
- `node.ts` 替代 `query/node/read.ts`
- `edit.ts` 替代 `query/edit/read.ts`
- `selection.ts` 合并 `query/selection/model.ts`、`query/selection/read.ts`、`query/selection/runtime.ts`
- `target.ts` 不再单独存在，直接并入 `query/index.ts` 或 `selection.ts`

### 4.2 `presentation` 推荐结构

`presentation` 顶层目录可以保留，但 `selection.ts` 不应继续单文件承载全部职责。

推荐形态：

```text
src/presentation/
  edge.ts
  mindmap.ts
  selection/
    stats.ts
    scope.ts
    overlay.ts
    index.ts
```

如果不想新增子目录，也可以退一步：

```text
src/presentation/
  edge.ts
  mindmap.ts
  selectionScope.ts
  selectionStats.ts
  selectionOverlay.ts
  selection.ts
```

无论选哪种，目标都一样：

- 样式读取与 toolbar scope 分离
- stats 计算与 overlay 语义分离
- 保留一个小的 `selection.ts` / `selection/index.ts` 做对外聚合

### 4.3 `layout` 推荐结构

`layout` 顶层目录可以保留，但要把纯策略逻辑从 `runtime.ts` 中抽走。

推荐形态：

```text
src/layout/
  runtime.ts
  request.ts
  draft.ts
  mindmap.ts
  textMetrics.ts
```

职责建议：

- `runtime.ts`: 只做装配与对外 API
- `request.ts`: `readLayoutKind`、`buildLayoutRequest`、`patchRect` 一类纯函数
- `draft.ts`: `DraftMeasure`、draft 测量、layout-affecting update 判断
- `mindmap.ts`: mindmap layout store / animation / projection
- `textMetrics.ts`: 文本测量资源

## 5. 类型迁移原则

### 5.1 应该迁移的类型

下面这些类型更适合移出实现文件：

- `NodeTypeCapability`
- `NodeTypeRead`
- `NodeTypeSupport`
- `DraftMeasure`
- `MindmapNodeGeometry` / `ProjectedOwnerGeometry`

推荐位置：

```text
src/types/
  nodeRead.ts
  layout.ts
```

或者更保守一些：

```text
src/query/types.ts
src/layout/types.ts
```

关键原则不是目录名，而是：

- 被多个模块引用
- 不依赖具体实现细节
- 迁移后能改善依赖方向

### 5.2 不应该迁移的类型

以下类型不建议为“看起来整齐”而强行移走：

- `NodeRender`
- `EdgeRender`
- `EdgeLabelPlacement`
- `MindmapChrome`

原因是它们高度依附本地实现语义：

- 迁出去只会增加跳转成本
- 并不会提升复用
- 反而让“定义处”和“使用处”分离

## 6. `equal` 的收敛策略

### 6.1 不建议做的事

不建议新建一个巨大的 `equal/` 目录，把所有 `isXEqual` 都搬进去。

这会产生三个问题：

- 领域逻辑远离使用点
- 文件之间来回跳转更多
- 未来改字段时容易漏同步

### 6.2 应该做的事

只收敛“通用且重复”的 equality。

推荐新增一个小型共享模块，例如：

```text
src/query/equal.ts
```

或者：

```text
src/utils/readEqual.ts
```

只放下面这类内容：

- `isCaretEqual`
- `isSelectionMembersEqual`
- `isRectWithRotationEqual`
- 其他确实跨文件重复的小比较器

### 6.3 仍然留在本地的 equality

下面这些应继续留在使用文件附近：

- edge geometry / handle / label equality
- selection chrome equality
- mindmap scene equality
- node render equality

因为这些 equality 强依赖本地字段结构，离定义处近更安全。

## 7. 推荐合并与删除清单

### 7.1 可以直接合并的模块

- `query/selection/model.ts`
- `query/selection/read.ts`
- `query/selection/runtime.ts`

最终合并成：

- `query/selection.ts`

### 7.2 可以拍平的模块

- `query/node/read.ts` -> `query/node.ts`
- `query/edge/read.ts` -> `query/edge.ts`
- `query/edit/read.ts` -> `query/edit.ts`

### 7.3 可以内联或删除的薄模块

- `query/target.ts`

它的逻辑足够薄，完全可以：

- 合并到 `query/index.ts`
- 或并入 `query/selection.ts`

### 7.4 可以顺手清理的噪音

- `layout/mindmap.ts` 中已无用途的 `readDebugRelatedNodeIds`

这类遗留 helper 继续留着只会增加误判成本。

## 8. 具体模块建议

### 8.1 `query/node`

当前问题：

- 类型定义多
- equality 多
- projection / render / capability / hit-test 混在一起

建议收敛成三个小层次，但不一定要拆多个文件：

- 类型与 capability
- projection / geometry
- render / read store

如果后续还要继续拆，优先拆的是：

- `nodeType` 相关
- `toSpatialNode` / `toProjectedNodeGeometry` 这一类通用投影 helper

但第一步不建议继续加目录，先拍平文件名。

### 8.2 `query/edge`

当前问题：

- 一个文件同时承担 item patch、geometry resolve、label content、label placement、render、connect candidates

它已经接近“一个模块包含两个子模块”：

- edge 本体读取
- edge label 读取

长期更自然的结构是：

```text
query/edge.ts
query/edgeLabel.ts
```

但这是第二阶段再做的事。

第一阶段先做：

- 目录拍平
- 抽通用 equality
- 不再让 label caret equality 重复实现

### 8.3 `query/selection`

这是最优先重构点。

最终目标不是“三个 selection 文件”，而是“一个 selection read 模块，对外直接给：

- `members`
- `summary`
- `affordance`
- `node.selected`
- `edge.selected`

这样 `query/index.ts` 里就少一段层层装配。

### 8.4 `presentation/selection`

当前文件过重，不适合继续堆。

建议按语义拆成：

- `stats`: node / edge stats
- `scope`: toolbar scope、样式统一值、默认值回退
- `overlay`: selection overlay / toolbar context

拆分标准不是“按代码长度”，而是“按输出物语义”。

### 8.5 `layout/runtime`

当前文件里可以稳定抽出的纯函数包括：

- `readLayoutKind`
- `patchRect`
- `buildLayoutRequest`
- `isLayoutAffectingUpdate`
- `normalizeStickyFontModeUpdate`
- `toLayoutResultUpdate`

这些都不该继续留在 runtime wiring 文件里。

`runtime.ts` 最终应退化成：

- 初始化 text metrics
- 初始化 draft measure store
- 初始化 live mindmap layout store
- 组合对外 patch / preview API

## 9. 推荐实施顺序

### 第一步：先做低风险结构收敛

- `query` 单文件目录拍平
- 合并 `query/selection/*`
- 删除 `query/target.ts`
- 清理死代码 helper

这一阶段只改结构，不改语义。

### 第二步：迁移共享类型

- 把 `NodeTypeSupport` 一组类型移出 `query/node`
- 把 `DraftMeasure` 移出 `layout/runtime`
- 合并 `ProjectedOwnerGeometry` 与 `MindmapNodeGeometry`

这一阶段的目标是修正依赖方向。

### 第三步：收敛通用 `equal`

- 统一 caret equality
- 统一 selection members equality
- 只收敛真正跨文件重复的比较器

这一阶段要克制，不能把领域 equality 一起搬走。

### 第四步：拆大文件

- 拆 `presentation/selection.ts`
- 拆 `layout/runtime.ts`
- 必要时再拆 `query/edge.ts`

这一步应该最后做，因为前面三步做完以后，真正需要拆的边界会更清楚。

## 10. 最终建议

这次重构的最优方向不是“继续加目录把代码分类”，而是相反：

- 把无意义的目录层级拍平
- 把过度拆分的薄模块合并
- 把真正共享的类型与小型通用 helper 提出来
- 把真正过重的大文件按语义拆开

长期最优结构应当固定成下面四条：

1. `presentation` / `query` / `layout` 顶层边界保留，不做大合并。
2. `query` 内部显著拍平，`selection` 收敛成单模块。
3. `types` 只承接真正跨模块稳定的类型，不承接局部实现类型。
4. `equal` 只集中通用比较器，领域比较器继续留在本地。

如果只做一轮、且希望收益最大，优先顺序应固定为：

1. 合并 `query/selection`
2. 拍平 `query/*/read.ts`
3. 迁移 `DraftMeasure` 和 `NodeTypeSupport`
4. 拆 `presentation/selection.ts`

这四步做完，整体复杂度就会明显下降，而且不会把系统重构成另一套更抽象但更难读的结构。
