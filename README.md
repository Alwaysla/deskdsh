# DeskDSH

一个面向 Ubuntu 的 DSH 桌面宠物客户端。它把常用对话放进随手可开的悬浮小窗，同时保留完整 DSH 页面用于文件操作、插件管理、设置等功能。

## 当前功能

- 透明、无边框、可拖动的桌面宠物
- 始终置顶、隐藏任务栏，并在 Ubuntu X11/GNOME 下通过 Electron 与 `wmctrl` 双重设置显示在所有工作区
- 点击 💬 打开/收起迷你 DSH 对话窗口
- 点击 ✓ 展开本地待办便签，支持添加、双击编辑、划掉/恢复和永久删除
- 待办未完成数量显示在 ✓ 按钮角标，并持久化到 Electron 用户数据目录的 `todos.json`
- 点击 ▣ 打开完整 DSH 管理窗口
- 自动检查 `http://127.0.0.1:3080`
- DSH 未启动时提供清晰的离线状态和重试按钮
- 自动保存宠物位置；显示器变化后会回退到可见区域
- 系统托盘提供恢复宠物、迷你对话、完整 DSH、重连和退出入口
- 外部链接交给系统浏览器，禁止内嵌页面跳往非 DSH 来源

迷你窗口直接加载 DSH 官方 Web 页面，因此会跟随当前 DSH 版本，自然具备会话、审批、工具卡片等能力。完整窗口提供文件、插件和设置等全部菜单。

## 环境要求

- Ubuntu
- Node.js 20 或更新版本
- 已可访问的 DSH Web：`http://127.0.0.1:3080`
- 首版推荐 X11；XWayland 通常也可用

> 原生 Wayland 会限制应用强制置顶、跨工作区和精确窗口定位。这是桌面协议限制，不是 DeskDSH 单独能够完全绕过的问题。
>
> Ubuntu 24.04 默认通过 AppArmor 限制非特权用户命名空间，因此 Electron 开发版需要配置其 SUID sandbox。运行一次 `npm run setup:sandbox`，按提示输入 sudo 密码即可。`npm install` 重装 Electron 后可能需要重新配置。

## 安装与运行

```bash
cd /home/alwaysla/deskdsh
npm install
npm run setup:sandbox
npm start
```

安装到 Ubuntu 应用菜单：

```bash
npm run install:desktop
```

如果当前 Ubuntu 会话是 Wayland，但希望 Electron 通过 XWayland 运行：

```bash
npm run start:x11
```

若只是想立即测试且暂时不配置 SUID sandbox，可使用：

```bash
npm run start:x11:unsafe
```

这会传递 Chromium 的 `--no-sandbox`，仅建议用于你信任的本机 DSH 临时测试，不建议长期使用。

若 DSH 使用其他本机端口：

```bash
DSH_URL=http://127.0.0.1:其他端口/ npm start
```

出于安全考虑，地址必须是本机回环地址 `http://127.0.0.1[:端口]/`；DeskDSH 不会把带控制能力的窗口桥接给远程网页。

## 使用方式

- **拖动宠物**：按住宠物人物区域或顶部状态条拖动。
- **✓**：展开待办便签；圆圈切换划掉状态，双击文字编辑，× 永久删除。
- **💬**：展开迷你对话窗口。
- **▣**：打开完整 DSH 页面，进行文件、插件、设置等操作。
- **↻**：重新检查 DSH 服务。
- **×**：退出 DeskDSH。

迷你对话顶部的浮动条可拖动窗口，并提供打开完整面板、最小化和收起按钮。

## 开发检查

```bash
npm run check
```

## 当前限制与下一步

1. 当前宠物使用 `dsh.jpg` 参考图，后续可制作透明背景的逐帧/WebM/Lottie 动画和不同角色皮肤。
2. 迷你对话首版复用完整 DSH 响应式页面，而不是重新实现一套 API 客户端，因此兼容性高，但仍会保留窄屏侧栏入口。
3. 原生 Wayland 下的置顶和跨工作区属于实验支持；正式发行前应分别测试 GNOME、KDE、多显示器和缩放。
4. 后续可加入开机自启、通知提醒、语音唤醒、`.deb` / AppImage 打包。

## 架构

- `src/main.cjs`：Electron 主进程、宠物/待办/聊天/管理窗口、DSH 探活和安全导航策略
- `src/pet.html` / `src/pet.css` / `src/pet.js`：桌面宠物界面
- `src/todo.html` / `src/todo.css` / `src/todo.js`：待办便签界面
- `src/todos-store.cjs`：待办的校验、原子持久化和增删改状态逻辑
- `src/pet-preload.cjs`：宠物窗口的最小 IPC API
- `src/dsh-preload.cjs`：DSH 窗口控制条和最小 IPC API
- `src/offline.html`：DSH 不可用时的回退页面
