# Whiteboard 重复逻辑与底层设施继续收敛方案

## 目标

这一轮不是继续讨论单个 bug，而是从 whiteboard 全局视角盘一遍：

- 还有哪些重复和复杂度，适合继续通过底层设施收敛
- 还有哪些逻辑已经出现多处复制，应该抽成共享实现
- 哪些适合进 `shared/*`
- 哪些适合进 `@whiteboard/core`
- 哪些只应该留在 `whiteboard-editor` / `whiteboard-react`

目标仍然是长期最优，不考虑兼容成本，不保留双套写法。

## 结论

当前 whiteboard 里最值得继续做的不是再补业务 helper，而是继续收掉下面四类结构性重复：

1. React 工具栏自己拼 `NodeUpdateInput` / `EdgePatch`
2. `editor` / `react` 两层工具栏外壳重复
3. editor runtime 的 overlay branch update 重复
4. 领域 equality / field-update 逻辑在 core / engine / editor 三层重复

其中最优先的是第一类和第二类，因为它们同时影响：

- API 语义一致性
- UI 层复杂度
- 未来功能扩展成本

## 一、最高优先级

## 1. React 不应继续自己拼 node patch

### 现状

当前 whiteboard-react 里很多工具栏项仍在直接构造 `NodeUpdateInput`，典型文件包括：

- [fill.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/fill.tsx)
- [stroke.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/stroke.tsx)
- [textColor.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/textColor.tsx)
- [fontSize.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/fontSize.tsx)
- [shapeKind.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/shapeKind.tsx)
- [update.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/update.ts)

而 editor runtime 其实已经有一套语义命令：

- [node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/commands.ts)
- [node/text.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts)

现在的问题是：

- UI 层还知道 `style/data` field path
- UI 层还知道 `compileNodeFieldUpdate(...)`
- 同一件事有两套入口
- editor 的语义命令被绕过

### 长期最优

React 层不再拼 patch，只调语义动作：

```ts
editor.actions.node.style.fill(nodeIds, value)
editor.actions.node.style.stroke(nodeIds, value)
editor.actions.node.style.strokeWidth(nodeIds, value)
editor.actions.node.style.opacity(nodeIds, value)
editor.actions.node.style.textColor(nodeIds, value)
editor.actions.node.text.size({ nodeIds, value })
editor.actions.node.text.align(nodeIds, value)
editor.actions.node.shape.set(nodeIds, kind)
```

React 层只表达：

- 改什么
- 对哪些 node 改

不再表达：

- field path 是什么
- update object 怎么编译
- 具体 patch 长什么样

### 必须删除的旧实现

完成后应删除：

- [update.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/update.ts)

同时所有 toolbar item 不再 import：

- `toNodeStylePatch`
- `toNodeFieldUpdate`
- `toNodeDataPatch`

## 2. Edge 也需要补齐语义命令

### 现状

`edge` 这边 editor runtime 暴露的语义面还不够完整，导致 UI 里仍有局部 glue：

- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edge.ts)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)

现在 `EdgeToolbar.tsx` 里还有：

- 读 `editor.read.edge.item.get(edgeId)?.edge`
- 循环 `edgeIds.forEach(...)`
- 本地拼 `style` patch

这说明 edge 的 write API 还停留在“文档 patch 层”，而不是“领域语义层”。

### 长期最优

补出和 node 对齐的 edge 语义动作：

```ts
editor.actions.edge.style.color(edgeIds, value)
editor.actions.edge.style.width(edgeIds, value)
editor.actions.edge.style.dash(edgeIds, value)
editor.actions.edge.style.start(edgeIds, value)
editor.actions.edge.style.end(edgeIds, value)
editor.actions.edge.textMode.set(edgeIds, value)
```

如果不想再加太多 namespace，至少也要让 `edge` 顶层直接有这些动作，而不是逼 UI 自己拼 patch。

### 必须删除的旧实现

完成后：

- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx) 里的 `patchEdgeStyles` 应删除
- UI 层不再逐 edge 读取 committed edge 再本地 merge `style`

## 3. NodeToolbar / EdgeToolbar 需要共享同一个浮动工具栏壳子

### 现状

下面两份组件几乎在维护同一种结构：

- [NodeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)

重复点包括：

- anchor world 计算
- placement 计算
- live position / sticky position session
- `buttonRefByKey`
- `activePanelKey`
- panel toggle / close
- popover 打开关闭
- toolbar style 计算

### 长期最优

抽成 whiteboard-react 内部共享外壳：

```ts
useFloatingToolbar(...)
```

或：

```tsx
<FloatingToolbarShell ... />
```

它应负责：

- 位置与会话锚定
- 按钮注册
- active panel 管理
- popover anchor 绑定
- 基础 toolbar chrome

具体业务仍由 node / edge 各自提供：

- toolbar context
- item recipe
- panel content

### 归属

这个不适合进 `shared/react`，因为它强绑定：

- whiteboard world/screen 坐标
- whiteboard toolbar placement 规则
- whiteboard z-index / popover 结构

它应该留在 `whiteboard-react`。

## 二、中优先级

## 4. Overlay preview branch update 还可以再收一层

### 现状

你前面已经收掉了 overlay map merge 的一层，但 [preview.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/overlay/preview.ts) 里仍然有很多重复模式：

- `overlay.set((current) => current.xxx === next ? current : {...current, ...})`
- `clear / clearGuide / clearPatches / clearSize`
- 分支级别的 no-op guard

这类模式在 overlay 这层很集中，不是一次性逻辑。

### 长期最优

在 `whiteboard-editor/runtime/overlay` 内部增加一层 branch mutator helper，例如：

```ts
updateOverlayBranch(...)
setOverlayBranchIfChanged(...)
```

目标不是抽成复杂框架，而是让 `preview.ts` 里这种重复变成单一表达。

### 归属

这不适合进 `shared/core`。

原因：

- 强依赖 whiteboard overlay state 结构
- 不是通用 store 模式
- 只是 editor overlay 自己的局部设施

## 5. editor runtime read 仍有固定流水线重复

### 现状

下面这些文件仍然有相似结构：

- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/node.ts)
- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts)
- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/mindmap.ts)

典型重复是：

- `item`
- `state`
- `resolved/view`
- `bounds/rect`
- 各层一个 `createKeyedDerivedStore`

### 长期最优

在 `whiteboard-editor/runtime/read` 内引入很薄的一层 keyed read builder，例如：

```ts
createKeyedReadLayer(...)
createKeyedViewStore(...)
```

它不负责领域逻辑，只负责把：

- keyed source
- derive
- equality

这套固定样板压薄。

### 不建议做的事

不建议强行做成 `shared/core` 级万能工厂。

原因：

- node / edge / mindmap 结构差异还是明显
- 配置过重的通用工厂会比手写更难读

## 6. 领域 equality 在 core / engine / editor 三层有重复

### 现状

目前 edge 相关 equality 分散在多处：

- [edge/patch.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/edge/patch.ts)
- [finalize.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts)
- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/edge.ts)

重复内容包括：

- edge end equality
- anchor equality
- route equality
- labels equality

另外 rect equality 也有局部重复：

- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/node.ts)
- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/mindmap.ts)

而 `shared/core` 已经有：

- `sameRect`
- `sameOptionalRect`
- `samePointArray`

### 长期最优

分两层收：

#### 1. 通用几何 equality

继续进 `shared/core` 或直接复用现有实现。

例如 editor 里本地 `isRectEqual` 应尽量替换为 `sameRect`。

#### 2. whiteboard 领域 equality

进 `@whiteboard/core`，例如：

```ts
sameEdgeEnd(...)
sameEdgeRoute(...)
sameEdgeLabels(...)
sameEdgeLabel(...)
```

engine / editor 都复用。

### 不建议做的事

不要让 engine/editor 各自再维护一套 edge equality。

## 三、同包内很值得继续抽的点

## 7. Node field batch command 还能进一步数据驱动

### 现状

在 [node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/commands.ts) 和 [node/text.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts) 里还有大量这种结构：

```ts
nodeIds.map((id) => ({
  id,
  update: styleUpdate('fill', value)
}))
```

或：

```ts
nodeIds.map((id) => ({
  id,
  update: dataUpdate('kind', kind)
}))
```

### 长期最优

在 `runtime/node` 内部做一层 field command builder：

```ts
createNodeFieldBatchCommand(...)
writeNodeStyle(...)
writeNodeData(...)
```

把：

- `style`
- `text`
- `shape`

这些动作的“批量 updateMany 样板”压成统一设施。

### 归属

这层应留在 `whiteboard-editor/runtime/node`。

## 8. 颜色面板 / slider section / segmented options 还可以继续复用

### 现状

下面这些组件在 UI 模板上有明显重复：

- [BorderPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/BorderPanel.tsx)
- [FillPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FillPanel.tsx)
- [TextColorPanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/TextColorPanel.tsx)
- [FontSizePanel.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/FontSizePanel.tsx)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)

重复模式包括：

- 颜色 swatch grid
- segmented enum row
- slider section
- 百分比格式化

### 长期最优

只在 `whiteboard-react` 内部增加 primitives：

```tsx
<ColorSwatchGrid ... />
<SliderSection ... />
<EnumSegmentPanel ... />
formatPercent(...)
```

### 归属

这不建议进 `shared/react`。

原因：

- 组件已经带很强的 whiteboard toolbar 视觉与交互约束
- shared 层不需要理解这些产品语义

## 四、已有文件还可以进一步简化

## 9. `SelectionTarget -> entities` 的读取还没完全正式化

### 现状

现在已经有：

- [target.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/target.ts)
- [target.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/target.ts)

但局部还有直接：

- `list.get().map(id => item.get(id)?.node)`
- `list.get().map(id => item.get(id)?.edge)`

例如：

- [move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts)
- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/node.ts)

### 长期最优

继续把“按 target / selection / id list 取实体”的语义收成正式 read。

例如：

```ts
read.node.nodes(nodeIds)
read.edge.edges(edgeIds)
```

或者更明确一点：

```ts
read.node.listItems(nodeIds)
read.edge.listItems(edgeIds)
```

这样上层不再自己：

- 读 list
- map id
- filter undefined

## 五、明确不建议继续抽的点

## 10. 不要再回到“大而全 selector facade”

当前 `editor.select` 已经删除，这是正确方向。

不要因为 react 侧有重复读取就再补：

- `useEditorPanelState`
- `useEditorChromeState`
- `useEditorSelectionState`

这类聚合 hook。

当前直接：

```ts
useStoreValue(editor.read.panel)
useStoreValue(editor.read.chrome)
useStoreValue(editor.store.selection)
```

已经够薄。

## 11. 不要把 whiteboard toolbar UI primitives 抬到 shared/react

像：

- swatch grid
- shape panel
- toolbar shell

这些都强绑定 whiteboard 视觉与布局，不应该污染 shared。

## 六、最终分层建议

## 适合进 `shared/*`

只放真正通用的能力：

- 几何 / 集合 equality 的基础实现
- store 基础协议
- react 对 `ReadStore` / `KeyedReadStore` 的消费 helper

## 适合进 `@whiteboard/core`

放 whiteboard 领域但与 runtime/UI 无关的能力：

- edge / node 领域 equality
- field / patch 纯算法
- selection / target 纯查询算法

## 适合进 `whiteboard-editor`

放 editor runtime 的内部设施：

- overlay branch mutator
- keyed read pipeline builder
- node / edge 语义命令
- node field batch command helper

## 适合进 `whiteboard-react`

放 UI 组合层设施：

- floating toolbar shell
- color/slider/segmented panel primitives
- toolbar item shared action binder

## 七、建议的实施顺序

### 阶段 1

先做 React -> Editor 语义命令收口。

目标：

- 删除 react 自己拼 node patch
- 补齐 edge 语义命令
- 删掉 UI 里的 patch glue

涉及：

- [node/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/commands.ts)
- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edge.ts)
- [update.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/update.ts)
- toolbar item 相关文件

### 阶段 2

做 floating toolbar shell。

目标：

- NodeToolbar / EdgeToolbar 共用一套位置与 panel 管理壳子

涉及：

- [NodeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx)
- [EdgeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeToolbar.tsx)

### 阶段 3

做 overlay / read / equality 收口。

目标：

- overlay branch update 更薄
- editor read keyed pipeline 更薄
- edge equality 统一归 core

涉及：

- overlay
- runtime/read
- `@whiteboard/core/edge`
- engine normalize/finalize

## 八、最终判断

whiteboard 现在最明显还能继续优化的，并不是“再补 helper 数量”，而是把下面三件事彻底做完：

1. UI 不再理解 patch 结构，只调 editor 语义动作
2. NodeToolbar / EdgeToolbar 的外壳完全共享
3. 领域 equality 回到 core，不再散落在 engine/editor

这三刀做完之后，whiteboard 的复杂度会继续明显下降，而且不会引入新的抽象负担。
