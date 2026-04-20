# Whiteboard 模块化导出与命名空间方案

## 目标

- 尽量减少 runtime 平铺导出。
- 外部优先使用模块对象，而不是直接 import 散落的 helper。
- 命名按领域分层，不做全局 `read/get/resolve/helpers` 大桶。
- 各模块内部继续按命名空间分开，导出面稳定、清晰、可演进。

## 现状结论

### 全局 helper 分布

- 以 `whiteboard/packages/*/src` 为范围，排除 `dist`、`node_modules`、`test`。
- 运行时 `export const/function` 粗扫约 **721** 个。
- helper 前缀高度集中在 `whiteboard-core`，其次是 `editor`、`react`、`product`。

按 package 的粗扫结果：

| package | 主要前缀 |
| --- | --- |
| `whiteboard-core` | `create` 76, `get` 44, `resolve` 40, `read` 17, `is` 23 |
| `whiteboard-editor` | `create` 68, `read` 6, `is` 12 |
| `whiteboard-engine` | `create` 13, `compile` 9, `resolve` 3 |
| `whiteboard-react` | `use` 19, `resolve` 17, `read` 10, `create` 12 |
| `whiteboard-product` | `read` 11, `get` 6, `resolve` 4, `create` 6 |
| `whiteboard-collab` | `create` 6 |

结论：

- 真正散的是“公开导出语言”，不是“helpers 文件”本身。
- `core` 和 `product` 是导出面最需要收口的两个区域。
- `editor / engine / history / collab` 的包入口已经比较克制，但仍可进一步模块化。

### 当前高风险扁平入口

`export *` 主要集中在：

- `@whiteboard/core/document`
- `@whiteboard/core/edge`
- `@whiteboard/core/mindmap`
- `@whiteboard/core/types`
- `@whiteboard/product`
- `@whiteboard/product/i18n`

结论：

- 长期最优应当禁止 runtime 入口继续使用 `export *`。
- 类型 barrel 可以单独保留，runtime barrel 不应继续平铺。

## 总体判断

### 不做什么

不做这些事情：

- 不做全局 `read = {}`、`resolve = {}`、`helpers = {}` 总线。
- 不把纯几何、纯算法、运行时 facade 混进同一个 verb 桶。
- 不在包根继续堆 `createX / resolveY / getZ` 这种重复领域前缀的平铺导出。

### 做什么

做“领域优先”的模块化：

- 先按 domain 切模块。
- 再在 domain 内按 role 切命名空间。
- 最终对外暴露少量模块对象。

标准形态：

```ts
import { geometry } from '@whiteboard/core/geometry'
import { edge } from '@whiteboard/core/edge'
import { product } from '@whiteboard/product'

geometry.rect.center(rect)
geometry.viewport.worldToScreen(point, viewport)
edge.route.insert(edgeValue, index, point)
product.palette.key.create('line', 0)
```

核心原则：

- domain first
- role second
- verb last

## 导出规则

### 1. 包入口规则

每个 package 的 runtime 入口只允许导出：

- 领域模块对象
- 极少数语言级例外
- 类型

不允许：

- 大量 `createX / getX / resolveX / readX` 平铺在包根
- runtime `export *`

### 2. 子模块规则

每个 public subpath 优先只暴露一个主模块对象。

例如：

- `@whiteboard/core/geometry` 导出 `geometry`
- `@whiteboard/core/node` 导出 `node`
- `@whiteboard/core/edge` 导出 `edge`
- `@whiteboard/core/document` 导出 `document`

如果一个 subpath 本身已经很小，也可以只导出极少数模块对象，例如：

- `@whiteboard/core/spec/operation` 导出 `meta`、`sync`
- `@whiteboard/core/spec/history` 导出 `key`、`collect`

### 3. 子命名空间规则

模块对象内部允许这些稳定 role：

- `read`
- `list`
- `has`
- `create`
- `plan`
- `build`
- `apply`
- `patch`
- `guard`
- `equal`
- `normalize`
- `layout`
- `route`
- `text`
- `shape`
- `label`
- `snap`
- `view`
- `command`

不建议使用这些没有领域边界的全局桶：

- `helpers`
- `common`
- `misc`
- `utils`
- 跨 domain 的 `read/get/resolve`

### 4. 命名压缩规则

一旦进入模块命名空间，叶子函数名必须去掉重复的领域前缀。

例子：

| 当前导出 | 目标导出 |
| --- | --- |
| `getRectCenter` | `geometry.rect.center` |
| `rectFromPoints` | `geometry.rect.fromPoints` |
| `viewportWorldToScreen` | `geometry.viewport.worldToScreen` |
| `getNode` | `document.read.node` |
| `listNodes` | `document.list.nodes` |
| `hasNode` | `document.has.node` |
| `getSubtreeIds` | `mindmap.tree.subtreeIds` |
| `resolveInsertPlan` | `mindmap.plan.insertByPlacement` |
| `insertRoutePoint` | `edge.route.insert` |
| `moveRoutePoint` | `edge.route.move` |
| `removeRoutePoint` | `edge.route.remove` |
| `clearRoute` | `edge.route.clear` |
| `resolveTextContentBox` | `node.text.contentBox` |
| `readShapeKind` | `node.shape.kind` |
| `isShapeKind` | `node.shape.isKind` |

### 5. 实现优先级

优先使用这两种方式组织模块：

1. `export * as rect from './rect'`
2. `export const geometry = { rect, point, viewport } as const`

选择原则：

- 如果只是做天然文件分组，优先 `export * as`
- 如果需要组合多个子模块、做别名、裁剪导出面，优先显式对象

## 各 package 目标 API

## `@whiteboard/core`

### 总原则

- 保持 **无根入口**，继续只走 subpath。
- 每个 subpath 只导出一个主模块对象，外加必要类型。
- `types` 单独保留，不混进 runtime 模块对象。

### `@whiteboard/core/document`

目标：

```ts
document.create()
document.assert(value)
document.read.node(doc, id)
document.read.edge(doc, id)
document.read.group(doc, id)
document.read.mindmap(doc, id)
document.has.node(doc, id)
document.has.edge(doc, id)
document.list.nodes(doc)
document.list.edges(doc)
document.list.groups(doc)
document.list.canvasRefs(doc)
document.slice.translate(slice, delta)
document.slice.bounds(slice)
document.slice.export.selection(input)
document.slice.export.nodes(input)
document.slice.export.edge(input)
document.slice.buildInsertOps(input)
```

内部命名空间：

- `document`
- `read`
- `has`
- `list`
- `slice`

### `@whiteboard/core/geometry`

目标：

```ts
geometry.scalar.clamp()
geometry.rect.center()
geometry.rect.fromPoints()
geometry.rect.expand()
geometry.rect.bounding()
geometry.point.rotate()
geometry.point.quantizeAngleStep()
geometry.polyline.normalize()
geometry.polyline.equal()
geometry.rotation.corners()
geometry.collision.rectIntersectsRotatedRect()
geometry.segment.distanceToPoint()
geometry.equal.point()
geometry.equal.size()
geometry.viewport.normalize()
geometry.viewport.pan()
geometry.viewport.zoom()
geometry.viewport.fitToRect()
geometry.viewport.worldToScreen()
geometry.viewport.screenToWorld()
geometry.anchor.point()
```

内部命名空间：

- `scalar`
- `rect`
- `point`
- `polyline`
- `rotation`
- `collision`
- `segment`
- `equal`
- `viewport`
- `anchor`

### `@whiteboard/core/node`

目标：

```ts
node.update.apply()
node.update.inverse()
node.update.classify()
node.update.isEmpty()

node.geometry.rect()
node.geometry.aabb()
node.geometry.bounds()
node.geometry.rotation()

node.outline.bounds()
node.outline.anchor()
node.outline.projectPoint()

node.draw.resolvePoints()
node.draw.resolveStroke()

node.frame.collectMembers()
node.frame.expandSelection()
node.frame.atPoint()
node.frame.of()

node.move.buildCommit()
node.move.buildSet()
node.move.projectPreview()
node.move.resolveEffect()
node.move.state.start()
node.move.state.step()
node.move.state.finish()

node.transform.buildPlan()
node.transform.buildHandles()
node.transform.project()
node.transform.start()
node.transform.step()
node.transform.finish()
node.transform.resolveBehavior()

node.snap.buildCandidates()
node.snap.compute()
node.snap.computeResize()
node.snap.grid.create()
node.snap.grid.query()

node.hit.matchRect()
node.hit.idsInRect()
node.hit.filterIdsInRect()

node.command.buildCreate()
node.command.buildAlign()
node.command.buildDistribute()

node.layout.align()
node.layout.distribute()

node.projection.applyGeometryPatch()
node.projection.applyTextDraft()
node.projection.applyTextPreview()
node.projection.equalPatch()

node.text.layoutKey()
node.text.contentBox()
node.text.frameMetrics()
node.text.wrapWidth()
node.text.widthMode()
node.text.autoFont()
node.text.box()

node.selection.apply()

node.shape.descriptor()
node.shape.kind()
node.shape.isKind()
```

内部命名空间：

- `update`
- `geometry`
- `outline`
- `draw`
- `frame`
- `move`
- `transform`
- `snap`
- `hit`
- `command`
- `layout`
- `projection`
- `text`
- `selection`
- `shape`

### `@whiteboard/core/edge`

目标：

```ts
edge.guard.isManualRoute()
edge.guard.isNodeEnd()
edge.guard.isPointEnd()

edge.route.points()
edge.route.set()
edge.route.insert()
edge.route.move()
edge.route.remove()
edge.route.clear()

edge.path.get()
edge.anchor.snap()
edge.end.resolve()
edge.view.resolve()
edge.hit.test()
edge.relation.collect()
edge.segment.bounds()
edge.duplicate.duplicate()
edge.command.buildCreate()
edge.edit.moveRoute()
edge.connect.resolve()
edge.patch.apply()
edge.patch.equal()
edge.label.mask()
edge.label.equal()
```

内部命名空间：

- `guard`
- `route`
- `path`
- `anchor`
- `end`
- `view`
- `hit`
- `relation`
- `segment`
- `duplicate`
- `command`
- `edit`
- `connect`
- `patch`
- `label`
- `equal`

### `@whiteboard/core/mindmap`

目标：

```ts
mindmap.tree.fromRecord()
mindmap.tree.fromDocument()
mindmap.tree.byNode()
mindmap.tree.subtreeIds()
mindmap.tree.side()

mindmap.plan.insertByPlacement()
mindmap.plan.rootMove()
mindmap.plan.subtreeMove()

mindmap.layout.compute()
mindmap.layout.classic()
mindmap.layout.tidy()

mindmap.command.buildCreate()
mindmap.template.build()
mindmap.render.connector()
mindmap.drop.resolve()
```

内部命名空间：

- `tree`
- `plan`
- `layout`
- `command`
- `template`
- `render`
- `drop`

### `@whiteboard/core/selection`

目标：

```ts
selection.target.empty
selection.target.apply()
selection.target.normalize()
selection.target.equal()
selection.derive.affordance()
selection.derive.summary()
selection.bounds.get()
selection.resolve.boxTarget()
```

内部命名空间：

- `target`
- `derive`
- `bounds`
- `resolve`

### `@whiteboard/core/schema`

目标：

```ts
schema.node.applyDefaults()
schema.node.missingFields()
schema.node.compileFieldRecord()
schema.node.compileFieldUpdate()
schema.node.compileFieldUpdates()
schema.node.compileDataUpdate()
schema.node.compileStyleUpdate()
schema.node.mergeUpdates()

schema.edge.applyDefaults()
schema.edge.missingFields()
```

内部命名空间：

- `node`
- `edge`

### `@whiteboard/core/spec/*`

这里已经基本正确，继续保持 namespace 化，不再回退为平铺：

- `@whiteboard/core/spec/operation`
  - `meta`
  - `sync`
- `@whiteboard/core/spec/history`
  - `key`
  - `collect`

### `@whiteboard/core` 中不建议强行模块化的例外

这些可以继续保持极小 flat surface：

- `@whiteboard/core/result`
  - `ok`
  - `err`
- `@whiteboard/core/types`
  - type-only barrel

这些是否模块化都可以，但优先级低：

- `@whiteboard/core/id`
- `@whiteboard/core/value`
- `@whiteboard/core/config`
- `@whiteboard/core/lock`

判断标准很简单：

- 运行时导出极少
- 没有明显二级领域
- 继续 flat 不会形成认知成本

## `@whiteboard/product`

### 总原则

- `@whiteboard/product` 作为 curated catalog，适合提供根模块对象。
- 彻底删除 runtime `export *`。
- 外部从 `product` 取 domain 模块，而不是在包根继续拿散常量和散 helper。

目标：

```ts
product.palette.key.create()
product.palette.key.parse()
product.palette.key.resolveValue()
product.palette.registry.byGroup
product.palette.defaults.lineColor
product.palette.ui.fillOptions
product.palette.sticky.option()

product.draw.mode.options
product.stroke.options

product.edge.markers
product.edge.presets
product.edge.ui

product.insert.types
product.insert.catalog.byKey()

product.node.defaults
product.node.templates
product.node.text
product.node.shapes

product.mindmap.ui
product.mindmap.template

product.i18n.keys
product.i18n.tokens
product.i18n.resources
product.i18n.register()
```

内部命名空间：

- `palette`
- `draw`
- `stroke`
- `edge`
- `insert`
- `node`
- `mindmap`
- `i18n`

## `@whiteboard/engine`

包根目标改为单一服务模块：

```ts
engine.create()
engine.document.normalize()
engine.config.default
```

说明：

- `engine` 本身就是 service，不适合继续平铺 `createEngine`、`normalizeDocument`、`DEFAULT_BOARD_CONFIG`。
- 对外只暴露 `engine` 模块对象和类型即可。

## `@whiteboard/history`

包根目标：

```ts
history.binding.create()
history.local.create()
history.local.config.default
```

说明：

- `history` 已经天然是命名空间。
- `createHistoryBinding` 与 `createLocalEngineHistory` 继续平铺没有任何长期收益。

## `@whiteboard/collab`

包根目标：

```ts
collab.yjs.session.create()
collab.yjs.codec.create()
collab.yjs.store.create()
```

说明：

- `collab` 的主边界不是 helper，而是协议/后端类型。
- 长期最优就是把 `yjs` 收成一个清晰的命名空间，而不是三个平铺 `createX`。

## `@whiteboard/editor`

### 外部 public API

`editor` 根入口本来已经比较克制，但仍然建议统一成模块对象：

```ts
editor.create()
editor.clipboard.parse()
editor.clipboard.serialize()
```

类型继续单独导出，不强行塞进 runtime 对象。

### 内部结构

`editor` 内部已经有一条相对清晰的对象化主线：

- `read`
- `write`
- `actions`
- `session`
- `input`

长期最优不是再做一个 helpers 中心，而是把内部命名继续收敛为稳定模块：

- `editor.read.*`
- `editor.write.*`
- `editor.action.*`
- `editor.session.*`
- `editor.input.*`

这里最需要做的是命名统一，不是再新增 helper 层。

## `@whiteboard/react`

### 例外规则

`react` 不能像别的包一样把所有东西都塞进模块对象。

必须继续 flat 的项目：

- `Whiteboard`
- `useEditor`
- `useWhiteboard`
- 其他 hooks

原因：

- hooks 需要保留 `useX` 形态
- 组件本身就是 public root symbol
- 强行改成 `react.use.editor()` 会让 React 语义变差

### 可模块化的部分

这些适合收口：

- `nodeRegistry.create()`
- `nodeRegistry.createDefault()`
- 其他非 hook、非 component 的 runtime helper

结论：

- `react` 只做局部模块化
- 不做“全包对象化”

## 类型导出规则

runtime 模块化不等于 type 也必须对象化。

长期最优：

- runtime 导出尽量收成模块对象
- type 导出继续走专用 `types` barrel 或包根 type export

不要尝试通过 runtime 对象承载 TS type。

## 适合模块化的内容，不只 helpers

除了 `read/get/resolve` 风格 helper，下面这些也应该模块化：

- service/factory
  - `engine`
  - `history`
  - `collab`
  - `editor`
- catalog/preset/options
  - `product.palette`
  - `product.edge`
  - `product.insert`
  - `product.node`
- guard/equal/spec
  - `edge.guard`
  - `geometry.equal`
  - `selection.target.equal`
  - `spec.operation.meta`
- adapter/codec/binding
  - `history.binding`
  - `collab.yjs.codec`
  - `collab.yjs.store`
- runtime facade
  - `editor.read`
  - `editor.write`
  - `engine.read`
  - `engine.write`

## 不适合模块化的内容

这些不需要为了“看起来统一”而硬收进对象：

- React hooks
- React components
- `result.ok/err`
- type-only barrel
- 极小、无二级领域、无增长压力的 leaf 模块

## 实施规则

### 阶段 1：冻结坏方向

- 禁止新的 runtime `export *`
- 禁止新的 `helpers.ts`、`common.ts`、`misc.ts`
- 禁止在 public entrypoint 新增平铺 `createX/getX/resolveY`

### 阶段 2：先收 public 边界

优先级：

1. `@whiteboard/product`
2. `@whiteboard/core/document`
3. `@whiteboard/core/geometry`
4. `@whiteboard/core/node`
5. `@whiteboard/core/edge`
6. `@whiteboard/core/mindmap`
7. `@whiteboard/engine`
8. `@whiteboard/history`
9. `@whiteboard/collab`
10. `@whiteboard/editor`

### 阶段 3：内部导入切换

从内部代码开始迁移为模块用法，例如：

```ts
import { geometry } from '@whiteboard/core/geometry'
import { node } from '@whiteboard/core/node'
import { product } from '@whiteboard/product'
```

不再继续新增这种写法：

```ts
import { getRectCenter, isPointEqual, resolveTextContentBox } from '@whiteboard/core/node'
```

### 阶段 4：删除旧平铺导出

- 删除所有 public flat helper export
- 删除 runtime `export *`
- 删除过时 alias

## 最终约束

长期完成态只保留这些导出习惯：

- 包根导出少量模块对象
- subpath 导出单一主模块对象
- 运行时 helper 只通过模块对象访问
- 类型单独导出
- hooks / components 作为明确例外保留 flat

## 一句话结论

长期最优不是做一个全局 `read/get/resolve` 总线，而是把 Whiteboard 全部 runtime API 收敛成“**按领域分包，按命名空间分层，按模块对象对外**”的结构；真正该削减的是平铺导出面，而不是再造一层 helpers。
