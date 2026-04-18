# Whiteboard Editor Public API Final Architecture

这份文档只回答一件事：

**`@whiteboard/editor` 的主入口最终应该导出什么，不应该导出什么，以及如何把当前过宽的 public surface 一次性收口到长期最优形态。**

目标固定为：

1. `editor` 是纯 runtime，不是工具箱，不是产品目录，也不是内部实现明细的展示窗。
2. 主入口只暴露外部集成真正需要的 contract。
3. 内部 read graph、write patch、fallback 默认值、layout key helper 这类内部胶水不进入 public API。
4. 命名尽量短、清晰、稳定，不保留重复别名和无意义的叶子类型。

---

## 1. 当前问题

当前 [whiteboard/packages/whiteboard-editor/src/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/index.ts) 的问题不是“导出太多”这么简单，而是混了四层不同职责：

1. 运行时 facade
2. 外部真正需要依赖的 contract type
3. facade 内部叶子结构类型
4. editor 与 react layout adapter 之间的实现胶水

这会导致三个后果：

1. 外层很容易直接依赖 editor 内部结构，而不是依赖稳定的 facade。
2. editor 主入口会持续膨胀，任何内部重构都会牵动 public API。
3. 一些本该只存在于 editor 内部或 react adapter 内部的 helper，被误提升成“官方能力”。

---

## 2. 最终原则

`@whiteboard/editor` 主入口最终只允许导出三类东西。

### 2.1 运行时入口

这类是外部创建和持有 editor runtime 必须依赖的能力。

保留：

1. `createEditor`
2. `Editor`

### 2.2 外部集成 contract

这类是 react、host、registry、layout backend、tool controller 等外部集成真正需要依赖的稳定接口。

保留：

1. `Tool`
2. `DrawMode`
3. `DrawState`
4. `NodeDefinition`
5. `NodeRegistry`
6. `EditField`
7. `EditCaret`
8. `EditSession`
9. `KeyboardInput`
10. `PointerInput`
11. `PointerDownInput`
12. `PointerMoveInput`
13. `PointerUpInput`
14. `PointerSample`
15. `WheelInput`
16. `ModifierKeys`
17. `ContextMenuInput`
18. `ContextMenuIntent`
19. `EditorPick`
20. `LayoutBackend`
21. `LayoutRequest`
22. `TextTypographyProfile`
23. `SelectionOverlay`
24. `SelectionToolbarContext`
25. `SelectionToolbarScope`
26. `ClipboardPacket`
27. `createClipboardPacket`
28. `parseClipboardPacket`
29. `serializeClipboardPacket`
30. `ClipboardTarget`

### 2.3 少量外部真实消费的 draw helper

这类虽然不是 facade，但当前已经形成稳定的跨包使用，而且确实属于 editor 的通用 runtime 语义。

保留：

1. `DRAW_MODES`
2. `DRAW_BRUSHES`
3. `DRAW_SLOTS`
4. `DEFAULT_DRAW_MODE`
5. `DEFAULT_DRAW_BRUSH`
6. `DEFAULT_DRAW_STATE`
7. `isDrawMode`
8. `hasDrawBrush`
9. `readDrawSlot`
10. `readDrawStyle`
11. `patchDrawStyle`
12. `setDrawSlot`

说明：

1. 这部分仍然需要进一步压缩，但它们当前被 `whiteboard-react` 的 toolbox 真实使用。
2. 因为这是 editor 的通用 draw runtime 语义，而不是 whiteboard product 目录，所以可以留在 editor。

---

## 3. 必须删除的主入口导出

下面这些类型或常量，不应该继续从 `@whiteboard/editor` 主入口导出。

### 3.1 纯内部实现结构

删除：

1. `EditorChromePresentation`
2. `EditorPanelPresentation`
3. `EditorRead`
4. `EditorStore`
5. `EditorEvents`
6. `EditorInputHost`
7. `EditorQuery`

原因：

1. 这些都是 facade 的内部组成结构，不是外部稳定 contract。
2. 外部如果真的需要类型，应通过 `Editor['read']`、`Editor['store']`、`Editor['events']` 这类派生方式获得。
3. 主入口直接导出这些类型，会把 editor 内部 shape 固化成 public API。

### 3.2 无新增语义的重复别名

删除：

1. `EditorSelectionActions`
2. `EditorEditActions`
3. `EditorNodeActions`
4. `EditorEdgeActions`

原因：

1. 它们只是 `SelectionActions`、`EditActions`、`NodeActions`、`EdgeActions` 的别名。
2. 主入口同时导两套名字没有任何价值，只会增加心智负担。

最终抉择：

1. 保留 base name
2. 删除 `Editor*Actions` 别名

### 3.3 无外部消费者的 action 叶子类型

删除：

1. `AppActions`
2. `ClipboardActions`
3. `DrawActions`
4. `EdgeActions`
5. `NodeActions`
6. `MindmapActions`
7. `ToolActions`
8. `ViewportActions`
9. `HistoryActions`
10. `EditorActions`

原因：

1. 当前仓库没有跨包直接 import 这些类型。
2. 它们应作为 `Editor['actions']` 的内部组成存在，而不是主入口摊平暴露。
3. 对外公开 `Editor` 本体就足够。

### 3.4 默认值和 fallback 配置

删除：

1. `EditorDefaults`
2. `EditorEdgeDefaults`
3. `EditorNodePaintDefaults`
4. `DEFAULT_EDITOR_DEFAULTS`

原因：

1. 这是 `createEditor()` 的内部 fallback/config 结构，不是 public API。
2. 把它们挂到主入口，会诱导上层去依赖 editor 的默认实现细节。
3. 真正需要的是 `createEditor({ services })` 的入参 contract，而不是默认值对象本身。

最终做法：

1. 这些类型保留在 editor 内部文件中
2. 不从主入口导出
3. `createEditor` 参数推导即可覆盖外部类型需求

### 3.5 write patch 与 write-layer 中间类型

删除：

1. `EdgeLabelPatch`
2. `MindmapBorderPatch`
3. `MindmapBranchPatch`

原因：

1. 这些是 write-layer patch 结构，不是 editor facade contract。
2. 当前没有外部跨包直接消费它们。
3. 它们只会把 write 实现细节泄漏到 public surface。

### 3.6 不应由 editor 主入口转发的 core 类型

删除：

1. `OrderMode`

原因：

1. `OrderMode` 的真正来源是 `@whiteboard/core/types`。
2. editor 再转一遍只会制造边界模糊。
3. 谁需要这个类型，直接从 core 取。

### 3.7 Tool 和 layout 的细粒度叶子类型

删除：

1. `DrawTool`
2. `EdgeTool`
3. `InsertTool`
4. `InsertTemplate`
5. `DrawBrushState`
6. `DrawPreview`
7. `BrushStyle`
8. `BrushStylePatch`
9. `DrawStyle`
10. `DrawBrush`
11. `DrawSlot`

原因：

1. 外部通常只需要 `Tool`、`DrawMode`、`DrawState`。
2. 子类型都可以通过 `Extract<Tool, ...>` 或 `DrawState['pen']` 一类推导获得。
3. 继续导出这些叶子会让主入口保持膨胀。

补充判断：

1. 其中有少数 helper 当前被 `whiteboard-react` toolbox 真实消费。
2. 所以最终收口应分两步：
   1. 先删明显没用的子类型导出
   2. 再把 `whiteboard-react` 对 draw 叶子类型的依赖收敛到自己的 view model

### 3.8 layout 的叶子辅助类型

删除：

1. `LayoutKind`
2. `LayoutResult`
3. `NodeLayoutSpec`
4. `TextSourceField`
5. `TextSourceId`

原因：

1. 外部真正需要的是 `LayoutBackend`、`LayoutRequest`、`TextTypographyProfile`。
2. `LayoutKind` / `LayoutResult` / `TextSourceId` 都属于内部细粒度实现结构。
3. `NodeLayoutSpec` 是 editor node registry 内部 contract，不必在主入口再抬一遍。

### 3.9 selection presentation 的过细叶子

删除：

1. `SelectionEdgeTypeInfo`
2. `SelectionNodeInfo`
3. `SelectionNodeTypeInfo`
4. `SelectionToolbarEdgeScope`
5. `SelectionToolbarLockState`
6. `SelectionToolbarNodeKind`
7. `SelectionToolbarNodeScope`
8. `SelectionToolbarScopeKind`

原因：

1. react 跨包真实消费的稳定类型是：
   1. `SelectionOverlay`
   2. `SelectionToolbarContext`
   3. `SelectionToolbarScope`
2. 其余都是 context 内部叶子结构，没有必要进入主入口。

### 3.10 node registry 叶子类型

删除：

1. `ControlId`
2. `NodeHit`
3. `NodeFamily`
4. `NodeMeta`

原因：

1. 这些只是 editor node registry 的内部叶子类型。
2. `whiteboard-react` 当前通过主入口转用它们，但长期最优是 react 自己定义自己的 registry surface。
3. editor 主入口不该为 react 的内部 registry 再暴露一组细碎叶子。

---

## 4. `readEdgeLabelTextSourceId` / `readNodeTextSourceId` 的最终判断

这两个函数当前定义在 [whiteboard/packages/whiteboard-editor/src/types/layout.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/layout.ts)。

### 4.1 `readEdgeLabelTextSourceId`

最终结论：

**不应导出。**

原因：

1. 当前只被 editor 内部使用。
2. 它没有任何跨包 contract 价值。
3. 它只是 layout source key 的字符串序列化 helper。

最终做法：

1. 收回 editor 内部
2. 从主入口删除

### 4.2 `readNodeTextSourceId`

最终结论：

**也不应继续从 editor 主入口导出。**

原因：

1. 它虽然被 react 使用，但职责不是 editor public API。
2. 它本质是 editor layout runtime 与 react DOM text source store 之间的胶水协议。
3. 把它挂在主入口，会让“字符串 key 规则”变成 editor 的官方语义。

这不是正确抽象。

---

## 5. Text Source 这条线的长期最优模型

当前模型的问题是：

1. `LayoutRequest` 暴露了 `sourceId?: string`
2. editor 内部生成这个 string
3. react 必须知道完全一样的序列化规则来绑定 DOM source

这会迫使 editor 主入口暴露：

1. `TextSourceId`
2. `TextSourceField`
3. `readNodeTextSourceId`
4. `readEdgeLabelTextSourceId`

这条线的根问题是：**把结构化 source 引用错误地降级成了 opaque string。**

### 5.1 最终模型

引入结构化 `TextSourceRef`：

```ts
export type TextSourceRef =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
    }
```

然后：

1. `LayoutRequest` 不再使用 `sourceId?: string`
2. 改为 `source?: TextSourceRef`
3. editor layout runtime 内部构造结构化 source
4. react 的 `TextSourceStore` 也按 `TextSourceRef` 查找

### 5.2 改造收益

这会直接删掉一整串不合理导出：

1. `TextSourceId`
2. `TextSourceField`
3. `readNodeTextSourceId`
4. `readEdgeLabelTextSourceId`

同时使职责更清晰：

1. editor 提供“布局请求引用的是哪个语义对象”
2. react 决定“如何把这个语义对象映射到 DOM source”
3. 不再用硬编码字符串协议耦合两个层

### 5.3 实施顺序

第一步：

1. 保持当前 string 机制不动
2. 先从主入口删除 `readEdgeLabelTextSourceId`

第二步：

1. 引入 `TextSourceRef`
2. 改写 `LayoutRequest`
3. 更新 editor layout runtime
4. 更新 react `TextSourceStore`
5. 删除 `TextSourceId` / `TextSourceField` / `readNodeTextSourceId`

---

## 6. 主入口最终保留清单

下面是长期最优的最终主入口保留清单。

### 6.1 Runtime

保留：

1. `createEditor`
2. `Editor`

### 6.2 Edit

保留：

1. `EditField`
2. `EditCaret`
3. `EditSession`

删除：

1. `EditCapability`
2. `EditLayout`
3. `EditEmptyBehavior`

原因：

1. 外部真实消费主要是 edit session 与 caret/field。
2. capability/layout/emptyBehavior 更偏 editor 内部建模。

### 6.3 Input

保留：

1. `ContextMenuInput`
2. `ContextMenuIntent`
3. `KeyboardInput`
4. `ModifierKeys`
5. `PointerInput`
6. `PointerDownInput`
7. `PointerMoveInput`
8. `PointerUpInput`
9. `PointerSample`
10. `WheelInput`
11. `EditorPick`

### 6.4 Tool / Draw

保留：

1. `Tool`
2. `DrawMode`
3. `DrawState`
4. `DRAW_MODES`
5. `DRAW_BRUSHES`
6. `DRAW_SLOTS`
7. `DEFAULT_DRAW_MODE`
8. `DEFAULT_DRAW_BRUSH`
9. `DEFAULT_DRAW_STATE`
10. `isDrawMode`
11. `hasDrawBrush`
12. `readDrawSlot`
13. `readDrawStyle`
14. `setDrawSlot`
15. `patchDrawStyle`

删除：

1. `DrawTool`
2. `EdgeTool`
3. `InsertTool`
4. `InsertTemplate`
5. `DrawBrush`
6. `DrawSlot`
7. `DrawBrushState`
8. `DrawStyle`
9. `DrawPreview`
10. `BrushStyle`
11. `BrushStylePatch`
12. `normalizeDrawState`
13. `isDrawStateEqual`
14. `readDrawBrushStyle`

说明：

1. 第二轮还可以继续把 toolbox 对 draw 叶子 helper 的依赖压成 react 自己的 view model。
2. 但本轮最终目标是先把 editor 主入口从“内部实现超市”收成“运行时 API”。

### 6.5 Node Registry

保留：

1. `NodeDefinition`
2. `NodeRegistry`

删除：

1. `ControlId`
2. `NodeHit`
3. `NodeMeta`
4. `NodeFamily`

### 6.6 Layout

保留：

1. `LayoutBackend`
2. `LayoutRequest`
3. `TextTypographyProfile`

删除：

1. `LayoutKind`
2. `LayoutResult`
3. `NodeLayoutSpec`
4. `TextSourceField`
5. `TextSourceId`
6. `readNodeTextSourceId`
7. `readEdgeLabelTextSourceId`

### 6.7 Selection Presentation

保留：

1. `SelectionOverlay`
2. `SelectionToolbarContext`
3. `SelectionToolbarScope`

删除：

1. 其他 selection presentation 叶子类型

### 6.8 Clipboard

保留：

1. `ClipboardPacket`
2. `createClipboardPacket`
3. `parseClipboardPacket`
4. `serializeClipboardPacket`
5. `ClipboardTarget`

删除：

1. `ClipboardActions`
2. `ClipboardOptions`

---

## 7. `createEditor()` 的最终对外设计

当前 `createEditor()` 外部真正需要知道的是：

1. `engine`
2. `initialTool`
3. `initialDrawState`
4. `initialViewport`
5. `registry`
6. `services.layout`

当前 `services.defaults` 只是产品注入通道，不应该成为 editor 主入口 public 设计的一部分。

最终抉择：

1. 对外仍允许传入 `services.defaults`
2. 但不从主入口导出 defaults 类型和默认对象
3. 由 `createEditor` 参数推导承担类型能力

也就是说：

1. editor 允许高级调用方注入 defaults
2. 但 editor 不把 defaults 提升成 public “能力域”

这样才能保持：

1. `editor` 是 runtime
2. `product` 是 defaults source

---

## 8. 实施方案

### 阶段 1：主入口瘦身，不动底层语义

目标：

1. 只调整 `src/index.ts` 导出
2. 不改 runtime 行为

要做的事：

1. 删除重复 alias 导出
2. 删除内部实现类型导出
3. 删除 patch/defaults/query/order 等不该公开的类型
4. 保留当前 react 仍真实依赖的最小集合

完成标准：

1. `src/index.ts` 明显缩短
2. `whiteboard-react` 仍可 typecheck

### 阶段 2：收掉 `readEdgeLabelTextSourceId`

目标：

1. 先去掉确定无外部消费者的 helper

要做的事：

1. 从主入口删除 `readEdgeLabelTextSourceId`
2. editor 内部改为直接从内部路径使用，或直接内联

完成标准：

1. 主入口不再导出 `readEdgeLabelTextSourceId`
2. 仓库 typecheck/test 通过

### 阶段 3：把 text source 从 string key 改成结构化 source

目标：

1. 根治 `readNodeTextSourceId` 这类导出存在的原因

要做的事：

1. 引入 `TextSourceRef`
2. 改 `LayoutRequest`
3. 改 editor layout runtime
4. 改 react `TextSourceStore`
5. 删除 `TextSourceId`
6. 删除 `TextSourceField`
7. 删除 `readNodeTextSourceId`
8. 删除 `readEdgeLabelTextSourceId`

完成标准：

1. layout request 不再依赖字符串协议
2. editor 主入口不再暴露任何 text source key helper

### 阶段 4：继续压缩 draw 叶子导出

目标：

1. 让 `editor` 主入口只保留 draw 的稳定 contract

要做的事：

1. react toolbox 建立自己的 draw view model
2. 减少对 `DrawBrushState`、`BrushStyle`、`DrawStyle` 等 editor 叶子类型的直接依赖
3. 视情况继续收掉 `readDrawSlot` / `readDrawStyle` 一部分 helper

完成标准：

1. 主入口里的 draw 导出只保留稳定 contract 与少量必要 helper

---

## 9. 最终判断

这条线最终没有模糊空间。

最终结论固定为：

1. `@whiteboard/editor` 主入口必须显著瘦身。
2. `Editor` facade 是对外核心，不是 `EditorQuery`、`EditorStore`、`EditorRead` 这些内部形状。
3. defaults、patch、query、order、selection 叶子结构都不该挂在主入口。
4. `readEdgeLabelTextSourceId` 与 `readNodeTextSourceId` 的存在，本质是 text source 抽象做错了。
5. 长期最优不是换个地方继续导出 string key builder，而是把 source 建模改成结构化引用。

一句话总结：

**editor 主入口应当只暴露“外部如何驱动 runtime”，不暴露“runtime 内部是怎么拼出来的”。**
