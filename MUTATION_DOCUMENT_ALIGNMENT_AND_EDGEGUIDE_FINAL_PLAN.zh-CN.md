# Mutation Document 对齐与 EdgeGuide 最终重构方案

本文只定义最终 API 设计与实施方案，不讨论兼容层，不保留过渡实现。

目标：

- 消除 `mutation engine document` 与业务 `document` 不一致导致的大量 `as`
- 删除为弥补类型不一致而存在的 helper / adapter / `.from({ read, write })`
- 让 `shared/mutation` 的 `MutationDocument<TSchema>` 直接等于业务文档类型
- 收敛 editor preview state，删除 `edgeGuide.current` 这类无意义壳层

---

## 1. 现状问题

当前大量 `as`、`as unknown as`、局部 helper 的根因不是 TypeScript 太严格，而是模型分叉：

1. 业务文档的真实形态是一套
2. mutation schema 推导出来的 `MutationDocument<TSchema>` 是另一套
3. 两者之间用 `.from({ read, write })`、table value 转换、preview wrapper 等方式桥接

这会带来四类长期问题：

- engine / collab / writer / reader 之间到处做类型强转
- schema 明明叫 typed schema，但 typed 的不是最终业务文档
- compile / projection / collab 经常要知道“真实文档”和“mutation 文档”两套协议
- 一旦字段结构调整，需要同步修改 schema、adapter、normalize、helper、测试，脆弱且重复

结论：

**长期最优不是继续压制 `as`，而是消灭“第二套 mutation document”。**

---

## 2. 最终原则

### 2.1 一份文档形态

最终必须满足：

```ts
type MutationDocument<typeof schema> === DomainDocument
```

也就是：

- whiteboard 的 mutation document 直接就是 `Document`
- dataview 的 mutation document 直接就是 `DataDoc`
- editor state mutation document 直接就是 `EditorStateDocument`

不能再存在：

- `as Document`
- `as DataDoc`
- `as MutationDocument<typeof schema>`
- `asWhiteboardMutationDocument`
- `fromDataviewMutationRecord`
- `readMutationTableList`
- `toLabelTableValue / fromLabelTableValue`
- `toRouteTableValue / fromRouteTableValue`

这些都属于“第二套文档协议”的症状，最终都应该删除。

### 2.2 schema 只能描述真实业务结构

schema 的职责是：

- 描述业务文档的真实结构
- 驱动 typed read / write / delta / query / change

schema 不应该再承担：

- 发明一套更容易写 mutation 的中间结构
- 把业务 table 重新编码成另一个 table value
- 用 singleton/table wrapper 包一层无意义的 `current`

### 2.3 `from({ read, write })` 不是主路径能力

`from({ read, write })` 这种 access override 只应保留在极少数确实无法直接存回文档的场景。

长期最优下：

- 它不是 dataview / whiteboard 主体建模方式
- 不能再用它把 schema value 和 document value 映射成两套协议
- 不能再作为类型对齐的常规手段

换句话说：

**如果一个节点需要 `.from({ read, write })` 才能工作，优先怀疑 document shape 设计错了。**

---

## 3. shared/mutation 的最终要求

### 3.1 `MutationValueOfShape` 必须能直接表达业务值

shared/mutation 最终应该只做“结构推导”，不做“结构改写”。

也就是：

- `field<T>()` 推导 `T`
- `field<T>().optional()` 推导 `T | undefined`
- `sequence<T>()` 推导 `readonly T[]`
- `dictionary<K, V>()` 推导 `Readonly<Partial<Record<K, V>>>`
- `table<TId, TShape>()` 推导真实 table
- `map<TId, TShape>()` 推导真实 map
- `tree<TId, TValue>()` 推导真实 tree

但这里的“真实 table / 真实 tree”必须和业务层统一，不允许 shared/mutation 自己定义一套抽象值形态后再让业务去迁就。

这里额外固定一条：

- `tree` 只表达**单根树**
- 正式结构使用 `rootId`
- 当前 `rootIds` / forest 语义直接删除
- 暂不保留 forest primitive

### 3.2 主体 API 只保留结构 facade

shared/mutation 的正式表面应只保留：

- `schema(...)`
- `reader`
- `writer`
- `delta`
- `query`
- `engine`
- `history`
- `serialize / deserialize writes`
- `conflict scopes`

不再允许外部依赖：

- program
- operation
- footprint
- registry handle
- path string mutation protocol
- Mutation document adapter helper

### 3.3 variant 必须成为正式能力

为了解决 dataview `Field` 这种按 `kind` 分支的实体，shared/mutation 最终需要原生 `variant(tag)`。

最终目标是这种建模能力：

```ts
const fieldSchema = variant('kind', {
  text: shape({ ... }),
  number: shape({
    ...,
    config: shape({
      format: ...,
      precision: ...,
    }),
  }),
  select: shape({
    ...,
    config: shape({
      options: table(optionShape),
    }),
  }),
})
```

原因：

- 只有 variant 才能让 `MutationDocument<TSchema>` 和判别联合实体一致
- 只有 variant 才能消除 “一个大 Field + 一堆 optional 属性” 的伪联合
- 只有 variant 才能把 dataview field 的 normalize / convert / helper 复杂度真正打掉

在 variant 正式落地前，继续用大平铺对象只会让 `as` 和 helper 不断回潮。

---

## 4. whiteboard 的最终结构要求

## 4.1 whiteboard schema 必须直接等于 Document

当前 whiteboard mutation model 中最明显的问题是：

- `edge.labels`
- `edge.route`
- `mindmap.structure`

都通过 `.from({ read, write })` 映射到另一套 mutation 值结构。

这直接导致：

- `Document` 不是 `MutationDocument<typeof whiteboardMutationSchema>`
- collab / engine / schema 之间只能靠 `as unknown as`
- route/labels/tree 的 typed facade 都是建在中间协议上的

最终必须改成：

- `Edge.labels` 的业务结构直接就是 schema 结构
- `Edge.route` 的业务结构直接就是 schema 结构
- `Mindmap.structure` 的业务结构直接就是 schema 结构

也就是不要再有：

- `getLabels`
- `writeEdgeLabels`
- `getManualRoutePoints`
- `writeEdgeRoute`
- `createMindmapTreeSnapshot`
- `writeMindmapTreeSnapshot`

这些如果只是 schema/document 对齐而存在，最终都应删除。

### 4.2 edge 的最终形态

`Edge.route`、`Edge.labels` 必须在领域模型里就是可直接写入的结构，而不是：

- 领域层一个形态
- mutation 再投影成 table value

推荐最终方向：

1. `labels` 直接建模为 `EntityTable<EdgeLabelId, EdgeLabel>`
2. `route.points` 直接建模为 `EntityTable<EdgeRoutePointId, EdgeRoutePoint>`
3. 若 `route.kind` 需要区分 `auto/manual`，用 variant 建模

这样：

- schema 直接描述真实 edge
- writer 直接写真实 edge
- collab serialize 的 writes 直接对应真实 edge 结构

### 4.3 mindmap 的最终形态

mindmap 也不应再维护一套“记录形态”和一套“tree snapshot 形态”。

必须二选一：

1. 业务文档直接存单根 tree snapshot
2. shared/mutation 原生支持单根 tree 的 typed 操作

长期更优的是第 1 种：

- document 里直接存 canonical single-root tree
- index / projection 从 tree 派生 children / owner / resolve helpers

不要再让 mutation schema 去把 `MindmapRecord` 转写成另一套 tree snapshot。

---

## 5. dataview 的最终结构要求

## 5.1 field 不再是扁平大对象

当前 dataview field schema 把所有 kind 的字段都平铺在一个 `fieldShape` 上：

- `displayFullUrl`
- `format`
- `precision`
- `currency`
- `defaultOptionId`
- `displayDateFormat`
- `multiple`
- `accept`
- `options`

这不是长期模型，只是缺少 variant 时的妥协。

最终必须改成：

- `Field = TitleField | CustomField`
- `CustomField = TextField | NumberField | SelectField | StatusField | DateField | ...`
- kind-specific 字段统一收进 `config`

推荐最终形态：

```ts
type FieldBase = {
  id: CustomFieldId
  name: string
  meta?: Record<string, unknown>
}

type NumberField = FieldBase & {
  kind: 'number'
  config: {
    format: NumberFormat
    precision: number | null
    currency: string | null
    useThousandsSeparator: boolean
  }
}
```

而不是继续让 `format / precision / currency` 挂在每个 field 的顶层。

这条规则对所有 kind 一致适用：

- `url.config.displayFullUrl`
- `number.config.format / precision / currency / useThousandsSeparator`
- `select.config.options`
- `multiSelect.config.options`
- `status.config.options / defaultOptionId`
- `date.config.displayDateFormat / displayTimeFormat / defaultValueKind / defaultTimezone`
- `asset.config.multiple / accept`

### 5.1.1 status 的 options 也进入 config

`status` 不应继续例外地把 `options`、`defaultOptionId` 放在顶层。

最终应为：

```ts
type StatusField = FieldBase & {
  kind: 'status'
  config: {
    options: EntityTable<FieldOptionId, StatusOption>
    defaultOptionId: string | null
  }
}
```

原因：

1. `status` 的 option 语义与 `select` / `multiSelect` 是同一层级的 kind-specific config
2. 顶层 `Field` 只应保留真正跨 kind 共享的字段
3. 这样才能彻底删除当前 `CustomFieldSchemaSurface` 这种“超集字段对象”心智
4. mutation schema、reader、writer、query、delta 才能与判别联合一一对应

### 5.2 options 必须是结构内真实字段

`select` / `multiSelect` / `status` 的 `options` 应该是它们自己 variant 内的真实字段。

不能继续依赖：

- 所有 field 共享一个 `options`
- 再靠 `kind` 和 normalize 去解释它到底是什么

最终：

- `select.config.options: EntityTable<FieldOptionId, FlatOption>`
- `multiSelect.config.options: EntityTable<FieldOptionId, FlatOption>`
- `status.config.options: EntityTable<FieldOptionId, StatusOption>`
- `status.config.defaultOptionId: string | null`

### 5.3 业务 helper 必须回归“领域 helper”，不能承担类型补洞

像下面这类 helper，如果是为了修补 mutation schema/document 差异，最终都要删除：

- `readMutationTableList`
- `fromDataviewMutationRecord`
- 任何 `normalizeXxxMutation...`

保留下来的 helper 只能是：

- 真正的领域算法
- 真正的 UI 派生
- 真正的 query 聚合

不能是 schema/document 的桥接胶水。

### 5.4 optional 的最终 public API

最终 public API 应统一为：

```ts
optional(field<string>())
optional(sequence<NodeId>())
optional(variant('kind', {...}))
```

而不是：

```ts
field<string>().optional()
```

理由：

1. `optional` 是 schema modifier，不是 field 专属行为
2. 它应该能一致地作用在 field / object / sequence / variant / tree 等任意节点上
3. 这比在每种 node 上挂实例方法更接近统一的 shape-first / zod 风格
4. 可以减少 node instance method 数量，避免 API 面继续膨胀

最终原则：

- `field<T>()` 只表达值类型
- `optional(node)` 表达可缺省语义

`field().optional()` 如果在重构中短期保留，也只能作为内部 sugar，不能作为最终正式表面。

---

## 6. editor preview state 的最终要求

## 6.1 `edgeGuide.current` 没有独立存在价值

现在 editor state 中：

- `draw` 被建成 `{ current: DrawPreview | null }`
- `edgeGuide` 被建成 `{ current?: EdgeGuidePreview }`

但真实业务状态是：

- `preview.draw: DrawPreview | null`
- `preview.edgeGuide?: EdgeGuidePreview`

`current` 这层没有任何领域语义，只是为了配合当前 singleton patch 机制包了一层壳。

这会导致：

- schema 上多一层无意义结构
- runtime 里每次写入都要 `patch({ current: ... })`
- read/write `.from(...)` 又多一层胶水
- projection / equality / action 里出现重复的 unwrap

结论：

**`edgeGuide.current` 应直接删除。**

`draw.current` 也一样，应一起删除。

### 6.2 最终 preview schema

最终 preview 应直接等于业务状态：

```ts
preview: singleton({
  node: ...,
  edge: ...,
  mindmap: ...,
  selection: ...,
  draw: field<DrawPreview | null>(),
  edgeGuide: field<EdgeGuidePreview>().optional(),
})
```

而不是：

```ts
draw: singleton({
  current: field<DrawPreview | null>()
})

edgeGuide: singleton({
  current: field<EdgeGuidePreview>().optional()
})
```

### 6.3 runtime API 最终形态

最终 editor runtime 应直接暴露：

```ts
writer.preview.draw.set(value | null)
writer.preview.edgeGuide.set(value | undefined)
```

而不是：

```ts
writer.preview.draw.patch({ current: value })
writer.preview.edgeGuide.patch({ current: value })
```

也就是说：

- preview 子字段本身就是最终值
- 不要为“可 patch”再引入伪对象

---

## 7. 类型强转清零方案

## 7.1 需要被清零的 `as` 类型

以下类别最终都应清零：

1. schema/document 对齐类
   - `as Document`
   - `as DataDoc`
   - `as MutationDocument<typeof schema>`
   - `as WhiteboardMutationDelta`

2. compile facade 补洞类
   - `as unknown as WhiteboardCompileContext`
   - `as unknown as MutationCompile[...]`

3. writer/read/query facade 补洞类
   - `as MutationShapeNode`
   - `as Extract<...>`
   - `as never` 用于吞掉 facade 类型问题

4. projection / preview wrapper 类
   - `(next as PreviewEdgeGuideValue).current`
   - `(next as PreviewDrawValue).current`

### 7.2 可以保留的极少数 `as`

只有两类 `as` 可以接受：

1. TS 对标准库返回值过宽的地方
   - `Object.keys(...) as FooId[]`
   - `Object.entries(...) as ...`

2. 明确的 branded / opaque id 收窄

除此之外，`as` 原则上都视为结构设计问题，而不是实现细节。

---

## 8. 实施顺序

按长期最优，一步到位顺序如下：

### Phase 1：shared/mutation 先支持真实结构与 variant

1. 补正式 `variant(tag)` schema 节点
2. 让 `MutationDocument<TSchema>` 能直接表达判别联合
3. 收缩 writer/read/query/delta 的内部类型体操
4. 删除仅为旧结构兼容存在的内部 helper

完成标准：

- dataview field 可以不靠扁平大对象建模
- whiteboard edge/mindmap 可以不靠 `.from({ read, write })` 双向转写

### Phase 2：whiteboard document 对齐 schema

1. 重写 `Edge.labels`
2. 重写 `Edge.route`
3. 重写 `Mindmap.structure`
4. 删除对应 conversion helpers

完成标准：

- `Document` 直接等于 `MutationDocument<typeof whiteboardMutationSchema>`
- whiteboard collab / engine / query / projection 中不再需要 document 类型强转

### Phase 2.1：mindmap 的最终语义

这里的“重写 `Mindmap.structure`”不是把 node 实体数据塞进 tree。

最终语义必须明确：

- `document.nodes` 继续保存 node 实体正文，是 node 内容的唯一真相
- `mindmap.tree` 只保存**单根树**关系与 tree-specific metadata
- tree 不保存 node 通用正文数据
- 不再允许多 root 语义
- 不再保留 forest / `rootIds`

也就是：

#### `nodes` 负责

- node text / data / style / geometry / owner 之外的实体正文
- 所有 node 的统一实体表

#### `mindmap.tree` 负责

- parent / children 关系
- sibling order
- side / direction
- collapsed 状态
- branch style
- tree-only layout / semantic metadata

不再允许：

- 业务 document 里一套 `members / children / meta / layout`
- mutation schema 再投影出另一套 `MutationTreeSnapshot`
- 通过 `createMindmapTreeSnapshot(...)` / `writeMindmapTreeSnapshot(...)` 互转
- 用 `rootIds` 冒充 tree
- 为 tree/document 不一致保留任何 adapter / conversion / wrapper 层

最终必须做到：

- document 中存的 mindmap tree，本身就是 mutation schema 直接读写的 tree
- tree value 只表达 tree node value，不表达完整 `Node`
- tree 顶层只有 `rootId`

推荐最终方向：

```ts
type MindmapRecord = {
  id: MindmapId
  layout: MindmapLayoutSpec
  tree: MutationTreeSnapshot<{
    side?: 'left' | 'right'
    collapsed?: boolean
    branchStyle?: ...
    nodeStyle?: ...
  }>
}
```

其中 `MutationTreeSnapshot` 的最终定义应改为：

```ts
type MutationTreeSnapshot<TValue> = {
  rootId?: string
  nodes: Readonly<Record<string, {
    parentId?: string
    children: readonly string[]
    value?: TValue
  }>>
}
```

其中：

- tree value 只承载 tree-specific value
- 真正 node 实体数据仍在 `document.nodes`
- 空树用 `rootId?: undefined` 表达，不再用 `rootIds: []`
- 单根树用 `rootId: string` 表达，不再用 `rootIds: [id]`

### Phase 2.2：删除 tree 适配层与中转层

tree 改成单根 `rootId` 之后，所有适配层和中转层必须一起清掉，不保留“先转成 snapshot 再转回 record”的双向桥。

需要删除的典型内容：

- `createMindmapTreeSnapshot(...)`
- `writeMindmapTreeSnapshot(...)`
- 任何 `record.root -> rootIds[0]`
- 任何 `rootIds.length !== 1` 检查
- 任何为 `rootIds` / forest 语义保留的 helper
- 任何 `tree document` 与 `mindmap document` 之间的 read/write adapter

完成标准：

- shared/mutation 的 tree 正式语义就是单根 `rootId`
- whiteboard mindmap 直接存这种 tree
- 代码库中不再存在 rootIds / forest / tree adapter 心智

### Phase 3：dataview field 结构重写

1. `CustomField` 改为 `base + variant config`
2. mutation schema 改为真实 union 结构
3. 删除 `CustomFieldSchemaSurface`
4. 删除为扁平大 field 存在的 normalize/convert 胶水

完成标准：

- `DataDoc` 直接等于 `MutationDocument<typeof dataviewMutationSchema>`
- field 不再是大平铺对象

### Phase 4：editor preview state 扁平化

1. 删除 `draw.current`
2. 删除 `edgeGuide.current`
3. schema/read/write/runtime 全面改为直接值
4. 删除对应 `PreviewDrawValue / PreviewEdgeGuideValue` wrapper

完成标准：

- `writer.preview.draw.set(...)`
- `writer.preview.edgeGuide.set(...)`
- preview state 不再出现无意义 singleton current 壳层

### Phase 5：清理 residual `as` 与 helper

1. 全仓搜索 `as unknown as`、`as never`
2. 逐项判断是否仍属于结构不一致
3. 删除所有 schema/document adapter helper
4. 只保留标准库宽类型收窄类断言

完成标准：

- 代码库里不再存在因 mutation document/业务 document 分叉导致的强转

---

## 9. 最终状态定义

最终状态应满足以下条件：

1. `MutationDocument<typeof schema>` 与业务 document 类型完全一致
2. 业务包不再维护“mutation 专用 document 形态”
3. `.from({ read, write })` 不再作为主体建模方式
4. dataview field 回到真正的按 kind 分支联合
5. whiteboard edge/mindmap 不再通过中转结构桥接
6. editor preview 不再使用 `edgeGuide.current` / `draw.current`
7. `as unknown as` / `as never` 的主体来源被清零

这才是长期最优。
