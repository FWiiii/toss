# Toss - 跨设备传输

<p align="center">
  <img src="public/logo.svg" width="120" height="120" alt="Toss Logo">
</p>

<p align="center">
  简单、快速、安全的跨设备文件和文本传输工具
</p>

<p align="center">
  🔒 端到端加密 · ⚡ 设备直传 · 📱 跨平台 · 💻 支持 PWA
</p>

## ✨ 特性

- **设备直传** - 基于 WebRTC 技术，传输内容优先在设备间直接发送
- **端到端加密** - 数据传输全程加密，并提供会话指纹供两端人工核对
- **连接链路可见** - 可查看当前连接是局域网直连、P2P 穿透还是服务器中转
- **无文件大小限制** - 传输速度取决于您的网络环境与当前连接方式
- **跨平台支持** - 支持手机、平板、电脑等任何现代浏览器设备
- **PWA 支持** - 可安装为本地应用，支持系统分享功能
- **暗色模式** - 支持浅色/深色主题切换
- **简洁易用** - 6 位房间代码，一键创建或加入

## 🖼️ 预览

创建或加入房间后，即可在设备间自由传输文本和文件：

- 📝 发送文本消息
- 📁 传输任意类型文件
- 🖼️ 图片预览与下载
- 📋 一键复制房间代码

## 🚀 快速开始

### 环境要求

- Node.js 22.12+（Capacitor 8 与 Vite 8 的共同要求）
- pnpm (推荐) 或 npm

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/toss.git
cd toss

# 安装依赖
pnpm install
```

### 运行

```bash
# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 运行生产版本
pnpm start
```

访问 http://localhost:3000 即可使用。

### 行动端本地入口（Capacitor）

首步已接入 React + Vite 本地入口与 Android / iOS 原生工程。当前页面用于检查本地启动、平台与原生桥接；尚未接入房间或文件传输。网站和 PWA 保持原有入口。

固定版本：Capacitor core / CLI / Android / iOS 8.5.3、App 插件 8.1.2、Vite 8.3.4、React 插件 6.1.2。

```bash
# 浏览器开发：仅用于预览，不代表原生验证通过
pnpm mobile:dev

# 类型检查、生产构建、同步到两个原生工程
pnpm mobile:sync

# 预览生产产物：http://127.0.0.1:4173
pnpm mobile:preview

# 打开原生 IDE
pnpm mobile:open:android
pnpm mobile:open:ios

# 构建并在连接设备 / 已创建模拟器上运行
pnpm mobile:run:android
pnpm mobile:run:ios
```

配置在 `capacitor.config.ts`，本地资源来自 `mobile/dist`；不使用远端 `server.url`，不包含网站 Service Worker、manifest 或 Analytics。共用现有主题、样式和 Button。原生工程位于 `mobile/android`、`mobile/ios`，构建产物不提交；重新拉取后先运行 `pnpm install --frozen-lockfile` 和 `pnpm mobile:sync`。`app.toss.mobile` 是当前开发标识，商店发布前必须统一设置正式 App ID、签名及图标。

Android 需要符合 Capacitor 8 要求的 Android Studio / JDK、SDK Platform 36、对应构建工具，以及已连接设备或已创建 AVD；命令行构建需配置 `JAVA_HOME` 与 SDK 路径。iOS 需要 macOS、Xcode 26+；工程使用 Swift Package Manager，在 Mac 上同步后再打开。

在 App 中点击「检查原生桥接」应返回真实安装名称、App ID 与版本。浏览器会明确提示不能验证原生桥接；Web Crypto / WebRTC 的 API 存在不代表传输已通过测试。

本次验证：移动端类型检查、Vite 构建、两平台资源同步、新增代码 ESLint、Next.js 生产构建通过；390 × 844 浏览器预览的浅色 / 深色界面与按钮操作已验证，无横向溢出、无页面运行错误、无外部资源请求、无 Service Worker 注册。Android / iOS 同步资源的 SHA-256 与 Vite 产物一致。

原生启动尚未验证：当前 Android 构建明确因缺少 Java / `JAVA_HOME` 失败，SDK 仅发现 android-36.1，且无连接设备或 AVD；本机没有 macOS / Xcode，无法编译或启动 iOS。不能把资源同步成功当作两平台已启动成功。

完整后续范围见 [Capacitor 行动 App 计划书](docs/product/capacitor-mobile-app-plan.md)。

## 📖 使用方法

### 基本流程

1. **创建房间** - 在一台设备上点击「创建房间」，获得 6 位房间代码
2. **加入房间** - 在另一台设备上输入房间代码并点击「加入」
3. **开始传输** - 连接成功后，即可发送文本或文件

### PWA 安装

在支持 PWA 的浏览器（如 Chrome、Edge、Safari）中，可以将 Toss 安装为本地应用：

- **桌面端**: 点击地址栏右侧的安装图标
- **移动端**: 使用浏览器菜单中的「添加到主屏幕」

### 系统分享 (Web Share Target)

安装 PWA 后，可以直接从其他应用分享文件到 Toss：

1. 在任意应用中选择「分享」
2. 选择 Toss 作为分享目标
3. 内容会自动加载，连接设备后即可发送

## 🛠️ 技术栈

- **框架**: [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/)
- **样式**: [Tailwind CSS 4](https://tailwindcss.com/)
- **UI 组件**: [Radix UI](https://www.radix-ui.com/)
- **P2P 通信**: [PeerJS](https://peerjs.com/) (WebRTC)
- **图标**: [Lucide React](https://lucide.dev/)
- **主题**: [next-themes](https://github.com/pacocoursey/next-themes)

## 📁 项目结构

```
├── app/                    # Next.js App Router
│   ├── page.tsx           # 主页面
│   ├── layout.tsx         # 根布局
│   ├── share/             # Web Share Target API 路由
│   └── globals.css        # 全局样式
├── components/            # React 组件
│   ├── room-panel.tsx     # 房间面板（创建/加入）
│   ├── transfer-panel.tsx # 传输面板（消息列表）
│   ├── transfer-item.tsx  # 传输项（文本/文件）
│   └── ui/                # 基础 UI 组件
├── lib/                   # 工具库
│   ├── transfer-context.tsx # 传输状态管理
│   ├── types.ts           # TypeScript 类型
│   └── utils.ts           # 工具函数
├── hooks/                 # 自定义 Hooks
│   └── use-share-target.ts # Web Share Target Hook
├── public/                # 静态资源
│   ├── manifest.json      # PWA 配置
│   └── sw.js              # Service Worker
└── styles/                # 样式文件
```

## 🔒 安全说明

- **传输内容**：文本和文件内容优先通过 WebRTC 数据通道在设备间直接发送，不由 Toss 服务端存储。
- **连接建立**：建立连接时需要通过 PeerJS 信令服务器交换建链信息。信令仅用于协调连接，不承载实际传输内容。
- **连接方式**：根据网络环境不同，实际链路可能表现为局域网直连、NAT 穿透后的 P2P 直连，或经 TURN 服务器中转。
- **链路加密**：所有 WebRTC 数据通道默认启用 DTLS 加密；即使在 TURN 中转场景下，传输链路仍受 WebRTC 加密保护。
- **会话校验**：连接建立后会显示短会话指纹，可在两端人工核对当前会话是否一致。

## 🧭 连接模型

为了避免歧义，可以把 Toss 的连接过程理解成两段：

1. **先建立连接**：应用通过信令服务交换建链信息，让两台设备找到彼此。
2. **再传输内容**：连接建立后，文本和文件通过 WebRTC 链路传输，默认不在 Toss 服务端存储。

当网络限制较少时，链路通常会直接建立在两台设备之间；当网络限制较强时，链路可能回退到 TURN 中转，但传输仍由 WebRTC 加密保护。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

---

<p align="center">
  Made with ❤️ for seamless cross-device transfer
</p>
