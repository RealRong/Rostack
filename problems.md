 你觉得我想尽量做到spec+plain object+字符串配置来实现装配，shared下面这些基础设施以及上层
  使用方还能进一步简化做到长期最优吗，全面研究后在根目录生成一份文档，尽量把能覆盖的都覆盖
  掉

  dataview/packages/dataview-runtime/src/source/patch.ts 你觉得这个可以下沉吗，先不要写代码

  帮我扫一轮现在的实现，找找有没有这些问题： 1. 类型上因为shared暴露过少导致上层频繁的自己定义或者强转，unknown，any，或者泛型很复杂 2. 还是没有做到spec+plain object+字符串化+callback，而是仍然暴露helper让上层去构建和解析 3. 类似patch的问题，因为重构而导致退化，只能用parse来兜底，delta和类型传递不畅 4. 还存在中间层或者兼容过渡层 总之是尽可能减少helpers和过多的类型，让上层最大化利用底层设施，基于底层设施来构建代码，能统一和复用的就尽量统一，比如 dataview/packages/dataview-core/src/operations/definitions.ts和dataview/packages/dataview-core/src/operations/compile.ts等等这些issues还有compile，你把whiteboard和dataview都扫一遍，然后整理成一份根目录文档


  那你觉得 runtime/sourceInput的问题呢？MutationDelta到Projection的问题解决了，更下游呢

  `runtime/performance.ts`还需要自己去造一套performance收集器吗，能沉到底层吗，既然我们的delta都是统一的了

  检查一下dataview和whiteboard有没有全吃shared基础设施，还存不存在第二套实现的问题

  你觉得 dataview/packages/dataview-engine/src/active/plan.ts  reasons结构如何？算是优化还是退化？

  研究一下 shared/mutation现在对于whiteboard custom还能否优化，这些基础设施对于dataview-core呢，两者之间还有没有共性

  docuemnt reader

  帮我扫一遍dataview里能否用到structural能力

  帮我扫一遍dataview里除了document reader是否还需要其他reader避免过多read和write的helper

  帮我研究一下whiteboard全链路，从whiteboard-core的领域算法和基于shared/mutation的operation架构，到whiteboard-engine的写入连