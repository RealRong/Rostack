# Whiteboard Patch 体系最简化重构方案

## 结论

如果目标不是“保留现有 API 习惯”，而是“把 patch 体系尽量做简单”，那么最优方向不是继续保留 editor 自己那层 patch DSL，再去整理 compiler 和 policy，而是直接删掉中间层。

最简单的长期方案应该是：

1. `editor.document.nodes.patch()` 直接接收 `NodeUpdateInput`
2. `editor.document.edges.patch()` 直接接收 `EdgePatch`
3. 删除 `EditorNodePatch`
4. 删除 `EditorEdgePatch`
5. 删除 `runtime/compile/nodePatch.ts`
6. 删除 `runtime/compile/edgePatch.ts`
7. overlay 保留，但内部容器改成 keyed map，删除 entry 数组维护 helper
8. sticky 不再保留双写和特例分支，颜色唯一来源定为 `style.fill`

这套方案的核心不是“抽象更多”，而是“删掉 editor 自己定义的一层 patch 语言”。

## 当前体系为什么显得复杂

当前 `whiteboard-editor` 中，`patch` 这个词至少同时表示三种不同对象：

1. editor-facing patch DSL
   - `EditorNodePatch`
   - `EditorEdgePatch`

2. engine-facing mutation
   - `NodeUpdateInput`
   - `EdgePatch`

3. runtime overlay projection
   - `NodeProjectionPatch`
   - `TextPreviewPatch`
   - overlay 中复用的 `EdgePatch`

真正的问题不是 patch 数量多，而是第 1 层和第 2 层之间差异并没有大到值得长期保留一个专门的中间 DSL。

特别是：

- edge patch 编译本质上只是 shallow merge
- node patch 编译虽然复杂一些，但复杂点主要来自少量业务规则和字段映射
- overlay patch 跟 document patch 生命周期完全不同，本来就不该混在一个抽象里

因此，把 editor patch DSL 整层删掉，系统会立刻少掉一整层概念跳转。

## 现在最该删掉的中间层

## 1. 直接删除 editor patch DSL

建议删除：

- `EditorNodePatch`
- `EditorEdgePatch`
- `compileNodePatch`
- `compileEdgePatch`

删除后的 API 方向：

- `editor.document.nodes.patch(ids, update: NodeUpdateInput)`
- `editor.document.edges.patch(ids, patch: EdgePatch)`

这样做的好处：

- 不再需要 “intent -> compile -> update” 这层翻译
- patch 概念从三层减少为两层
- 调用链变成“调用方直接构建 engine-native mutation”
- 新增字段时不用再同步维护 editor DSL 和 compiler

代价也很明确：

- editor API 会变得更底层
- 调用方需要理解 `NodeUpdateInput`
- 一些以前藏在 compiler 里的规则需要显式放到 helper 或调用点

但如果追求最简单，这是值得的。

## 2. 不删 overlay，但删掉 overlay 内部的 entry 中间态

不建议删除 overlay projection 这层本身，因为它承担的是：

- selection preview
- text preview
- hover
- hidden
- edge interaction draft

这些都不是 document mutation，必须和持久化更新分开。

但 overlay 里当前这种“数组 entry -> 查找/替换 helper -> 最后再投影成 map”的结构可以简化。

建议删除或退出长期模型的内容：

- `readNodePatchEntry`
- `replaceNodePatchEntry`
- `readTextPreviewEntry`
- `replaceTextPreviewEntry`
- 基于 `readonly Entry[]` 的临时容器形态

建议的长期形态：

- overlay 内部直接存 keyed map
- selector/read 层直接读 keyed projection

这样可以少掉一层纯容器性质的中间态。

## 什么不该删

以下层次不建议删除：

## 1. engine-native mutation

`NodeUpdateInput` 和 `EdgePatch` 不该删。

原因很简单：

- 这就是 engine 的真实写入协议
- 它们已经是 document mutation 的自然边界
- 再往下删，就等于把 engine operation 细节直接暴露到更上层

所以“最简”不是删到 operation 级别，而是把 editor 自己那层 DSL 去掉，直接停在 engine mutation 这一层。

## 2. overlay projection

overlay projection 不该整层删。

原因：

- 它和 document mutation 生命周期不同
- 它服务于交互预览，不应进入持久化模型
- 它本身是合理边界，问题只在于内部容器实现太绕

所以要删的是 overlay 内部的 entry 容器中间层，不是 overlay 这个概念。

## sticky 的最终判断

## 结论：sticky 的颜色唯一来源应该是 `style.fill`

如果要求“不保留特例”，那 sticky 最终就不应该继续双写：

- 不应该同时写 `style.fill`
- 不应该同时写 `data.background`

必须选一个长期唯一来源。最优判断是：

- 保留 `style.fill`
- 删除 sticky 对 `data.background` 的长期依赖

## 为什么是 `style.fill`

原因有四个。

### 1. sticky 的 schema 本身已经把颜色定义在 `style.fill`

sticky 的 schema 定义是：

- `styleField('fill', 'Fill', 'color')`

这说明 editor-facing 的配置模型已经把 sticky 填充色视为 style，而不是 data。

### 2. 渲染链路已经把 `style.fill` 放在优先级第一位

sticky 渲染读取逻辑是：

- 先读 `node.style.fill`
- 没有时才 fallback 到 `node.data.background`

这说明 `data.background` 现在更像兼容兜底，不是主模型。

### 3. selection / toolbar 的读法也是先看 `style.fill`

selection presentation 读取 sticky 填充色时，也是：

- 先读 `fill`
- 再 fallback 到 `data.background`

也就是说，编辑器展示语义已经在偏向 `style.fill`。

### 4. `style.fill` 才符合通用节点样式模型

sticky 的“底色”本质上是视觉样式，不是业务数据。

把它放在 `data.background` 的问题是：

- 数据语义混入表现层字段
- sticky 成为特殊节点
- 任何通用填充逻辑都要额外照顾 sticky
- 导致编译器、mutation、render、selection 全链路出现特例

而如果统一用 `style.fill`：

- 节点颜色语义与其他节点一致
- 通用样式工具可以直接复用
- sticky 不需要额外联动规则

## 对 `data.background` 的处理建议

长期方案里，`data.background` 不应该继续保留为 sticky 的运行时来源。

建议：

1. 新创建的 sticky 只写 `style.fill`
2. 运行时读取 sticky 填充色时，只读 `style.fill`
3. 删除 `style.fill <-> data.background` 的同步逻辑
4. 删除 sticky 相关的 `data.background` patch 能力

如果需要兼容旧文档，最多允许一次性迁移：

- 在文档升级或导入阶段，把 `data.background` 搬到 `style.fill`
- 迁移完成后，不在 runtime 长期保留 fallback

这里的关键原则是：

- 可以做一次性数据迁移
- 不要保留永久兼容分支

用户要求是不想保存特例，这个原则和该要求一致。

## 最简单的目标架构

如果完全以“结构最少”为目标，建议把 patch 体系收敛成下面两类。

## 1. document mutation

只保留：

- `NodeUpdateInput`
- `EdgePatch`

所有真正提交到 engine 的修改都直接使用这两种类型。

## 2. overlay projection

只保留：

- `NodeProjectionPatch`
- `TextPreviewPatch`
- `EdgeOverlayProjection` 内部所需的 patch/route 状态

所有交互中的临时预览都只停留在 overlay。

换句话说，长期结构不再是“三层 patch”。

而是：

- 一层 document mutation
- 一层 overlay projection

editor 自己定义的 patch DSL 整层删除。

## 最简单方案下，代码层面的删减方向

优先考虑删除或退出长期模型的内容：

- `whiteboard/packages/whiteboard-editor/src/runtime/compile/nodePatch.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/compile/edgePatch.ts`
- `EditorNodePatch`
- `EditorEdgePatch`
- sticky 上对 `data.background` 的 patch 写入
- sticky 上 `style.fill` 与 `data.background` 的双写
- overlay 中的 entry 数组读写 helper

优先考虑保留的内容：

- `NodeUpdateInput`
- `EdgePatch`
- `styleUpdate` / `dataUpdate` 这类轻量 builder
- `mergeNodeUpdates`
- overlay projection 概念本身

这里需要强调一件事：

`styleUpdate` / `dataUpdate` 不是必须删除。它们即使保留，也只是轻量 builder，不再承担“中间 DSL 编译器”的角色。

## 迁移建议

为了尽量直接达到最简方案，迁移顺序建议如下。

### 阶段 1：定模型

明确宣布长期模型：

- sticky 颜色唯一来源为 `style.fill`
- `data.background` 不再是 sticky 的正式字段来源
- editor patch DSL 不再作为长期 API 保留

### 阶段 2：改公开接口

把：

- `nodes.patch(ids, EditorNodePatch, options)`
- `edges.patch(ids, EditorEdgePatch)`

改成：

- `nodes.patch(ids, NodeUpdateInput, options?)`
- `edges.patch(ids, EdgePatch)`

同时删掉 compiler 调用链。

### 阶段 3：收敛 sticky

做一轮 sticky 数据模型收敛：

- 创建 sticky 时只写 `style.fill`
- 读 sticky 填充色时只读 `style.fill`
- 去掉 `data.background` fallback
- 去掉 sticky 双写逻辑

### 阶段 4：压平 overlay 容器

把 overlay 内部状态改成 keyed map：

- 删除 entry 数组维护 helper
- 让 node/edge overlay projection 直接基于 keyed 容器工作

## 预期收益

采用这套最简单方案后，收益是直接且明确的：

- patch 语义层次减少
- 新人理解成本下降
- sticky 不再是跨越 data/style 两套模型的例外
- editor patch compiler 整层消失
- edge patch 路径变得非常直接
- node patch 路径只剩 `NodeUpdateInput` 构建
- overlay 只保留必要语义，不再保留多余 entry 中间态

## 风险

这套方案最主要的风险不是技术不可行，而是迁移面较大。

### 1. 调用方会更底层

原本依赖 `EditorNodePatch` 的调用方，需要直接构建 `NodeUpdateInput`。

这会让一部分调用点显得更“engine-aware”，但这是换取整体结构更简单的代价。

### 2. sticky 旧数据需要一次性处理

如果历史文档中还存在只写 `data.background` 的 sticky，需要迁移。

但应坚持：

- 做迁移
- 不做长期 fallback

### 3. overlay map 化需要复核引用稳定性

把数组改成 map 后，需要重新检查 selector equality 和更新传播。

不过这属于实现层风险，不影响长期结构判断。

## 最终判断

如果你的目标是“理论上更优雅”，可以继续保留 editor patch DSL，再做 compiler/policy 抽象。

但如果你的目标是“最简单，少一层是一层”，那最优解其实更直接：

- 删掉 `EditorNodePatch` / `EditorEdgePatch`
- 删掉 `compileNodePatch` / `compileEdgePatch`
- document patch 直接使用 `NodeUpdateInput` / `EdgePatch`
- overlay 保留，但内部改为 keyed map
- sticky 颜色统一收敛到 `style.fill`
- `data.background` 退出 sticky 的长期模型

这是我认为在“不在乎成本”前提下，最简单、最干净、也最不容易继续长出新特例的方案。

