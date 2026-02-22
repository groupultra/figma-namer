在当前 AI 辅助编程（如 Cursor、Windsurf、Claude Code）大爆发的背景下，“Design-to-Code（设计到代码）”最大的瓶颈已经不是大模型的代码生成能力，而是“语义鸿沟（Semantic Gap）”。

你提到的**“利用截图和视觉上下文，高亮特定组件交由视觉大模型（VLM）处理”**，正是目前顶级多模态 AI Agent 在解析 UI 界面时采用的最前沿策略——学术界称之为 Set-of-Mark (SoM) Prompting（视觉标记提示技术）。

我将为你详细梳理 Figma API/MCP 的现状、最适合大模型的命名规范，并为你量身定制这个自动化工具的落地计划。

一、 调研：Figma API、接口与 Figma MCP 现状
为了实现这个工具，我们需要明确不同接口的权限边界：

Figma Plugin API（你的主战场）

能力：运行在 Figma 客户端内部的沙箱环境中（基于 TypeScript/JS）。

权限：拥有对设计稿的最高读写权限。它可以遍历图层树（DOM），获取任何节点的绝对坐标（absoluteBoundingBox），导出局部/全局截图（exportAsync），并且可以直接修改图层名称（node.name = "新名字"）。

结论：你的工具必须以 Figma Plugin 的形态开发。

Figma REST API

能力：用于外部服务器通过 HTTP 请求获取设计稿数据。

局限：基本是只读的。它无法直接修改设计稿内的图层名，因此不适合做重命名工具的回写操作。

Figma MCP (Model Context Protocol)

现状：Anthropic 推出 MCP 协议后，Figma 官方和社区迅速跟进发布了 MCP Server。当你在 Cursor 中说“帮我把这个设计稿写成代码”时，MCP 会把选中组件的 DOM 树、属性变量提取为 JSON 喂给大模型。

痛点即机会：MCP 遵循“Garbage in, garbage out”。如果设计稿里全是 Frame 1142、Rectangle 3，大模型会耗费大量 Context Token 去“盲猜”这些节点的业务逻辑，进而导致生成的代码结构混乱（满屏的无意义 div）。你的工具就是 Figma MCP 的“前置清洗器”，由 AI 来为 AI 提供极其精确的语义元数据。

二、 什么样的命名对大模型（Context Window）最友好？
大语言模型（LLM）处理的是文本 Token。一个完美的命名必须具备高信息密度、结构化、去冗余、强业务语义。大模型不需要知道它是“蓝色圆角矩形”，它需要知道这是“禁用状态的安卓端登录提交按钮”。

🌟 黄金命名公式：
[平台/场景] / [模块] / [组件或元素] - [核心语义] - [状态/修饰]
(推荐使用 / 划分层级，用 - 连接属性。在 Figma 中 / 会自动生成嵌套菜单，同时这种结构极度契合 LLM 的分词习惯)

绝佳命名范例（让大模型在 Context 中“秒懂”）：
1. 交互组件级 (Components & Inputs)

❌ 差：Btn 1, Login Btn

✅ 优：Android / AuthBottomSheet / Button - LoginSubmit - Disabled

💡 LLM 视角：“这是一个安卓端底部弹窗里的登录提交按钮，当前是禁用态。我会直接生成带 disabled 属性的 Material 风格代码。”

✅ 优：Web / Checkout / TextInput - PromoCode - ErrorState

2. 布局与容器级 (Layouts & Frames)
(明确告诉 LLM 这里该用 Flexbox 还是 Grid，是横向还是纵向，防止它生成绝对定位的垃圾代码)

❌ 差：Frame 113, Group 23

✅ 优：Global / UserProfile / CardContainer_VStack - Active

✅ 优：iOS / ProductGallery / ImageGrid - 3Columns_Scrollable

✅ 优：Web / GlobalNav / ActionButtons_HStack

3. 细碎图层级 (Layers, Icons & Texts)

❌ 差：Vector 4, Rectangle 2

✅ 优：System / Icon - ChevronRight - 24px

✅ 优：ProductDetail / TextLabel - OriginalPrice - Strikethrough (带删除线的原价文本)

✅ 优：Decorative / BackgroundPattern - IgnoreInCode (明确告诉大模型这是纯装饰，写代码时忽略，直接切图即可)

三、 自动化命名工具的架构设计（验证你的天才思路）
单纯把 Figma 导出的长篇 JSON 发给大模型，它会迷失在嵌套的 AutoLayout 地狱中；单纯截一个小按钮的图发过去，它又不知道这个按钮在整个页面的什么业务场景下。

你的思路——整体导出图片，利用截图和视觉化的 context 信息，高亮特定组件——是目前多模态大模型解决 GUI 解析的最强解法（Set-of-Mark）。

核心数据流设计（最佳实践）：
遍历与清洗（Figma Plugin）：

递归遍历用户选中的整个页面或 Frame。

智能过滤：忽略纯背景色块、单根线条，只提取有业务意义的节点（包含文本的 Frame、Group、Button 等），记录它们的 id 和绝对坐标 absoluteBoundingBox。

获取全局底图（Figma Plugin）：

调用 figma.exportAsync({ format: 'PNG' }) 导出当前整个 Frame 的高清原图。

离屏打标高亮（Plugin UI / Canvas）：

安全策略：不要直接在 Figma 画布上画红框（容易弄脏原稿或崩溃导致无法撤销）。

在插件的 HTML Iframe 前端中，利用 <canvas> 将导出的底图画上去。

根据提取到的坐标，在 Canvas 上对应的位置画出半透明红色遮罩，并在边角打上醒目的数字编号（如 🟥[1], 🟥[2], 🟥[3]），重新导出为一张打满标签的 Base64 图片。

组大多模态 Prompt 请求 VLM（GPT-4o / Claude 3.5 Sonnet）：

输入：打好标签的整图 + 简短的文本辅助信息（如：节点1的内部文字是"Log In"，防止模型产生 OCR 幻觉）。

Prompt 示例：

“你是一个世界级的 UX 工程师。请看这张 UI 图，图中有 [1] 到 [15] 个高亮标记的组件。结合界面的全局上下文，请为它们生成精准的语义化命名。
严格遵循格式：[平台]/[模块]/[组件]-[语义]-[状态]。
返回 JSON 格式，Key 为编号，Value 为新命名。”

回写与确认（Figma Plugin）：

拿到 JSON 后，不要盲目自动覆盖。在插件面板渲染一个列表展示：[原名字] ➔ [AI 建议新名字]。

设计师扫一眼无误后，点击 “Apply All”，插件执行 node.name = newName，瞬间完成极度精细的命名。

四、 你的开发计划 (Action Plan)
为了把这个极具价值的工具做出来，我建议你分为四个阶段推进：

Phase 1: 核心概念验证与 Prompt 炼丹 (1-2天)
目标：不用写一行代码，先验证大模型的理解力。

行动：

在 Figma 中手动导出一张复杂的 App 界面图。

用画图软件手动在几个关键组件上画几个红框，写上数字 1, 2, 3。

将图片发给 ChatGPT (GPT-4o) 或 Claude 网页版，使用上述 Prompt 进行测试。不断微调你的 System Prompt，直到输出的命名 100% 符合规范。

Phase 2: Figma 插件基础管道建设 (MVP) (3-5天)
目标：实现自动化获取坐标、截图并打标签。

行动：

初始化 Figma 插件（React + TypeScript）。

编写算法：遍历选中的顶级 Frame，收集子节点的 id 和 absoluteBoundingBox。

实现在插件 UI（Iframe）中使用 Canvas 绘制底图，并在对应坐标上叠加红色数字序号，最后输出 Base64。

Phase 3: AI 对接与批量处理优化 (3-5天)
目标：连接大模型，实现自动化流水线。

行动：

搭建一个轻量级的 Serverless 后端（Node.js / Vercel Edge），因为 Figma 插件前端不能直接暴露大模型 API Key。

分批次处理 (Batching)：如果一个页面有 100 个元素，让 VLM 一次性命名容易遗漏。可以在 Canvas 上每次只高亮 15 个元素，分批向大模型请求。

Phase 4: 人在回路 (Human-in-the-Loop) 与商业化包装 (持续迭代)
目标：安全、可控，打造杀手级卖点。

行动：

在插件 UI 中提供一个输入框，让设计师手动填一句**“全局上下文提示”**（例如：“这是一个医疗 SaaS 系统的 iPad 端门诊大屏”），这会让 AI 的命名准确率飙升。

完成确认回写 UI。

宣传：主打 “The Missing Pre-processor for Figma MCP”。录制对比视频：展示未经处理的 Figma 稿件输入 Cursor 产生的混乱代码，对比使用你插件一键命名后，Cursor 瞬间生成的带状态、带清晰组件划分的极品生产级代码。
