# Whiteboard Product + I18n 最终架构方案

这份文档只回答一个问题：

在决定新建 `@whiteboard/product` 之后，whiteboard 产品自己的国际化体系应该怎么落位，才能既不污染 `core / editor / react`，也不破坏已有 `shared/i18n` 的跨产品共享定位。

这份文档只保留一个最终版本，不保留候选设计，不保留兼容路径。

它是 [WHITEBOARD_PRODUCT_PACKAGE_FINAL_ARCHITECTURE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_PRODUCT_PACKAGE_FINAL_ARCHITECTURE.zh-CN.md) 在 i18n 轴上的补充终稿。

---

## 1. 最终结论

最终架构固定为两层：

1. `@shared/i18n`
2. `@whiteboard/product`

职责分工固定如下：

### 1.1 `@shared/i18n`

继续作为跨产品共享的国际化基础设施。

只负责：

1. `Token` 类型系统
2. `token(...) / tokenRef(...) / tokenDate(...) / tokenRange(...)`
3. token resolver 注册与读取机制
4. i18next/react-i18next 适配
5. `I18nProvider`
6. `useTranslation`
7. 通用格式化能力

### 1.2 `@whiteboard/product`

承接 whiteboard 产品自己的国际化资产与产品词汇体系。

只负责：

1. whiteboard 文案 key
2. whiteboard translation resources
3. whiteboard token factories
4. whiteboard token refs 与 resolver 注册
5. preset / catalog / theme / toolbar / panel 的产品文案
6. 所有产品默认 label / description / title 的唯一数据源

一句话概括：

**`shared/i18n` 负责“怎么翻”，`@whiteboard/product` 负责“翻什么”。**

---

## 2. 为什么不能把 `shared/i18n` 并进 `product`

当前 [shared/i18n/src/index.ts](/Users/realrong/Rostack/shared/i18n/src/index.ts) 与 [shared/i18n/src/react.tsx](/Users/realrong/Rostack/shared/i18n/src/react.tsx) 已经表现得很清楚：

它们提供的是通用基础设施，而不是 whiteboard 专属语义。

已经确认的事实：

1. `dataview` 在大量使用 `@shared/i18n`
2. `shared/i18n` 内没有 whiteboard-specific key
3. 它的 API 是抽象 token 与格式化系统，不是产品词库

所以不能把它并入 `@whiteboard/product`。

否则会产生三个问题：

1. `product` 反向变成基础设施包，层级倒挂
2. `dataview` 等其它产品会被迫依赖 whiteboard 产品包
3. 通用 i18n runtime 与产品文案资源再次耦合

这条路不是长期最优。

---

## 3. 为什么 whiteboard 的 i18n 资产必须进 `product`

如果只把 preset/catalog/theme 数据迁到 `product`，却把文案继续散落在 `core / editor / react`，那么迁移是不完整的。

当前已经存在的大量产品文案分布在：

1. edge preset label
2. shape label
3. mindmap preset label / description
4. sticky tone label
5. toolbox menu 文案
6. panel 文案
7. 默认 placeholder / title

这些如果继续裸字符串分散存在，会有四个问题：

1. product 目录不是完整产品源
2. 多语言无法中轴化
3. 未来改名要到处改字符串
4. preset/canvas/theme/catalog 迁了，文案却没迁，边界仍然是脏的

所以：

**whiteboard 的产品 i18n 资产必须和 product catalog 一起迁。**

---

## 4. 最终分层原则

### 4.1 `shared/i18n` 不知道任何 whiteboard 文案 key

禁止放入：

1. `whiteboard.*`
2. `edge.*`
3. `mindmap.*`
4. `sticky.*`
5. `shape.*`

这类产品 key。

### 4.2 `@whiteboard/product` 不实现通用 i18n runtime

禁止在 `product` 里重新造：

1. `Token` 类型
2. provider
3. hook
4. i18next wrapper

`product` 只消费 `@shared/i18n`。

### 4.3 `core / editor / react` 不再持有 whiteboard 产品文案源

允许：

1. 使用 token
2. 使用 key
3. 调用 product resolver

禁止：

1. 再定义产品 label
2. 再定义产品 description
3. 再定义默认文案常量

---

## 5. 新包的 i18n 目录结构

最终建议在 `@whiteboard/product` 中固定为：

```txt
whiteboard/packages/whiteboard-product/
  src/
    index.ts
    i18n/
      index.ts
      keys.ts
      tokens.ts
      register.ts
      resources/
        en.ts
        zh-CN.ts
    palette/
      key.ts
      registry.ts
      defaults.ts
    edge/
      presets.ts
    insert/
      types.ts
      catalog.ts
    mindmap/
      seeds.ts
      presets.ts
      materialize.ts
    node/
      templates.ts
      shapes.ts
    theme/
      whiteboard.css
```

说明：

1. `i18n/keys.ts` 放稳定 key 常量或 key builder
2. `i18n/tokens.ts` 放 token 工厂
3. `i18n/register.ts` 放 whiteboard resolver 注册
4. `i18n/resources/*` 放语言资源

---

## 6. 最终 API 设计

### 6.1 `@shared/i18n` 保持不变

继续暴露：

```ts
export type Token
export type TokenTranslator

export const token: (...)
export const tokenRef: (...)
export const tokenDate: (...)
export const tokenRange: (...)

export const registerTokenResolver: (...)
export const readTokenResolver: (...)

export const I18nProvider: (...)
export const useTranslation: (...)
```

这层不改语义。

### 6.2 `@whiteboard/product/i18n/keys.ts`

最终固定为稳定 key 常量或 key builder。

```ts
export const WHITEBOARD_I18N_KEYS = {
  edgePreset: {
    line: 'whiteboard.edgePreset.line',
    arrow: 'whiteboard.edgePreset.arrow',
    elbowArrow: 'whiteboard.edgePreset.elbowArrow',
    filletArrow: 'whiteboard.edgePreset.filletArrow',
    curveArrow: 'whiteboard.edgePreset.curveArrow'
  },
  toolbox: {
    text: 'whiteboard.toolbox.text',
    frame: 'whiteboard.toolbox.frame'
  }
} as const
```

如果 key 太多，允许改成 builder：

```ts
export const whiteboardEdgePresetLabelKey = (key: string) =>
  `whiteboard.edgePreset.${key}.label` as const

export const whiteboardEdgePresetDescriptionKey = (key: string) =>
  `whiteboard.edgePreset.${key}.description` as const
```

长期最优更偏向 builder，因为它更不容易堆成巨大对象。

### 6.3 `@whiteboard/product/i18n/tokens.ts`

这里不直接暴露裸字符串，而是提供 token 工厂。

```ts
import { token, tokenRef, type Token } from '@shared/i18n'

export const whiteboardTextPlaceholderToken = (): Token =>
  token('whiteboard.node.text.placeholder', 'Text')

export const whiteboardFrameTitleToken = (): Token =>
  token('whiteboard.node.frame.title', 'Frame')

export const whiteboardEdgePresetLabelToken = (preset: string): Token =>
  tokenRef('whiteboard.edgePreset.label', preset)

export const whiteboardMindmapPresetLabelToken = (preset: string): Token =>
  tokenRef('whiteboard.mindmap.preset.label', preset)
```

### 6.4 `@whiteboard/product/i18n/register.ts`

这里负责把 product key 的动态解析注册到 `shared/i18n`。

```ts
import { registerTokenResolver, token, type Token } from '@shared/i18n'
import { getWhiteboardEdgePreset } from '@whiteboard/product/edge/presets'
import { getWhiteboardMindmapPreset } from '@whiteboard/product/mindmap/presets'

export const registerWhiteboardI18nResolvers = () => {
  registerTokenResolver('whiteboard.edgePreset.label', (ref): Token | undefined => {
    const preset = ref.id ? getWhiteboardEdgePreset(ref.id) : undefined
    return preset?.labelToken
      ?? (preset ? token(`whiteboard.edgePreset.${preset.key}.label`, preset.fallbackLabel) : undefined)
  })
}
```

关键点：

1. resolver 注册只在 product 层发生
2. 其它层只消费 token
3. catalog 可以用 token 或 fallback string，但源头在 product

### 6.5 `@whiteboard/product/i18n/resources/en.ts`

资源文件只负责真实语言文本：

```ts
export const whiteboardEnResources = {
  whiteboard: {
    edgePreset: {
      line: {
        label: 'Line'
      },
      arrow: {
        label: 'Arrow'
      }
    },
    node: {
      text: {
        placeholder: 'Text'
      },
      frame: {
        title: 'Frame'
      }
    }
  }
} as const
```

### 6.6 `@whiteboard/product/i18n/index.ts`

统一暴露：

```ts
export { registerWhiteboardI18nResolvers } from './register'
export { whiteboardEnResources } from './resources/en'
export { whiteboardZhCNResources } from './resources/zh-CN'
export * from './tokens'
```

---

## 7. catalog 与 i18n 的最终关系

长期最优不是把最终文案字符串写死在 catalog 里，而是：

1. catalog 持有稳定 key
2. 文案通过 token / resolver 投影

### 7.1 edge preset

最终建议：

```ts
export type WhiteboardEdgePreset = {
  key: string
  create: Pick<EdgeInput, 'type' | 'style' | 'textMode'>
  label: Token
  description?: Token
}
```

或：

```ts
export type WhiteboardEdgePreset = {
  key: string
  create: Pick<EdgeInput, 'type' | 'style' | 'textMode'>
  labelKey: string
  descriptionKey?: string
}
```

两种都可以，但最终只保留一个版本。

我的最终建议是：

**直接存 `Token`，不要只存 `labelKey`。**

原因：

1. 上层组件拿到就能直接 `t(option.label)`
2. 不需要再每次手写 key builder
3. fallback 文案也能直接放进去

### 7.2 insert preset

同理：

```ts
export type WhiteboardNodeInsertPreset = {
  key: string
  group: WhiteboardInsertGroup
  label: Token
  description?: Token
  ...
}
```

### 7.3 shape spec

最终：

```ts
export type WhiteboardShapeSpec = {
  kind: ShapeKind
  group: 'basic' | 'flowchart' | 'annotation'
  label: Token
  defaultText: Token
  ...
}
```

### 7.4 mindmap preset / seed

最终：

```ts
export type WhiteboardMindmapSeed = {
  key: string
  label: Token
  description?: Token
  ...
}

export type WhiteboardMindmapPreset = {
  key: string
  label: Token
  description?: Token
  ...
}
```

---

## 8. 哪些旧裸字符串必须迁走

下面这些类型的字符串必须从 `core / editor / react` 全部迁到 `product/i18n`。

### 8.1 node/template 文案

当前已确认：

1. `Text`
2. `Frame`
3. `Sticky`

### 8.2 edge preset 文案

当前已确认：

1. `Line`
2. `Arrow`
3. `Elbow`
4. `Fillet`
5. `Curve`

### 8.3 sticky tone / format / menu 文案

当前已确认：

1. 各 tone label
2. square / rectangle
3. menu section title

### 8.4 shape 文案

当前已确认：

1. shape label
2. group title
3. defaultText

### 8.5 mindmap 文案

当前已确认：

1. seed label
2. seed description
3. preset label
4. preset description
5. default root topic 文案
6. seed child node 文案

### 8.6 toolbar / panel / menu 文案

当前已确认：

1. edge panel 文案
2. toolbox 菜单文案
3. 未来所有 whiteboard feature menu/panel 的产品文案

---

## 9. `core / editor / react` 的最终使用方式

### 9.1 core

`core` 不应直接依赖 `@shared/i18n`。

原因：

1. core 不该带翻译 token
2. core 只处理模型和算法

所以：

1. core 里不能再出现产品层 label/description
2. 如果某个 core 类型当前有 label 字段，这部分应移到 product wrapper type

### 9.2 editor

`editor` 也不应直接成为 i18n 文案源。

允许：

1. `tool.preset: string`
2. 暴露 runtime read/write/action

不允许：

1. 定义产品 label
2. 定义 preset 文案 key
3. re-export 产品 token

### 9.3 react

`react` 可以直接使用 `useTranslation()` 去渲染 `@whiteboard/product` 提供的 token。

最终模式：

```ts
const { t } = useTranslation()
const option = WHITEBOARD_EDGE_PRESETS[0]
return <span>{t(option.label)}</span>
```

而不是：

```ts
label: 'Arrow'
```

这种裸字符串模式。

---

## 10. `product` 与 app 的装配方式

最终应该在 whiteboard app/runtime 初始化时一次性注册 whiteboard i18n，并注入资源。

例如：

```ts
import {
  registerWhiteboardI18nResolvers,
  whiteboardEnResources,
  whiteboardZhCNResources
} from '@whiteboard/product/i18n'

registerWhiteboardI18nResolvers()
```

然后应用层把资源并到 `I18nProvider`：

```ts
<I18nProvider
  lang={lang}
  resources={{
    en: {
      translation: {
        ...whiteboardEnResources,
        ...otherResources
      }
    },
    'zh-CN': {
      translation: {
        ...whiteboardZhCNResources,
        ...otherResources
      }
    }
  }}
/>
```

关键点：

1. `product` 提供资源
2. app 决定是否装载这些资源
3. `shared/i18n` 仍然只负责 runtime

---

## 11. 完整迁移清单

### 阶段 1：建立 `product/i18n`

1. 新建 `src/i18n/index.ts`
2. 新建 `src/i18n/tokens.ts`
3. 新建 `src/i18n/register.ts`
4. 新建 `src/i18n/resources/en.ts`
5. 新建 `src/i18n/resources/zh-CN.ts`

阶段结束标准：

1. whiteboard product 已有自己的 i18n 入口

### 阶段 2：迁 preset/catalog 文案

迁移来源：

1. edge preset
2. insert preset
3. sticky option
4. shape spec
5. mindmap seed/preset

阶段结束标准：

1. catalog 中不再写死裸字符串文案

### 阶段 3：迁 template/default 文案

迁移来源：

1. `Text`
2. `Frame`
3. 其它默认 placeholder/title

阶段结束标准：

1. 默认产品文案全部由 product token 提供

### 阶段 4：迁 UI menu/panel 文案

迁移来源：

1. toolbox
2. edge menu/panel
3. mindmap panel
4. 其它 whiteboard feature UI

阶段结束标准：

1. React 组件不再作为文案源

### 阶段 5：删除旧导出与裸字符串源

必须删除：

1. `editor` 里关于产品文案的 re-export
2. `react` 里作为源头的 preset label 常量
3. `core` 里任何 whiteboard 产品文案字段

阶段结束标准：

1. whiteboard 产品文案只剩 `@whiteboard/product/i18n`

---

## 12. 最终抉择

如果只保留一句话，最终抉择就是：

**不要把 `shared/i18n` 并入 `product`；要把 whiteboard 自己的产品文案、token、resolver、resources 整体纳入 `@whiteboard/product`。**

具体就是：

1. `shared/i18n` 继续做通用国际化基础设施
2. `@whiteboard/product` 新增 `i18n/*`
3. 所有 whiteboard 产品文案从 `core / editor / react` 迁出
4. product catalog 统一持有 token，而不是裸字符串
5. app 层统一注册 resolver 和 resources

这才是长期最优，而且不会破坏现有跨产品共享 i18n 体系。
