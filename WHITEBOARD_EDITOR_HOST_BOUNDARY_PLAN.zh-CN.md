# Whiteboard Editor / Host 边界收敛方案

## 结论

如果长期目标是：

- `engine` 只负责文档与核心命令
- `editor` 只负责世界语义交互
- `react` 只负责宿主、DOM、viewport 和产品层策略

那么当前 `whiteboard-editor` 里仍然有一部分职责放得太高了。

最值得继续收敛出去的，不是 `selection / edge / transform` 这些已经逐步简化过的 interaction 本身，而是下面这几类“宿主策略”：

1. `viewport` 行为和限制
2. `inputPolicy`
3. `drawPreferences`
4. `insertPresetCatalog`
5. `insert preset` 这条产品层快捷插入线

一句话概括长期最优：

```text
engine 负责 document truth
editor 负责 world interaction semantics
host 负责 screen policy / tool preference / preset catalog / DOM input
```

当前实现之所以让人感觉 `createEditor(...)` 参数越来越多，不是因为 editor 真需要这么多核心依赖，而是因为 editor 同时承担了：

- interaction runtime
- viewport host
- tool preference container
- preset product layer

这四层中的后两层，长期都不该留在 editor。

---

## 当前问题

现在 `whiteboard-editor/src/runtime/editor/createEditor.ts` 接收：

- `initialTool`
- `initialViewport`
- `viewportLimits`
- `inputPolicy`
- `registry`
- `insertPresetCatalog`
- `initialDrawPreferences`

从纯类型上看，这些参数都能工作。  
但从架构边界看，它们不是一个层级的东西。

### 当前混在一起的三类输入

#### 1. 真正的 editor 核心依赖

- `engine`
- `registry`

这两项没有争议。

- `engine` 提供文档事实、命令、索引、history
- `registry` 提供 node render / capability / geometry 等解释能力

它们属于 editor 的核心构造依赖。

#### 2. editor 本地初始状态

- `initialTool`
- `initialViewport`

这两项勉强还可以留在 editor。

原因是：

- `tool` 决定 world interaction 语义
- `viewport` 决定 screen/world 映射的起点

但要注意，`viewport` 只适合作为“当前 host 提供给 editor 的初始 camera”，不适合继续演化成“editor 自己拥有完整 viewport policy”。

#### 3. 宿主 / 产品层策略

- `viewportLimits`
- `inputPolicy`
- `initialDrawPreferences`
- `insertPresetCatalog`

这四项已经明显不属于同一层了。

它们的问题不是“能不能放在 editor”，而是：

```text
它们并不是 editor 的核心事实，而是 host / product 提供的策略与偏好
```

---

## 为什么这些更像 Host 职责

### 1. `viewportLimits`

`viewportLimits` 本质上是 camera policy。

它回答的是：

- 最小能缩到多少
- 最大能放到多少

这不是文档语义，也不是 selection / transform / edge edit 的世界规则。  
它是宿主决定如何允许用户观察文档。

从职责上看，它更像：

- 宿主产品体验策略
- 外层容器 UI 策略
- 不同宿主平台的交互限制

所以它长期更应该由 host 持有。

### 2. `inputPolicy`

`inputPolicy` 回答的是：

- 是否允许 pan
- 是否允许 wheel
- wheel 灵敏度是多少

这更明显是 host 行为。

它不是文档的一部分，也不是 editor 世界状态的一部分。  
它是“当前这个宿主容器如何解释输入设备”的规则。

例如：

- 桌面 whiteboard host
- 只读嵌入 host
- 移动端 host
- 演示模式 host

这些宿主完全可能共享同一个 editor world model，但有不同的输入策略。

所以长期最优一定是：

- `inputPolicy` 属于 host
- editor 不持有它作为内部真相

### 3. `drawPreferences`

`drawPreferences` 当前也是 editor runtime state 的一部分。  
但它的本质不是 editor 的核心世界模型，而是“当前宿主为 draw tool 维护的本地偏好”。

它更像：

- 画笔颜色
- 线宽
- fill / stroke
- 当前 brush slot

这些都不是文档事实。  
它们更接近：

- tool settings
- user preference
- product defaults

长期最优不是让 editor 内部拥有一套 draw preference store，而是：

- host 维护当前 draw config
- draw interaction 开始时由 host 提供参数
- editor 只负责把 stroke / erase 作用到 document

### 4. `insertPresetCatalog`

这个点最容易争议，因为它现在在 `editor.write.document.insert` 这条线上。

但如果重新定义它的语义，会发现它其实也更像 host / product 责任。

`preset catalog` 回答的是：

- 当前产品里有哪些插入模板
- 某个 preset key 对应什么节点结构
- 某类模板如何分组展示
- 不同宿主是否启用同一套模板

这不是 editor 通用世界语义。  
这是产品层模板编排。

editor 真正需要的不是：

- “给我一个 preset key”

editor 真正需要的是：

- “创建这些 node / edge / tree”

也就是说：

- `preset` 是 host/product 概念
- `create node / create mindmap / create subtree` 才是 editor / engine 概念

如果沿着这个方向收敛，`insertPresetCatalog` 也应该移出 editor。

---

## 当前 editor 里哪些东西因此变重了

上面这些策略还留在 editor，直接导致 editor 现在比“世界语义控制器”更胖。

### 1. editor 自己维护 viewport runtime

当前 editor 不只是消费 viewport 结果，而是自己维护：

- current viewport
- limits
- pan / wheel
- screen/world 转换

这会让 editor 既像 interaction runtime，又像 host viewport controller。

### 2. editor 自己维护 input policy

这使得 interaction 直接依赖 editor 本地状态里的 `inputPolicy`。

例如：

- `viewport pan` 是否允许
- wheel 是否允许

这类判断本来应该在 host 入口就被裁掉，或者由 host viewport controller 决定。

### 3. draw interaction 直接读取 editor 内部 preference store

这导致 draw 看起来像 editor 的核心能力，但其实里面掺了很多产品层偏好状态。

### 4. insert interaction 直接绑定 preset catalog

这让 `insert` 从“产品快捷插入能力”变成了“editor 内建领域能力”，边界会越来越糊。

---

## 长期最优分层

长期建议把 whiteboard 明确分成三层。

## 1. Engine

职责：

- document truth
- history
- node / edge / tree / mindmap commands
- index / query
- core config

Engine 不关心：

- DOM
- viewport policy
- input policy
- tool preference
- preset catalog

## 2. Editor

职责：

- selection
- edit
- interaction session
- 世界坐标下的 move / marquee / transform / edge edit / draw gesture 语义
- active gesture / overlay 所需的世界语义反馈

Editor 可以关心：

- pointer 在世界坐标下的位置
- 选区如何变化
- 一次 move / resize / route 如何 commit

Editor 不应该拥有：

- wheel/pan 是否允许
- viewport limit policy
- draw preference store
- preset catalog
- 具体产品层 tool defaults

一句话：

```text
editor 负责“世界里发生了什么”
不负责“宿主允许用户怎么操作屏幕”
```

## 3. Host

这里的 host 可以是：

- `whiteboard-react`
- 未来的 canvas host
- electron host
- embedded readonly host

Host 负责：

- DOM 输入事件
- pointer capture / focus / keyboard source
- viewport camera policy
- screen -> world / world -> screen
- tool preference state
- draw preference state
- preset catalog
- 产品层快捷工具和菜单

一句话：

```text
host 负责“用户如何通过当前容器和 editor 交互”
```

---

## 最终边界定义

为了避免后面又重新漂移，建议直接固定下面这句原则：

```text
editor 不拥有 screen policy、tool preference、preset catalog；
editor 只消费世界语义输入，并输出世界语义结果。
```

这句话一旦定下来，很多当前摇摆的问题都会自然消失。

---

## 目标 API 形态

长期最优不是继续给 `createEditor(...)` 增加参数，而是缩到只保留 editor 真正需要的依赖。

建议目标形态类似：

```ts
createEditor({
  engine,
  registry
})
```

然后把 host/runtime 相关内容全部挪到外层组装。

### Host 侧目标形态

Host 自己维护：

```ts
createWhiteboardHost({
  editor,
  viewport,
  inputPolicy,
  drawPreferences,
  insertPresets
})
```

或者更进一步：

```ts
createWhiteboardHostRuntime({
  engine,
  registry,
  viewport,
  tools,
  preferences,
  presets
})
```

然后 host 内部再创建 editor。

关键点不是具体函数名，而是：

- editor 构造签名变小
- host runtime 明确承担策略与偏好

---

## 具体收敛建议

下面按模块给出长期最优收敛方向。

## A. Viewport 收到 Host

### 当前问题

当前 editor runtime 自己维护 viewport state，并把它暴露给 read/write。

这会导致：

- editor 同时拥有 world interaction 和 camera policy
- wheel/pan/limit 都留在 editor

### 长期建议

把 viewport 拆成两部分：

#### 1. Host viewport controller

host 持有：

- current viewport
- limits
- wheel / pan policy
- screen/world transform

#### 2. Editor viewport port

editor 只消费一个很小的 viewport port：

- `getViewport()`
- `worldPointFromClient(...)`
- `screenPointFromClient(...)`
- `panBy(...)`，如果某些 interaction 仍需 autoPan

也就是说，editor 不再拥有 viewport 状态，只依赖 host 注入的 viewport service。

### 收益

- `viewportLimits` 和 `inputPolicy` 自动离开 editor
- `createRuntimeState(...)` 明显变小
- `createEditor(...)` 参数减少

## B. Draw Preferences 收到 Host

### 当前问题

draw preference 当前是 editor runtime local state。

这使得：

- draw interaction 必须通过 `editor.read.draw.preferences`
- draw UI 修改 preference 也必须走 `editor.write.view.draw`

本质上是把产品层 tool preference 放进了 editor。

### 长期建议

host 维护 draw preference store。

draw interaction 启动时，host 把当前 draw config 显式传入 interaction 或 command。

例如可以收敛成：

```ts
startStroke({
  pointer,
  style,
  zoom
})
```

这里的 `style` 由 host 提供，不再从 editor 内部 runtime 读取。

### 收益

- `initialDrawPreferences` 从 `createEditor(...)` 消失
- `runtime.state.drawPreferences` 可以删除
- `read.draw.preferences` 和 `write.view.draw` 可以逐步外移

## C. Insert Preset 收到 Host

### 当前问题

当前 editor 把 `preset catalog` 直接作为 document write 的一部分。

这会导致 editor 拥有产品模板知识。

### 长期建议

把 insert 分成两层：

#### 1. Host preset layer

host 负责：

- 当前有哪些 preset
- 当前 tool 选了哪个 preset
- 某个 preset 解开后要创建什么结构

#### 2. Editor document commands

editor / engine 只提供：

- `createNode`
- `createMindmap`
- `createSubtree`
- `insertNodesAt`

也就是说：

- `preset -> document ops` 的翻译在 host
- `document ops -> commit` 在 editor / engine

### 收益

- `insertPresetCatalog` 从 editor 构造签名消失
- `insert interaction` 可以不再是 editor 核心 interaction
- editor 更接近通用世界语义层

## D. Insert Interaction 也应外移

如果 `preset catalog` 出去，那么 `insert interaction` 最终也应一起外移。

原因是它本质上是：

- 当前 tool 是 insert
- 用户点 background
- host 根据 preset 决定插入什么

这条线并不是 editor 的底层交互语义。

它是产品层快捷操作。

长期最优建议：

- editor 保留最小 document creation commands
- host 监听 pointer down，根据当前 tool 做 preset insert

这样可以让 `interactions/insert.ts` 最终退出 editor 核心交互层。

---

## 不建议外移的部分

为了避免收得过头，下面这些我认为仍然应该留在 editor。

### 1. Selection

selection 是世界语义，不是 host 策略。

### 2. Edit

文本编辑、当前编辑目标，属于 editor 领域。

### 3. Transform / Move / Marquee / Edge Route

这些都是真正的世界交互语义。

### 4. Snap Solver 的调用

虽然 snap solver 可以继续是纯函数，但 move / transform / edge edit 何时请求 snap，仍然属于 editor 交互语义。

也就是说：

- snap policy 可注入
- 但 gesture 如何应用 snap，仍在 editor

---

## 推荐实施顺序

这轮如果要落地，建议不要一次性全拆，按收益最大且风险最小的顺序来。

## 第一阶段：先把概念边界固定

目标：

- 不急着大改实现
- 先停止继续把 host 策略塞进 editor

动作：

1. 明确规定 `createEditor(...)` 不再新增 host policy 参数
2. 新增 host/runtime 设计文档和目标 API
3. 停止扩大 `editor.read.draw`、`editor.write.view.draw`、`editor.write.document.insert` 这类边界

## 第二阶段：Viewport 先外移

这是最值得先动的一条，因为收益最大。

动作：

1. host 持有 viewport state
2. editor 改为依赖 host 注入的 viewport port
3. `viewportLimits` / `inputPolicy` 从 editor state 删除

完成后：

- editor 的 runtime state 直接瘦一大截
- interaction / input / viewport 的边界会清楚很多

## 第三阶段：Draw Preferences 外移

动作：

1. host 持有 draw preferences
2. draw interaction 不再从 editor runtime 读 preference
3. 删除 editor 内部的 draw preference state / read / write 入口

## 第四阶段：Preset Catalog 和 Insert 外移

动作：

1. host 维护 preset catalog
2. host 负责 `preset -> commands` 翻译
3. `insert interaction` 退出 editor 核心 interaction
4. editor 保留最小插入命令能力

---

## 迁移后的目标结构

长期目标可以收成：

### `whiteboard-engine`

- 文档事实
- 命令
- 查询

### `whiteboard-editor`

- selection
- edit
- interaction sessions
- gesture feedback
- 世界语义 commit

### `whiteboard-react`

- host runtime
- viewport controller
- input policy
- draw preferences
- insert presets
- DOM / React binding

这样以后看目录就会很直观：

- `engine` 是底层事实
- `editor` 是世界交互
- `react` 是宿主和产品壳

---

## 最终建议

如果目标是长期最优，我建议直接接受下面这个判断：

1. `viewportLimits` 不该继续留在 editor
2. `inputPolicy` 不该继续留在 editor
3. `drawPreferences` 不该继续留在 editor
4. `insertPresetCatalog` 也不该继续留在 editor
5. `insert interaction` 长期也应该离开 editor

但这不等于“React 直接接管一切”。

更准确地说，是：

- 这些都应该进入 `host runtime`
- 当前 `whiteboard-react` 正好是这个 host 的承载层

所以真正的长期最优不是：

```text
把东西都放到 React
```

而是：

```text
把宿主策略和产品层状态从 editor 中剥离，
由 whiteboard-react 作为当前 host runtime 承载。
```

这才是最稳的长期收敛方向。
