# WHITEBOARD Template-Centric Final API

## 1. 最终抉择

这次设计最终应当收敛到一条很简单的中轴：

**`preset key -> template`**

也就是：

1. `preset` 只存在于 `@whiteboard/product` 和 `@whiteboard/react`
2. `editor` 不知道 `preset`
3. `editor` 不知道 `product`
4. `editor` 不对外暴露 `policy`
5. `template` 是 editor 与 product/react 之间唯一稳定的创建语义

因此，上一版文档里的这些方向全部放弃：

1. `EdgeSpec`
2. `MindmapSpec`
3. `EditorEdgePolicy`
4. `EditorMindmapPolicy`
5. `mindmap.create({ spec })`

最终模型是：

1. `EdgeTemplate`
2. `NodeTemplate`
3. `MindmapTemplate`
4. `InsertTemplate`

一句话总结：

**tool 持有 template，不持有 preset；真正创建时，再把 template 展开成 document 写入。**

---

## 2. 为什么 `template` 比 `spec` 更对

### 2.1 `spec` 更像内部执行态

`spec` 这个词更适合表示：

1. 已经准备好执行
2. 往往已经绑定了这次操作的上下文
3. 在某些场景下可能已经包含实例化结果

这在 edge 上还勉强成立，但在 mindmap 上会变怪。

因为 mindmap 一旦进入“真正可执行”的状态，通常就已经需要：

1. 真实 node id
2. 真实 tree
3. 真实 node payload map

这更像一次性实例，而不是稳定的公共建模。

### 2.2 `template` 才是可复用的主模型

真正适合穿过 product -> react -> editor 这条边界的，是：

1. 可重复使用
2. 不绑定 document id
3. 不绑定一次性实例上下文
4. 不泄漏产品层以外的解释过程

这正是 `template`。

### 2.3 mindmap 必须是 template-first

node 和 edge 可以比较直接地从 template 落到创建。

但 mindmap 不一样：

1. 它天然是一个复合结构
2. 它需要在真正 commit 时才分配真实 node id
3. 它适合先保存“蓝图”，再实例化

所以如果把 mindmap 的公共主模型做成 `spec`，最终一定会别扭。

---

## 3. 最终命名规则

后续命名只保留这两层。

### 3.1 `*Template`

公共主模型，用于：

1. product preset 解析结果
2. react toolbox / menu 选择结果
3. editor tool 当前创建语义

最终保留：

1. `EdgeTemplate`
2. `NodeTemplate`
3. `MindmapTemplate`
4. `InsertTemplate`

### 3.2 `instantiate*` / `build*`

只用于内部 helper 函数，不用于 editor 对外主类型名。

例如：

1. `instantiateMindmapTemplate(...)`
2. `buildNodeCreate(...)`
3. `buildEdgeCreate(...)`

也就是说：

1. “实例化”是过程
2. “template”是稳定边界对象

---

## 4. 最终分层

### 4.1 `@whiteboard/product`

负责：

1. `preset key -> template`
2. 产品层 preset / catalog / palette / theme / i18n

它可以知道：

1. `preset`
2. `seed`
3. label / description / icon / group

### 4.2 `@whiteboard/react`

负责：

1. 渲染 toolbox / menus / toolbar
2. 读取 product catalog
3. 把 `preset` 解析成 `template`
4. 把 `template` 写入 editor tool

### 4.3 `@whiteboard/editor`

负责：

1. 维护当前 tool
2. 在交互时使用 tool.template
3. 在真正创建时，把 template 转成 create payload

它只知道：

1. `template`
2. pointer / position / endpoints
3. layout / write / interaction

### 4.4 `@whiteboard/core`

负责：

1. 通用 types
2. geometry / reducer / commands
3. node / edge / mindmap 纯算法
4. `template -> concrete create payload` 的通用实例化 helper

---

## 5. 最终类型设计

## 5.1 Edge

```ts
export type EdgeTemplate = Pick<
  EdgeInput,
  'type' | 'style' | 'textMode'
>
```

说明：

1. edge template 已经足够简单，不需要再额外包一层
2. 它不包含 source / target
3. source / target 属于这次交互输入，不属于模板

## 5.2 Node

```ts
export type NodeTemplate = Omit<
  SpatialNodeInput,
  'position'
>
```

说明：

1. node template 不包含 position
2. position 属于本次插入行为
3. template 本身可以长期复用

如果未来需要彻底规避“输入类型”和“模板类型”混用，也可以升级成：

```ts
export type NodeTemplate = {
  node: Omit<SpatialNodeInput, 'position'>
}
```

但当前长期最优下，直接用 `Omit<..., 'position'>` 已经足够清晰，不需要人为多包一层。

## 5.3 Mindmap

mindmap template 必须是纯蓝图，不带真实 node id。

最终建议：

```ts
export type MindmapTemplateNode = {
  node: NodeTemplate
  side?: 'left' | 'right'
  branch?: MindmapBranchStyle
  children?: readonly MindmapTemplateNode[]
}

export type MindmapTemplate = {
  layout: MindmapLayoutSpec
  root: MindmapTemplateNode
}
```

说明：

1. 不使用 document node id
2. 不使用 template-local id map 作为公共主模型
3. 使用嵌套树表达结构，最直观
4. 更适合产品 preset、UI preview、tool 持有

### 5.4 Insert

最终 insert 统一成一个并集：

```ts
export type InsertTemplate =
  | {
      kind: 'node'
      template: NodeTemplate
      placement?: 'point' | 'center'
      editField?: EditField
    }
  | {
      kind: 'mindmap'
      template: MindmapTemplate
      focus?: 'edit-root' | 'select-root'
    }
```

这样：

1. editor 只需要一个 insert tool
2. react/toolbox 也只需要一个 insert 入口
3. node 与 mindmap 在 insert 语义上统一

---

## 6. 最终 Tool API

上一版的：

```ts
tool.edge(spec: EdgeSpec): void
tool.insertNode(...): void
tool.insertMindmap(...): void
```

不采用。

原因：

1. 三套接口不对称
2. editor action 表面上在帮调用方分类，实际上暴露了内部实现切分
3. `insertNode / insertMindmap` 让 insert 这条主语义被拆散了

最终核心 API 应当只有：

```ts
tool.set(tool: Tool): void
```

其中：

```ts
export type EdgeTool = {
  type: 'edge'
  template: EdgeTemplate
}

export type InsertTool = {
  type: 'insert'
  template: InsertTemplate
}

export type Tool =
  | SelectTool
  | HandTool
  | DrawTool
  | EdgeTool
  | InsertTool
```

### 可选的薄快捷方式

如果为了调用方便，可以保留两层极薄 sugar：

```ts
tool.edge(template: EdgeTemplate): void
tool.insert(template: InsertTemplate): void
```

但这不是核心模型，核心模型永远是：

```ts
tool.set(tool)
```

---

## 7. 最终 create / write API

### 7.1 Node

```ts
node.create(input: {
  position: Point
  template: NodeTemplate
}): CommandResult<{ nodeId: NodeId }>
```

### 7.2 Edge

```ts
edge.create(input: {
  from: EdgeEnd
  to: EdgeEnd
  template: EdgeTemplate
}): CommandResult<{ edgeId: EdgeId }>
```

### 7.3 Mindmap

你给的两个版本里，我最终都不选。

最终定稿是：

```ts
mindmap.create(input: {
  id?: MindmapId
  position?: Point
  template: MindmapTemplate
}): CommandResult<{
  mindmapId: MindmapId
  rootId: MindmapNodeId
}>
```

这是长期最优。

---

## 8. 为什么 `mindmap.create({ template })` 最优

### 不选版本 A

```ts
mindmap.create({
  id?,
  rootId?,
  position?,
  create: MindmapMaterializedCreate
})
```

问题：

1. `create.create` 很别扭
2. `MindmapMaterializedCreate` 过长而且暴露构建过程
3. `rootId` 双重来源
4. public API 里出现一次性展开结果，不适合作为主模型

### 不选版本 B

```ts
mindmap.create({
  id?,
  position?,
  tree,
  nodeInputs
})
```

问题：

1. 边界对象被拍平
2. 未来字段会继续散落在命令参数表面
3. 没有一个稳定对象名可供复用
4. preview / action / write / test 会越来越难统一

### 选版本 C

```ts
mindmap.create({
  id?,
  position?,
  template
})
```

原因：

1. public API 短
2. 语义清晰
3. 与 `node.create({ template })` / `edge.create({ template })` 对齐
4. editor 内部可以自由决定何时实例化
5. id 生成逻辑完全内聚在 mindmap create 流程内

所以最终不是 `spec` 边界，而是：

**统一 `template` 边界。**

---

## 9. `template(idGenerator)=node/edge/mindmap` 怎么理解

你这个方向是对的，但要精确一点。

### 9.1 Edge

edge 不需要 `idGenerator` 去展开内容结构。

它只是：

```ts
template + from + to -> edge payload
```

这里只有最终 edge 自己的 `edgeId` 是命令层生成的，不属于 template 实例化问题。

### 9.2 Node

node 也不需要 `idGenerator` 去展开结构。

它只是：

```ts
template + position -> node payload
```

### 9.3 Mindmap

只有 mindmap 真正需要：

```ts
template + createNodeId -> concrete tree + node payloads
```

所以最终不应该为了“看起来统一”去强行做一个泛化的：

```ts
template(idGenerator) => node/edge/mindmap
```

而是应当明确：

1. node / edge 直接使用 template
2. mindmap 在 create 内部额外做一次实例化

这才是最自然的职责分离。

---

## 10. Mindmap 内部实例化 helper

虽然 public API 不暴露 `spec` 作为主模型，但 mindmap 内部仍然需要一个实例化结果。

这个结果不建议作为 editor 公共主类型，而建议作为内部 helper 返回值。

最终建议在 core 提供：

```ts
export type MindmapConcrete = {
  tree: MindmapTree
  nodes: Record<MindmapNodeId, NodeTemplate>
}

export const instantiateMindmapTemplate: (input: {
  template: MindmapTemplate
  createNodeId: () => MindmapNodeId
}) => MindmapConcrete
```

说明：

1. `MindmapConcrete` 是内部执行态，不是外部主模型
2. 它可以保留简短命名
3. 它的使用范围应当限制在 create/write/preview 这类内部链路

如果你希望更进一步减少概念，甚至可以不导出 `MindmapConcrete` 类型名，只导出函数返回值推断。

但文档层面，保留这个内部名是有帮助的。

---

## 11. preset 到 editor 的最终链路

### 11.1 Edge

```ts
const template = resolveWhiteboardEdgeTemplate(presetKey)

editor.actions.tool.set({
  type: 'edge',
  template
})
```

### 11.2 Node Insert

```ts
const preset = getWhiteboardInsertPreset(key)

editor.actions.tool.set({
  type: 'insert',
  template: {
    kind: 'node',
    template: preset.template,
    placement: preset.placement,
    editField: preset.editField
  }
})
```

### 11.3 Mindmap Insert

```ts
const template = buildWhiteboardMindmapTemplate({
  preset,
  seed
})

editor.actions.tool.set({
  type: 'insert',
  template: {
    kind: 'mindmap',
    template,
    focus: 'edit-root'
  }
})
```

### 11.4 真正创建

pointer commit 时：

```ts
if (tool.type === 'insert' && tool.template.kind === 'mindmap') {
  editor.actions.mindmap.create({
    position,
    template: tool.template.template
  })
}
```

在 `mindmap.create(...)` 内部再做：

```ts
const concrete = instantiateMindmapTemplate({
  template,
  createNodeId
})
```

---

## 12. product 的最终 API

最终 `@whiteboard/product` 不输出 `policy`，而只输出：

```ts
export const resolveWhiteboardEdgeTemplate: (
  preset: string
) => EdgeTemplate | undefined

export const getWhiteboardInsertPreset: (
  key: string
) => WhiteboardInsertPreset | undefined

export const buildWhiteboardMindmapTemplate: (input?: {
  preset?: string
  seed?: string
}) => MindmapTemplate
```

其中：

```ts
export type WhiteboardInsertPreset =
  | {
      kind: 'node'
      key: string
      label: string
      description?: string
      template: NodeTemplate
      placement?: 'point' | 'center'
      editField?: EditField
    }
  | {
      kind: 'mindmap'
      key: string
      label: string
      description?: string
      template: MindmapTemplate
      focus?: 'edit-root' | 'select-root'
    }
```

这样 product 层也完全围绕 template 收敛。

---

## 13. editor 最终 API 定稿

### 13.1 Tool

```ts
export type EdgeTool = {
  type: 'edge'
  template: EdgeTemplate
}

export type InsertTool = {
  type: 'insert'
  template: InsertTemplate
}

export type Tool =
  | SelectTool
  | HandTool
  | DrawTool
  | EdgeTool
  | InsertTool
```

### 13.2 Actions

核心：

```ts
tool.set(tool: Tool): void
```

可选 sugar：

```ts
tool.edge(template: EdgeTemplate): void
tool.insert(template: InsertTemplate): void
```

### 13.3 Writes

```ts
node.create(input: {
  position: Point
  template: NodeTemplate
}): CommandResult<{ nodeId: NodeId }>

edge.create(input: {
  from: EdgeEnd
  to: EdgeEnd
  template: EdgeTemplate
}): CommandResult<{ edgeId: EdgeId }>

mindmap.create(input: {
  id?: MindmapId
  position?: Point
  template: MindmapTemplate
}): CommandResult<{
  mindmapId: MindmapId
  rootId: MindmapNodeId
}>
```

---

## 14. 接下来还要做什么

### 14.1 文档与命名统一

全部改成：

1. `EdgeTemplate`
2. `NodeTemplate`
3. `MindmapTemplate`
4. `InsertTemplate`

删除：

1. `EdgeSpec`
2. `MindmapSpec`
3. `MindmapMaterializedCreate`
4. `Editor*Policy`

### 14.2 editor 收口

需要完成：

1. `Tool` 去掉 `preset`
2. `Tool` 改成 `template`
3. `tool.set` 成为核心 API
4. 删除 `policy` 注入
5. `mindmap.create` 改成接 `template`

### 14.3 product 收口

需要完成：

1. 所有 preset 解析结果统一为 `template`
2. insert catalog 不再混用 `input/spec/create`
3. mindmap preset 输出 `MindmapTemplate`

### 14.4 core 收口

需要完成：

1. 增加 `instantiateMindmapTemplate(...)`
2. 清理旧产品层内容

---

## 15. 最终原则

最后只保留五条原则。

### 15.1 `preset` 不进 editor

### 15.2 `policy` 不进 editor

### 15.3 `tool` 只持有 `template`

### 15.4 `create` 统一接 `template`

### 15.5 只有 mindmap 在内部额外做实例化

---

## 16. 一句话总结

**最终模型不是 `preset -> policy -> spec`，而是 `preset -> template`；tool 持有 template，`node/edge/mindmap.create(...)` 都以 template 为公开边界，只有 mindmap 在内部用 `instantiateMindmapTemplate(...)` 展开成真实结构。**
