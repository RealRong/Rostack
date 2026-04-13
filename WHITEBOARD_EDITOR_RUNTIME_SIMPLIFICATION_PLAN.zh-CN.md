# Whiteboard Editor Runtime 再简化方案

## 目标

这份文档只讨论 `whiteboard/packages/whiteboard-editor/src` 的下一轮长期最优收敛，不讨论迁移成本，不保留兼容层，不接受双轨实现。

这轮的核心目标不是继续“按概念拆目录”，而是把已经正确分离出来的职责重新压回更少、更稳定的主轴，降低以下成本：

- `createEditor` 组装链过长，平级 runtime 组件过多
- 本地 transient 状态 ownership 分散在 `state / overlay / viewport / write/*`
- 读侧查询被拆成 `read / projection / presentation` 三个顶层目录，跨层跳转频繁
- `write` 同时承载 committed command 和 local mutation，语义不纯
- 顶层目录数量超过稳定主轴所需，文件查找路径噪音偏高

## 一句话结论

当前 `whiteboard-editor/src` 仍然可以再简化一轮。

正确方向不是把所有内容继续摊平成少数大文件，而是把现有 10 多个顶层目录收敛成 6 个长期稳定主轴：

- `editor`
- `input`
- `local`
- `query`
- `command`
- `types`

其中：

- `local` 统一承接 editor 本地 transient runtime
- `query` 统一承接 committed read + transient projection + UI presentation
- `command` 只承接 committed command 与 editor intent 写入
- `input` 继续作为交互 feature 轴
- `editor` 只保留总装配与对外 runtime facade
- `types` 只保留公共类型，不再承接 feature 内部结构类型

## 当前结构的主要问题

当前顶层目录：

- `clipboard`
- `editor`
- `input`
- `model`
- `overlay`
- `presentation`
- `projection`
- `read`
- `state`
- `types`
- `write`

这套结构已经比旧版本好很多，但还没有完成“中轴化终态”，主要问题如下。

## 1. Local Runtime 被拆散了

现在 editor 本地运行态分散在多处：

- `state/*`
  - `tool / draw / selection / edit / pointer / space`
- `overlay/*`
  - draw preview / edge guide / selection preview / mindmap drag feedback
- `editor/viewport.ts`
  - viewport local runtime
- `input/core/runtime.ts`
  - active gesture / busy / mode / chrome
- `write/view.ts`
  - pointer / viewport / draw / space mutation
- `write/session.ts`
  - tool / selection / edit session mutation
- `write/edit.ts`
  - edit commit / cancel orchestration

这说明“本地状态是什么”和“本地状态如何被修改”没有收敛在同一轴里。

用户要理解 editor 当前瞬时态，需要在：

- `state`
- `overlay`
- `editor`
- `input/core`
- `write/view`
- `write/session`
- `write/edit`

之间来回跳。

这不是合理的长期结构。

## 2. Query 被拆成了三个顶层目录

现在读侧链路实际是：

- `read/*`
- `projection/*`
- `presentation/*`

职责上这三者属于同一条读管线：

1. 从 engine committed state 读取
2. 叠加 local transient projection
3. 派生 selection / toolbar / chrome 等 UI presentation

但现在它们被切成三个顶层目录，导致一个 feature 的读侧需要跨多个根目录才能看完整。

最典型的是：

- `read/node.ts`
- `projection/node.ts`
- `read/selectionModel.ts`
- `presentation/selection.ts`

逻辑上是连续的，但组织上是割裂的。

## 3. `write` 的语义已经不纯

当前 `write/*` 同时容纳了两类完全不同的东西：

### A. committed command

- `write/document.ts`
- `write/node/*`
- `write/edge.ts`
- `write/mindmap.ts`
- `write/selection.ts`
- `write/history.ts`
- `write/clipboard.ts`

### B. local mutation

- `write/view.ts`
- `write/session.ts`
- `write/edit.ts`
- `write/overlay.ts`

第一类是对 committed state 的 command / intent。
第二类是 editor 本地 transient runtime 的 mutation。

这两者不应继续共享 `write` 这个顶层语义。

## 4. 顶层目录里仍有偏轻、偏孤立的轴

以下顶层目录不值得长期继续存在：

- `clipboard`
  - 现在本质只有一个 `packet.ts`
- `projection`
  - 只有 `node.ts` 和 `edge.ts`
- `presentation`
  - 只有 `selection.ts` 和 `edgeToolbar.ts`
- `model`
  - 现在几乎等价于 draw feature 局部状态

它们不是稳定主轴，只是当前阶段性拆分结果。

## 长期终态目录

长期终态统一收敛为：

```text
src/
  editor/
    createEditor.ts
    facade.ts
    input.ts
    state.ts

  input/
    core/
    draw/
    edge/
    mindmap/
    selection/
    transform/
    viewport/
    index.ts
    context.ts

  local/
    runtime.ts
    session/
    viewport/
    feedback/
    actions/
    draw/

  query/
    node/
    edge/
    mindmap/
    selection/
    target.ts
    index.ts

  command/
    document.ts
    node/
    edge/
    mindmap/
    selection.ts
    clipboard.ts
    history.ts
    index.ts

  types/
    editor.ts
    commands.ts
    input.ts
    pick.ts
    tool.ts
    insert.ts
    edgePresentation.ts
    selectionPresentation.ts
    node/
```

注意：

- `projection` 不再作为顶层目录存在
- `presentation` 不再作为顶层目录存在
- `state` 不再作为顶层目录存在
- `overlay` 不再作为顶层目录存在
- `write` 不再作为顶层目录存在
- `model` 不再作为顶层目录存在
- `clipboard` 不再作为顶层目录存在

## 各主轴的明确职责

## 1. `editor`

`editor` 只负责总装配、对外 runtime facade、公共入口。

允许存在：

- `createEditor.ts`
- editor facade / public read / event bridge
- editor 级输入入口

不允许存在：

- feature 领域逻辑
- transient projection 细节
- local state mutation 细节
- committed command 细节

### 终态要求

`createEditor` 只保留三段组装：

1. `createLocalRuntime`
2. `createQueryRuntime`
3. `createCommandRuntime`

然后把它们交给 `input` 和 editor facade。

## 2. `input`

`input` 继续保留为 feature 轴，这是当前结构里最稳定的一层。

允许存在：

- pointer / keyboard / wheel interaction feature
- feature session
- feature-specific start / resolve / session

不允许存在：

- committed write 细节直接散落在 feature 内部
- feature 内部直接理解 overlay / state 的结构细节
- feature 自己维护全局状态 ownership

### 终态要求

`input` 只依赖：

- `query`
- `command`
- `local.actions`

不再直接跨越到零散的 `state / overlay / write/view / write/session`。

## 3. `local`

`local` 是下一轮最关键的新主轴。

它统一承接 editor 所有 transient local runtime。

### 负责的内容

- `tool`
- `draw`
- `selection`
- `edit`
- `pointer`
- `space`
- `viewport`
- `active gesture`
- `busy / mode / chrome`
- edge guide / marquee / draw preview / mindmap drag feedback

### 终态结构

```text
local/
  runtime.ts

  session/
    tool.ts
    selection.ts
    edit.ts

  viewport/
    runtime.ts

  feedback/
    state.ts
    selectors.ts
    edge.ts
    node.ts
    selection.ts

  draw/
    state.ts

  actions/
    session.ts
    viewport.ts
    edit.ts
    feedback.ts
    draw.ts
```

### 原目录映射

- `state/*` -> `local/session/*` 或 `local/draw/*`
- `overlay/*` -> `local/feedback/*`
- `editor/viewport.ts` -> `local/viewport/runtime.ts`
- `input/core/runtime.ts` 中的 active local runtime -> `local/runtime.ts`
- `write/view.ts` -> `local/actions/viewport.ts` + `local/actions/draw.ts`
- `write/session.ts` -> `local/actions/session.ts`
- `write/edit.ts` -> `local/actions/edit.ts`
- `write/overlay.ts` -> `local/actions/feedback.ts`

### 强制边界

- `local` 不接触 engine committed mutation
- `local` 只管理 transient state
- `local.actions` 只修改 local state，不调用 engine.execute

## 4. `query`

`query` 统一承接 editor 读侧。

### 负责的内容

- committed read glue
- transient projection
- selection model
- toolbar / chrome presentation

### 终态结构

```text
query/
  node/
    read.ts
    projection.ts

  edge/
    read.ts
    projection.ts

  mindmap/
    read.ts

  selection/
    model.ts
    presentation.ts
    edgeToolbar.ts

  target.ts
  utils.ts
  index.ts
```

### 原目录映射

- `read/node.ts` + `projection/node.ts` -> `query/node/*`
- `read/edge.ts` + `projection/edge.ts` -> `query/edge/*`
- `read/mindmap.ts` -> `query/mindmap/read.ts`
- `read/selectionModel.ts` + `presentation/selection.ts` -> `query/selection/*`
- `presentation/edgeToolbar.ts` -> `query/selection/edgeToolbar.ts`
- `read/target.ts` -> `query/target.ts`
- `read/utils.ts` -> `query/utils.ts`

### 强制边界

- `query` 不修改 local state
- `query` 不执行 engine command
- `query` 是只读轴

### 关键判断

`projection` 这个概念必须保留，但只能作为 `query` 内部子层保留，不能继续做顶层目录。

`presentation` 也同理。

## 5. `command`

`command` 只保留 committed command 与 editor intent 写入。

### 负责的内容

- document command
- node command
- edge command
- mindmap command
- selection command
- clipboard command
- history command

### 终态结构

```text
command/
  document.ts
  node/
    commands.ts
    text.ts
  edge.ts
  mindmap.ts
  selection.ts
  clipboard.ts
  history.ts
  index.ts
```

### 原目录映射

- `write/document.ts` -> `command/document.ts`
- `write/node/*` -> `command/node/*`
- `write/edge.ts` -> `command/edge.ts`
- `write/mindmap.ts` -> `command/mindmap.ts`
- `write/selection.ts` -> `command/selection.ts`
- `write/clipboard.ts` -> `command/clipboard.ts`
- `write/history.ts` -> `command/history.ts`

### 强制边界

- `command` 只做 committed write
- `command` 不持有 local state 结构
- `command` 不负责反馈层内部结构

## 6. `types`

`types` 只保留公共类型和 editor surface。

### 保留范围

- `editor.ts`
- `commands.ts`
- `input.ts`
- `pick.ts`
- `tool.ts`
- `insert.ts`
- 外部可见的 presentation type
- `types/node/*`

### 删除范围

feature 内部专用 type 必须回到 feature 旁边，不能继续堆在 `types/`。

## 调用链终态

当前 `createEditor` 的调用链过长：

1. runtime state
2. viewport
3. interaction runtime
4. overlay
5. read
6. editor state
7. write
8. input

长期终态必须压缩为：

1. `createLocalRuntime`
2. `createQueryRuntime`
3. `createCommandRuntime`
4. `createInteractionRuntime`
5. `createEditorFacade`

即：

```text
engine + registry
  -> local
  -> query(local + engine)
  -> command(local + query + engine)
  -> input(query + command + local.actions)
  -> editor facade
```

这条链比当前更短，也更符合 ownership：

- `local` 只关心 transient
- `query` 只关心读取
- `command` 只关心 committed 写入
- `input` 只负责交互调度

## 最应该删除的中间层

下一轮不应保留以下中间层命名与目录：

### A. `write/view.ts`

问题：

- 名字像 committed write，实际上在改 local runtime

终态：

- 拆入 `local/actions/viewport.ts`
- 拆入 `local/actions/draw.ts`

### B. `write/session.ts`

问题：

- 名字像 command，实际上是 local session mutation

终态：

- 改为 `local/actions/session.ts`

### C. `write/edit.ts`

问题：

- 一半是 local edit session orchestration
- 一半才是提交 committed command

终态：

- local 部分进 `local/actions/edit.ts`
- commit bridge 保留在 `command` 或由 facade 显式装配

### D. `overlay/*`

问题：

- 本质是 local feedback runtime，但名字单独成了一个大轴

终态：

- 全部并入 `local/feedback/*`

### E. `projection/*`

问题：

- 已经是读管线内部细分，不值得继续顶层化

终态：

- 并入 `query/node/*`
- 并入 `query/edge/*`

### F. `presentation/*`

问题：

- 也是读侧内部子层，不值得继续顶层化

终态：

- 并入 `query/selection/*`

### G. `model/draw/*`

问题：

- 现在 draw 已经不是抽象 model，而是 local transient feature state

终态：

- 并入 `local/draw/*`

### H. `clipboard/packet.ts`

问题：

- 单文件顶层目录没有必要

终态：

- 并入 `command/clipboard.ts` 同目录，或者进入 `command/clipboard/packet.ts`

## 明确不做的事

这轮再简化不做以下错误方向：

### 1. 不把所有内容重新压成巨型 `editor/*`

那会回到旧式“全都在一层”的不可维护状态。

### 2. 不把 `input` 合并进 `editor`

交互 feature 轴本身是稳定的，应该保留。

### 3. 不把 local transient 继续下沉到 engine

engine 仍然只负责 committed state。

### 4. 不保留 `write` 作为大杂烩目录

`write` 语义已经失真，必须拆成 `command` 和 `local.actions`。

## 执行顺序

如果后续实施，顺序必须固定：

1. 先建 `local`
   - 吸收 `state / overlay / viewport / local write`
2. 再建 `query`
   - 吸收 `read / projection / presentation`
3. 再把 committed write 收成 `command`
4. 再缩短 `createEditor` 总装配链
5. 最后删除旧目录

不能边迁移边长期保留两套结构。

## 最终目录删除清单

完成后，以下顶层目录必须从 `src` 删除：

- `clipboard`
- `model`
- `overlay`
- `presentation`
- `projection`
- `read`
- `state`
- `write`

保留：

- `editor`
- `input`
- `local`
- `query`
- `command`
- `types`

## 最终判断

当前 `whiteboard-editor/src` 还可以明显再简化一轮，而且方向非常明确。

这轮简化的本质不是“再拆 feature”，而是：

- 把本地 runtime 收拢成单一 `local` 主轴
- 把读侧链路收拢成单一 `query` 主轴
- 把 committed 写入收拢成单一 `command` 主轴

只要这三条轴明确了，顶层目录会显著变少，调用链会显著变短，状态 ownership 也会更清晰。

这就是 `whiteboard-editor/src` 的下一轮长期终态。
