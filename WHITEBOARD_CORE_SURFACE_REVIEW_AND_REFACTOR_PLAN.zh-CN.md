# Whiteboard Core 对外表面与职责拆分审查

## 目标

这份文档只讨论一件事：

- 在不保留兼容层
- 不在乎迁移成本
- 只在乎降低复杂度与职责分离

的前提下，如何把 `whiteboard-core` 的类型、运行时 helper、public entrypoint 一次性收干净。

本文不是温和优化建议，而是一步到位的终态方案。

## 总结结论

`whiteboard-core` 当前最严重的问题不是“某几个 helper 太多”，而是：

1. `types` 模块混入了大量运行时代码
2. `index.ts`/barrel 过度导出，导致内部实现细节被放大成 public API
3. `utils` 成了跨领域杂物间，很多 helper 不是没用，而是不该公开
4. document / edge / result / schema / mindmap 的职责边界被 `types/core.ts` 和 wildcard export 打穿了

如果只允许给一个总原则，那么应该是：

- `@whiteboard/core/types` 变成纯类型入口
- 运行时代码只能从领域入口导出
- `utils` 不再作为 catch-all public API 存在
- 低层 helper 默认 internal，只有跨领域且稳定的最小集合才允许公开

## 主要问题

## 1. `types/core.ts` 严重越权

文件：

- `whiteboard/packages/whiteboard-core/src/types/core.ts`

现状：

- 文件长达 636 行
- 同时承载基础类型、document 模型、operation、registry、result、runtime guard、document 查询函数、document assert

它不是一个“类型文件”，而是一个混合式基础设施文件。

这会直接导致两个问题：

- `@whiteboard/core/types` 这个入口不再是 type-only 语义
- 上层调用方会自然把类型入口当成 runtime 工具箱使用

这就是最核心的职责污染。

### 当前混在 `types/core.ts` 里的运行时代码

包括但不限于：

- `NODE_TYPES`
- `isNodeEdgeEnd`
- `isPointEdgeEnd`
- `isManualEdgeRoute`
- `listCanvasItemRefs`
- `createDocument`
- `getNode`
- `getEdge`
- `getGroup`
- `hasNode`
- `hasEdge`
- `hasGroup`
- `listNodes`
- `listEdges`
- `listGroups`
- `listGroupCanvasItemRefs`
- `listGroupNodeIds`
- `listGroupEdgeIds`
- `assertDocument`
- `ok`
- `err`

这些都不应该继续留在 `types/core.ts`。

## 2. `@whiteboard/core/types` 被当成运行时入口使用

现状上，很多 runtime 模块直接从 `@whiteboard/core/types` 拿函数，而不仅是拿类型。

例如当前代码里已经存在这类依赖：

- `@whiteboard/core/types` 中的 `isPointEdgeEnd`
- `@whiteboard/core/types` 中的 `getNode`
- `@whiteboard/core/types` 中的 `listCanvasItemRefs`
- `@whiteboard/core/types` 中的 `assertDocument`

这会让“类型层”反过来承载 document、edge、result 等运行时职责。

这条边界如果不切开，后面做任何模块精简都会继续反弹。

## 3. public entrypoint 过度导出

文件：

- `whiteboard/packages/whiteboard-core/src/edge/index.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/index.ts`
- `whiteboard/packages/whiteboard-core/src/document/index.ts`
- `whiteboard/packages/whiteboard-core/src/utils/index.ts`
- `whiteboard/packages/whiteboard-core/src/types/index.ts`
- `whiteboard/packages/whiteboard-core/src/node/index.ts`

问题不是用了 barrel，而是：

- 大量 `export *`
- 将内部拼装 helper、局部 query、只服务某个模块的函数都提升成了 package public surface

结果是：

- public API 远大于实际需要
- 调用方容易依赖偶然暴露的内部函数
- 后续重构时几乎所有小函数都像“公共协议”

这会直接放大维护成本。

## 4. `utils` 成了杂物间

文件：

- `whiteboard/packages/whiteboard-core/src/utils/index.ts`
- `whiteboard/packages/whiteboard-core/src/utils/*.ts`

当前 `utils` 里混了几类完全不同的职责：

- equality
- deep clone / merge
- object path
- path mutation
- order 操作
- id 生成

这些 helper 里，有些适合公开，有些只适合在单一领域内部使用。

### 已确认不该继续公开的低层 helper

根据当前仓内引用情况，以下函数不适合继续作为 public API 暴露：

- `applySetPathMutation`
- `applyUnsetPathMutation`
- `applySplicePathMutation`
- `isRecordLike`
- `isObjectContainer`
- `setValueByPath`
- `hasValueByPath`
- `getValueByPath`

原因不是它们没用，而是它们属于：

- `node.update`
- `schema`
- `mindmap mutation`

这类具体语义模块的底层实现细节。

它们作为公共 helper 暴露，会诱导其他模块直接依赖路径级别原语，继续放大耦合。

## 5. 有明确可删除的孤儿导出

以下导出当前没有形成合理的公共语义，应该直接删：

- `sanitizeOrderIds`
  - 当前基本没有实际使用价值，且只是 `Array.from(new Set(ids))`
- `isSameNumberish`
  - 当前没有形成稳定通用语义，也没有实质调用价值

以下导出虽然有使用，但没有独立存在必要：

- `getGroup`
- `hasGroup`

它们可以被内联到具体调用点，或者在 document/group query 模块中按需提供，不需要继续作为顶层公共函数。

## 6. `mindmap/helpers.ts` 与 `mindmap/query.ts` 边界多余

文件：

- `whiteboard/packages/whiteboard-core/src/mindmap/helpers.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/query.ts`

当前：

- `getMindmapTreeFromNode`
- `getMindmapTreeFromDocument`

本质上都是 query。

但现在它们被单独放进 `helpers.ts`，然后 `query.ts` 又转一层：

- `getMindmapTree = getMindmapTreeFromNode`

这属于纯粹的层级噪音。

最简单的终态是：

- 删除 `helpers.ts`
- 统一并入 `query.ts`
- 只保留一套命名

## 7. `edge/types.ts` 里混入了运行时函数

文件：

- `whiteboard/packages/whiteboard-core/src/edge/types.ts`

当前它除了导出 type alias，还导出：

- `readEdgeRoutePoints`

这又重复了 `types` 层和 runtime 层混合的问题。

最简单的处理是：

- `edge/types.ts` 只保留类型导出职责
- `readEdgeRoutePoints` 搬到 `edge/route.ts` 或 `edge/path.ts`

## 8. `document` 模型与 `types` 耦合过深

当前 `createDocument`、`listNodes`、`listEdges`、`listCanvasItemRefs`、`assertDocument` 都在 `types/core.ts`。

它们其实属于两个明确领域：

- document model/query
- document validation

而不是“核心类型定义”。

这会让 document 语义被错误地绑定到类型入口。

## 9. 测试覆盖不足，无法兜住表面收敛后的回归

`whiteboard-core` 有测试，但更多覆盖 node update / mindmap command 等具体能力。

真正高风险的表面收敛项，包括：

- public entrypoint 删除
- `types` 去 runtime 化
- helper internal 化

目前没有专门的 surface regression 检查。

这意味着一旦开始激进删除导出，应该同步加一轮“public surface snapshot / import contract”测试或审计脚本，否则后续很难判断是否真正完成收口。

## 实际使用信号

结合仓内引用情况，可以得到几个明显信号：

### 1. `types/core.ts` 里有大量运行时导出使用度极低

例如：

- `getGroup`
- `hasGroup`
- `listGroups`
- `listGroupCanvasItemRefs`
- `listGroupNodeIds`
- `listGroupEdgeIds`

这些并不应该继续占据顶层 core 类型入口。

### 2. `ok` / `err` 使用很多，但位置完全错误

它们不是该删除，而是必须搬家。

正确位置应该是：

- `result`
- 或 `kernel/result`

绝不应该继续待在 `types/core.ts`。

### 3. `cloneValue` 确实被广泛使用

这类函数说明不是“删所有 helper”，而是要把 helper 分层：

- 少量跨领域稳定原语保留
- 领域内部细节全部 internal 化

## 终态方案

## A. `@whiteboard/core/types` 只保留类型

这是第一原则。

终态要求：

- `src/types/index.ts` 只能 `export type`
- `src/types/*.ts` 只能定义 type / interface
- 不允许再导出 `const`、`function`、`class`

### 这意味着必须搬走的内容

从 `types/core.ts` 搬走：

- `NODE_TYPES`
- `isNodeEdgeEnd`
- `isPointEdgeEnd`
- `isManualEdgeRoute`
- `createDocument`
- `getNode`
- `getEdge`
- `getGroup`
- `hasNode`
- `hasEdge`
- `hasGroup`
- `listCanvasItemRefs`
- `listNodes`
- `listEdges`
- `listGroups`
- `listGroupCanvasItemRefs`
- `listGroupNodeIds`
- `listGroupEdgeIds`
- `assertDocument`
- `ok`
- `err`

## B. 拆掉 `types/core.ts` 巨石文件

最简单的终态不是“继续维护一个更干净的 core.ts”，而是直接拆开。

建议拆成：

- `types/primitives.ts`
  - `DocumentId`
  - `NodeId`
  - `EdgeId`
  - `GroupId`
  - `Point`
  - `Size`
  - `Rect`
  - `Viewport`
- `types/node.ts`
  - `Node`
  - `SpatialNode`
  - `NodeStyle`
  - `NodeSchema`
  - `NodeUpdateInput`
  - 相关 node type
- `types/edge.ts`
  - `Edge`
  - `EdgeEnd`
  - `EdgeRoute`
  - `EdgePatch`
  - 相关 edge type
- `types/documentModel.ts`
  - `Document`
  - `CanvasItemRef`
  - `Group`
  - `DocumentPatch`
  - `Operation`
  - `ChangeSet`
- `types/registry.ts`
  - `Registry`
  - `NodeTypeDefinition`
  - `EdgeTypeDefinition`
  - `SchemaRegistry`
  - `CoreRegistries`
  - `Serializer`
- `types/result.ts`
  - `Origin`
  - `ResultCode`
  - `ErrorInfo`
  - `Result`

`types/core.ts` 最终应删除，不保留兼容壳。

## C. 新建运行时领域模块，接管从 `types` 搬出的函数

### 1. Document Runtime

新增建议：

- `document/model.ts`
- `document/query.ts`
- `document/assert.ts`

承接函数：

- `createDocument`
- `getNode`
- `getEdge`
- `getGroup`
- `hasNode`
- `hasEdge`
- `hasGroup`
- `listCanvasItemRefs`
- `listNodes`
- `listEdges`
- `listGroups`
- `listGroupCanvasItemRefs`
- `listGroupNodeIds`
- `listGroupEdgeIds`
- `assertDocument`

其中可以继续进一步收敛为：

- `document/model.ts`
  - `createDocument`
- `document/query.ts`
  - `getNode`
  - `getEdge`
  - `listCanvasItemRefs`
  - `listNodes`
  - `listEdges`
- `document/group.ts`
  - `listGroups`
  - `listGroupCanvasItemRefs`
  - `listGroupNodeIds`
  - `listGroupEdgeIds`
- `document/assert.ts`
  - `assertDocument`

### 2. Edge Runtime

新增建议：

- `edge/guards.ts`
- `edge/route.ts`

承接函数：

- `isNodeEdgeEnd`
- `isPointEdgeEnd`
- `isManualEdgeRoute`
- `readEdgeRoutePoints`

### 3. Result Runtime

新增建议：

- `result/index.ts`

承接函数：

- `ok`
- `err`

这样可以把结果构造从类型层彻底移走。

## D. 删除 `utils` 作为 catch-all public API

最优终态不是“整理 utils”，而是：

- `@whiteboard/core/utils` 不再作为公共入口存在

理由：

- 只要保留这个入口，上层就会继续把各种低层 helper 当作默认依赖面
- 这会持续破坏职责边界

### 替代方式

把现在的 `utils` 分成两类：

#### 1. 继续存在，但只作为 internal module

- `objectPath.ts`
- `recordMutation.ts`
- `order.ts`

这些文件可以继续存在，但不再从 package public entry 导出。

#### 2. 迁入明确领域

- equality 迁入 `equality/` 或按领域就地内聚
- `objectPath` 迁入 `schema` / `node.update`
- `recordMutation` 迁入 `node.update` / `mindmap.commands`
- `order` 迁入 `group` / `order` 相关命令域

#### 3. 保留极少数真正跨领域稳定原语

只有这类函数值得继续公开：

- `createId`
- `cloneValue`
- `mergeValue`

即使这些保留，也不建议继续通过 `utils` 聚合入口暴露，而是拆成明确小入口，例如：

- `@whiteboard/core/id`
- `@whiteboard/core/clone`
- `@whiteboard/core/result`
- `@whiteboard/core/equality`

如果不想增加 entrypoint 数量，那么更简单的做法是：

- 不公开这些 helper
- monorepo 内部全部转为领域模块直接引用

在“不在乎迁移成本”的前提下，这是更干净的方向。

## E. 收紧 barrel，禁止 `export *`

以下入口都应改为显式导出：

- `edge/index.ts`
- `mindmap/index.ts`
- `document/index.ts`
- `node/index.ts`
- `types/index.ts`
- `utils/index.ts`

原则：

- public entry 只能显式列出稳定导出
- 不允许 `export *`
- 不允许把内部 helper 因为顺手而暴露

## F. 合并明显多余的中间层

### 1. `mindmap/helpers.ts` 删除

动作：

- 合并到 `mindmap/query.ts`
- 保留单一命名：
  - `getMindmapTree(node)`
  - `getMindmapTreeFromDocument(document, id)`

不再保留：

- `helpers.ts`
- query 中的转发别名

### 2. `edge/types.ts` 只保留类型

动作：

- `readEdgeRoutePoints` 搬出
- `edge/types.ts` 变成纯 type re-export

## G. 明确直接删除的对象

以下内容建议直接删，不保留兼容：

- `types/core.ts`
- `mindmap/helpers.ts`
- `utils/index.ts`
  - 如果决定彻底取消 `@whiteboard/core/utils` 入口
- `sanitizeOrderIds`
- `isSameNumberish`

以下内容建议删掉 public export，即使实现文件可保留：

- `applySetPathMutation`
- `applyUnsetPathMutation`
- `applySplicePathMutation`
- `isRecordLike`
- `isObjectContainer`
- `getValueByPath`
- `hasValueByPath`
- `setValueByPath`
- `bringOrderToFront`
- `sendOrderToBack`
- `bringOrderForward`
- `sendOrderBackward`
- 大部分 equality helper

说明：

这不是说实现一定要删，而是说它们不应该继续是 package 公开能力。

## H. `whiteboard-core` 的推荐公共入口终态

终态建议只保留这些高层入口：

- `@whiteboard/core/types`
  - 纯类型
- `@whiteboard/core/geometry`
- `@whiteboard/core/node`
- `@whiteboard/core/edge`
- `@whiteboard/core/group`
- `@whiteboard/core/mindmap`
- `@whiteboard/core/document`
- `@whiteboard/core/selection`
- `@whiteboard/core/schema`
- `@whiteboard/core/kernel`
- `@whiteboard/core/config`
- `@whiteboard/core/result`

明确移除：

- `@whiteboard/core/utils`

如果觉得 `result` 单独一个入口过细，也可以折叠到 `kernel`，但不能继续挂在 `types` 上。

## 建议执行顺序

如果后续要真正落地，最稳的顺序是：

1. 先把 `types/core.ts` 中的 runtime 函数全部迁出
2. 拆分 `types/core.ts`，最终删除文件
3. 取消 `types/index.ts` 中的一切 runtime 导出
4. 收紧 `edge/index.ts`、`mindmap/index.ts`、`document/index.ts`、`node/index.ts`
5. 删除 `mindmap/helpers.ts`
6. 收掉 `utils` 入口，只保留内部实现或明确新入口
7. 最后统一改全仓 import 路径

## 最终判断

如果只做局部删函数，`whiteboard-core` 的复杂度不会真正下降。

真正该做的是：

- 切断 `types` 与 runtime 的混合
- 把 document / edge / result / mindmap query 还给各自领域
- 停止 wildcard export
- 停止把 low-level helper 暴露成 package API

最优解不是“把 helper 数量从 100 变成 70”，而是：

- 让 package public surface 只剩真正稳定的领域能力
- 让类型层重新变回类型层
- 让 helper 回到内部实现或明确归属的领域模块

这是在“不保留兼容过渡、不在乎迁移成本”的前提下，最简单、最可维护、也最符合职责分离的终态。
