# Whiteboard Product Remaining Work Final

这份文档不复述历史方案，也不兼容旧文档。

它只回答一个问题：

**以“`editor` 只做纯 runtime，`product` 只做 whiteboard 产品数据源，`react` 只做 UI 视图层”为最终目标，当前还有哪些事情没做完，应该如何一次性收口。**

---

## 1. 最终目标

最终状态固定为：

1. `@whiteboard/core` 只保留通用类型、算法、模板实例化与几何语义。
2. `@whiteboard/editor` 只保留运行时、session、input、query、actions、writes，不再暴露任何“像工具箱”的产品子模块。
3. `@whiteboard/product` 成为 whiteboard 产品默认值、catalog、theme、i18n、template 的唯一源头。
4. `@whiteboard/react` 只消费 `editor` 和 `product`，负责菜单、toolbar、panel、DOM 适配与视觉渲染。

一句话：

**product 提供产品语义，editor 执行运行时语义，react 只做呈现。**

---

## 2. 当前还没收干净的核心问题

### 2.1 `editor` 里仍然保留了 draw 的独立 public surface

当前状态：

1. `whiteboard/packages/whiteboard-editor/package.json` 仍然导出 `./draw`
2. `whiteboard/packages/whiteboard-editor/src/session/draw/index.ts` 仍然作为单独的 barrel 暴露给外部
3. `react` 有多处直接 import `@whiteboard/editor/draw`

这不是 product 污染本身，但它说明：

1. `editor` 还没有完全收敛成单一 runtime 入口
2. draw 仍然以“对外工具模块”的形态存在
3. 外层 UI 代码仍然绕过 `editor` 主接口，直接绑定 editor 内部 session 子域

最终要求：

1. `editor` 不再导出 `@whiteboard/editor/draw`
2. draw 相关类型与读取能力如果需要对外暴露，只从 `@whiteboard/editor` 主出口暴露
3. `react` 不再 import editor 的 session 子路径

### 2.2 draw 默认值仍然写死在 `editor`

当前状态：

1. `whiteboard/packages/whiteboard-editor/src/session/draw/state.ts` 里存在 `WHITEBOARD_DRAW_DEFAULTS`
2. 这些默认值直接写了 whiteboard palette token 与宽度配置

问题：

1. 这是 whiteboard 产品默认值，不是 editor runtime 语义
2. 如果未来换产品或换 draw preset，editor 不应跟着改
3. `editor` 现在仍然知道 whiteboard 的配色和默认笔刷布局

最终要求：

1. `DrawState`、`DrawStyle`、normalize/read/patch 这类结构性能力保留在 `editor`
2. whiteboard draw 默认 slot、颜色、宽度迁到 `@whiteboard/product`
3. `createEditor(...)` 初始化 draw session 时只接收外部传入的初始值，或者由上层在创建 editor 前组装好

### 2.3 `@whiteboard/product` 的 theme 资产导出未落地完成

当前状态：

1. `whiteboard/packages/whiteboard-product/package.json` 导出了 `./theme/whiteboard.css`
2. 但当前仓库没有 `whiteboard/packages/whiteboard-product/src/theme/whiteboard.css`

问题：

1. 包导出与实际文件不一致
2. 产品主题资产还没有真正完成打包落位
3. 文档和代码状态不一致

最终要求：

1. 补齐 `@whiteboard/product/theme/whiteboard.css`
2. 所有 whiteboard palette/theme CSS 变量从这里成为唯一源头
3. `react` 或 demo app 只 import 这一份 product theme CSS

### 2.4 product i18n 只迁了一半，仍有大量裸字符串

当前状态：

1. `@whiteboard/product` 已有 `i18n/keys.ts`、`tokens.ts`、`resources/*`
2. 但 edge preset、mindmap seed/preset、insert catalog 里仍然直接写 label/description 裸字符串
3. `react` 的 toolbar/menu/panel/context menu 里仍然有大量裸字符串

问题：

1. product 文案源还没有真正中轴化
2. react 仍然承担部分产品文案定义职责
3. 未来换语言或统一改名仍然需要跨包搜索字符串

最终要求：

1. `product` 内所有产品 catalog 的 label/description/title 改为 token 或稳定 key + fallback
2. `react` 不再定义 whiteboard 产品文案源
3. context menu、toolbox、edge ui、selection panel 等 whiteboard 文案统一从 `product/i18n` 或共享 token 获取

### 2.5 `react` 里仍然保留一部分 product catalog

当前状态：

1. `whiteboard/packages/whiteboard-react/src/features/edge/ui/catalog.tsx` 里仍然定义 edge type/dash/textMode/preset 的 UI catalog
2. 这些数据里仍然包含产品 label、preset label、分组与展示信息
3. toolbox 侧也还残留部分对产品默认值的直接依赖

问题：

1. `react` 依然是某些产品目录的实际源头
2. 目录数据和 UI 组件耦合
3. icon/glyph 可以留在 react，但 catalog 不应继续留在 react

最终要求：

1. `react` 只保留图标、glyph、组件
2. `product` 统一输出 edge ui 所需的 catalog 数据
3. `react` 只负责把 `product` catalog 映射成按钮、菜单和面板

### 2.6 根目录文档自身仍然前后冲突

当前状态：

1. 一部分文档还是旧的 `policy` / 注入思路
2. 一部分文档已经切到新的 `preset -> template`
3. 文档之间存在代际差异

问题：

1. 同一件事有多套结论
2. 后续重构无法以单一文档作为依据
3. 容易在实现时误回旧设计

最终要求：

1. 以“`preset -> template`，editor 不知道 preset/product/policy”为唯一准则
2. 旧的 policy / 注入类文档不再作为实施依据
3. 后续实现只以本文件和之后更新的最终文档为准

---

## 3. 最终抉择

这里明确所有仍有歧义的点。

### 3.1 draw 是否还应该作为 `editor` 独立子出口存在

最终结论：

**不应该。**

理由：

1. draw 是 editor 内部 session 的一个子域，不是 editor 对外的独立产品模块
2. 单独导出 `@whiteboard/editor/draw` 会鼓励上层直接耦合 editor 内部目录结构
3. 长期最优是 `editor` 只有主出口，最多按稳定能力域在主出口里暴露类型

最终做法：

1. 删除 `./draw` subpath export
2. 需要对外公开的 draw 类型和 helper 统一从 `@whiteboard/editor` 主出口导出
3. `react` 全量改为从 `@whiteboard/editor` 主入口取 draw 相关类型

### 3.2 draw 默认值应该放哪

最终结论：

**放到 `@whiteboard/product`。**

理由：

1. 默认颜色、默认宽度、默认 slot 是产品决策
2. `editor` 只需要知道 draw state 长什么样，以及如何读取和更新
3. 这和 node/edge/mindmap 的 template 默认值性质完全一致

最终做法：

1. `@whiteboard/product` 提供 `createWhiteboardDrawState()` 或 `WHITEBOARD_DRAW_STATE`
2. `editor` 在初始化 session 时只接收 `DrawState`
3. `editor` 内部不再出现 `var(--wb-palette-...)` 这种 whiteboard 产品 token

### 3.3 edge type/dash/textMode 这些 catalog 应该放哪

最终结论：

**数据放 `@whiteboard/product`，图标放 `@whiteboard/react`。**

理由：

1. 类型列表、宽度列表、展示 label、preset list 都是产品 UI 数据
2. 但 svg glyph 和 React component 明显属于视图层

最终做法：

1. `product` 输出纯数据 catalog，例如 key、value、token、排序、分组
2. `react` 用 key 映射本地 icon 组件
3. `react` 不再自己写一份产品目录常量

### 3.4 product i18n 的最终主模型是什么

最终结论：

**catalog 持有稳定 key 或 token，不再把裸字符串当唯一源。**

理由：

1. 只有这样 product 才真的是唯一词汇源
2. catalog、toolbar、menu、preset、theme 才能一致
3. fallback string 可以存在，但只能作为兜底，不再作为主语义

最终做法：

1. `product/i18n` 提供稳定 key 与 token builder
2. `product` 的 edge/insert/mindmap/palette catalog 统一挂 token 或 labelKey/descriptionKey
3. `react` 使用 `shared/i18n` 翻译，不再自己写产品裸文案

### 3.5 `product` 包导出应该怎么做

最终结论：

**保留主出口，补齐主题资源；是否再加细粒度 subpath，不作为当前阻塞项。**

理由：

1. 当前最实际的问题是导出了不存在的 css
2. 真正的边界问题不是 subpath 数量，而是谁是数据源
3. 先把包内容和导出的一致性做好，再决定是否拆更细的公共子路径

最终做法：

1. 补齐 `./theme/whiteboard.css`
2. 确保主出口已完整覆盖 palette / edge / insert / node / mindmap / i18n
3. 后续若需要 tree-shaking 或更稳的边界，再单独加子路径，但不是本轮硬要求

---

## 4. 必须完成的实施项

下面是必须一次性做完的清单。

### 阶段 1：收掉 `editor/draw` 子出口

目标：

1. 删除 `@whiteboard/editor/draw`
2. 所有外部调用统一改走 `@whiteboard/editor`

要做的事：

1. 删除 `whiteboard/packages/whiteboard-editor/package.json` 的 `./draw` 导出
2. 保留 draw session 内部文件夹，但不再作为 public subpath
3. 将外部真正需要的 draw 类型与 helper 回收到 `whiteboard/packages/whiteboard-editor/src/index.ts`
4. 修改 `react` 中所有 `@whiteboard/editor/draw` import

完成判定：

1. 仓库内不再存在 `@whiteboard/editor/draw` 引用
2. `editor` 不再通过 package exports 暴露 draw 子路径

### 阶段 2：把 whiteboard draw 默认值迁入 `product`

目标：

1. `editor` 不再持有 whiteboard draw 默认配置

要做的事：

1. 在 `@whiteboard/product` 新增 draw 目录
2. 定义 whiteboard draw 默认 state
3. editor 初始化时改为接收 product 组装后的 draw 初始值
4. 删除 `editor` 内部的 whiteboard draw 默认常量

完成判定：

1. `editor/session/draw/*` 不再出现 whiteboard palette token
2. `editor` 里不再出现 `WHITEBOARD_DRAW_*` 这种产品命名

### 阶段 3：补齐 product theme 资产

目标：

1. `@whiteboard/product` 的 CSS 主题导出真实可用

要做的事：

1. 新建 `whiteboard/packages/whiteboard-product/src/theme/whiteboard.css`
2. 将 whiteboard palette/theme CSS 变量统一收进去
3. app/react 改为从 `@whiteboard/product/theme/whiteboard.css` 读取

完成判定：

1. package exports 不再指向不存在文件
2. 主题变量来源只有一份

### 阶段 4：把 product i18n 真正收成唯一源

目标：

1. 产品文案全部回到 `@whiteboard/product`

要做的事：

1. edge preset label 迁成 token/key
2. insert catalog label/description 迁成 token/key
3. mindmap seed/preset label/description 迁成 token/key
4. sticky/shape/palette UI 文案迁成 token/key
5. react 菜单、toolbar、panel、context menu 中仍作为产品源头的裸字符串全部清掉

完成判定：

1. `product` catalog 不再以裸字符串作为唯一文案源
2. `react` 不再定义 whiteboard 产品 label/description 常量

### 阶段 5：把剩余 product catalog 从 `react` 收回 `product`

目标：

1. `react` 不再维护 edge/toolbox 的产品目录数据

要做的事：

1. 抽离 edge type/dash/textMode/width/preset catalog 到 `@whiteboard/product`
2. 保留 react 本地图标映射层
3. toolbox、edge toolbar、菜单、panel 统一消费 product catalog

完成判定：

1. `whiteboard-react` 中不再存在以 label/value/template 为主的数据源 catalog 常量
2. `react` 只保留 UI 组件和 icon/glyph 映射

### 阶段 6：统一根目录文档依据

目标：

1. 后续实现只依赖一套最终结论

要做的事：

1. 清理或废弃旧的 `policy` / 注入类设计文档
2. 统一明确 `preset -> template` 是唯一产品创建链路
3. 保证新文档和实际代码边界一致

完成判定：

1. 根目录不再存在与当前实现方向冲突的 product 最终文档
2. 后续开发者只需看一套结论即可继续推进

---

## 5. 本轮重构后的最终边界

### 5.1 `@whiteboard/core`

保留：

1. `NodeTemplate` / `EdgeTemplate` / `MindmapTemplate`
2. 模板实例化
3. 通用 geometry / reducer / schema / algorithm

不再放：

1. whiteboard 默认 palette
2. whiteboard draw 默认值
3. whiteboard 产品文案
4. whiteboard 工具目录数据

### 5.2 `@whiteboard/editor`

保留：

1. `createEditor`
2. session / input / query / write / actions
3. draw state 的结构与运行时变更能力

不再放：

1. whiteboard draw 默认值
2. product preset key
3. product catalog
4. 独立的工具箱式 public subpath

### 5.3 `@whiteboard/product`

保留：

1. whiteboard palette
2. whiteboard theme css
3. whiteboard draw default state
4. edge/insert/mindmap/node catalog 与 template
5. whiteboard i18n keys/tokens/resources

### 5.4 `@whiteboard/react`

保留：

1. toolbar / menu / panel / canvas component
2. DOM 和 React 视图实现
3. glyph / icon / visual component
4. 将 product catalog 渲染成 UI

不再放：

1. product data 源
2. 产品默认值
3. 产品裸文案源

---

## 6. 最终验收标准

全部完成后，必须同时满足下面这些条件：

1. `editor` 包不再导出 `@whiteboard/editor/draw`
2. `editor` 内不再出现 whiteboard draw 默认配置
3. `@whiteboard/product/theme/whiteboard.css` 真实存在并成为主题唯一源
4. edge/insert/mindmap/sticky/shape 的产品文案源统一收回 `product`
5. `react` 不再维护 edge/toolbox 的产品 catalog 源数据
6. 根目录 product 方向只保留一套最终、互不冲突的设计依据

如果上述 6 条中有任意一条未满足，就不算完成。

---

## 7. 下一步执行顺序

为了降低返工，实施顺序固定如下：

1. 先收 `editor/draw` public surface
2. 再迁 draw 默认值到 `product`
3. 再补齐 product theme CSS
4. 再迁 product i18n 和 catalog
5. 最后清理旧文档和遗留导出

这个顺序的原因很简单：

1. 先把边界收正
2. 再把默认值和目录数据迁过去
3. 最后再统一文档与清理残留

这样返工最少，也最不容易重新把 product 语义塞回 editor/react。
