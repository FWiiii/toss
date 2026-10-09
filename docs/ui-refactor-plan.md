# Toss UI 现代化重构计划

> 目标：重构整个 UI 界面，使其符合 AI 时代现代审美风格（参考 OpenAI、Google Gemini、Anthropic、Linear 等）

---

## 总体策略

| 原则 | 说明 |
|------|------|
| 渐进式重构 | 先建立设计系统，再逐个组件/页面迁移，保持应用可运行 |
| 设计令牌优先 | 所有视觉决策集中在 design-tokens.ts 和 globals.css，组件只消费令牌 |
| CSS-first 动画 | 优先用 CSS 关键帧/过渡，复杂交互才引入 Framer Motion |
| 无障碍基线 | WCAG AA、键盘完整导航、减弱动画偏好、语义化 HTML |
| TypeScript 严格 | 组件 props 严格类型、CVA 变体类型安全、无 any |

---

## 实施阶段

### Phase 1: 设计系统基础
- [x] 1.1 扩充 lib/design-tokens.ts - 色彩、间距、圆角、阴影、动画、字体令牌，同时保留现有状态映射
- [x] 1.2 更新 app/globals.css - 统一浅/深色主题变量、Tailwind v4 动效令牌；页面背景采用纯色
- [x] 1.3 检查 Tailwind 配置 - 项目已使用 Tailwind v4 和 @tailwindcss/postcss，无需旧版 tailwind.config.ts
- [x] 1.4 统一现有 Button、Input、Textarea、Dialog 基础样式与交互反馈；沿用项目已有布局，不为抽象而增加重复组件

验收：实际页面验证主题切换与控件对比度；仓库目前没有 Storybook 配置，先用应用页面验收

---

### Phase 2: 核心布局重构
- [x] 2.1 对齐 viewport 主题色与全局背景色
- [x] 2.2 重构 components/app-client-page.tsx - 加入产品说明区与响应式 Grid 布局
- [x] 2.3 整理 Header - sticky 毛玻璃表面、简化品牌标识和间距
- [x] 2.4 响应式断点 - 移动端单栏、桌面端双栏 sticky

验收：页面骨架稳定、无布局偏移、Header 滚动时玻璃态效果正常

---

### Phase 3: RoomPanel 重构 (Week 2)
- [x] 3.1 状态卡片化 - 连接状态、房间代码、QR Code 统一卡片风格
- [x] 3.2 操作区块重设计 - 主 CTA (创建房间)、次级操作 (加入/扫码) 视觉层级分明
- [x] 3.3 QR Code / Scanner 对话框 - 品牌色装饰角、扫描线动画、Radix Dialog 键盘焦点管理与读屏状态
- [x] 3.4 详情展开面板 - 连接类型、延迟/带宽、安全状态卡片化
- [x] 3.5 空状态插画 - 自定义 SVG、品牌色、微动画

验收：视觉层级清晰、交互流程顺畅、移动端体验优秀

---

### Phase 4: TransferPanel 重构 (Week 2-3)
- [x] 4.1 连接状态条 - 紧凑状态灯、说明与展开详情
- [x] 4.2 传输列表卡片化 - 方向色标识、进度反馈、完成闪光
- [x] 4.3 文件/图片/文本条目差异化 - 图片预览、文本复制、文件下载与传输状态
- [x] 4.4 输入区 - 字符计数、拖拽反馈、剪贴板读取状态与键盘提示
- [x] 4.5 已完成区折叠 - 动画展开、数量徽标与清空操作
- [x] 4.6 接收历史面板 - 过滤标签、记录展开与分批加载，避免一次渲染全部历史

验收：列表 100+ 条目无卡顿、拖拽上传流畅、操作反馈即时

---

### Phase 5: 动画与微交互系统 (Week 3)
- [x] 5.1 页面进场动画 - delight-fade-up、错开延迟
- [x] 5.2 状态转场动画 - 连接建立闪光、进度完成脉冲
- [x] 5.3 交互反馈 - 卡片悬停微升、拖拽提升、按钮过渡
- [x] 5.4 加载反馈 - 按真实摄像头/传输状态显示进度；不为无异步加载场景添加骨架屏
- [x] 5.5 品牌光晕 - Header Logo hover 光晕

验收：动画流畅 60fps、减弱动画模式下优雅降级

---

### Phase 6: 视觉润色与品牌化 (Week 3-4)
- [x] 6.1 品牌色系统 - 通过设计令牌与状态色映射统一应用
- [x] 6.2 Logo 动效 - 采用轻量 CSS hover 光晕，避免侵入式 SVG 路径动画
- [x] 6.3 深色模式 - 主题令牌和组件共用语义色，媒体预览维持独立表面
- [x] 6.4 UI 文档 - docs/ui-system.md 使用指南、交互规范与迁移清单
- [x] 6.5 整体回归测试 - lint、75 项功能测试、生产构建与本地页面 200 响应验证

验收：生产就绪、文档完整、团队可维护

---

## 文件变更清单

### 文件范围
- 复用现有 `components/ui/`、页面结构与 Radix Dialog，不为暂未使用的控件新增依赖或空抽象
- 令牌与动画集中在 `lib/design-tokens.ts`、`app/globals.css`
- 组件改动以 `room-panel`、`connection-status`、`transfer-panel`、`transfer-item`、`transfer-input` 和 `receive-history-panel` 为主
- 使用指南：`docs/ui-system.md`

### 修改文件
app/layout.tsx                    # 引入新布局、字体
app/page.tsx                      # 保持不变 (仅导出 AppClientPage)
components/app-client-page.tsx    # 重写布局逻辑
components/room-panel.tsx         # 重写
components/transfer-panel.tsx     # 重写
components/transfer-item.tsx      # 重写
components/connection-status.tsx  # 重写
components/transfer-input.tsx     # 重写
components/image-thumbnail.tsx    # 适配新设计
components/qr-code-display.tsx    # 适配新设计
components/qr-code-scanner.tsx    # 适配新设计
components/receive-history-panel.tsx # 适配新设计
hooks/ 相关 hooks                 # 仅类型适配，逻辑不变
lib/transfer-context.tsx          # 仅类型适配
lib/utils.ts                      # 新增 cn、格式化工具

### 删除/弃用文件
components/ui/empty-state.tsx     -> 合并到 Card/EmptyState 组件
styles/globals.css                -> 合并到 app/globals.css

---

## 设计令牌规范摘要

### 色彩 (OKLCH)
brand: { base: oklch(0.55 0.15 160), strong: oklch(0.48 0.18 160), subtle: oklch(0.95 0.02 160) }
success: oklch(0.62 0.15 150)
warning: oklch(0.72 0.14 85)
danger: oklch(0.58 0.22 25)
info: oklch(0.58 0.15 240)
surface: { 1: oklch(1 0 0), 2: oklch(0.98 0.003 240), 3: oklch(0.95 0.005 240) }
border: { subtle: oklch(0.9 0.005 240), default: oklch(0.87 0.008 240) }

### 间距 (4px 基础)
space-1 到 space-16 (4px ~ 64px) + 流体 clamp()

### 圆角
xs:4px sm:6px md:8px lg:12px xl:16px 2xl:24px full

### 阴影
xs sm md lg xl + glass (玻璃态)

### 动画
ease-out-expo ease-out-circ ease-spring ease-in-out
duration-fast:120ms base:200ms slow:320ms slower:480ms

---

## 当前状态

- 分支: refactor/ui-modernization
- 基准: main (干净)
- 当前进度: Phase 1-6 的设计与组件迁移已完成；正在执行 lint、测试、生产构建与页面回归验证

---

## 开发规约

1. 每个 PR 单一职责 - 一个 Phase 或一个组件
2. 提交信息规范 - feat(ui): ... fix(ui): ... refactor(ui): ... docs(ui): ...
3. 预览验收 - 每个组件完成后在浏览器手动验收 + 自动化测试
4. 不破坏现有功能 - 重构只改 UI，不改业务逻辑 (hooks、context、lib 核心逻辑保持不变)
