# Whiteboard Frame Node Model Refactor Plan

## 当前实现状态（2026-04-08）

本方案已经按“不要兼容层、不要双轨实现”的要求直接落地，当前仓库状态与本文目标一致：

- `frame` 已回归普通 node，`children / ownerId / tree owner` 整套模型已删除
- `group` 已从 node 角色语义中清出，group command 已迁到独立 `core/group/*`
- frame 空白区域不再命中 frame，自然退化为 background 语义；从空白区域拖动直接进入 marquee
- frame 的 marquee 命中继续按 `contain` 生效，`touch` 不会把 frame 选中
- 选中后的 frame 通过 selection overlay 进入 move / resize，不再走 container-shell 或 owner-tree 分支
- `FrameLayer / ContainerChromeLayer / node/owner.ts / engine tree index` 已删除
- 插入、粘贴、slice remap 已不再暴露或处理 `ownerId`
- UI 术语已从 `container` 收敛回 `frame`

已完成校验：

- `@whiteboard/core` build / lint / test 通过
- `@whiteboard/engine` build / lint 通过
- `@whiteboard/editor` build / lint 通过
- `@whiteboard/react` build / lint 通过

## 背景

当前 whiteboard 里的 `frame` 语义是混乱的，代码里同时存在两套互相冲突的模型：

1. 几何模型
   `frame` 是普通节点，成员关系由几何包含关系动态推导。
   这条线体现在：
   - `whiteboard/packages/whiteboard-core/src/node/frame.ts`
   - `whiteboard/packages/whiteboard-core/src/node/move.ts`
   - `whiteboard/packages/whiteboard-core/src/node/duplicate.ts`

2. 容器树模型
   `frame` 被当成 owner/container，内部节点通过 `children` / `ownerId` / `tree` 形成父子关系。
   这条线体现在：
   - `whiteboard/packages/whiteboard-core/src/node/owner.ts`
   - `whiteboard/packages/whiteboard-engine/src/read/indexes/tree.ts`
   - `whiteboard/packages/whiteboard-core/src/document/slice.ts`
   - `whiteboard/packages/whiteboard-engine/src/write/translate/node.ts`
   - `whiteboard/packages/whiteboard-react/src/runtime/bridge/insert.ts`

这两套模型并存，直接导致了当前 `frame resize` 走错路径：

- selection 层把单选 `frame` 视为 `single-container`
- overlay 层给它渲染的是 `selection-box` 级别的 transform handle
- transform 层又把 `selection-box` resize 当成 multi-scale
- multi-scale target 构造时明确排除了 container-only target
- 结果就是：`frame` 看起来有 resize 入口，但真正拖动时没有合法 transform target

这不是一个局部 bug，而是模型边界已经错了。

## 长期正确模型

### 结论

`frame` 应该被定义为普通 spatial node，而不是 container / owner / parent。

`group` 则不应该再出现在 node 语义层里。

`group` 的正确定位是：

- `Document.groups` 中的显式逻辑集合
- 通过 `node.groupId` / `edge.groupId` 关联成员
- 由独立的 group command / group read / group selection 体系管理

所以从长期模型上看：

- `frame` 是 node
- `group` 不是 node
- `frame` 和 `group` 不能共享任何 “container node” 抽象
- `frame` 与 `group` 也不应该共用 `NodeRole`

它的特殊性只有两点：

1. 它有 frame 自己的视觉和 hit policy
2. 它在移动时会带动当前几何包含的成员节点

除此之外，`frame` 不应该拥有下面这些语义：

- 不应该成为 tree owner
- 不应该通过 `children` 持有成员
- 不应该通过 `ownerId` 绑定子节点
- 不应该参与 parent-child transform root 过滤
- 不应该走 container 专用 selection/overlay/transform 分支

### 正确的成员关系模型

`frame` 与“内部节点”的关系应当是派生关系，而不是持久关系。

推荐定义：

- `frame.members(frameId)` 由几何包含关系动态计算
- move frame 时，按交互开始瞬间的 membership snapshot 一起移动
- duplicate/delete frame 时，按当前 membership 扩展选择集
- resize frame 时，只改变 frame 自己的几何，不对内部节点做 scale
- 节点离开或进入 frame，不需要写回任何 parent/child 结构

这和当前 `node/frame.ts`、`move.ts`、`duplicate.ts` 的主方向是一致的，说明正确答案其实已经在一半代码里了，另一半 container/tree 逻辑是后续混进去的错误层。

### group 与 frame 的根本区别

这是这次清理里必须写死的边界。

#### frame

- 类型上是 node
- 拥有自己的几何、渲染、transform
- 成员由几何包含派生
- move 会带动成员
- resize 只改变自己

#### group

- 类型上不是 node
- 没有自己的 node geometry / node transform / node hit target
- 是对 node/edge 的显式逻辑归组
- 成员由 `groupId` 显式声明
- group 的行为应通过 `editor.commands.group` 和 `editor.read.group` 实现

因此，下面这些做法都属于错误：

- 把 `group` 塞进 `NodeRole`
- 在 selection affordance 中把 `group` 当成 `single-container node`
- 让 transform / move / owner / tree 共用 frame 和 group 的逻辑分支
- 把 group helper 挂在 `core/node/*` 之下继续扩大语义污染

## 目标状态

### 数据模型

`Node` 是扁平集合。

- 文档里不存在 frame-specific parent-child 关系
- `Node.children` 不再承担 frame 成员关系
- `SpatialNodeInput.ownerId` 不再用于把节点“插入到 frame 里”
- `Document.insert(..., ownerId)` 不再承担 frame 嵌套写入

如果未来确实需要真正的树结构，应当只为真正的树状对象单独建模，例如 mindmap，不能再借用通用 node 的 `children` 字段。

与此同时：

- `Group` 应继续作为 `Document.groups` 中的独立实体存在
- `node.groupId` / `edge.groupId` 继续保留
- 但 group 的存在不应反向影响 node role / node hierarchy / node transform pipeline

### 交互模型

单选 frame 时：

- frame 一旦已经处于单选状态，transform 应该走单节点语义，而不是 `selection-box` multi-scale
- resize handle 应该是 node-level handle，不是 container/selection-box handle
- 但 frame 的空白区域本身不承担选中入口；空白区域 pointer down 语义应退化为 background
- 也就是说，frame 单选的主要进入方式应当是 contain marquee 命中，而不是点击 frame 空白区域

多选时：

- frame 和普通 node 一样参与 selection
- 如果多选中包含 frame，缩放行为只对被选中的节点本身生效
- 不要再通过 owner/tree 过滤 transform roots
- marquee 对 frame 必须使用 `contain`，不能使用 `touch`

group 则应完全走另一条交互链：

- group 是否“被选中”，由当前 selection 是否完整覆盖该 group 的成员来推导
- group 没有自己的 node body / shell / transform handle
- group 的排序、解组、工具条状态由 `group` read/command 体系处理

### 渲染模型

frame 依然可以保留特殊视觉层，但不能再以 “container” 概念存在。

长期最优不是继续保留 `ContainerChromeLayer` 这类命名和分层，而是：

- `frame` 仍然是 node
- 它的 scene/chrome 由 node 体系承载
- frame 专属 UI 只是 node renderer 的一种实现

如果现有 node renderer API 还不够表达 frame 标题或编辑入口，可以扩展 node render contract；不要继续让 `frame` 走独立 container 分支。

## 保留什么

下面这些是符合长期方向的，应当保留并围绕它们重构：

### 1. 几何成员判定

- `whiteboard/packages/whiteboard-core/src/node/frame.ts`

这是 `frame` 正确的核心语义来源。建议保留并继续作为：

- `frame.at(point)`
- `frame.of(nodeId)`
- `frame.members(frameId)`
- `expandFrameSelection(...)`

的底层实现。

### 2. frame move/duplicate 的几何扩展思路

- `whiteboard/packages/whiteboard-core/src/node/move.ts`
- `whiteboard/packages/whiteboard-core/src/node/duplicate.ts`

这两处已经是“frame 带动内部节点，但不靠 parent/child 持久化”的方向，应该保留，但需要去掉其中对 owner/tree 的间接依赖。

### 3. frame hover 作为拖拽反馈

- `whiteboard/packages/whiteboard-editor/src/interactions/selection/move.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts`

`frameHoverId` 作为拖拽时的视觉提示是合理的，可以保留，但它应该只依赖 `frame.at / frame.of / frame.members` 这种几何 API，而不是 owner/tree。

### 4. group 作为显式逻辑集合的整条链

下面这些属于正确方向，应保留：

- `Document.groups`
- `node.groupId` / `edge.groupId`
- `whiteboard/packages/whiteboard-engine/src/write/translate/group.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/group.ts`
- `whiteboard/packages/whiteboard-engine/src/read/store/index.ts` 中的 `read.group.*`
- `whiteboard/packages/whiteboard-react/src/runtime/selection.ts`

它们体现的是“group 是逻辑集合”而不是“group 是 node”的模型。

长期需要做的是把这些 group 代码从 `node/*` 污染里解耦出来，而不是删除 group 功能本身。

## 必须删除的错误模型

### 1. frame 作为 owner/container 的模型

以下内容属于错误建模，应当整体删除：

- `whiteboard/packages/whiteboard-core/src/node/owner.ts`
- `buildOwnerOps`
- `buildDeleteOwnerOps`
- `patchChildren`
- `filterRootIds`
- `findOwnerAncestor`
- `createOwnerDepthResolver`

原因：

- 它们把 frame 关系持久化成 parent-child
- 它们驱动了 transform root 过滤、delete detach、insert nesting、slice remap
- 它们与“frame 是普通 node”这一前提根本冲突

如果未来还有真正 owner/tree 需求，应为那个需求单独引入专用结构，而不是复用通用 node。

### 2. 通用 Node 上的 frame 嵌套字段

以下字段/输入应当从通用 node 模型中移除：

- `whiteboard/packages/whiteboard-core/src/types/core.ts`
  - `BaseNode.children`
  - `SpatialNodeInput.ownerId`
  - `NodeFieldPatch.children`
- `whiteboard/packages/whiteboard-core/src/types/document.ts`
  - `SliceInsertOptions.ownerId`

原因：

- 这些字段目前主要就是在给 frame 假装树结构
- 它们污染了所有 node 的通用类型
- 它们迫使 update/normalize/finalize/read/index 都把 frame 当层级对象处理

### 3. engine 里的 tree 索引

以下内容应删除：

- `whiteboard/packages/whiteboard-engine/src/read/indexes/tree.ts`
- `EngineRead.tree`
- `EngineRead.node.owner`
- `NodeRectIndex` 对 `tree.ancestors / childrenOf` 的依赖

原因：

- 该 tree 不是 mindmap 的 tree，而是 generic node 的伪容器树
- whiteboard 普通 node 层没有真实 parent-child 语义
- 继续保留它只会不断诱导后续功能误用

### 4. frame 的 container 选择语义

以下“container”分支应删除：

- `whiteboard/packages/whiteboard-core/src/selection/affordance.ts`
  - `single-container`
  - `passThroughContent`
  - frame/group 走 container affordance
- `whiteboard/packages/whiteboard-core/src/selection/press.ts`
  - `container-shell`
  - `targetInput.shell === 'frame'`
- `whiteboard/packages/whiteboard-react/src/features/node/selection.ts`
  - 基于 `single-container` 的 presentation 推导
- `whiteboard/packages/whiteboard-editor/src/interactions/transform.ts`
  - frame 单选通过 `selection-box` 走 multi-scale 的路径

原因：

- 这里把 frame 从 node pipeline 里拆了出去
- resize bug 就是这条分支直接造成的
- 继续修补这条分支只会让模型越来越乱

### 5. group 作为 node/container 的伪抽象

以下内容属于错误桥接，应删除或迁出 node 域：

- `whiteboard/packages/whiteboard-core/src/node/capability.ts`
  - `NodeRole = 'content' | 'frame' | 'group'` 中的 `'group'`
- `whiteboard/packages/whiteboard-core/src/selection/affordance.ts`
  - `role === 'group' || role === 'frame'` 这种并列逻辑
- `whiteboard/packages/whiteboard-core/src/node/group.ts`
  - `isContainerNode`
  - `isOwnerNode`
  - `sanitizeGroupNode`
  - `sanitizeGroupPatch`
  - `getGroupChildrenMap`
  - `findGroupAncestor`
  - `expandGroupMembers`
- `whiteboard/packages/whiteboard-engine/src/document/normalize/sanitize.ts`
  - 基于 `sanitizeGroupNode / sanitizeGroupUpdate` 的 node 级 sanitize 桥接

原因：

- `group` 已经不是 node
- 这些 helper 不是在实现 group 本身，而是在把 group 错误地嵌回 node 系统
- 其中不少函数已经是空实现或语义错位，继续保留只会制造错误入口

需要注意：

- `getGroupDescendants()` 这个名字本身也有误导性，因为 group 不是树
- 如果保留类似能力，应改成显式集合语义命名，例如 `listGroupNodeMembers()`

### 6. UI 和术语层面的 container 残留

以下内容不应再把 frame 叫作 container：

- `whiteboard/packages/whiteboard-editor/src/types/node/registry.ts`
  - `NodeFamily = 'text' | 'shape' | 'container' | 'draw'`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/frame.tsx`
  - `family: 'container'`
- `whiteboard/packages/whiteboard-react/src/features/toolbox/presets.ts`
  - `description: 'Manual container area'`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/SelectionActionMenu.tsx`
  - `Create container`

这些不是核心 bug 来源，但会持续误导后续设计判断。

长期应改为更准确的术语，例如：

- `frame`
- `area`
- `region`
- `scope`

而不是 `container`

## 需要重构而不是直接删除的部分

### 1. frame render/chrome/hit 区

当前文件：

- `whiteboard/packages/whiteboard-react/src/features/node/components/FrameLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/frame.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeSceneLayer.tsx`

当前问题：

- frame 没走普通 `NodeItem`
- frame chrome 和空白区域 hit policy 是单独图层
- 命名上也在持续强化 “container” 这个错误概念

长期最优：

- frame 仍是 node renderer
- frame 的标题、边框和必要的编辑入口应并入 node render contract
- `FrameLayer` / `ContainerChromeLayer` 最终应消失

短期过渡允许：

- 先保留 frame 专属层以减少改动面
- 但空白区域命中必须退化为 background 语义，transform 只在 frame 已被选中后按单节点语义工作
- 然后再把视觉层并回 node 渲染体系

### 1b. group command/read 从 node 域拆出

当前文件：

- `whiteboard/packages/whiteboard-core/src/node/commands.ts`
- `whiteboard/packages/whiteboard-core/src/node/index.ts`
- `whiteboard/packages/whiteboard-core/src/node/group.ts`

当前问题：

- group merge / ungroup 明明是 group 逻辑，却仍放在 `node/*`
- 导出面把 frame、owner、group、transform、selection 全混在 node 域
- 这也是后续出现 “group 是 node role” 幻觉的原因之一

长期最优：

- 将 group 相关算法迁到独立域，例如 `core/group/*`
- `buildGroupMergeOperations` / `buildGroupUngroupOperations` 从 `node/commands.ts` 移出
- `node/index.ts` 不再导出 group 逻辑

这一步不是为了重命名而重命名，而是为了阻断错误语义继续扩散。

### 2. transform target 构造

当前文件：

- `whiteboard/packages/whiteboard-core/src/node/transform.ts`

当前问题：

- `resolveSelectionTransformTargets()` 仍以 owner/tree 思路做 root 过滤
- 它还会排除 container-only commit target

长期正确做法：

- transform target 只基于选中节点本身
- 对单选 frame，直接走 `single-resize`
- 对多选，直接对选中的 node 集合做 scale，不再讨论 container commitIds

如果还需要“frame move 带动成员”这种扩展，应该只存在于 move pipeline，不应该污染 transform target 构造。

### 3. 插入/粘贴 API

当前文件：

- `whiteboard/packages/whiteboard-react/src/runtime/bridge/insert.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/clipboard.ts`
- `whiteboard/packages/whiteboard-core/src/document/slice.ts`

当前问题：

- API 仍然暴露 `ownerId`
- insert/paste 会尝试把根节点追加到 frame.children
- slice remap 会按 owner depth 排序

长期正确做法：

- 删除 `ownerId`
- 插入到 frame 内部只意味着计算一个落点位置
- paste 到 frame 也只意味着 origin 选在 frame 内，不写 membership 关系
- slice remap 按普通节点扁平复制，不需要 owner depth 排序

### 4. group 成员查询与选择推导

当前文件：

- `whiteboard/packages/whiteboard-engine/src/read/store/index.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/selection.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/group.ts`

当前状态：

- 这部分整体模型是对的
- 问题不在“要不要保留 group”，而在“不要再让 group 反向污染 node 语义”

长期正确做法：

- 保留 group read / command / selection 这条链
- 将名字和模块位置收敛到独立 group 域
- 明确 group 只处理显式成员集合，不介入 frame membership / node role / node transform

## 建议的最终语义

### frame move

- frame 空白区域 pointer down 不直接进入 frame move，而是等同 background，开始拖动即进入 marquee
- frame 已经被选中后，再通过 selection move/transform 入口拖动时，移动 frame 本身
- 同时移动交互开始时几何上属于该 frame 的节点
- 这是 runtime move snapshot，不写文档 parent-child

### frame resize

- 只修改 frame 的 `position/size`
- 不缩放、不重排、不平移 frame 内部节点
- resize 后成员关系按新几何重新计算

### frame selection

- 点击 frame 空白区域，不选中 frame，语义等同 background
- 从 frame 空白区域开始拖动，语义等同 background marquee
- marquee 命中 frame 时必须满足 `contain` 才能选中 frame，`touch` 不足以选中 frame
- 点击 frame 内部实际 node，仍然优先命中内部 node
- 这属于 hit policy，不属于容器树

### frame duplicate / delete

- duplicate frame 时，默认连同当前成员一起复制
- delete frame 时，默认连同当前成员一起删除
- 这两个动作都基于几何扩展选择，不写 parent-child

## 推荐实施顺序

### 第一阶段：修语义，不动大渲染

目标：先把错误模型从交互路径上拔掉，让 frame resize 恢复正确。

1. 让 frame 空白区域 pointer down 退化为 background 语义，拖动直接进入 marquee
2. 明确 marquee 对 frame 一律按 `contain` 判定
3. 删除 `single-container` / `container-shell` 这条 selection 分支
4. 让 frame 在“已单选”状态下的 transform 回到单节点语义
5. 去掉 transform target 对 container-only target 的排斥
6. 保证 frame resize 只影响 frame 自身

这一阶段完成后，resize bug 应该先消失。

### 第二阶段：删 owner/tree 持久化模型

目标：从数据和 engine 层清理错误抽象。

1. 移除 `children` / `ownerId`
2. 删除 `owner.ts`
3. 删除 `TreeIndex`
4. 删除 insert/paste/slice 中 owner 相关逻辑
5. 精简 normalize/finalize/update 中 relation diff 的 children 处理

这一阶段完成后，frame 的数据模型会回到扁平 node。

### 第三阶段：把 group 从 node 域彻底拆出

目标：明确 group 是显式逻辑集合，不是 node 派生概念。

1. 删除 `NodeRole` 中的 `'group'`
2. 删除 `selection.affordance` 里所有 frame/group 并列分支
3. 删除或迁出 `node/group.ts`
4. 将 group merge / ungroup 算法迁到独立 group 模块
5. 删除 node sanitize 中的 group 桥接逻辑

这一阶段完成后，frame 与 group 的边界会稳定下来。

### 第四阶段：回收 frame 独立 container UI

目标：统一渲染架构，让 frame 真正成为 node。

1. 让 frame 回归普通 node scene/chrome 管线
2. 将 frame 标题和必要编辑入口纳入 node render contract
3. 删除 `FrameLayer` / `ContainerChromeLayer`
4. 移除代码里的 container 命名

这一阶段完成后，架构会更干净，后续功能不会继续沿错误语义生长。

## 文件级清单

### 优先修改

- `whiteboard/packages/whiteboard-core/src/selection/affordance.ts`
- `whiteboard/packages/whiteboard-core/src/selection/press.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/selection.ts`
- `whiteboard/packages/whiteboard-core/src/node/transform.ts`
- `whiteboard/packages/whiteboard-core/src/node/capability.ts`

### 第二批重构

- `whiteboard/packages/whiteboard-core/src/types/core.ts`
- `whiteboard/packages/whiteboard-core/src/types/document.ts`
- `whiteboard/packages/whiteboard-core/src/node/update.ts`
- `whiteboard/packages/whiteboard-engine/src/write/normalize/finalize.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/bridge/insert.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/clipboard.ts`
- `whiteboard/packages/whiteboard-core/src/document/slice.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/node.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/index.ts`
- `whiteboard/packages/whiteboard-engine/src/read/indexes/nodeRect.ts`
- `whiteboard/packages/whiteboard-engine/src/types/instance.ts`
- `whiteboard/packages/whiteboard-engine/src/document/normalize/sanitize.ts`
- `whiteboard/packages/whiteboard-core/src/node/group.ts`
- `whiteboard/packages/whiteboard-core/src/node/commands.ts`
- `whiteboard/packages/whiteboard-core/src/node/index.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/group.ts`

### 预期删除

- `whiteboard/packages/whiteboard-core/src/node/owner.ts`
- `whiteboard/packages/whiteboard-engine/src/read/indexes/tree.ts`
- `whiteboard/packages/whiteboard-core/src/node/group.ts`

### 最终回收

- `whiteboard/packages/whiteboard-react/src/features/node/components/FrameLayer.tsx`

说明：
如果第三阶段引入了新的 node chrome/render contract，那么 `frame.tsx` 会保留，但 `FrameLayer.tsx` 这种 frame 专用分层应最终消失。

## 风险与注意事项

### 1. 不能把 group 和 frame 混为一谈

当前很多分支是 `role === 'group' || role === 'frame'` 一起处理。
这在长期上也是错误的。

- `group` 是显式逻辑集合
- `frame` 是几何派生集合

两者不应该复用同一套 container affordance。

更进一步说：

- `group` 不应存在于 node role 体系里
- `group` 不应出现在 node transform / node owner / node tree 相关代码里
- `group` 的正确承载面是 `document.groups`、`groupId`、group command、group read

### 2. 不要把“可点边框”误建模成 container

frame 的空白区域不应成为独立可选中的 shell。
如果保留少量编辑入口，也必须是局部的 UI hit policy，而不是 ownership model。

### 3. resize 逻辑不要继承 move 逻辑

frame move 带动成员是合理的。
frame resize 缩放成员则不是当前模型的一部分。

move 和 resize 必须在语义上分离。

## 最终判断

长期最优方案不是补丁式修复 `frame container` 逻辑，而是明确承认：

- `frame` 不是 container
- `frame` 不是 parent
- `frame` 不是 tree owner
- `frame` 是普通 node
- `frame` 的成员关系是几何派生关系

围绕这个前提，正确方向是：

- 保留几何 membership 相关代码
- 删除 owner/tree/container 相关代码
- 删除 “group 作为 node/container 抽象” 的整层桥接代码
- 保留 group 作为显式逻辑集合的独立能力
- 让 frame 的空白区域回归 background 级别的 selection 语义
- 让 frame 在已选中后的 transform/render 回归 node 体系

这才是能把 resize、插入、复制、删除、拖拽这些行为一次性理顺的长期解。

## 附：container 代码整体删除口径

为了避免执行时误删，这里明确区分两类 “container”：

### 应删除的 container 语义代码

指 frame/group 被建模成 container node 的代码，包括：

- owner/tree/children/ownerId
- `single-container`
- `container-shell`
- `isContainerNode`
- `NodeRole['group']`
- frame 专用 `ContainerChromeLayer`
- UI 文案里的 “manual container area / create container”

### 不应删除的普通 DOM container 命名

下面这些 `container` 只是普通 DOM 容器，不属于错误模型，不应因为名字里有 `container` 就误删：

- `containerRef`
- `wb-container`
- `wb-root-container`
- pointer/keyboard/contextmenu 等 DOM binding 里的 `container` 变量

是否保留这些名字，属于后续代码整洁问题，不属于本次模型清理范围。
