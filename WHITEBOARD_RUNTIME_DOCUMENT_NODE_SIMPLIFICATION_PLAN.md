# WHITEBOARD_RUNTIME_DOCUMENT_NODE_SIMPLIFICATION_PLAN

## 目标

盘点 `whiteboard-editor` 中 `runtime/document` 和 `runtime/node` 两块的整体复杂度，判断:

- 哪些抽象仍然有真实价值
- 哪些已经进入收益递减区
- 长期最优的目录与职责结构应该如何收口

本文件只给结构判断与实施方案，不涉及兼容与过渡设计。

## 总结

两块问题不一样:

- `runtime/node` 的问题是“碎”
- `runtime/document` 的问题是“混”

更具体地说:

- `runtime/node` 里存在少量真实复杂模块，加上若干过薄的 mutation 文件
- `runtime/document` 里存在多个真实业务模块，但总装配层、helper 层、类型层混在一起，导致跳转多、边界不稳

长期最优不是继续增加 helper，而是减少薄文件数量，同时让每个目录内的文件只承担一种职责。

## `runtime/node` 盘点

当前文件:

- `appearance.ts`
- `lock.ts`
- `patch.ts`
- `shape.ts`
- `text.ts`
- `types.ts`

### 1. `patch.ts`

文件:

- [patch.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/patch.ts)

判断:

- 值得保留

原因:

- `mergeNodeUpdates`
- `styleUpdate`
- `dataUpdate`
- `createNodePatchWriter`

这些都属于稳定且跨功能复用的“node update 编译与合并能力”，不是简单转发层。

长期定位:

- 继续作为 `runtime/node` 的基础模块保留

### 2. `text.ts`

文件:

- [text.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts)

判断:

- 值得保留
- 但内部职责偏重

当前承担的内容:

- 文本 preview
- cancel
- commit
- empty text delete cascade
- size commit
- toolbar 文本样式写入

问题:

- 文本 session 生命周期逻辑和文本样式批量写入逻辑混在同一个对象中

长期最优:

- 保留 `text.ts`
- 但未来可以拆成两类语义:
  - `nodeTextSession`
  - `nodeTextStyle`

不是为了文件数而拆，而是为了把“输入态/提交态”与“样式 mutation”分开。

### 3. `appearance.ts`

文件:

- [appearance.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/appearance.ts)

判断:

- 中等价值
- 已进入收益递减区

原因:

- 它主要是在做 `styleUpdate(path, value)` 到命名 API 的映射
- 内部实现非常机械:
  - `document.updateMany(nodeIds.map(...))`

这层的价值主要是:

- 对外 API 语义清晰

它的问题不是“错”，而是:

- 单独成文件的体量太小
- 和 `shape.ts` / `lock.ts` 一起看时，碎片化明显

长期最优:

- 不建议再继续细分
- 更适合与 `shape.ts` / `lock.ts` 合并成一个较大的 node mutation 文件

### 4. `shape.ts`

文件:

- [shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/shape.ts)

判断:

- 不值得单独成文件

原因:

- 只有一个 `setKind`
- 逻辑体量很小
- 还只是顺手做了 `shape` 类型过滤

长期最优:

- 并入 node mutation 聚合文件

### 5. `lock.ts`

文件:

- [lock.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/lock.ts)

判断:

- 不值得单独成文件

原因:

- 只有 `set` 和 `toggle`
- `toggle` 只是先读 committed node 再调用 `set`
- 文件体量过小

长期最优:

- 并入 node mutation 聚合文件

### 6. `types.ts`

文件:

- [types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/types.ts)

判断:

- 当前仍有价值
- 但价值依赖于 `runtime/node` 仍是多文件结构

原因:

- 它承担 node 子模块之间的接口边界

长期最优:

- 如果未来把 `appearance.ts` / `shape.ts` / `lock.ts` 并回
- `types.ts` 也应同步缩小

### `runtime/node` 结论

长期最优结构不是继续维持 6 个小文件，而是收成 3 个主文件:

- `patch.ts`
- `text.ts`
- `mutations.ts`

其中:

- `mutations.ts` 吸收原来的:
  - `appearance.ts`
  - `shape.ts`
  - `lock.ts`

这样保留真正复杂的文本子域，同时消除非文本 mutation 的碎片化。

## `runtime/document` 盘点

当前文件:

- `clipboard.ts`
- `edge.ts`
- `mindmap.ts`
- `runtime.ts`
- `selection.ts`
- `target.ts`
- `types.ts`

### 1. `runtime.ts`

文件:

- [runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/runtime.ts)

判断:

- 当前是这一块的主要复杂度来源

问题:

- 它同时承担:
  - document/edge/group/background/history command dispatch
  - node runtime 子模块装配
  - mindmap runtime host 适配和装配

因此这个文件同时像:

- facade
- factory
- adapter

这不是最优结构。

长期最优:

- `runtime.ts` 只负责最终装配
- 不再承担过多局部 helper 映射
- node/mindmap/selection/clipboard 自己完成自己的业务语义

### 2. `selection.ts`

文件:

- [selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/selection.ts)

判断:

- 值得保留

原因:

- 这是实逻辑，不是空壳
- 它承担:
  - duplicate
  - delete
  - order
  - group
  - ungroup
  - frame

问题:

- 仍依赖了体量很薄的 helper 文件 `target.ts`

长期最优:

- 保留 `selection.ts`
- 把 `target.ts` 中与 selection 高耦合的 helper 直接并回来

### 3. `clipboard.ts`

文件:

- [clipboard.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/clipboard.ts)

判断:

- 值得保留

原因:

- 它有完整的业务语义:
  - copy
  - cut
  - paste
  - selection target 解析
  - inserted roots 回填 selection

这不是机械转发层。

长期最优:

- 保留
- 但把 `target.ts` 中与 clipboard 高耦合的 helper 吸收进来

### 4. `edge.ts`

文件:

- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/edge.ts)

判断:

- 有真实逻辑
- 但体量偏小

内容:

- edge label add
- edge label patch
- edge label remove

问题:

- 文件名太宽，但内容其实只服务 label

长期最优:

- 要么保留并重命名为更准确的 `edgeLabel.ts`
- 要么直接并入 `document/runtime.ts`

更推荐前者，因为它确实承载了一小块真实业务语义。

### 5. `mindmap.ts`

文件:

- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/mindmap.ts)

判断:

- 逻辑是真的
- 但内部职责混合

当前同时包含:

- `insertMindmapByPlacement`
- `moveMindmapByDrop`
- `moveMindmapRoot`
- `createMindmapRuntime`

问题:

- 前三者是 mindmap 业务 helper
- 最后一个是 runtime factory
- 这两类职责混在同一个文件里

长期最优:

- 二选一:
  - 这个文件只保留高阶业务 helper
  - 或者只保留 runtime 装配

不应继续混放。

### 6. `target.ts`

文件:

- [target.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/target.ts)

判断:

- 不值得单独成文件

当前内容:

- `toCanvasRefs`
- `resolveInsertedSelection`
- `readGroupTarget`

问题:

- helper 很薄
- 聚合价值不高
- 为共享几个小函数额外增加了一个跳转层

长期最优:

- `toCanvasRefs` / `readGroupTarget` 并入 `selection.ts`
- `resolveInsertedSelection` 并入 `clipboard.ts`

### 7. `types.ts`

文件:

- [types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/document/types.ts)

判断:

- 当前偏大
- 内部概念混杂

问题:

- 一部分是 document runtime public type
- 一部分是内部 host type，比如 `ClipboardRuntime`
- 一部分又依赖 node 子模块类型

这会导致:

- 文件看起来像接口文件
- 实际却承载了较多局部耦合

长期最优:

- 要么拆成:
  - document public types
  - 内部 host/dependency types
- 要么至少把内部 host types 挪回各自实现文件附近

## 两块对比

### `runtime/node`

核心问题:

- 非文本 mutation 被拆得太碎

长期最优:

- 合并薄 mutation 文件

### `runtime/document`

核心问题:

- helper / factory / facade / host type 混在一起

长期最优:

- helper 并回业务文件
- factory 和业务 helper 拆清
- 类型层缩小

## 长期最优结构

### `runtime/node`

建议重组为:

- `patch.ts`
- `text.ts`
- `mutations.ts`
- `types.ts` 视收缩情况决定是否继续保留

说明:

- `mutations.ts` 吸收:
  - `appearance.ts`
  - `shape.ts`
  - `lock.ts`

### `runtime/document`

建议重组为:

- `runtime.ts`
  - 只做最终装配
- `selection.ts`
  - 吸收 `target.ts` 中与 selection 耦合的 helper
- `clipboard.ts`
  - 吸收 `resolveInsertedSelection`
- `edgeLabel.ts`
  - 由当前 `edge.ts` 重命名
- `mindmap.ts`
  - 明确只保留业务 helper 或只保留 runtime factory
- `types.ts`
  - 缩小或拆分

## 推荐实施顺序

### 第一阶段

低风险高收益:

1. `runtime/document/target.ts` 并回
2. `runtime/node/{appearance,shape,lock}.ts` 合并

### 第二阶段

中风险高收益:

3. `runtime/document/mindmap.ts` 拆清 factory 和 helper
4. `runtime/document/edge.ts` 改名为 `edgeLabel.ts`

### 第三阶段

结构收口:

5. `runtime/document/types.ts` 缩小或拆开
6. `runtime/document/runtime.ts` 再瘦身，变成真正的最终装配层

## 最终判断

如果继续追求长期最优，下一步不应该再去零散删小 helper，而应该进行两类系统性收口:

- `runtime/node`: 合并薄 mutation 文件，保留真正复杂的 `text.ts` 与 `patch.ts`
- `runtime/document`: helper 并回业务文件，factory 与业务 helper 拆清，类型层缩小

一句话总结:

- `runtime/node` 的问题是“碎”
- `runtime/document` 的问题是“混”

下一步代码落地时，优先级最高的是:

1. 合并 `runtime/node/{appearance,shape,lock}.ts`
2. 删除 `runtime/document/target.ts`
3. 拆清 `runtime/document/mindmap.ts`
