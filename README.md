# 八音 (BaYin)

一款基于 Tauri + React 的跨平台桌面音乐播放器。

## 技术栈

- **桌面框架**: [Tauri 2](https://tauri.app/) (Rust)
- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件**: Radix UI + Tailwind CSS
- **状态管理**: React Context
- **路由**: React Router

## 项目结构

```
BaYin/
├── src-tauri/          # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── lib.rs      # 主入口，插件注册
│   │   └── main.rs
│   ├── capabilities/   # 权限配置
│   ├── icons/          # 应用图标
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src-ui/             # 前端子仓库 (React)
│   ├── src/
│   │   ├── components/ # UI 组件
│   │   ├── context/    # 状态管理
│   │   ├── services/   # Tauri 服务层
│   │   └── routes.ts   # 路由配置
│   ├── package.json
│   └── vite.config.ts
│
└── package.json
```

## 功能特性

- 本地音乐库管理（歌曲、专辑、艺术家）
- 歌单创建与管理
- 播放队列
- 多种播放模式（顺序、随机、单曲循环）
- 歌词显示
- 深色/浅色主题
- Navidrome 服务器集成

## 开发环境

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri 依赖](https://tauri.app/start/prerequisites/)

### 安装依赖

```bash
# 安装子仓库前端依赖
cd src-ui
npm install

# 返回主目录
cd ..
```

### 运行开发环境

```bash
npx tauri dev
```

### 构建生产版本

```bash
npx tauri build
```

## 子仓库说明

前端 UI (`src-ui`) 作为 Git 子模块管理，可以独立开发：

```bash
# 独立运行前端（浏览器预览）
cd src-ui
npm run dev
```

在浏览器环境下，Tauri API 会自动降级为 mock 数据。

## Services 层

`src-ui/src/services/` 封装了所有 Tauri 相关调用：

| 模块 | 功能 |
|------|------|
| `audio.ts` | 音频播放控制 |
| `scanner.ts` | 本地音乐扫描 |
| `storage.ts` | 持久化存储 |
| `opener.ts` | 外部链接打开 |
| `tauri.ts` | 环境检测工具 |
