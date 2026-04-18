# Whiteboard Product Package 最终架构方案

这份文档只回答一个问题：

当前 `whiteboard-core / whiteboard-editor / whiteboard-react` 三层里，哪些东西其实是 **whiteboard 产品层** 的 presets / catalog / theme / 默认值 / 样式 schema，而不是底层 runtime；这些东西应该如何一次性迁移到一个新的 package，并且不遗漏。

这份文档只保留一个最终版本，不保留兼容设计，不保留多候选方案。

最终目标非常明确：

1. `core` 只保留通用模型、算法、纯函数、文档语义。
2. `editor` 只保留纯净 runtime，不再承担工具箱、preset、产品目录职责。
3. `react` 只保留 React 视图、DOM、UI 组件，不再作为产品 preset 数据源。
4. 所有 whiteboard 产品层的 preset / palette / theme / catalog / 默认模板，统一迁移到一个新包。

---

## 1. 最终结论

必须新建一个独立 package：

`whiteboard/packages/whiteboard-product`

包名建议固定为：

`@whiteboard/product`

这个包承接所有 **whiteboard-specific product policy**：

1. palette key 与 palette registry
2. light/dark theme token 与 CSS variables
3. sticky / frame / text / draw / edge / shape / mindmap 的默认值与 preset
4. insert catalog
5. edge tool preset catalog
6. mindmap seed / preset catalog
7. shape 的产品层 metadata
8. node creation templates 的产品版本

不放 `react`，也不放 `core`。

原因：

1. 这些东西不是 UI 组件，因此不该放 `react`
2. 这些东西也不是底层通用语义，因此不该放 `core`
3. 它们属于“whiteboard 这个产品”的 policy 层，最合理就是单独成包

一句话总结：

**`core` 是引擎语义，`editor` 是运行时，`react` 是视图层，`product` 才是 whiteboard 这款产品自己的默认配置与目录。**

---

## 2. 新包的职责边界

`@whiteboard/product` 只做一件事：

提供 whiteboard 产品自己的 **数据、规则、目录、默认值、主题资源**。

允许放入：

1. `key`
2. `catalog`
3. `preset`
4. `default`
5. `seed`
6. `theme`
7. `token`
8. `template`
9. `resolver`
10. `materializer`

禁止放入：

1. React component
2. DOM measure / DOM host
3. editor session / preview / query / write
4. engine execute / editor action
5. 浏览器事件绑定
6. 与 React hooks 强耦合的逻辑

也就是说，它是一个 **纯数据 + 纯函数 + 可导出的 CSS 资产** 包。

---

## 3. 三层最终职责

### 3.1 `@whiteboard/core`

只保留：

1. types
2. schema patch DSL
3. document / node / edge / mindmap 算法
4. 几何计算
5. 选择、布局、渲染路径、命令规划
6. 与任何具体 whiteboard 产品默认值无关的 helper

不再保留：

1. `WHITEBOARD_*` 命名常量
2. whiteboard palette groups
3. whiteboard light/dark theme token
4. sticky tone presets
5. edge tool presets
6. insert catalog
7. whiteboard shape labels / groups / previewFill / defaultText
8. whiteboard mindmap seeds / presets
9. whiteboard node templates

### 3.2 `@whiteboard/editor`

只保留：

1. session
2. input/host
3. query
4. write
5. actions
6. editor facade
7. runtime-only tool state

不再保留：

1. `edge.line` / `edge.arrow` 这类产品 preset key 的枚举
2. edge tool preset 到 `EdgeInput` 的映射
3. insert preset catalog type
4. 任何 `label / description / group / defaults` 风格的工具箱目录数据
5. 产品默认值

### 3.3 `@whiteboard/react`

只保留：

1. 组件
2. hooks
3. DOM adapter
4. text layout backend
5. icon / panel / menu / toolbar 的视图拼装

不再保留：

1. 作为 whiteboard 产品 preset 的单一来源
2. sticky / shape / mindmap / insert 的产品目录定义
3. edge preset create mapping
4. whiteboard 主题 token 源文件

`react` 可以消费 `@whiteboard/product`，但不应再自己持有这些数据的源头。

---

## 4. 当前已经确认的 product 污染点

下面这些是当前明确不该继续留在 `core / editor / react` 原位置的内容。

### 4.1 `core` 中的 product 污染

#### A. palette 整个目录

当前文件：

1. [palette/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/index.ts)
2. [palette/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/schema.ts)
3. [palette/registry.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/registry.ts)
4. [palette/presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/presets.ts)

问题：

1. `WhiteboardPaletteGroup = 'bg' | 'sticky' | 'border' | 'text' | 'line'` 是 whiteboard 产品定义，不是底层语义
2. `WHITEBOARD_*` 常量全部是产品默认值
3. `sticky` / `line` 这些 group 并不是所有 board 产品都必然有
4. `schema.ts` 这个命名本身也不准确，它实际上是 whiteboard 产品 palette key 规则，不是 core schema

#### B. mindmap schema

当前文件：

1. [mindmap/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mindmap/schema.ts)

问题：

1. 它里面包含 `DEFAULT_SEEDS`
2. 包含 `DEFAULT_PRESETS`
3. 包含 label / description / seed / preset catalog
4. 包含 whiteboard 风格的默认 node / branch style

这些都是产品层，不是 core mindmap 算法。

#### C. node templates

当前文件：

1. [node/templates.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/templates.ts)

问题：

1. `TEXT_PLACEHOLDER`
2. `FRAME_DEFAULT_TITLE`
3. `createTextNodeInput()`
4. `createStickyNodeInput()`
5. `createFrameNodeInput()`
6. `STICKY_*` / `FRAME_*` 默认值

这些都是 whiteboard 产品“新建对象默认模板”，不属于 core。

#### D. shape 元数据混层

当前文件：

1. [node/shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/shape.ts)

问题不是整文件都错，而是它把两类东西混在一起了：

应该留在 core 的：

1. `ShapeKind`
2. outline geometry
3. path spec
4. visual spec
5. shape 命中/描边/几何相关纯算法

应该移出 core 的：

1. `label`
2. `group`
3. `defaultSize`
4. `defaultText`
5. `defaults.fill / stroke / color`
6. `previewFill`
7. `ShapeMeta`
8. `SHAPE_SPECS`
9. `createShapeNodeInput()`

这部分是 whiteboard 产品层的 shape catalog。

### 4.2 `editor` 中的 product 污染

#### A. edge preset

当前文件：

1. [edgePresets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/tool/edgePresets.ts)

问题：

1. `edge.line / edge.arrow / edge.elbow-arrow / edge.fillet-arrow / edge.curve-arrow` 是产品 preset key
2. `DEFAULT_EDGE_PRESET_KEY` 是产品默认工具箱行为
3. `readEdgePresetCreate()` 是产品 key 到创建参数的映射

这条线不是 editor runtime。

#### B. tool type 里混入具体 product key

当前文件：

1. [tool.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/tool.ts)

问题：

`EdgePresetKey` 现在是具体联合类型。这会把 editor runtime 和某一套产品工具箱永久绑死。

#### C. insert preset types

当前文件：

1. [insert.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/insert.ts)

问题：

里面有：

1. `InsertPresetGroup`
2. `InsertPreset`
3. `NodeInsertPreset`
4. `MindmapInsertPreset`
5. `InsertPresetCatalog`
6. `label`
7. `description`
8. `defaults`

这整套都是产品工具箱目录模型，不是 editor runtime。

#### D. editor input 直接读产品 preset

当前文件：

1. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts)

问题：

editor input 现在直接依赖 `readEdgePresetCreate()`。

这意味着 editor runtime 还在直接理解产品 preset，而不是只消费外部注入的 tool policy。

### 4.3 `react` 中的 product 污染

#### A. toolbox preset catalog

当前文件：

1. [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)

问题：

这里已经成为：

1. sticky preset 源
2. shape insert preset 源
3. mindmap insert preset 源
4. insert catalog 源
5. default insert key 源

它不应继续放在 React 包里。

#### B. sticky palette/product options

当前文件：

1. [sticky.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/palette/sticky.ts)
2. [ui.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/palette/ui.ts)

问题：

tone / format / option / default key / section 这些都是产品层数据。

#### C. edge UI catalog 中的数据部分

当前文件：

1. [catalog.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/ui/catalog.tsx)

这个文件现在混了两层：

应该留在 react 的：

1. glyph 组件绑定
2. menu/panel 视图配置

应该移出的：

1. preset key 列表
2. preset label
3. preset create 数据
4. 宽度/dash/textMode 等产品目录常量

#### D. 主题 token CSS

当前文件：

1. [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)

里面的：

1. `--wb-palette-*`
2. light theme values
3. dark theme values

这部分本质上是 whiteboard 产品的 theme token 资产，不应继续把源头放在 react 包。

---

## 5. 新包的最终结构

最终建议固定为：

```txt
whiteboard/packages/whiteboard-product/
  src/
    index.ts
    palette/
      key.ts
      registry.ts
      defaults.ts
      theme.css
    edge/
      presets.ts
    insert/
      catalog.ts
      types.ts
    mindmap/
      seeds.ts
      presets.ts
      materialize.ts
    node/
      templates.ts
      shapes.ts
    theme/
      whiteboard.css
```

说明：

1. `palette/key.ts` 替代今天误放在 core 的 `palette/schema.ts`
2. `palette/defaults.ts` 承接 `WHITEBOARD_*` 默认值
3. `edge/presets.ts` 承接 editor 里的 edge preset
4. `insert/catalog.ts` 承接 editor/react 里的 insert catalog
5. `mindmap/*` 承接 core 里的 seed / preset / materialize policy
6. `node/templates.ts` 承接 text/sticky/frame 创建模板
7. `node/shapes.ts` 承接 shape 的产品层 meta
8. `theme/whiteboard.css` 承接 palette 变量与 light/dark token

不建议再叫 `schema.ts`，除非它真的是 schema。多数当前文件应该改名为：

1. `key`
2. `registry`
3. `defaults`
4. `preset`
5. `catalog`
6. `materialize`

---

## 6. 最终 API 设计

### 6.1 palette

```ts
export type WhiteboardPaletteGroup =
  | 'bg'
  | 'sticky'
  | 'border'
  | 'text'
  | 'line'

export type WhiteboardPaletteKey = `palette:${WhiteboardPaletteGroup}:${number}`

export const createWhiteboardPaletteKey: (...)
export const parseWhiteboardPaletteKey: (...)
export const resolveWhiteboardPaletteVariable: (...)
export const resolveWhiteboardPaletteValue: (...)

export const WHITEBOARD_PALETTE_REGISTRY: ...
export const WHITEBOARD_BG_PALETTE_INDICES: ...
export const WHITEBOARD_STICKY_PALETTE_INDICES: ...
```

这些 API 原样保留语义，但包归属从 `core` 改到 `product`。

### 6.2 product defaults

```ts
export const WHITEBOARD_TEXT_DEFAULT_COLOR: WhiteboardPaletteKey
export const WHITEBOARD_STROKE_DEFAULT_COLOR: WhiteboardPaletteKey
export const WHITEBOARD_LINE_DEFAULT_COLOR: WhiteboardPaletteKey
export const WHITEBOARD_SURFACE_DEFAULT_FILL: WhiteboardPaletteKey

export const WHITEBOARD_STICKY_DEFAULTS: WhiteboardPaintPreset
export const WHITEBOARD_FRAME_DEFAULTS: WhiteboardPaintPreset
export const WHITEBOARD_SHAPE_DEFAULTS: WhiteboardPaintPreset
export const WHITEBOARD_DRAW_DEFAULTS: ...
export const WHITEBOARD_STICKY_TONE_PRESETS: ...
```

### 6.3 edge preset catalog

```ts
export type WhiteboardEdgePresetKey = string

export type WhiteboardEdgePreset = {
  key: WhiteboardEdgePresetKey
  label: string
  create: Pick<EdgeInput, 'type' | 'style' | 'textMode'>
}

export const WHITEBOARD_EDGE_PRESETS: readonly WhiteboardEdgePreset[]
export const DEFAULT_WHITEBOARD_EDGE_PRESET: WhiteboardEdgePresetKey
export const getWhiteboardEdgePreset: (key: string) => WhiteboardEdgePreset | undefined
export const resolveWhiteboardEdgeCreate: (key: string) => Pick<EdgeInput, 'type' | 'style' | 'textMode'> | undefined
```

关键点：

1. `editor` 不再拥有 `EdgePresetKey` 联合类型
2. `editor` 只吃 `string`
3. create spec 的解释留给 `product`

### 6.4 insert catalog

```ts
export type WhiteboardInsertGroup =
  | 'text'
  | 'frame'
  | 'sticky'
  | 'shape'
  | 'mindmap'

export type WhiteboardNodeInsertPreset = {
  kind: 'node'
  key: string
  group: WhiteboardInsertGroup
  label: string
  description?: string
  focus?: 'text' | 'title'
  placement?: 'center' | 'point'
  input: (world: Point) => Omit<SpatialNodeInput, 'position'>
}

export type WhiteboardMindmapInsertPreset = {
  kind: 'mindmap'
  key: string
  group: 'mindmap'
  label: string
  description?: string
  preset: string
  seed?: string
}

export type WhiteboardInsertPreset =
  | WhiteboardNodeInsertPreset
  | WhiteboardMindmapInsertPreset

export type WhiteboardInsertCatalog = {
  get: (key: string) => WhiteboardInsertPreset | undefined
  defaults: {
    text: string
    frame: string
    sticky: string
    mindmap: string
    shape: (kind: ShapeKind) => string
  }
}

export const WHITEBOARD_INSERT_CATALOG: WhiteboardInsertCatalog
export const readWhiteboardInsertGroup: (key: string | undefined) => WhiteboardInsertGroup | undefined
```

### 6.5 node templates

```ts
export const WHITEBOARD_TEXT_TEMPLATE: ...
export const WHITEBOARD_STICKY_TEMPLATE: ...
export const WHITEBOARD_FRAME_TEMPLATE: ...

export const createWhiteboardTextNodeInput: () => Omit<SpatialNodeInput, 'position'>
export const createWhiteboardStickyNodeInput: (...) => Omit<SpatialNodeInput, 'position'>
export const createWhiteboardFrameNodeInput: () => Omit<SpatialNodeInput, 'position'>
```

### 6.6 shape product catalog

core 保留：

```ts
export type ShapeKind = ...
export type ShapeOutlineSpec = ...
export type ShapeVisualSpec = ...
export const SHAPE_GEOMETRY: ...
```

product 承接：

```ts
export type WhiteboardShapeSpec = {
  kind: ShapeKind
  label: string
  group: 'basic' | 'flowchart' | 'annotation'
  defaultSize: { width: number; height: number }
  defaultText: string
  defaults: {
    fill: string
    stroke: string
    color: string
  }
  previewFill?: string
}

export const WHITEBOARD_SHAPE_SPECS: readonly WhiteboardShapeSpec[]
export const getWhiteboardShapeSpec: (kind: ShapeKind) => WhiteboardShapeSpec | undefined
export const createWhiteboardShapeNodeInput: (kind: ShapeKind) => Omit<SpatialNodeInput, 'position'>
```

### 6.7 mindmap catalog

```ts
export type WhiteboardMindmapSeed = {
  key: string
  label: string
  description?: string
  root: MindmapTopicData
  children?: readonly {
    data: MindmapTopicData
    side?: 'left' | 'right'
  }[]
}

export type WhiteboardMindmapPresetRule = {
  match?: {
    depth?: number | { min?: number; max?: number }
    side?: 'left' | 'right'
    leaf?: boolean
    root?: boolean
  }
  node?: Partial<MindmapNodeStyle>
  branch?: Partial<MindmapBranchStyle>
}

export type WhiteboardMindmapPreset = {
  key: string
  label: string
  description?: string
  seed: string
  layout: MindmapLayoutSpec
  rules: readonly WhiteboardMindmapPresetRule[]
}

export const WHITEBOARD_MINDMAP_SEEDS: readonly WhiteboardMindmapSeed[]
export const WHITEBOARD_MINDMAP_PRESETS: readonly WhiteboardMindmapPreset[]
export const listWhiteboardMindmapPresets: () => readonly WhiteboardMindmapPreset[]
export const materializeWhiteboardMindmapCreate: (...) => MindmapMaterializedCreate
```

关键点：

1. `materializeMindmapCreate` 从 core 移出
2. core 只保留 tree / layout / render / command 算法
3. `preset` / `seed` 的解释放到 product

---

## 7. `core` 需要保留什么，必须说清楚

为了避免“为了迁 product，把 core 也掏空”，下面明确哪些必须留在 core。

### 7.1 必须留在 core

1. document / node / edge / mindmap 基础 types
2. 几何算法
3. 文档命令规划与 reducer
4. generic schema patch DSL
5. selection model
6. edge / node / mindmap 的纯算法
7. shape 几何与 path 数据
8. 与任何具体 whiteboard 产品默认值无关的 helper

### 7.2 必须移出 core

1. 所有 `WHITEBOARD_*` 常量
2. 所有 light/dark theme token
3. 所有 preset key / label / description
4. 所有 product catalog
5. 所有 whiteboard 默认模板
6. 所有 whiteboard-specific palette group 规则
7. 所有 whiteboard-specific mindmap seed / preset
8. shape 的产品层 label/group/defaults

### 7.3 `schema` 一词的最终处理

当前有两类“schema”：

应该保留在 core 的：

1. [schema/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/schema/index.ts)
2. 这类 generic mutation/schema 编译器

应该迁出且改名的：

1. [palette/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/schema.ts)
2. [mindmap/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mindmap/schema.ts)

最终命名：

1. `palette/schema.ts` -> `product/palette/key.ts`
2. `mindmap/schema.ts` -> `product/mindmap/presets.ts` + `product/mindmap/materialize.ts`

---

## 8. `editor` 的最终纯净化方案

### 8.1 tool 类型

最终改成：

```ts
export type EdgeTool = {
  type: 'edge'
  preset: string
}

export type InsertTool = {
  type: 'insert'
  preset: string
}
```

不再在 editor 内写死：

1. `EdgePresetKey` 联合类型
2. `InsertPresetCatalog`

### 8.2 editor 注入 product policy

editor 长期最优不应该 import `@whiteboard/product`，而应该吃外部注入：

```ts
createEditor({
  ...,
  services: {
    layout,
    tools: {
      edge: {
        resolveCreate: (preset: string) => EdgeCreateSpec | undefined
      }
    }
  }
})
```

这样：

1. `editor` 保持纯 runtime
2. `react` 或 app 层可选择接 `@whiteboard/product`
3. 未来换产品包时不用改 editor

### 8.3 edge connect 的最终职责

[connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts)

现在不应该直接：

1. import `readEdgePresetCreate`

最终应该只做：

1. 从当前 tool 读 `preset: string`
2. 调用上游注入的 `resolveCreate(preset)`
3. 拿到 `EdgeCreateSpec`
4. 继续纯 runtime edge connect 流程

---

## 9. `react` 的最终职责

### 9.1 保留在 react

1. glyph / icon
2. menu / panel / toolbar component
3. hooks
4. DOM host
5. text source / layout backend
6. 视图层组合逻辑

### 9.2 移出 react

1. toolbox preset 数据源
2. sticky tone / format / insert option 数据源
3. edge preset 数据源
4. theme token 源文件
5. whiteboard 产品默认 key

### 9.3 React 如何消费 product

最终模式应当是：

1. React 组件 import `@whiteboard/product` 的 catalog
2. React 只负责把 catalog 渲染成 UI
3. React 图标层只保留 glyph 映射

例如 edge UI：

保留在 react：

1. glyph component
2. panel component
3. toolbar layout

移到 product：

1. preset list
2. preset label
3. create spec

React 通过：

```ts
const preset = WHITEBOARD_EDGE_PRESETS.find(...)
```

来消费，而不是自己重新定义一套数据。

---

## 10. 完整迁移清单

下面按“移动 / 拆分 / 删除替换”给出完整清单。

### 10.1 从 `core` 移到 `product`

整体迁移：

1. [palette/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/index.ts)
2. [palette/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/schema.ts)
3. [palette/registry.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/registry.ts)
4. [palette/presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/palette/presets.ts)
5. [node/templates.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/templates.ts)

迁移并重构：

1. [mindmap/schema.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mindmap/schema.ts)
2. [node/shape.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/shape.ts)

### 10.2 从 `editor` 移到 `product`

整体迁移：

1. [edgePresets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/tool/edgePresets.ts)
2. [insert.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/insert.ts)

类型降级后保留在 editor：

1. [tool.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/tool.ts)

需要改依赖方式：

1. [connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts)
2. [index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/index.ts)

### 10.3 从 `react` 移到 `product`

整体迁移数据层：

1. [presets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts)
2. [sticky.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/palette/sticky.ts)
3. [ui.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/palette/ui.ts)

拆分迁移：

1. [catalog.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/edge/ui/catalog.tsx)
2. [whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css)

### 10.4 需要删除的旧导出

必须删除，不留兼容：

1. `@whiteboard/core/palette`
2. `@whiteboard/editor/tool/edgePresets`
3. `@whiteboard/editor` 对 `DEFAULT_EDGE_PRESET_KEY` / `EDGE_PRESET_KEYS` / `readEdgePresetCreate` 的 re-export
4. `@whiteboard/editor` 对 `InsertPresetCatalog` / `NodeInsertPreset` / `MindmapInsertPreset` 的 re-export
5. `react` 内部作为源头的 preset 常量导出

---

## 11. 实施顺序

### 阶段 1：建立新包

1. 新建 `whiteboard/packages/whiteboard-product`
2. 建立 `package.json`
3. 建立 `src/index.ts`
4. 先把 palette / defaults / edge preset / insert catalog 的静态数据迁过去

阶段结束标准：

1. product 包可以独立被 `react` 与 app 消费

### 阶段 2：迁移 palette 与 theme

1. 从 core 搬 `palette/*`
2. 从 react CSS 搬 `--wb-palette-*`
3. 让 react 改为消费 `@whiteboard/product` 的 CSS 资产

阶段结束标准：

1. `core` 不再有 `palette` 目录
2. `react` 不再作为 palette token 源

### 阶段 3：迁移 node templates 与 shape product meta

1. `node/templates.ts` 移到 product
2. `node/shape.ts` 拆成 geometry 与 product meta 两半
3. `createShapeNodeInput()` 移到 product

阶段结束标准：

1. core 只保留 shape geometry
2. whiteboard 默认 node input 模板都从 product 来

### 阶段 4：迁移 mindmap seeds / presets / materialize

1. `mindmap/schema.ts` 拆到 product
2. core 删除 preset/seed 默认目录
3. `materializeMindmapCreate` 迁到 product
4. core mindmap 只保留 tree/layout/render/application 算法

阶段结束标准：

1. core 不再理解 whiteboard mindmap preset

### 阶段 5：纯净化 editor

1. `edgePresets.ts` 移到 product
2. `types/insert.ts` 移到 product
3. `types/tool.ts` 去掉具体 product key 联合
4. edge connect 改为消费注入 resolver
5. 删除 editor 对这些 product 常量的 re-export

阶段结束标准：

1. editor 不再承担工具箱目录

### 阶段 6：纯净化 react

1. toolbox / palette / edge ui 数据改从 product 读
2. React 仅保留组件与 glyph
3. 删除 react 内部作为源头的 preset/catalog 数据

阶段结束标准：

1. react 不再持有产品目录源数据

---

## 12. 最终抉择

如果只保留一句话，最终抉择就是：

**把所有 whiteboard-specific 的 preset、catalog、theme、默认模板、palette key 规则统一迁到 `@whiteboard/product`，并同时把 `core` 清回算法层、把 `editor` 清回 runtime、把 `react` 清回视图层。**

具体就是：

1. `core` 删掉 `palette/*`、mindmap preset、node templates、shape product meta
2. `editor` 删掉 edge preset 和 insert catalog
3. `react` 删掉工具箱 preset 与 theme token 源数据
4. 新建 `@whiteboard/product` 作为唯一产品层数据源
5. 不保留兼容 re-export

这才是长期最优的完整迁移终态。
