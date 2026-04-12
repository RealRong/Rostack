# Whiteboard Editor 中轴化扫描与重构方案

## 目标

这份文档基于当前 `whiteboard/packages/whiteboard-editor` 的整体实现，按“中轴思维”重新审视 editor 包内部的结构问题，重点回答下面五类问题：

1. 哪些地方在从 core 或各种 helper 直接取原料，再在 editor 里构造复杂逻辑
2. 哪些地方存在多处重复或近似重复逻辑
3. 哪些能力明确可以下沉为 core / engine / editor 中轴逻辑
4. 哪些地方可以通过内聚减少对外函数、常量、散落 helper
5. 哪些地方已经触碰了 editor 不该直接触碰的领域逻辑或内部结构

目标不是继续做局部修修补补，而是给出一套“长期最优”的收敛方向。

## 结论

当前 `whiteboard-editor` 已经完成了一轮很大的扁平化和中轴化，但仍然存在四条主轴没有完全立住：

1. `selection axis`
2. `node presentation axis`
3. `text transform axis`
4. `mindmap axis`

现在最明显的问题不是“某个 helper 写得丑”，而是：

- editor 里仍有几块区域在自己拉 core helper 拼最终业务语义
- interaction / read / commands 三层之间还有旁路
- selection / node presentation / text transform / mindmap 仍然缺少真正单一的中轴

## 一、最高优先级问题

## 1. `selectionPresentation.ts` 过载，已经同时承担样式默认值、能力判断、展示语义和 toolbar 组装

### 关键文件

- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)
- [selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts)
- [nodeSummary.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/selection/nodeSummary.ts)

### 现状

[selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts#L1) 当前同时在做下面几类事情：

- 读取 node 默认样式
- 根据 schema 和 style 实际值判断字段能力
- 读取 registry meta / controls
- 判断 selection kind
- 解析 toolbar 各字段统一值
- 组装 `NodeToolbarContext`
- 处理 `SelectionOverlay`
- 内嵌 UI 相关默认色语义，例如 `var(--ui-text-primary)`

同时它和 [nodeSummary.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/selection/nodeSummary.ts#L35) 重复在做：

- `definition?.describe?.(node) ?? definition?.meta`
- 节点类型聚合
- registry 元信息读取

### 问题归类

- 命中问题 1：直接从 core / registry / schema 拿原料，在 editor read 层本地拼最终复杂语义
- 命中问题 2：和 `nodeSummary.ts` 明显重复
- 命中问题 3：应下沉为 editor 内部单一 presentation 中轴
- 命中问题 4：当前暴露出大量只服务这一条链路的局部 helper
- 命中问题 5：已经碰到 UI 默认值和展示语义，不再只是 editor read

### 长期最优

不要继续在 `selectionPresentation.ts` 里堆 helper。

应该显式建立 `node presentation axis`，例如：

```ts
editor.read.node.presentation.meta(node)
editor.read.node.presentation.controls(node)
editor.read.node.presentation.defaults(node)
editor.read.node.presentation.styleSupport(nodes)
editor.read.selection.presentation.toolbar(target)
editor.read.selection.presentation.overlay(target)
```

其中：

- `node.presentation.*` 负责节点级展示语义
- `selection.presentation.*` 负责 selection 级展示组合

### 必须删除或收敛的旧结构

- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts) 中散落的 `readDefaultFill/readDefaultStroke/readDefaultTextColor/...`
- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts) 中散落的 `supportsStyleField/hasControl/resolveToolbarSelectionKind`
- [nodeSummary.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/selection/nodeSummary.ts) 中重复的 registry meta 读取逻辑

## 2. 文本 transform 语义仍然卡在 interaction 层，交互层知道太多文本领域模型

### 关键文件

- [transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts)

### 现状

[transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts#L302) 的 `single-text` 分支当前直接负责：

- 调 core resize 几何
- 调 snap
- 产生 preview
- 从 live preview item 反推最终 rect
- 决定 `widthMode`
- 决定 `wrapWidth`
- 决定 `fontSize`
- 组装最终 `NodeUpdateInput`

尤其是提交阶段 [transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts#L420) 这段逻辑，已经不是“interaction 层调命令”，而是 interaction 自己在做文本领域提交计划。

### 问题归类

- 命中问题 1：自己从 core helper 和 read 结果拼复杂领域逻辑
- 命中问题 3：应下沉为 editor 的文本变换中轴
- 命中问题 5：interaction 直接触碰了文本宽度模型和 preview 合并后的内部结构

### 长期最优

建立 `text transform axis`，把“文本 resize / scale 的 preview 与 commit 规划”移出 interaction：

```ts
editor.actions.node.textTransform.start(...)
editor.actions.node.textTransform.preview(...)
editor.actions.node.textTransform.commit(...)
```

或者至少形成一个内部 planner：

```ts
editor.node.textTransform.planPreview(...)
editor.node.textTransform.planCommit(...)
```

interaction 只负责：

- pointer / autopan / snap 输入
- 调 planner
- 执行 planner 产出的 preview / commit

### 必须删除或收敛的旧结构

- [transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts) 中 `single-text` 分支自己拼 `widthMode / wrapWidth / fontSize` 的逻辑
- interaction 直接读取 preview live item 再反推 commit 的方式

## 3. `edit.ts` 直接碰 `engine.read` committed 结构，绕过 editor 自己已有中轴

### 关键文件

- [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts)
- [node/context.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/context.ts)

### 现状

[edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts#L53) 和 [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts#L75) 仍然直接读取：

- `engine.read.edge.item.get(...)`
- `engine.read.node.item.get(...)`

而 node 这边其实已经有 [node/context.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/context.ts#L7) 明确区分：

- committed
- live
- preview
- session

这说明 edit command 还在走旁路。

### 问题归类

- 命中问题 3：应下沉到统一 edit context / node-edge edit axis
- 命中问题 4：当前多出了一条 committed 读取旁路
- 命中问题 5：直接碰 engine committed 结构，绕过 editor 语义边界

### 长期最优

把 `edit.cancel / edit.commit` 建立在统一的 edit 中轴上：

```ts
editor.actions.edit.cancel()
editor.actions.edit.commit()
```

内部依赖：

```ts
editor.edit.node.committed(nodeId)
editor.edit.node.live(nodeId)
editor.edit.edge.committed(edgeId)
editor.edit.edge.live(edgeId)
```

不要让 `edit.ts` 再直接依赖 `engine.read.*.item`。

### 必须删除或收敛的旧结构

- [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts) 中直接访问 `engine.read.node.item`
- [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts) 中直接访问 `engine.read.edge.item`

## 二、高优先级问题

## 4. `edge/routePoint.ts` 存在两套高度重复的 route session 逻辑

### 关键文件

- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts)

### 现状

当前这个文件里至少有两套非常近似的交互 session：

- anchor route handle session
- elbow segment route handle session

重复内容包括：

- 本地 state
- step
- gesture 生成
- autoPan
- move
- up 提交

参见：

- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts#L102)
- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts#L243)

### 问题归类

- 命中问题 2：明显重复
- 命中问题 4：可以通过单一 session 工厂减少局部 helper 和分支复制

### 长期最优

建立统一的 `createEdgeRouteSession(...)`：

```ts
createEdgeRouteSession({
  initState,
  readEdge,
  canEditRoute,
  createInitialGesture,
  commit
})
```

anchor / segment 只提供：

- 初始化 state
- commit 策略
- 初始 activeRouteIndex

其余 step / gesture / autopan / move / up 共用。

### 必须删除或收敛的旧结构

- [routePoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/edge/routePoint.ts) 中两套手写 session 模板

## 5. `mindmap` 缺少 editor 内部单一中轴，commands 和 interactions 各自读内部结构

### 关键文件

- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/mindmap.ts)
- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/mindmap.ts)

### 现状

commands 层自己读：

- `editor.read.node.item.get(nodeId)?.node.position`

见 [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/mindmap.ts#L53)

interactions 层自己读：

- `ctx.read.mindmap.item.get(treeId)`
- `treeView.node.position`

见 [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/mindmap.ts#L56)

说明 mindmap 的 tree snapshot、root position、drop 语义、layout hint 还没有统一到 editor 中轴。

### 问题归类

- 命中问题 1：从 core 和 read 原始结构取料再拼业务
- 命中问题 3：应下沉为 editor 内部 mindmap axis
- 命中问题 5：interaction / commands 都在触碰 mindmap 内部结构

### 长期最优

建立：

```ts
editor.read.mindmap.tree(treeId)
editor.read.mindmap.rootPosition(treeId)
editor.actions.mindmap.drag.commit(...)
editor.actions.mindmap.insert.byPlacement(...)
```

让：

- commands 不再直接从 `node.item` 读取 root position
- interactions 不再直接消费 `mindmap.item` 内部快照结构

### 必须删除或收敛的旧结构

- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/mindmap.ts) 中 `readNodePosition`
- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/mindmap.ts) 中直接读 `treeView` 再自行组装 drag state 的路径

## 三、中优先级问题

## 6. `session.ts` 里 selection 规则和 state mutation 仍然混在一起

### 关键文件

- [session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/session.ts)
- [state/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts)
- [state/selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/selection.ts)

### 现状

[session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/session.ts#L156) 中 `replace/add/remove/toggle/selectAll/clear` 都在重复同一模式：

- 读当前 selection
- `normalize` 或 `apply`
- 判断是否变化
- 清 edit
- 再调用 mutation

`selectAll` 还直接依赖：

- `engine.read.node.list`
- `engine.read.edge.list`

见 [session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/session.ts#L188)

### 问题归类

- 命中问题 1：在 commands 里直接拼 selection 规则
- 命中问题 2：四个动作重复
- 命中问题 3：应下沉为 selection axis
- 命中问题 4：可以内聚减少外部 helper 和重复 mutation 包装
- 命中问题 5：commands 直接依赖 engine list，而不是 editor 语义读层

### 长期最优

让 `selection state axis` 自己提供：

```ts
selection.apply(mode, input)
selection.replaceNormalized(target)
selection.selectAll(read)
selection.reconcile(read)
```

然后 session commands 只做转发，不再自己拼规则。

### 必须删除或收敛的旧结构

- [session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/session.ts) 中 selection 四个分支重复的 `applySelectionTarget(...)`
- [state/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts) 中散落的 selection reconcile 细节

## 7. `selection.ts`、`nodeSummary.ts`、`selectionPresentation.ts` 形成了三段式散链，而不是明确两层中轴

### 关键文件

- [selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts)
- [nodeSummary.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/selection/nodeSummary.ts)
- [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)

### 现状

当前链路基本是：

1. `selection.ts` 生成 `summary / affordance / transformBox`
2. `nodeSummary.ts` 再从 `summary` 派生节点类型聚合
3. `selectionPresentation.ts` 再从 `summary + registry` 派生 toolbar / overlay

这会导致：

- registry meta 多次读取
- 节点类型聚合与展示聚合拆散
- selection presentation 仍然依赖多个旁路模块

### 问题归类

- 命中问题 2：同类语义在多处重复组织
- 命中问题 3：应该下沉为 selection presentation 中轴
- 命中问题 4：可通过内聚显著减少模块间跳转

### 长期最优

只保留两层：

1. `selection.model`
2. `selection.presentation`

不要再保留现在这种 `summary -> nodeSummary -> presentation` 的散链。

## 四、低优先级但应该顺手收的点

## 8. `state/index.ts` 里的去重和 reconcile 逻辑是典型可收敛样板

### 关键文件

- [state/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts)

### 现状

这里有：

- `uniqueNodeIds`
- `uniqueEdgeIds`
- `reconcileAfterCommit`

它们本质都是 selection target 修正逻辑的一部分。

### 问题归类

- 命中问题 2：重复
- 命中问题 4：可内聚减少对外 helper

### 长期最优

收成：

```ts
reconcileSelectionTarget(read, target)
dedupeSelectionTarget(target)
```

不要把 node/edge 的去重分开写。

## 五、边界判断

## 明确触碰 editor 不该直接触碰的领域逻辑或内部结构

下面这些是这轮扫描里最明确的越界点：

1. [transform.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/transform.ts)
   交互层直接拼文本宽度模式、wrapWidth、fontSize 最终提交语义。

2. [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/edit.ts)
   命令层直接读 `engine.read.*.item` committed 结构。

3. [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/commands/mindmap.ts)
   commands 直接从 `node.item` 推 root position。

4. [selectionPresentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts)
   editor read 直接内嵌 UI 默认值和展示语义。

## 六、建议的最终中轴设计

## 1. Selection Axis

```ts
editor.selection.apply(mode, input)
editor.selection.selectAll()
editor.selection.reconcile(read)
editor.selection.press.resolve(...)
```

负责：

- 选择规则
- commit 后 reconcile
- press / marquee / move 共享 target 语义

## 2. Node Presentation Axis

```ts
editor.read.node.presentation.meta(node)
editor.read.node.presentation.defaults(node)
editor.read.node.presentation.controls(node)
editor.read.node.presentation.styleSupport(nodes)
editor.read.selection.presentation.toolbar(target)
editor.read.selection.presentation.overlay(target)
```

负责：

- registry meta
- 默认样式与默认展示值
- toolbar / overlay 展示模型

## 3. Text Transform Axis

```ts
editor.node.textTransform.planPreview(...)
editor.node.textTransform.planCommit(...)
```

负责：

- text reflow / scale
- widthMode / wrapWidth / fontSize 的统一提交规划

## 4. Mindmap Axis

```ts
editor.read.mindmap.tree(treeId)
editor.read.mindmap.rootPosition(treeId)
editor.actions.mindmap.insert.byPlacement(...)
editor.actions.mindmap.drag.commit(...)
```

负责：

- tree snapshot
- root move / subtree move
- placement / drop / layout hint

## 七、实施顺序

### 阶段 1

收 `selectionPresentation.ts` + `nodeSummary.ts`：

- 抽 `node presentation axis`
- 删掉重复的 registry/meta/default/control 读取

### 阶段 2

收文本 transform：

- 抽 `text transform axis`
- interaction 不再自己拼文本提交 update

### 阶段 3

收 edit / session：

- `edit.ts` 不再直接依赖 `engine.read`
- selection apply / selectAll / reconcile 收回 state 中轴

### 阶段 4

收 edge route 和 mindmap：

- `routePoint.ts` 统一 session 工厂
- mindmap 建立 editor 内部 read / actions 中轴

## 八、最终判断

从中轴视角看，`whiteboard-editor` 当前最值得继续做的不是再补局部 helper，而是把下面四块真正立成单一中轴：

1. selection
2. node presentation
3. text transform
4. mindmap

只要这四块立住，当前 editor 里大部分“自己去 core 拉料再拼逻辑”“多处重复”“边界越界”的问题都会自然收掉。
