# Whiteboard 文本编辑最终方案

## 结论

最终方案明确采用：

- 统一 `EditSession`
- 统一 `editor.actions.edit.*`
- 统一 `editor.select.edit()` / `editor.select.panel().textToolbar`
- 就地 editable owner-host

明确不采用：

- 全局单一覆盖层 `EditingHost`
- “scene 继续显示文本，透明输入层只负责 caret”的方案

这里的“就地 editable owner-host”指的是：

- 每个可编辑 renderer 自己拥有真实输入 DOM 的位置
- 只有命中当前 `EditSession` 时，才切成真实 `contentEditable` 或 `input`
- 编辑状态、生命周期、提交协议、样式修改、测量回传，全部仍然归 `editor runtime`

一句话：

- 统一状态机，不统一宿主位置

## 为什么改方向

之前方案里最核心的判断是：

- `scene` 负责显示 draft
- 全局 `EditingHost` 只负责输入、composition、caret

这条路在普通键盘输入下能工作，但对中文输入法、composition、caret 对齐并不稳。

根因不是某个 CSS 没写对，而是结构本身有问题：

- 用户看到的文本不是浏览器真实正在编辑的 DOM
- caret 和 IME 候选窗依赖真实 editable DOM 的排版
- 透明输入层和 scene 文本只要有一点字体、padding、换行、缩放、baseline、transform 不一致，输入法就会漂
- composition 期间如果 runtime 还反向把 draft 同步回 DOM，会直接打断输入法内部状态

所以真正的问题不是“要不要统一 host”，而是：

- 可见文本和可编辑文本不能分裂成两层

最终最优解不是全局 overlay host，而是：

- 让浏览器真实编辑的 DOM 就是用户看到的那份文本

## 核心原则

### 1. 编辑仍然是 editor 一级概念

编辑状态必须仍然归 editor runtime，而不是退回各 renderer 自己维护局部状态。

它和这些概念同级：

- selection
- tool
- viewport
- interaction

### 2. DOM 宿主归 renderer，协议归 runtime

必须把两件事分开：

- 真实输入 DOM 挂在哪里
- 编辑协议由谁控制

最终边界是：

- renderer 拥有真实 editable DOM 的位置
- runtime 拥有编辑 session、draft、commit/cancel、样式、测量、selection 联动

### 3. 可见文本和可编辑文本必须是同一份

正在编辑的字段，用户看到的就必须是浏览器正在编辑的那份 DOM。

不能再做：

- scene 显示一份文本
- overlay host 再输入另一份透明文本

### 4. composition 期间要接受“DOM 暂时更接近真相”

长期必须接受一个现实：

- 文档级真相源在 runtime
- 但 composition 期间，浏览器 editable DOM 是临时最权威的输入状态

因此规则应当是：

- `beforeinput / input / compositionupdate` 可以把变化上送到 runtime
- 但 `composing = true` 时，runtime 不能再反向覆盖 DOM
- 只有 `compositionend` 之后才恢复外部同步

### 5. 能力必须声明化

toolbar 能力、空值策略、是否自动测量，不能继续由 React 组件根据 `node.type` 临时猜。

必须由 definition 或 capability resolver 声明：

- 字段能不能编辑
- toolbar 支持哪些工具
- 空值怎么处理
- 是否需要自动测量
- 是否是单行

### 6. read model 必须容错

即使编辑架构改成 owner-host，这条原则也不变：

- `node.view`
- `edge.view`
- `scene`
- `panel`

都不能在中间态 throw。

缺端点、协同半同步、删除级联、脏数据导入，都只能返回暂时不可渲染，不允许崩。

## 最终架构

## 顶层保持不变

顶层入口仍然只保留：

- `editor.store`
- `editor.actions`
- `editor.select`
- `editor.events`

其中编辑链路核心只保留：

- `editor.store.edit`
- `editor.actions.edit.*`
- `editor.select.edit()`
- `editor.select.panel()`

不再保留“全局输入宿主层”的长期抽象。

## `EditSession`

当前轻量 target 必须升级成真正的 `EditSession`。

示意：

```ts
type EditSession =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
      initial: {
        text: string
        style?: EditStyleDraft
      }
      draft: {
        text: string
        style?: EditStyleDraft
        measure?: Size
      }
      caret: EditCaret
      status: 'active' | 'committing'
      capabilities: EditCapability
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
      initial: {
        text: string
        style?: EditStyleDraft
      }
      draft: {
        text: string
        style?: EditStyleDraft
      }
      caret: EditCaret
      status: 'active' | 'committing'
      capabilities: EditCapability
    }
  | null
```

关键点：

- `draft.text` 在 runtime
- `draft.style` 在 runtime
- `draft.measure` 在 runtime
- `caret` 在 runtime
- `capabilities` 在 session 创建时就固定
- renderer 不再自己猜能力

## `editor.actions.edit`

最终编辑动作保持这一组：

```ts
editor.actions.edit.startNode(nodeId, field, options?)
editor.actions.edit.startEdgeLabel(edgeId, labelId, options?)
editor.actions.edit.input(text)
editor.actions.edit.caret(caret)
editor.actions.edit.style(patch)
editor.actions.edit.measure(size)
editor.actions.edit.commit()
editor.actions.edit.cancel()
editor.actions.edit.clear()
```

语义必须固定：

- `startNode/startEdgeLabel` 只负责创建 session
- `input` 是唯一文本写入口
- `caret` 是唯一光标写入口
- `style` 是唯一编辑态样式写入口
- `measure` 是唯一测量结果写入口
- `commit` 统一提交到 document
- `cancel` 统一回滚到 `initial`
- `clear` 只负责无条件清 session

必须删除这些旧概念：

- `editor.actions.edit.nodeText.set`
- `editor.actions.edit.nodeText.clear`
- `editor.actions.edit.nodeText.clearSize`
- renderer 内部自己写 `patch + clear + remove + selection.clear`

## `editor.select.panel().textToolbar`

text toolbar 不再让 React 现拼。

最终应由 runtime 直接产出：

```ts
type TextToolbarPresentation = {
  session: EditSession
  tools: readonly (
    | 'size'
    | 'weight'
    | 'italic'
    | 'color'
    | 'background'
    | 'align'
  )[]
  values: {
    size?: number
    weight?: number
    italic: boolean
    color?: string
    background?: string
    align?: 'left' | 'center' | 'right'
  }
}
```

React toolbar 只做两件事：

- 读 presentation
- 把用户操作转发给 `editor.actions.edit.style(...)`

## renderer 结构

最终每个可编辑 renderer 都有两种模式：

- display mode
- edit mode

规则是：

- 如果当前没有命中 `EditSession`，渲染普通 display
- 如果命中当前 `EditSession`，就在原位置切成真实 editable DOM

这里“不统一宿主位置”，但要“统一桥接协议”。

## 必须有共享 bridge，而不是每个组件自己写

不能重新退回：

- `text.tsx` 一套逻辑
- `shape.tsx` 一套逻辑
- `frame.tsx` 一套逻辑
- `EdgeItem.tsx` 一套逻辑

最终必须共享一套轻量 bridge，可以是：

- `useEditableBridge(...)`
- 或 `<EditableSlot ... />`

它只做这些事：

- 初始化 DOM 文本
- 根据 session.caret 聚焦和恢复 selection
- `beforeinput / input / compositionstart / compositionupdate / compositionend`
- composition 期间阻止 runtime -> DOM 反向覆盖
- blur -> `editor.actions.edit.commit()`
- escape -> `editor.actions.edit.cancel()`
- submit -> `editor.actions.edit.commit()`
- 把测量结果回传给 `editor.actions.edit.measure()`

它不做这些事：

- 不直接 patch node
- 不直接 remove node
- 不直接 clear selection
- 不直接写 edge label

这些都只能走 runtime action。

## 各类型最终规则

## 1. `text`

最终方案：

- 就地 editable
- 编辑态直接切成真实 `contentEditable`
- 文本显示、caret、selection、composition 全部由这份 DOM 承担
- 自动宽高测量基于这份 DOM 自己完成

行为要求：

- 第一帧进入编辑态内容不消失
- composition 不被 runtime 同步打断
- blur 不隐式删节点
- 空文本默认保留，显示 placeholder

## 2. `sticky`

最终方案：

- 就地 editable
- 编辑态直接切真实 `contentEditable`
- 字号自适应和布局基于这份 DOM 测量

行为要求：

- 不再依赖透明 host 和 scene 文本对齐
- draft text 和实际看到的文本永远是同一份
- toolbar 能力通过 capability 声明，不再硬编码

## 3. `shape`

最终方案：

- 就地 editable
- shape 外壳仍由 scene 正常渲染
- 中间文本区域在编辑态切成真实 editable

注意点：

- 编辑态可以允许和纯展示态有轻微布局差异
- 不要为了完全复刻展示态而牺牲输入稳定性
- 输入稳定性优先于百分百视觉复刻

长期标准：

- 居中、多行、caret、composition 同时稳定
- 不再依赖 overlay 对齐

## 4. `frame title`

最终方案：

- 就地编辑
- renderer 在 title 区域本身切到真实输入 DOM
- 可用 `input` 或单行 `contentEditable`

推荐：

- 单行仍然优先使用最稳定的宿主

无论最终是 `input` 还是 `contentEditable`，都必须满足：

- 生命周期归 runtime
- 空值策略归 runtime
- 默认值回退归 runtime

## 5. `edge label`

最终方案：

- 就地 editable
- 不要求切成水平编辑态
- 允许继续按当前 label 的视觉旋转方向编辑

这里明确记录最终判断：

- edge label 编辑态不需要为了输入而强制水平化
- 旋转编辑是可接受的目标
- 成熟产品里这类能力也是可以成立的

但边界仍然要清晰：

- 旋转的是同一份真实 editable DOM
- 不是 scene 一份、overlay 一份
- caret、selection、IME 候选窗都必须服务于这份真实 DOM

也就是说，最终要求不是“别旋转”，而是：

- 旋转可以保留
- 但不能再把输入 DOM 和显示 DOM 分离

## 为什么不再需要全局 `EditingHost`

全局 host 的最大优点只有一个：

- 理论上只维护一个浏览器输入上下文

但代价更大：

- anchor 定位复杂
- viewport/zoom/scroll 同步复杂
- scene 与 host 的显示容易漂
- composition 和 caret 对齐天然高风险
- edge label / shape label 这类特殊布局要做大量补偿

而 owner-host 方案里：

- DOM 就在真实视觉位置
- 不需要单独 overlay 定位
- 不需要 scene/host 两层文本对齐
- 不需要 hideSceneText 的大范围中间层抽象

所以长期最优不应再保留全局 host。

## 最终能力声明

建议在 definition 中显式声明：

```ts
type EditCapability = {
  tools: readonly EditTool[]
  placeholder?: string
  multiline: boolean
  empty: 'keep' | 'remove' | 'default'
  measure: 'none' | 'text'
  defaultText?: string
}

type NodeDefinition = {
  ...
  edit?: {
    fields?: Partial<Record<'text' | 'title', EditCapability>>
  }
}
```

示意约束：

- `text.text`
  - `tools: ['size', 'weight', 'italic', 'color', 'background']`
  - `multiline: true`
  - `empty: 'keep'`
  - `measure: 'text'`

- `sticky.text`
  - `tools: ['size', 'weight', 'italic', 'color', 'background']`
  - `multiline: true`
  - `empty: 'keep'`
  - `measure: 'none'`

- `shape.text`
  - `tools: ['size', 'weight', 'italic', 'color', 'align']`
  - `multiline: true`
  - `empty: 'keep'`

- `frame.title`
  - `tools: ['color']`
  - `multiline: false`
  - `empty: 'default'`
  - `defaultText: FRAME_DEFAULT_TITLE`

- `edge label`
  - 在 runtime 内部使用固定 capability
  - `tools: ['size', 'weight', 'italic', 'color', 'background']`
  - `multiline: true`
  - `empty: 'remove'`

## 必须删除的旧实现

以下内容在最终方案下都必须删掉。

### 1. 全局透明 `EditingHost`

必须删除：

- 单一全局 overlay `EditingHost`
- 基于 anchor rect 的透明输入层
- scene 文本和 host 文本双层并存

### 2. renderer 内本地提交协议

必须删除：

- renderer 自己的 `commit()`
- renderer 自己的 `cancel()`
- renderer 自己的 `patch/remove/clear edit`

统一替换为：

- `editor.actions.edit.commit()`
- `editor.actions.edit.cancel()`

### 3. preview patch 型编辑 API

必须删除：

- `editor.actions.edit.nodeText.set`
- `editor.actions.edit.nodeText.clear`
- `editor.actions.edit.nodeText.clearSize`

### 4. toolbar 基于 `node.type` 猜测能力

必须删除：

- `TextStyleToolbar` 中 `type === 'text'`
- `type === 'shape'`
- `sticky 不是 text` 之类的 React 判断

### 5. blur 删除空文本节点

必须删除：

- `text` blur 时读到空字符串直接删 node

替换规则：

- 空文本默认保留
- 删除只能是显式规则或 capability 明确声明

### 6. throw 型 edge projection

必须删除：

- read 层直接暴露 `resolveEdgeView` 的 throw 行为

替换规则：

- 缺端点提前返回 `undefined`
- resolve 失败返回 `undefined`
- 不允许让 scene/chrome/panel 因中间态崩掉

## 最终实施方案

## 阶段 A：回退错误方向

- 移除全局透明 `EditingHost`
- 停止维护“scene 显示文本 + host 透明输入”的双层模型

这是方向纠偏，不是优化。

## 阶段 B：统一 runtime 编辑状态

- `EditTarget` 升级成 `EditSession`
- `draft text / style / measure / caret / status / capability` 收进 runtime
- `editor.actions.edit.*` 收口成最终动作组

## 阶段 C：建立共享 owner-host bridge

- 增加 `useEditableBridge` 或 `EditableSlot`
- composition 期间阻止 runtime -> DOM 回写
- blur/escape/submit 全部统一转发给 runtime

## 阶段 D：各 renderer 切到就地 editable

- `text`
- `sticky`
- `shape`
- `frame title`
- `edge label`

都在原位置就地切换 editable DOM。

## 阶段 E：panel 与 capability 收口

- `panel.textToolbar` 统一由 runtime 提供
- toolbar 只转发 `editor.actions.edit.style(...)`
- definition 中声明各字段 capability

## 阶段 F：清理旧实现

- 删除全局 overlay host
- 删除 preview patch 型编辑 API
- 删除 renderer 本地提交协议
- 删除 toolbar 的 type 猜测逻辑
- 删除 blur 自动删 text

## 行为验收标准

完成后必须满足：

- 点击 `text` / `sticky` / `shape` / `frame title` / `edge label`，第一帧内容不消失
- caret 总是和用户看到的文本严格对齐
- 中文输入法 composition 不被 effect 打断
- 输入法候选窗跟随真实输入位置，不漂到左下角
- `text` / `sticky` toolbar 差异只来自 capability 声明
- `edge label` 可继续旋转编辑，不要求降级为水平编辑
- blur 不再隐式删除 text 节点
- 任意中间态都不会让 edge read throw
- renderer 不再自己做文档提交协议

## 最终一句话

最终最优方案不是：

- “一个全局透明输入层托管所有编辑”

而是：

- 用统一 `EditSession` 管状态
- 用统一 `editor.actions.edit.*` 管生命周期
- 用共享 bridge 管 DOM 输入协议
- 让每个 renderer 在原位置持有真实 editable DOM

也就是：

- 状态集中
- 宿主就地
- 可见文本和可编辑文本合一

这才是文本编辑、caret、composition、IME、测量、toolbar、edge label 旋转能力可以同时稳定成立的最终方向。
