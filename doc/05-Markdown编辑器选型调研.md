# Markdown 所见即所得编辑器选型调研

> 状态：调研记录 · 2026-08-10  
> 背景：文档以 Markdown 目录为真相源（见 [04-文档存储原则.md](./04-文档存储原则.md)），Web UI 需要可嵌入的编辑器。

## 1. 选型约束（DesignWeave）

- 落盘必须是 **可 Git / 可 Obsidian 打开的 Markdown**（优先 GFM）
- 技术栈：React / Next.js，内网小服务器，多人浏览器
- 用户：软件设计师为主，中文优先；不要求人人会写 md 语法
- 许可：优先 MIT/开源，避免强依赖商业云编辑器

## 2. 三类方案

### A. Markdown 原生（推荐优先评估）

| 方案 | 编辑体验 | 与 md 往返 | 备注 |
|------|----------|------------|------|
| [Vditor](https://github.com/Vanessa219/vditor) | WYSIWYG / 即时渲染(IR，类 Typora) / 分屏(SV) | 直接 md | 中文社区成熟；公式、任务列表、图表等齐全；有 React 封装 |
| [Milkdown](https://milkdown.dev/)（含 Crepe） | WYSIWYG，现代文档风 | md 一等公民（Remark） | MIT；插件化；偏国际 React 生态 |
| [MDXEditor](https://mdxeditor.dev/) | 工具栏式 WYSIWYG | md / mdx | 上手快；包体偏大 |
| [ByteMD](https://github.com/bytedance/bytemd) | 分屏+预览为主 | md | 轻量；严格 WYSIWYG 较弱 |
| Cherry Markdown（腾讯） | 分屏为主 | md | 国内文档场景常见 |

### B. Notion 块编辑器（体验好，md 多为导出）

| 方案 | 特点 |
|------|------|
| [BlockNote](https://www.blocknotejs.org/) | slash 菜单开箱即用；底层 Tiptap；React 友好 |
| [Novel](https://novel.sh/) | Notion 风模板向 |
| [Tiptap](https://tiptap.dev/) | 无头、最灵活；UI 需自建；md 靠扩展双向转换 |

风险：内部模型常为 JSON/HTML，转 md 可能丢细节（注释、部分表格/扩展语法）。与「文件即真相」略拧。

### C. 底层框架 / 传统富文本（成本高或 HTML 中心）

- Lexical、Plate/Slate：能力强，md 桥接与产品 UI 需自建  
- CKEditor / TinyMCE：企业富文本成熟，默认 HTML 中心，授权与内网部署更重  

## 3. 结论倾向

1. **首选 POC：Vditor**（默认 IR 或 WYSIWYG，保留 SV/源码入口）  
   - 与中文用户、md 落盘、三模式切换最合  
2. **对照 POC：Milkdown**  
   - 若更看重现代 React 插件体系与长期定制，再比一轮  
3. **暂不作为主编辑器：纯 BlockNote / 无头 Tiptap**  
   - 除非接受「内部块模型 + 保存时转 md」并单独验收保真度  

可并存策略：Web 默认所见即所得；高级用户可源码模式；也可用 Obsidian 直接改同一 vault 文件。

## 6. 单文件 POC（墨览）性能结论

`tools/markdown-viewer/index.html` 是可独立打开的 Vditor 壳。对 PRD 体量（数千到数万字、少量 Mermaid/公式），**解析本身已经够用**；真正拖慢输入的是按键路径上的 DOM 工作，不是缺一次「更极端」的编译。

### 6.1 已经够用的部分

- Vditor 的 Markdown 引擎是 [Lute](https://github.com/88250/lute)（Go，零正则），浏览器里用的是已编译的 `lute.min.js`（约数 MB 未压缩 / ~500KB gzip）。它本来就是为所见即所得编辑器做的结构化解析，日常文档的 `Md2VditorDOM` 不是主瓶颈。
- 官方 `index.min.js` 已经压缩。再对壳脚本做混淆（uglify/obfuscator）通常只会让标识更长、调试更难，**几乎不加快运行**；gzip 之后体积差也只有几十 KB。
- 把壳代码（选文件夹、IndexedDB、工具条）编成 WebAssembly **没有收益**：热路径全是 `contenteditable`、Selection、CSS、`innerHTML`，WASM 还要付 JS↔WASM 边界成本。

### 6.2 不要优先做的「极端优化」

| 方向 | 为什么现在不划算 |
|------|------------------|
| 编译混淆壳 JS | 壳只有约一千行 DOM 胶水；parse/compile 时间可忽略。混淆还会妨碍内网排查。 |
| 自研 lute.wasm 替换 | Lute 已有 JS 导出；IR 模式每次按键的成本在局部重绘 DOM、高亮、Mermaid/KaTeX，不在再抠一遍解析器。WASM 还要改 Vditor 加载链，和单文件分发拧着。 |
| 把 Mermaid 编成 WASM | 没有官方 WASM 运行时；流程图卡顿来自 SVG 布局与重复初始化，应避免输入时全量重渲染。 |
| 整页虚拟滚动编辑器 | 等于换引擎（CodeMirror 6 / Lexical），放弃 Vditor IR。只有稳定出现 10 万字级文档卡顿时才值得评估。 |

内网若首屏慢，优先 **自建/镜像 Vditor 静态资源**（尤其 `lute.min.js`），不要继续走 jsDelivr。这比 WASM 更能改善「打开就转圈」。

### 6.3 真正有效的优化（已做）

按键时不再每次 `getValue()`（会遍历整棵 IR DOM 还原 Markdown）+ 整表重建侧栏；字数/脏标记改为 180ms 空闲合并。目录扫描不再对每个 `.md` 调 `getFile()`。Mermaid 改为空闲预热，不挡编辑器初始化。纸纹滤镜降到 1 octave 并放到独立合成层。

下一步若仍卡：用 Performance 面板看 IR 输入时的 Recalculate Style / Mermaid `render`。大流程图应保持「预览静态、点进再编辑」，而不是边打字边重排 SVG。

## 4. POC 验收清单（Vditor vs Milkdown）

用同一篇样例 PRD（含：多级标题、列表、任务列表、表格、代码块、链接、引用）验证：

- [ ] 加载 md → 编辑 → 保存后的 diff 是否干净、可预期  
- [ ] 外部用 Obsidian/VS Code 改同一文件后，刷新能否正确重载  
- [ ] 中文输入、IME 是否顺畅  
- [ ] Next.js 客户端组件集成成本（动态 import、SSR）  
- [ ] 包体与首屏性能是否可接受  
- [ ] 许可证与内网离线（CDN/本地静态资源）是否可行  

## 5. 相关链接

- Vditor：https://github.com/Vanessa219/vditor  
- Milkdown：https://milkdown.dev/  
- MDXEditor：https://mdxeditor.dev/  
- BlockNote：https://www.blocknotejs.org/  
- 存储原则：[04-文档存储原则.md](./04-文档存储原则.md)
