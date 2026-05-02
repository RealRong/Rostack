# WHITEBOARD_EDITOR_LONG_TERM_PACKAGE_RESTRUCTURE_CHECKLIST

## 1. 目标

这份文档只回答一个问题：

`whiteboard/packages/whiteboard-editor` 内部，为了达到长期最优结构，哪些目录、文件、类型、helper 应该删除、合并、移位、重命名。

约束：

1. 不保留兼容层。
2. 不保留过渡目录。
3. 不在乎迁移成本。
4. 目标是最终结构最干净、命名最真、职责最单一。

---

## 2. 当前结构的核心问题

当前包已经在实现上往“单一 editor 主轴 + 单一 state engine + 单一 preview truth”收敛，但目录结构和命名仍大量停留在旧世界。

最明显的问题不是代码不能用，而是：

1. 目录名仍在表达旧架构。
2. 类型目录和实现目录混杂。
3. 一些“中间层”已经退化成薄壳，但文件系统仍把它们包装成独立层级。
4. 公共类型、内部类型、派生 UI 类型、输入协议类型交叉分布，导致认知成本很高。

具体表现：

1. `preview/` 仍像一套独立子系统，但现在本质只是 editor overlay preview 的规范化/比较/片段更新工具。
2. `clipboard/` 目录只有一个 `packet.ts`，独立目录价值很低。
3. `editor/projection.ts` 和 `editor/projection/types.ts` 本质是在做 `scene + ui projection` 组装，但目录名和文件名没有表达“scene ui 装配”。
4. `session/` 目录里混着纯状态模型、编辑协议、viewport runtime 类型，已经不是“session”语义。
5. `protocol/` 现在几乎只是重导出壳，继续保留只会制造“还有一套协议层”的错觉。
6. `types/` 下面混着：
   - 公共 API 类型
   - 输入协议类型
   - UI 展示类型
   - node capability/read/helper
   - defaults
   - helper/compile/read/support
   这说明 `types` 不是类型出口，而是“放不下的东西都放这里”。

---

## 3. 结论先行

如果按长期最优目标重构，`whiteboard-editor` 应当明确收缩为以下几类目录：

1. `editor/`
   - editor 主对象创建
   - 对外 facade / scene ui 装配
2. `state/`
   - editor state engine
   - state document / delta / commands
3. `input/`
   - interaction runtime
   - bindings / features
   - hover / snap / autopan
4. `actions/`
   - 高层 product actions
5. `write/`
   - 底层 document write/runtime write
6. `scene-ui/`
   - 基于 `editor-scene + editor state` 的 UI projection
7. `schema/`
   - draw / tool / edit / selection presentation / node spec 等纯结构定义
8. `tasks/`
   - 异步动画/任务
9. `clipboard.ts`
   - 单文件即可
10. `index.ts`
   - 唯一公共出口

也就是说，长期最优结构里：

1. 不应该再有 `protocol/`
2. 不应该再有 `preview/`
3. 不应该再有 `session/`
4. 不应该再有 `types/`
5. `editor/projection/` 这种名字也应该消失

---

## 4. 逐目录判断

## 4.1 `preview/`：应该拆散并删除目录

当前文件：

1. `preview/state.ts`
2. `preview/node.ts`
3. `preview/edge.ts`
4. `preview/selection.ts`
5. `preview/types.ts`

当前真实职责：

1. `state.ts`
   - normalize preview
   - compare preview
   - 更新 preview 片段
2. `node.ts / edge.ts / selection.ts`
   - preview 子结构的局部 helper
3. `types.ts`
   - preview patch / preview draft 数据结构

问题：

1. 现在 preview 已经不是一个独立 runtime 体系。
2. 它只是 editor state overlay 的一个字段。
3. 单独一个 `preview/` 目录会误导人以为“preview 有自己的一套模块世界”。

长期目标：

1. `preview/types.ts` 并入 `state/overlay.ts` 或 `state/preview.ts`
2. `preview/state.ts` 改名为 `state/preview.ts`
3. `preview/node.ts / edge.ts / selection.ts`：
   - 能内联则内联到 `state/preview.ts`
   - 若确实太长，可拆成：
     - `state/preview-node.ts`
     - `state/preview-edge.ts`
     - `state/preview-selection.ts`
4. 删除整个 `preview/` 目录

最终判断：

1. `preview/` 目录应该删除。
2. preview 应该成为 `state/` 下的一部分，而不是独立子系统。

---

## 4.2 `clipboard/`：应该降成单文件

当前文件：

1. `clipboard/packet.ts`

问题：

1. 单文件目录没有扩展价值。
2. `index.ts` 和 `action/*` 都只是消费一个 packet 结构。

长期目标：

1. 直接移动为 `clipboard.ts`
2. 所有引用改成 `@whiteboard/editor/clipboard`

最终判断：

1. 删除 `clipboard/` 目录
2. 使用根级单文件 `clipboard.ts`

---

## 4.3 `editor/projection/` 和 `editor/projection.ts`：应该改名为 `scene-ui`

当前文件：

1. `editor/projection.ts`
2. `editor/projection/types.ts`
3. `editor/ui/*`

当前真实职责：

1. 把 `editor-scene` 和 `editor state` 组合成 editor 对外 `scene.ui.*`
2. 这里本质上不是 projection runtime，也不是第二个 editor
3. 实际只是 `scene ui assembly`

问题：

1. `projection` 这个名字太泛，和 `editor-scene` 本身的 projection/runtime 容易混。
2. `editor/ui/*` 和 `editor/projection.ts` 本质属于同一层，却被拆成两个命名体系。
3. `EditorProjection` 这个类型名信息量低，还会让人误会为更底层的 projection data contract。

长期目标：

1. 删除 `editor/projection/` 目录
2. `editor/projection.ts` 改成：
   - `scene-ui/index.ts`
   - 或 `editor/sceneUi.ts`
3. `editor/ui/*` 整体挪到：
   - `scene-ui/*`
4. `EditorProjection` 改名：
   - `EditorSceneUiProjection`
   - 或更直接去掉中间类型，仅保留装配函数
5. `createEditorProjection` 改名：
   - `createEditorSceneUi`
6. `createEditorSceneFacade` 可以保留，但更建议并入 `createEditor.ts` 或 `editor/facade.ts`

最终判断：

1. `projection` 这个目录名应该删除。
2. `editor/ui` 不应该继续挂在 `editor/` 下面，应该独立成 `scene-ui/`。

---

## 4.4 `session/`：应该拆散并删除目录

当前文件：

1. `session/draw/model.ts`
2. `session/draw/state.ts`
3. `session/edit.ts`
4. `session/viewport.ts`

问题非常明显：

1. `draw/model.ts` 是 draw tool schema，不是 session。
2. `draw/state.ts` 是 draw style/state schema，不是 session。
3. `edit.ts` 是 edit state schema，不是 session。
4. `viewport.ts` 是 viewport runtime contract，不是 session。

也就是说，`session/` 目录名称已经完全失真。

长期目标：

1. `session/draw/model.ts` 移到 `schema/draw-mode.ts`
2. `session/draw/state.ts` 移到 `schema/draw-state.ts`
3. `session/edit.ts` 移到 `schema/edit.ts`
4. `session/viewport.ts`：
   - 若只被 state runtime 使用，则并入 `state/runtime.ts`
   - 若需要独立，则放到 `state/viewport.ts`
5. 删除整个 `session/` 目录

最终判断：

1. `session/` 应该彻底删除。
2. 里面没有任何内容还配叫 session。

---

## 4.5 `protocol/`：应该直接删除

当前文件：

1. `protocol/index.ts`

当前内容本质：

1. 重导出 `DrawState`
2. 重导出 `EditSession`
3. 重导出 `EditorDelta`
4. 重导出 `EditorStateDocument`
5. 重导出 `Tool`

问题：

1. 它没有真实实现。
2. 它不是唯一出口。
3. 它会误导调用方以为“editor 还有一层 protocol 概念”。

长期目标：

1. 直接删除 `protocol/index.ts`
2. 所有类型从真实定义处导出
3. 公共导出统一收口到 `src/index.ts`

最终判断：

1. `protocol/` 目录必须删除。

---

## 4.6 `types/`：必须拆掉

这是当前最需要系统性清理的目录。

当前内容：

1. `types/editor.ts`
2. `types/input.ts`
3. `types/pick.ts`
4. `types/tool.ts`
5. `types/defaults.ts`
6. `types/selectionPresentation.ts`
7. `types/node/*`

问题分三层：

### A. `types` 不是一个职责，而是一个垃圾桶名字

`types/` 里同时放了：

1. 公共 API 类型
2. 纯 schema
3. UI presentation schema
4. node capability/read/compile/helper
5. defaults

这会直接导致：

1. 新文件不知道放哪里
2. 依赖方向容易反
3. “类型”与“helper/编译逻辑”混在一起

### B. `types/editor.ts` 太胖

它同时承担：

1. public `Editor` API
2. `EditorSceneUi*` 类型
3. `EditorState` read-store 类型
4. viewport runtime 类型
5. input host 类型
6. selection chrome/mindmap chrome 类型

问题：

1. public api 和内部 ui projection type 混一起
2. store/view/runtime 三类概念都堆在一个文件
3. 很多类型并不适合作为公共顶层类型暴露

### C. `types/node/*` 里混着 schema 和实现 helper

当前 `types/node` 下有：

1. `spec.ts`
2. `read.ts`
3. `compile.ts`
4. `support.ts`
5. `index.ts`

问题：

1. `spec.ts` 是 schema
2. `read.ts` 是 contract
3. `compile.ts` 是实现 helper
4. `support.ts` 是 runtime implementation

这四种东西不应该继续放在 `types/` 下面。

---

## 5. `types/` 的长期拆分方案

建议彻底取消 `types/` 目录，拆成下面几组：

### 5.1 `api/`

只放对外公共 API 类型。

建议包含：

1. `api/editor.ts`
   - `Editor`
   - `EditorInputHost`
   - `EditorSceneFacade`
2. `api/input.ts`
   - pointer / keyboard / wheel / context menu input
3. `api/pick.ts`
4. `api/clipboard.ts`

原则：

1. `api/` 只能放包外可能 import 的结构。
2. 不允许掺内部 helper 类型。

### 5.2 `schema/`

放 editor 自己的纯结构定义。

建议包含：

1. `schema/tool.ts`
2. `schema/draw-mode.ts`
3. `schema/draw-state.ts`
4. `schema/edit.ts`
5. `schema/defaults.ts`
6. `schema/selection-ui.ts`
7. `schema/node-spec.ts`

原则：

1. 纯结构定义。
2. 不含 runtime helper。
3. 不含 compile/support 实现。

### 5.3 `node/`

作为 node type 子系统目录，替代 `types/node/`

建议包含：

1. `node/spec.ts`
2. `node/read.ts`
3. `node/compile.ts`
4. `node/support.ts`
5. `node/index.ts`

理由：

1. 这是一个明确的功能子系统，不应该继续挂在 `types/` 下。

### 5.4 `scene-ui/schema.ts`

当前 `selectionPresentation.ts` 不适合继续待在 `types/`

建议：

1. 改名为 `scene-ui/schema.ts`
2. 或拆成：
   - `scene-ui/selection-schema.ts`
   - `scene-ui/chrome-schema.ts`

因为它们描述的是 `scene.ui.*` 的派生产物，不是抽象的“类型工具”。

---

## 6. 具体目录去留建议

## 6.1 应删除的目录

1. `preview/`
2. `clipboard/`
3. `protocol/`
4. `session/`
5. `types/`
6. `editor/projection/`

## 6.2 应重命名的目录

1. `action/` -> `actions/`
   - 复数更符合“动作集合”
2. `editor/ui/` -> `scene-ui/`
3. `state-engine/` -> `state/`
   - 现在它就是 editor 的 state 中轴，不需要再强调 engine

## 6.3 可保留的目录

1. `input/`
2. `write/`
3. `tasks/`
4. `editor/`
   - 但只保留 editor 主创建/对外 facade

---

## 7. 建议的最终目录树

```txt
whiteboard-editor/src/
  index.ts
  clipboard.ts

  api/
    editor.ts
    input.ts
    pick.ts

  editor/
    create.ts
    facade.ts

  scene-ui/
    index.ts
    schema.ts
    chrome.ts
    mindmap.ts
    selection.ts
    selection-node-stats.ts
    selection-policy-edge.ts
    selection-policy-node.ts
    selection-policy-overlay.ts
    selection-policy-toolbar.ts
    state.ts

  state/
    runtime.ts
    document.ts
    delta.ts
    intents.ts
    entities.ts
    preview.ts
    viewport.ts

  actions/
    index.ts
    types.ts
    edge.ts
    edit.ts
    selection.ts
    mindmap.ts
    clipboard.ts

  input/
    host.ts
    core/
      runtime.ts
      types.ts
      snap.ts
    hover/
      edge.ts
      store.ts
    features/
      draw.ts
      transform.ts
      viewport.ts
      selection/
        press.ts
        move.ts
        marquee.ts
      edge/
        index.ts
        connect.ts
        move.ts
        route.ts
        label.ts
      mindmap/
        drag.ts
    interaction/
      mode.ts
    internals/
      autoPan.ts
      press.ts
      result.ts
      tuning.ts

  node/
    index.ts
    spec.ts
    read.ts
    compile.ts
    support.ts

  schema/
    tool.ts
    draw-mode.ts
    draw-state.ts
    edit.ts
    defaults.ts

  tasks/
    runtime.ts
    mindmap.ts

  write/
    index.ts
    types.ts
    document.ts
    history.ts
    canvas.ts
    node.ts
    group.ts
    orderStep.ts
    edge/
      index.ts
      label.ts
      route.ts
    mindmap/
      index.ts
      root.ts
      branch.ts
      topic.ts
```

---

## 8. 按文件的重点清理建议

## 8.1 `types/editor.ts`

建议拆成至少四个文件：

1. `api/editor.ts`
   - `Editor`
   - `EditorInputHost`
   - `EditorPointerDispatchResult`
   - `EditorSceneFacade`
2. `scene-ui/state-schema.ts`
   - `EditorState`
   - `ToolRead`
   - `EditorInteractionState`
3. `state/viewport.ts`
   - `EditorViewportRuntime`
   - `EditorViewportStateRead`
4. `scene-ui/chrome-schema.ts`
   - `EditorSceneUi*`
   - selection/chrome/mindmap read model

原则：

1. public api 和 internal derived schema 分离。

## 8.2 `action/types.ts`

当前这个文件太大，既像 API，又像内部 contracts。

建议拆为：

1. `actions/types.ts`
   - 只保留 actions api contract
2. `schema/tool.ts`
   - tool / insert template
3. `clipboard.ts`
   - clipboard packet references

## 8.3 `types/defaults.ts`

更适合放到 `schema/defaults.ts`

因为它是 editor config schema，不是“类型工具”。

## 8.4 `types/tool.ts`

应放到 `schema/tool.ts`

## 8.5 `types/input.ts` / `types/pick.ts`

应放到 `api/input.ts` / `api/pick.ts`

因为这两个是真正对外输入协议。

## 8.6 `types/selectionPresentation.ts`

应改名为 `scene-ui/schema.ts`

因为它描述的是 UI 投影输出，而不是底层 editor type system。

---

## 9. helper 清理原则

这轮重构不只是搬目录，还要清掉 helper 语义噪音。

原则如下：

1. 纯一处调用的 helper，直接内联。
2. 同一子系统内部高复用 helper，绑定到该子系统目录，不再丢进 `types/` 或全局 util。
3. 只做组装的“空壳文件”优先删除。
4. “名字像协议，实际只是重导出”的文件一律删除。

重点对象：

1. `protocol/index.ts`
2. `editor/projection/types.ts`
3. `preview/node.ts / edge.ts / selection.ts`
4. `types/node/read.ts` 中若只有 contract 可保留，helper 不应继续挂那里
5. `index.ts` 里如果只是为了绕一层路径别名，也要减少转发层级

---

## 10. 分阶段实施方案

## Phase 1：命名层清理

目标：

1. 删除最明显的假目录名
2. 先让路径语义正确

执行：

1. `action/` -> `actions/`
2. `state-engine/` -> `state/`
3. `editor/ui/` -> `scene-ui/`
4. `editor/projection.ts` -> `scene-ui/index.ts`
5. 删除 `editor/projection/types.ts`
6. `clipboard/packet.ts` -> `clipboard.ts`
7. 删除 `protocol/`

验收：

1. 源码中不再出现 `editor/projection`
2. 源码中不再出现 `protocol`
3. 源码中不再出现 `clipboard/packet`

## Phase 2：`session/` 和 `preview/` 拆散

目标：

1. 删除两组最失真的目录名

执行：

1. `session/draw/model.ts` -> `schema/draw-mode.ts`
2. `session/draw/state.ts` -> `schema/draw-state.ts`
3. `session/edit.ts` -> `schema/edit.ts`
4. `session/viewport.ts` -> `state/viewport.ts` 或并入 `state/runtime.ts`
5. `preview/state.ts` -> `state/preview.ts`
6. `preview/types.ts` 并入 `state/preview.ts` 或 `state/preview-schema.ts`
7. `preview/node.ts / edge.ts / selection.ts` 内联或搬到 `state/preview-*`
8. 删除 `session/`
9. 删除 `preview/`

验收：

1. 包内 import 路径不再出现 `session/`
2. 包内 import 路径不再出现 `preview/`

## Phase 3：拆掉 `types/`

目标：

1. 让“类型位置”与“职责位置”一致

执行：

1. `types/editor.ts` 拆分
2. `types/input.ts` -> `api/input.ts`
3. `types/pick.ts` -> `api/pick.ts`
4. `types/tool.ts` -> `schema/tool.ts`
5. `types/defaults.ts` -> `schema/defaults.ts`
6. `types/selectionPresentation.ts` -> `scene-ui/schema.ts`
7. `types/node/*` -> `node/*`
8. 删除 `types/`

验收：

1. 包内不再有 `src/types/`
2. `index.ts` 的公共导出从 `api/`、`schema/`、`node/`、`scene-ui/` 的真实位置导出

## Phase 4：收口 public API

目标：

1. `src/index.ts` 成为唯一清晰出口
2. 不再通过旧路径暴露概念

执行：

1. 只保留真正的 public types/export
2. 内部 schema 不对外的，停止从 `index.ts` 导出
3. 若某些 scene-ui 派生类型只是内部 React/UI 消费，考虑不再公开

验收：

1. `index.ts` 可读性显著提高
2. 对外类型数量下降
3. 没有“重导出壳中壳”

---

## 11. 必须明确删除的东西

以下内容不应该带着兼容继续存在：

1. `protocol/index.ts`
2. `preview/` 整目录
3. `session/` 整目录
4. `types/` 整目录
5. `editor/projection/` 整目录
6. `clipboard/` 整目录
7. `EditorProjection` 这个命名
8. `selectionPresentation` 这个文件名

---

## 12. 最终判断

是的，`whiteboard-editor` 内部还有很多文件应该删除，很多类型应该删除或合并，目录和文件也应该整体移位。

最核心的方向不是“再修几个 API”，而是：

1. 让目录名表达真实职责。
2. 让类型回到所属子系统。
3. 删除所有只剩历史包袱的中间目录。
4. 把 public api、state、scene-ui、schema、node、input、write 这几层彻底分开。

如果按长期最优、不留兼容来做，我建议最后把包收敛成：

1. `api`
2. `editor`
3. `scene-ui`
4. `state`
5. `actions`
6. `input`
7. `node`
8. `schema`
9. `tasks`
10. `write`
11. 根级 `clipboard.ts`

除此之外的旧目录，原则上都应该消失。
