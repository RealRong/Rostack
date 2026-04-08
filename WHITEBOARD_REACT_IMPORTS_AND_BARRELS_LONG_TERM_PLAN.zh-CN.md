# Whiteboard React Imports And Barrels Long-Term Plan

## 背景

当前 `whiteboard/packages/whiteboard-react/src` 内部的 import 组织已经出现一个很明显的问题：

- 文件移动成本高
- 相对路径层级深
- 模块边界不清晰
- 依赖关系容易穿透到叶子文件

以 `NodeToolbar.tsx` 为例，当前会直接写出类似：

- `../../node/selection`
- `../../../runtime/hooks/useEditor`
- `../../../runtime/hooks/useWhiteboard`
- `../../../dom/observe/useElementSize`
- `../../../runtime/overlay/chrome`

这说明两个问题已经同时存在：

### 1. import 路径表达能力不够

当前大量依赖仍然通过多层相对路径表达，这会导致：

- 文件一旦移动，import 大面积改写
- 读代码时很难一眼看出依赖属于哪个边界
- 代码 review 时不容易判断是否跨 feature 直接穿透

### 2. 模块导出边界不明确

现在大量导入直接落到叶子文件，说明：

- feature / runtime / dom 这些目录没有明确的导出边界
- “哪些模块允许被其他模块依赖”没有显式表达
- `index.ts` 的使用不足，或使用位置不成体系

因此需要一次性明确：

- whiteboard-react 内部应使用什么形式的绝对路径
- 哪些目录应该提供 `index.ts` barrel
- 哪些目录不应该提供 barrel
- 对外 public API 和包内 internal API 应如何区分

## 结论

### 1. 必须统一改为绝对路径导入

长期最优方案中，`whiteboard-react/src` 内部不再允许跨层相对路径作为常态。

明确要求：

- 同一目录下的近距离依赖可以继续使用 `./`
- 同一小模块内部的局部相对路径可以接受
- 任何跨 feature / runtime / dom / types 的依赖，统一改为绝对路径

也就是说，以下形态不应继续扩散：

- `../../node/selection`
- `../../../runtime/hooks/useEditor`
- `../../../dom/observe/useElementSize`

### 2. 必须建立边界型 barrel，而不是到处铺 `index.ts`

`index.ts` 应该增加，但只能作为“边界导出面”使用。

不采用以下做法：

- 每个子目录都建 `index.ts`
- 层层 `export *`
- 用 barrel 隐藏真实依赖关系

明确采用的做法是：

- 在稳定目录边界增加 `index.ts`
- 让跨模块依赖只导入这些边界 barrel
- 不鼓励直接依赖叶子文件

### 3. 不做半套方案

本方案明确不采用：

- 只把部分文件改成绝对路径
- 不定义目录边界
- 一边继续深层相对路径，一边零散加 barrel

长期最优方案要求：

- import 形式
- barrel 边界
- package alias 策略

三件事一起定义清楚。

## 目标

## 1. 代码中的 import 一眼可读

当看到一个 import 时，应该立刻知道它属于：

- `features`
- `runtime`
- `dom`
- `types`
- `config`

而不是先数 `../../..` 才能判断来源。

## 2. 跨层依赖必须通过边界暴露

一个模块如果要被别处依赖，应先通过边界 barrel 暴露。

不再鼓励：

- 任意文件都能被别人直接 import
- 某个 feature 私有 helper 被外部直接穿透依赖

## 3. public API 与 internal API 必须分离

`@whiteboard/react` 的对外导出面应保持克制。

包内源码使用的绝对路径体系，不应默认等价于对外 public API。

否则会产生两个问题：

- 外部用户意外依赖内部目录结构
- 包内部重构被 public subpath 绑定

## 绝对路径策略

## 1. 推荐优先采用 internal alias，而不是直接把所有内部路径做成 public subpath

这里先明确一个架构判断：

如果直接在源码里全面使用：

- `@whiteboard/react/features/node`
- `@whiteboard/react/runtime/hooks`
- `@whiteboard/react/dom/observe`

那么长期上就要回答一个问题：

- 这些 subpath 是否也属于包的正式 public API？

如果答案是“是”，那 package `exports` 就要同步维护这些路径。

这会带来后果：

- 内部目录结构会变成外部可依赖面
- 后续重构 feature/runtime 目录时会增加 public 兼容成本

从长期最优架构出发，我更推荐：

- 对外 public API 继续使用 `@whiteboard/react`
- 包内源码使用私有 internal alias

例如：

- `#react/features/node`
- `#react/runtime/hooks`
- `#react/dom/observe`

或其他明确表示“仅供包内源码使用”的别名。

### 结论

长期最优更推荐：

- **internal alias**
- **public root export**

而不是把内部源码导入路径直接等同于 public package subpath。

## 2. 如果坚持使用 `@whiteboard/react/...` 风格，也必须接受 public subpath 成本

如果团队坚持统一使用：

- `@whiteboard/react/features/node`
- `@whiteboard/react/runtime/hooks`

那就必须明确接受以下事实：

- `package.json` 的 `exports` 需要正式补齐 subpath
- 这些 subpath 应视为公共 API
- 重构目录结构时需要考虑兼容或明确 breaking change

这个方案不是不能做，但它扩大了公共承诺面。

因此本方案的最终建议是：

- 如果目标是长期最优架构，优先 internal alias
- 如果目标是视觉统一且接受公共承诺，才用 `@whiteboard/react/...`

## Barrel 策略

## 1. 只允许“边界 barrel”

`index.ts` 不应泛滥。

只在以下类型的目录增加 barrel：

- 一级能力域
- 稳定子系统
- 明确希望被别处依赖的目录

例如：

- `features/node/index.ts`
- `runtime/hooks/index.ts`
- `runtime/overlay/index.ts`
- `dom/observe/index.ts`
- `features/selection/chrome/toolbar/index.ts`

这些 barrel 的目的不是偷懒，而是表达：

- 这个目录的允许导出面是什么
- 其他模块应该从这里拿依赖，而不是穿透到内部叶子文件

## 2. 禁止“全目录 barrel 化”

以下做法明确不推荐：

- 每个目录都建 `index.ts`
- 大量 `export * from './foo'`
- 用 barrel 掩盖真实耦合关系

原因：

- 容易形成循环依赖
- 目录边界变得松散
- import 路径虽然短了，但依赖关系反而更模糊

## 3. Barrel 只导出稳定项，不导出所有文件

每个 barrel 都应当是显式设计的导出面，而不是“目录内容镜像”。

也就是说：

- 不追求全部导出
- 只导出应该被外部依赖的能力
- 私有文件继续保持私有

## 推荐边界规划

以下是 whiteboard-react 内部建议优先建立的边界 barrel。

## 1. `runtime/hooks`

建议统一从这里导出：

- `useEditor`
- `useEditorRuntime`
- `useEdit`
- `useTool`
- `useInteraction`
- `useWhiteboard`
- `useWhiteboardServices`
- `useResolvedConfig`
- `useNodeRegistry`
- `usePickRef`
- `useStoreValue`

这样跨模块依赖 runtime hooks 时，不再直接穿透到：

- `runtime/hooks/useEditor`
- `runtime/hooks/useWhiteboard`

## 2. `runtime/overlay`

建议统一从这里导出：

- `WhiteboardPopover`
- 其他白板级 overlay chrome primitives

不再跨模块直接引用：

- `runtime/overlay/chrome`

## 3. `dom/observe`

建议统一从这里导出：

- `useElementSize`
- 其他 DOM observe hooks

不再直接引用：

- `dom/observe/useElementSize`

## 4. `features/node`

建议导出 node feature 提供给其他 feature 的稳定能力，例如：

- `useSelectionPresentation`
- `selectNodesByTypeKey`
- `NodeTypeIcon`
- registry public helpers

这样 selection chrome 依赖 node feature 时，不再直接穿透到：

- `features/node/selection`
- `features/node/actions`
- `features/node/components/NodeTypeIcon`

## 5. `features/selection/chrome/toolbar`

对 `NodeToolbar` 相邻子系统，建议也建立局部 barrel：

- `toolbar/context`
- `toolbar/items`
- `toolbar/primitives`
- `toolbar/recipe`
- `toolbar/types`

如果这些已经具备部分 barrel，则应继续统一，不再混用“有的从 index 导，有的从叶子文件导”。

## NodeToolbar 的目标形态

以 `NodeToolbar.tsx` 为例，长期最优不是简单把相对路径替换成绝对路径，而是同时完成：

- import 绝对路径化
- 依赖边界化

它依赖的外部能力应尽量收敛成以下几个边界：

- `features/node`
- `runtime/hooks`
- `dom/observe`
- `runtime/overlay`

也就是说，像下面这些当前 import：

- `../../node/selection`
- `../../../runtime/hooks/useEditor`
- `../../../runtime/hooks/useWhiteboard`
- `../../../dom/observe/useElementSize`
- `../../../runtime/overlay/chrome`

都应该消失。

取而代之的是边界化导入。

## 推荐规则

## 规则 1

同目录或同一微型子模块内部，可使用相对路径：

- `./foo`
- `../bar`

但不允许出现三层及以上跨域相对路径作为常态。

也就是说，以下形态应视为需要收敛：

- `../../..`
- `../../../..`

## 规则 2

跨域依赖必须走绝对路径别名。

这里的“跨域”指：

- `features -> runtime`
- `features -> dom`
- `features -> types`
- `runtime -> features`

## 规则 3

绝对路径应优先指向边界 barrel，而不是叶子文件。

允许：

- `#react/runtime/hooks`
- `#react/features/node`

不推荐：

- `#react/runtime/hooks/useEditor`
- `#react/features/node/selection`

除非该叶子文件本身就是明确稳定边界。

## 规则 4

barrel 文件必须显式维护，不允许无脑 `export *` 拼成目录镜像。

## 规则 5

`src/index.ts` 只负责 package public API，不负责包内源码便利导出。

这点非常重要。

不要把：

- “给外部用户使用的 API”
- “给内部源码组织依赖的 alias/barrel”

混成一层。

## 不采用的方案

## 1. 不采用“只改写 import，不建立 barrel 边界”

这会导致：

- 路径短了
- 但依赖边界仍然混乱

不是长期最优。

## 2. 不采用“所有目录都加 index.ts”

这会导致：

- barrel 泛滥
- 循环依赖更难排查
- 真正的模块边界消失

## 3. 不采用“内部源码直接无限制使用 `@whiteboard/react/...`，但不维护 exports”

这会造成：

- tsconfig 能过
- 实际 package 边界不真实
- public/internal 语义混乱

## 最终建议

长期最优方案明确如下：

### 1. 建立包内绝对路径体系

优先推荐：

- 使用 internal alias

例如：

- `#react/features/node`
- `#react/runtime/hooks`
- `#react/dom/observe`
- `#react/runtime/overlay`

### 2. 建立边界型 barrel

优先补齐：

- `features/node/index.ts`
- `runtime/hooks/index.ts`
- `runtime/overlay/index.ts`
- `dom/observe/index.ts`

并只导出稳定能力。

### 3. 约束 import 规则

明确规定：

- 跨域依赖不能再使用深层相对路径
- 跨域依赖优先导入边界 barrel
- 叶子文件默认私有

### 4. 保持 public API 克制

对外仍以：

- `@whiteboard/react`

为主入口。

只有在团队明确接受 public subpath 承诺时，才扩展：

- `@whiteboard/react/...`

## 最终判断

针对最初提出的两个优化点：

### 第一，按 `@whiteboard/react` 这样的绝对路径别名引用

方向是对的。

但长期最优更推荐“internal alias”思路，而不是默认把内部路径都做成 public subpath。

### 第二，增加 `index.ts` 聚合导出

也对。

但必须是“边界型 barrel”，不是“全目录 barrel 化”。

## 最终决定

whiteboard-react 的长期唯一正确方向是：

- 用绝对路径取代跨域相对路径
- 用边界 barrel 取代叶子文件穿透
- 分离 internal import system 与 public package API
- 不为了少写几段 import 而牺牲模块边界

这套规则应作为 whiteboard-react 后续 import 重构与目录导出设计的统一标准。
