# SPEC + PLAIN OBJECT + 字符串配置长期最优审计与最终方案

## 1. 结论

可以继续显著简化，而且方向非常明确。

当前仓库里最核心的一步已经完成：

1. `shared/delta` 已经从 builder API 收敛到 plain object + 字符串叶子字段。
2. `shared/projection` 的 surface / phase scope 已经能用 plain object spec 装配。
3. `whiteboard-editor-scene` 已经把 `graph / spatial / items / ui / render` 的 phase 装配落到了对象 spec。

但这还不是最终状态。现在仍然存在 5 类非终态残留：

1. 词汇没有统一：`slot`、`field`、`schema`、`registry`、`meta table`、`path` 各自有自己的命名体系。
2. 数据形状没有统一：`order/byId`、`ids/byId`、`Map`、`Record`、数组回转层并存。
3. 装配方式没有统一：有的地方是 plain object spec，有的地方还是 `createXxx(...)`、`register(...)`、`helper(...)` 拼对象。
4. 配置键没有统一：有的地方已经是字符串 key，有的地方还在公共配置层暴露 `Path` 数组。
5. 基础设施之间存在重复实现：`shared/delta/changeState.ts` 和 `shared/projection/scope.ts` 都在做 schema tree 递归；`store/family`、`entityTable`、`projection family` 都在表达“有序实体族”，但词汇和接口不同。

长期最优状态必须是：

1. 配置层统一为 plain object spec。
2. 配置叶子统一为字符串字面量、字符串 key、函数引用三种。
3. 行为函数只出现在叶子，不再承担装配职责。
4. 公共配置层统一暴露字符串 key，不暴露数组 `Path`。
5. 公共实体族统一暴露 `ids + byId`。
6. 所有“注册”行为都改为“声明 spec + 一次编译”。

---

## 2. 最终原则

## 2.1 配置层与运行时层分离

最终架构必须分成两层：

1. **配置层**
   - 只允许 plain object、数组、字符串字面量、数字、布尔值、函数引用。
   - 不允许在配置层调用 builder/helper 去“拼”另一个对象。
   - 不允许在配置层暴露 `Map`、`Set`、`Path` 数组这种运行时结构。

2. **运行时层**
   - 允许 `Map`、`Set`、缓存、索引、编译结果。
   - 运行时层只消费“已经定型”的 spec，不再推断装配规则。

这意味着长期最优不是“没有函数”，而是“函数只做行为，不做装配”。

## 2.2 统一的公共词汇

最终公共 API 只能保留下面这套词汇：

1. **field kind**
   - `value`
   - `family`
   - `flag`
   - `ids`
   - `set`

2. **entity family shape**
   - `ids`
   - `byId`

3. **config key**
   - `type`
   - `family`
   - `panelKey`
   - `fieldKey`
   - `itemKey`
   - `phase`

以下词汇必须退出公共配置层：

1. `slot`
2. `order` 作为公共 entity family 顺序字段名
3. `register`
4. `createXxx` 用于对象装配

## 2.3 字符串配置的边界

字符串配置必须覆盖“可索引、可比对、可缓存、可序列化”的那部分领域信息：

1. phase 名称
2. surface field 名称
3. node type
4. toolbar item key / panel key
5. mutation field key
6. schema field key
7. operation type
8. operation family

以下内容不应强行字符串化：

1. React render 函数
2. projection phase `run`
3. toolbar panel render
4. node 命中、布局、编辑能力逻辑
5. runtime patch 算法

这些必须保留为函数叶子。

---

## 3. 当前审计结果

## 3.1 已经接近终态的部分

### A. `shared/delta`

文件：

- `shared/delta/src/changeState.ts`

当前状态：

1. `ChangeSchema<T>` 已经是 plain object schema。
2. 叶子字段已经收敛为字符串：
   - `'flag'`
   - `'ids'`
   - `'set'`
3. `whiteboard-editor-scene/src/contracts/delta.ts` 已经按这个模式声明 `graphChangeSpec / uiChangeSpec / renderChangeSpec`。

结论：

这一层方向正确，已经进入终态区间。

### B. `shared/projection` surface 装配

文件：

- `shared/projection/src/runtime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

当前状态：

1. surface field 已经是 plain object：
   - `{ kind: 'value', ... }`
   - `{ kind: 'family', ... }`
2. scene runtime 已经直接声明 spec，不再依赖 builder helper。
3. family sync 已经具备 `changed` / `delta` / `idsEqual` 机制。

结论：

surface 方向正确，已经是长期模型的核心。

### C. `whiteboard-editor-scene` phase spec

文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`

当前状态：

1. `graph / spatial / items / ui / render` 的 scope schema 已经是 plain object。
2. render 输入分流已经按 spec + delta 做装配。
3. `items` / `render.statics` / `render.labels` / `render.masks` 已经统一为 family 语义。

结论：

scene 这一层已经是“上层如何使用 spec 系统”的正确样板。

## 3.2 仍未到终态的部分

### A. `shared/projection/src/scope.ts` 的 `slot`

文件：

- `shared/projection/src/scope.ts`

当前状态：

1. `ScopeFieldSpec = 'flag' | 'set' | 'slot'`
2. `slot` 的语义是“任意单值覆盖”
3. 仓库内当前 phase scope 实际没有使用 `slot`

问题：

1. `slot` 不是最终公共词汇。
2. 它和 surface 的 `value` 是同一语义域，却用了另一套名字。
3. 它让 `scope` 这一套配置语言与 `surface` / `delta` 的词汇割裂。

最终状态：

1. `slot` 必须改名为 `value`。
2. `ScopeFieldSpec` 最终只能是：
   - `'flag'`
   - `'set'`
   - `'value'`
3. 如果长期没有 scope 单值字段需求，这个叶子类型应直接删除，只保留 `'flag' | 'set'`。

### B. `shared/projection` 导出的 plan/helper 仍带中间层味道

文件：

- `shared/projection/src/plan.ts`
- `shared/projection/src/scope.ts`

当前状态：

1. `createPlan()` / `mergePlans()` 仍是 helper 风格 API。
2. `normalizeScopeValue()` / `mergeScopeValue()` / `isScopeValueEmpty()` 是 runtime 内部机制。
3. 仓库内没有发现业务方直接使用 `createPlan()` / `mergePlans()`。

问题：

1. 没有业务价值的 helper 不应作为长期公共能力存在。
2. 这些 API 会把“对象配置系统”再次包装回“函数式装配系统”。

最终状态：

1. `createPlan()` / `mergePlans()` 不再作为公共 API。
2. scope merge/normalize helper 内聚到 projection runtime 内部。
3. `shared/projection` 对外只暴露：
   - projection runtime
   - projection spec 类型
   - scope schema 类型

### C. `shared/delta/changeState.ts` 与 `shared/projection/scope.ts` 重复递归

文件：

- `shared/delta/src/changeState.ts`
- `shared/projection/src/scope.ts`

当前状态：

1. 两者都维护 schema object tree。
2. 两者都做：
   - leaf 判定
   - 递归创建
   - 递归 merge
   - 递归空值判定 / has 判定

问题：

这是同一类“plain object schema tree walker”的重复实现。

最终状态：

必须建立统一的 schema tree 内核，形态有且只有两种可接受实现：

1. 新增 `shared/spec`
   - 只负责遍历 plain object schema tree
   - 不关心 `delta`、`projection`、`store`
2. 或者把这套 walker 内聚进 `shared/projection`，并让 `delta` 复用

长期最优是第 1 种：

```ts
type SpecLeaf = string

type SpecTree = {
  [key: string]: SpecLeaf | SpecTree
}

walkSpec(spec, {
  leaf(path, kind) { ... },
  enter(path, node) { ... }
})
```

`changeState`、`scope` 都基于同一 walker 定义语义。

### D. `shared/core/store` 仍是“函数组合器”而不是“对象 spec”

文件：

- `shared/core/src/store/table.ts`
- `shared/core/src/store/familyStore.ts`
- `shared/core/src/store/struct.ts`
- `shared/core/src/store/types.ts`

当前状态：

1. `createTableStore`
2. `createFamilyStore`
3. `createStructStore({ fields: ... })`
4. `table.project.field(select, isEqual)`

问题：

1. 这套 API 能工作，但词汇和 `projection surface` 完全不统一。
2. `struct` 需要再包一层 `fields`，不是最终 plain object 形态。
3. `project.field(...)` 是基于函数的局部投影 helper，不是 declarative spec。
4. `TableStore` / `FamilyStore` / `StructStore` 三套词汇没有统一为一个对象模型。

最终状态：

`shared/core/store` 必须收敛到与 `shared/projection` 同一套对象词汇：

1. value
2. family
3. object

最终公共组合接口应长成：

```ts
const selectionView = store.object({
  target: {
    kind: 'value',
    read: () => store.read(state.selection),
    isEqual: selectionApi.target.equal
  },
  kind: {
    kind: 'value',
    read: () => toSelectionViewKind(store.read(selectionSummary).kind)
  },
  summary: {
    kind: 'value',
    read: () => store.read(selectionViewSummary)
  }
})
```

而不是：

```ts
store.createStructStore({
  fields: { ... }
})
```

`TableStore.project.field(...)` 也必须改为统一的 object/field 语法，不再保留特例 DSL。

### E. `EntityTable` 与 `FamilyStore` 的公共形状不统一

文件：

- `shared/core/src/entityTable.ts`
- `shared/core/src/store/types.ts`

当前状态：

1. `EntityTable` 使用 `{ byId, order }`
2. `StoreFamily` 使用 `{ ids, byId }`

问题：

1. 这两个本质上表达的是同一个概念：有序实体族。
2. 公开字段名不同，会让上层在“document table / runtime family / projection family”之间来回做词汇转换。

最终状态：

1. 公共语义统一为 `ids + byId`
2. `order` 只允许作为局部算法变量名存在，不再作为公共结构字段名

`EntityTable` 最终必须收敛为：

```ts
interface EntityTable<TId extends string, TValue> {
  ids: readonly TId[]
  byId: Record<TId, TValue>
}
```

`shared/draft` 等依赖层随之对齐。

### F. `shared/mutation/meta.ts` 仍保留无必要包装

文件：

- `shared/mutation/src/meta.ts`

当前状态：

1. `meta.create(table)`
2. `meta.family(table)`
3. `meta.get(table, input)`

问题：

1. `create` / `family` 只是冻结对象，不是业务语义。
2. `family` 与 `create` 没有本质差异。
3. 仓库内没有业务方真实依赖这套 helper，基本停留在测试层。

最终状态：

公共配置层必须直接声明：

```ts
export const OP_META = {
  'doc.rename': { family: 'doc' },
  'doc.reindex': { family: 'doc', sync: 'checkpoint', history: false }
} as const satisfies OpMetaTable<DocOp>
```

保留的只应是读取 helper：

1. `readOpMeta(table, type)`
2. `isLiveOp(table, type)`
3. `tracksHistory(table, type)`

`meta.create` / `meta.family` 必须退出公共 API。

### G. `shared/mutation/path.ts` 不应继续暴露到公共配置层

文件：

- `shared/mutation/src/path.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx`
- `whiteboard/packages/whiteboard-editor/src/editor/source/selection.ts`

当前状态：

1. 节点 schema、样式能力、写接口都大量使用 `mutationPath.of('fontSize')`
2. 公共 schema field 里暴露 `Path` 数组

问题：

`Path` 数组属于内部执行结构，不属于最终配置语言。

最终状态：

公共配置层必须统一使用字符串字段键：

1. `data.title`
2. `data.text`
3. `style.fill`
4. `style.fontSize`

内部 runtime/编译层再把字符串字段键编译成 `Path`：

```ts
type FieldKey = `${'data' | 'style'}.${string}`
```

最终规则：

1. 对外 spec 使用 `fieldKey: 'style.fontSize'`
2. 对内 compiler 解析成 `{ scope: 'style', path: ['fontSize'] }`

### H. `whiteboard-react` node registry 仍是可变 registry

文件：

- `whiteboard/packages/whiteboard-react/src/features/node/registry/nodeRegistry.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/index.ts`
- `whiteboard/packages/whiteboard-react/src/Whiteboard.tsx`

当前状态：

1. `createNodeRegistry(definitions)`
2. 返回 `{ get, register }`
3. 但仓库内没有真实使用 `register`

问题：

1. 这是典型“保留了插件化姿态，但实际没有插件运行时注册”的过度设计。
2. 当前真实需求是“定义一个节点 spec 集合，然后只读消费”。

最终状态：

节点系统必须改为静态 spec：

```ts
export const NODE_SPEC = {
  frame: { ... },
  shape: { ... },
  draw: { ... },
  text: { ... },
  sticky: { ... }
} as const satisfies NodeSpecTable
```

然后一次编译：

```ts
const nodeType = compileNodeSpec(NODE_SPEC)
```

删除：

1. `createNodeRegistry`
2. `register`
3. `createDefaultNodeRegistry`

`Whiteboard` 的输入也应改成 `nodeSpec`，而不是 `nodeRegistry`。

### I. node schema field helper 仍在拼对象

文件：

- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx`

当前状态：

1. `createField`
2. `dataField`
3. `styleField`
4. `createSchema`

问题：

这些 helper 的作用只是把字符串和 path 拼成对象，不是业务行为。

最终状态：

节点 schema 必须直接写成 literal：

```ts
schema: {
  label: 'Text',
  fields: {
    'data.text': {
      label: 'Text',
      type: 'text'
    },
    'style.fill': {
      label: 'Background',
      type: 'color'
    },
    'style.fontSize': {
      label: 'Font size',
      type: 'number',
      min: 8,
      step: 1
    }
  }
}
```

不再允许：

1. `styleField(...)`
2. `dataField(...)`
3. `createSchema(...)`

### J. `createNodeTypeSupport()` 仍在用运行时扫描 schema 字段

文件：

- `whiteboard/packages/whiteboard-editor/src/types/node/support.ts`

当前状态：

1. `supportsStyle(node, path, kind)` 运行时通过 schema field 数组扫描
2. cache key 里使用 `mutationPath.toString(path)`

问题：

1. 能力判定依赖运行时扫描，而不是编译好的索引。
2. public API 继续暴露 `Path`。

最终状态：

`compileNodeSpec()` 必须在初始化阶段直接产出：

1. `metaByType`
2. `capabilityByType`
3. `editByType`
4. `styleFieldKindByTypeAndFieldKey`
5. `controlsByType`

`supportsStyle` 最终只接收 `fieldKey` 字符串，不再接收 `Path`。

### K. toolbar item registry 已经接近对象 spec，但 recipe 仍是命令式

文件：

- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/items/registry.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/recipe.ts`

当前状态：

1. `itemSpecs` 已经是 `Record<ToolbarItemKey, ToolbarItemSpec>`
2. `renderToolbarPanel()` 仍用 `Object.values(...).find(item => item.panelKey === panelKey)`
3. `resolveToolbarRecipe()` 仍在命令式拼 section 和 divider

问题：

1. item registry 已经 spec 化，但 panel lookup 没有建正式索引。
2. toolbar layout 仍是流程逻辑，不是 declarative recipe spec。

最终状态：

工具栏必须拆成 3 张正式 spec 表：

1. `TOOLBAR_ITEM_SPEC`
2. `TOOLBAR_PANEL_SPEC`
3. `TOOLBAR_LAYOUT_SPEC`

示例：

```ts
export const TOOLBAR_ITEM_SPEC = {
  scope: { panelKey: 'scope', units: 1, ... },
  align: { panelKey: null, units: 1, ... },
  'font-size': { panelKey: 'font-size', units: 1, ... }
} as const

export const TOOLBAR_PANEL_SPEC = {
  scope: { itemKey: 'scope', render: ... },
  'font-size': { itemKey: 'font-size', render: ... }
} as const

export const TOOLBAR_LAYOUT_SPEC = {
  node: [
    ['scope'],
    ['align', 'group'],
    ['shape-kind', 'font-size', 'bold', 'italic', 'text-align', 'text-color', 'stroke', 'fill'],
    ['mindmap-branch', 'mindmap-border'],
    ['lock', 'more']
  ],
  edge: 'edge-default'
} as const
```

可见性规则必须也是索引化配置，而不是散落的 `switch`。

### L. `whiteboard-editor` / `whiteboard-react` 的 runtime 组装仍偏工厂链

文件：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-react/src/Whiteboard.tsx`

当前状态：

1. 两层都采用 `createXxx(...)` 串联 runtime
2. 这些函数承担了 wiring / compile / runtime startup 三种职责

问题：

这不是 builder 式过渡层，但仍然没有把“配置层”和“运行时实例层”明确分开。

最终状态：

1. 保留 runtime factory 边界
2. 但把所有可声明部分前置成 spec：
   - `nodeSpec`
   - `toolbarSpec`
   - `boardConfigSpec`
   - `sceneProjectionSpec`
3. `createEditor()` / `Whiteboard()` 只负责把编译后的 spec 装进 runtime，不再负责解释业务 helper

---

## 4. 长期最优统一模型

## 4.1 配置对象只能有三类叶子

所有公共 spec 最终都只能由下面三类叶子组成：

1. **字符串字面量**
   - `'value'`
   - `'family'`
   - `'flag'`
   - `'ids'`
   - `'set'`
   - `'style.fontSize'`
   - `'scope'`
   - `'font-size'`

2. **普通对象**
   - nested spec tree
   - field config
   - meta config

3. **行为函数引用**
   - `read`
   - `run`
   - `render`
   - `isEqual`
   - `delta`

不再允许“helper 负责制造另一份对象”。

## 4.2 所有有序实体族统一为 `ids + byId`

最终全仓库统一：

```ts
type EntityFamily<TId extends string, TValue> = {
  ids: readonly TId[]
  byId: Readonly<Record<TId, TValue>> | ReadonlyMap<TId, TValue>
}
```

规则：

1. document / immutable table 可用 `Record`
2. runtime / hot path store 可用 `Map`
3. 公共字段名永远是 `ids` 和 `byId`

## 4.3 所有公共字段路径统一为字符串 key

最终全仓库统一：

```ts
type FieldKey = `${'data' | 'style'}.${string}`
```

内部 compiler 再做：

1. `fieldKey -> scope`
2. `fieldKey -> path[]`
3. `fieldKey -> schema field`
4. `fieldKey -> write compiler`

## 4.4 所有公共目标键统一为字符串 grammar

`FieldKey` 不是唯一需要字符串化的键。所有会进入下面这些公共语义层的“目标键 / 冲突键 / 跟踪键”都必须使用字符串 grammar：

1. mutation conflict key
2. operation target key
3. trace touched key
4. cache index key

最终规则：

1. 对外只暴露字符串 grammar：
   - `records`
   - `records.<recordId>`
   - `records.<recordId>.values.<fieldId>`
   - `fields.<fieldId>`
2. `Path[]` 只允许存在于 compiler / runtime 内部。
3. 任何 `mutationPath.of(...)`、`path.toString(...)` 风格 helper 都不能继续作为长期公共装配语言。

## 4.5 所有 kind/type 领域统一为 literal spec table + compile once

`node type` 不是特例。所有按 kind/type 分流的公共领域最终都必须收敛成同一模型：

1. literal spec table
2. 字符串 key
3. 行为函数叶子
4. compile once

最终覆盖范围包括：

1. node type
2. field kind
3. toolbar item / panel / layout
4. view type
5. filter preset / filter kind
6. field value render kind

不再接受下面这些中间层作为长期公共形态：

1. `switch (kind)`
2. `getXxxSpec(kind)`
3. `createXxxSpec(field)`
4. `register(kind, spec)`

长期最优形态必须是：

```ts
export const KIND_SPEC = {
  text: { ... },
  status: { ... },
  kanban: { ... }
} as const

const compiled = compileKindSpec(KIND_SPEC)
```

---

## 5. 每个 shared 基础设施的最终状态

## 5.1 `shared/delta`

最终公共 API：

1. `idDelta`
2. `entityDelta`
3. `createChangeState`
4. `hasChangeState`
5. `ChangeSchema`

内部 API：

1. `cloneChangeState`
2. `mergeChangeState`
3. `takeChangeState`

处理原则：

1. 如果外部没有真实使用，内部化。
2. schema tree walker 迁移到统一 spec walker。

## 5.2 `shared/projection`

最终公共 API：

1. `createProjectionRuntime`
2. `ProjectionSpec`
3. `ProjectionValueField`
4. `ProjectionFamilyField`
5. `ScopeSchema`

必须执行：

1. `slot -> value`
2. 未被使用的 plan helper 退出公共 API
3. scope helper internalize
4. 消除跨 package 源码相对导入：
   - `../../core/src/index`
   - `../../delta/src/index`

## 5.3 `shared/core/store`

最终目标不是删除 store，而是统一它的声明语言。

最终公共组合语法：

1. `store.value(...)`
2. `store.family(...)`
3. `store.object(...)`

以下旧式 helper 退出长期公共心智模型：

1. `createStructStore({ fields })`
2. `table.project.field(...)`

它们可以保留兼容实现，但最终公共写法必须统一成 object field grammar。

## 5.4 `shared/core/entityTable`

最终状态：

1. 公共字段名 `order` 改为 `ids`
2. 与 `StoreFamily` 统一语义
3. `shared/draft/entityTable` 同步对齐

## 5.5 `shared/mutation`

最终状态：

1. operation meta 直接是 const object table
2. public field config 使用 `fieldKey` 字符串
3. public target/conflict key 使用字符串 grammar
4. `Path` 数组退到 compiler / runtime 内部

---

## 6. 上层使用方的最终状态

## 6.1 `whiteboard-editor-scene`

保持：

1. phase scope spec
2. render / items / graph delta spec
3. surface plain object field spec

继续收口：

1. 所有 family public query/capture/state 统一 `ids + byId`
2. 任何 query 层数组回转都不得重新出现

## 6.2 `whiteboard-editor`

最终状态：

1. `nodeTypeSupport` 来自编译后的 node spec 索引
2. style capability 判定按 `fieldKey` 字符串
3. selection / write / layout 不再直接依赖 `mutationPath.of(...)` 出现在公共规则层

## 6.3 `whiteboard-react`

最终状态：

1. `nodeSpec` 替代 `nodeRegistry`
2. default node schema 直接写 literal field spec
3. toolbar item / panel / layout 三张 spec 表固定化
4. `Whiteboard` 只接收 declarative spec，不接收可变 registry

---

## 7. 不应继续做成“装配 helper”的区域

下面这些 helper 不属于长期最优：

1. `createNodeRegistry`
2. `createDefaultNodeRegistry`
3. `createField`
4. `dataField`
5. `styleField`
6. `createSchema`
7. `meta.create`
8. `meta.family`
9. `createPlan`
10. `mergePlans`

下面这些 factory 可以保留，因为它们是在**创建运行时实例**，不是在**配置对象装配**：

1. `createProjectionRuntime`
2. `createEditorSceneRuntime`
3. `createEditor`
4. `createWhiteboardServices`

---

## 8. 最终 API 草案

## 8.1 scope

```ts
type ScopeFieldSpec = 'flag' | 'set' | 'value'
```

## 8.2 change

```ts
type ChangeFieldSpec = 'flag' | 'ids' | 'set'
```

## 8.3 field key

```ts
type FieldKey = `${'data' | 'style'}.${string}`
```

## 8.4 node spec

```ts
export const NODE_SPEC = {
  text: {
    meta: {
      key: 'text',
      name: 'Text',
      family: 'text',
      icon: 'text',
      controls: ['text']
    },
    schema: {
      fields: {
        'data.text': { label: 'Text', type: 'text' },
        'style.fill': { label: 'Background', type: 'color' },
        'style.fontSize': { label: 'Font size', type: 'number', min: 8, step: 1 }
      }
    },
    behavior: {
      render: TextNode,
      style: resolveTextStyle,
      layout: textLayoutSpec
    }
  }
} as const
```

## 8.5 toolbar spec

```ts
export const TOOLBAR_SPEC = {
  items: {
    scope: { panelKey: 'scope', units: 1, render: ScopeButton },
    align: { panelKey: null, units: 1, render: AlignButton }
  },
  panels: {
    scope: { itemKey: 'scope', render: ScopePanel }
  },
  layouts: {
    node: [
      ['scope'],
      ['align', 'group'],
      ['font-size', 'bold', 'italic']
    ],
    edge: [
      ['edge-stroke', 'edge-marker-start', 'edge-marker-end']
    ]
  }
} as const
```

## 8.6 operation meta

```ts
export const OP_META = {
  'doc.rename': { family: 'doc' },
  'doc.reindex': { family: 'doc', sync: 'checkpoint', history: false }
} as const
```

---

## 9. 实施顺序

## Phase 1：统一词汇与公共数据形状

1. `slot -> value`
2. `order -> ids`
3. public field path 全部转为 `FieldKey` 字符串
4. 清理无业务价值 helper 导出

## Phase 2：shared 基础设施统一

1. 提取统一 spec walker
2. `shared/core/store` 统一到 `value / family / object`
3. `shared/mutation/meta` 改为直接 object table

## Phase 3：上层 spec 化

1. node registry -> node spec
2. node schema field helper 删除
3. toolbar recipe -> toolbar spec
4. capability lookup 走编译索引

## Phase 4：runtime 只消费编译结果

1. `createEditor()` 只接收 compiled services/spec
2. `Whiteboard` 只接收 declarative config/spec
3. 所有运行时工厂不再解释 helper 组合产物

---

## 10. 最终判断

这套系统还能继续明显简化，而且简化方向不是“再发明新抽象”，而是把现有体系统一到一套更严格的公共语言：

1. **对象装配统一为 plain object spec**
2. **可索引字段统一为字符串 key**
3. **有序实体族统一为 `ids + byId`**
4. **helper 退出配置层，编译器接管索引构建**
5. **行为函数只留在叶子**

如果把这些全部做完，`shared` 基建和上层白板系统会形成一套真正统一的长期模型：

1. delta 用字符串叶子 schema
2. projection 用对象 field spec
3. store 用同一套 object/value/family 词汇
4. mutation/schema/node/toolbar 全部用字符串 key spec
5. runtime 只消费编译后的索引与行为函数

这就是这条线的长期最优终态。
