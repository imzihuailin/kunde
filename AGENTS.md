# AGENTS.md

## Project

Kunde is a local-first EPUB reader built with React, TypeScript, and Vite.
# Kunde 是一个基于 React、TypeScript 和 Vite 构建的本地优先 EPUB 阅读器。

Core features:
# 核心功能：

- Local EPUB import
  # 本地导入 EPUB
- Bookshelf management
  # 书架管理
- Full-screen reading
  # 全屏阅读
- Reading progress persistence
  # 阅读进度持久化
- Reader style customization
  # 阅读样式自定义

## Structure

- `src/pages`: Page-level views
  # `src/pages`：页面级视图
- `src/components`: Reusable UI components
  # `src/components`：可复用 UI 组件
- `src/utils`: Storage, formatting, and reader settings
  # `src/utils`：存储、格式化和阅读设置
- `src/types`: Third-party type declarations
  # `src/types`：第三方类型声明
- `public`: Static assets, including reader backgrounds
  # `public`：静态资源，包括阅读背景图

## Commands

Install dependencies:
# 安装依赖：

```bash
npm install
```

Start development server:
# 启动开发服务器：

```bash
npm run dev
```

Build for production:
# 构建生产版本：

```bash
npm run build
```

Run lint:
# 运行 lint：

```bash
npm run lint
```

Preview production build:
# 预览生产构建结果：

```bash
npm run preview
```

## Debugging Notes

- If the reader opens fine on the first attempt in development but hangs on the second open, check React `StrictMode` before blaming EPUB parsing or device performance.
  # 如果阅读器在开发环境里首次打开正常、第二次打开卡住，先检查 React `StrictMode`，不要第一时间怀疑 EPUB 解析或设备性能。
- `StrictMode` intentionally re-runs effects in development. Avoid one-shot guards like `initAttemptedRef` inside reader initialization effects when cleanup also flips cancellation flags, or the second real init can get skipped.
  # `StrictMode` 会在开发环境中故意重复执行 effect。阅读器初始化 effect 里要避免使用 `initAttemptedRef` 这类“一次性防重”逻辑，尤其是在 cleanup 还会修改取消标记时，否则第二次真正初始化可能被自己拦掉。
- For reader startup bugs, instrument the pipeline as separate checkpoints: `db load -> initialize:start -> epub instance created -> epub.ready -> renderTo -> waitForInitialDisplay`.
  # 排查阅读器启动问题时，要把链路拆成独立检查点：`db load -> initialize:start -> epub instance created -> epub.ready -> renderTo -> waitForInitialDisplay`。
- If logs stop immediately after `epub.ready` in development, suspect effect lifecycle / cancellation logic before suspecting `display()` or saved `locationCfi`.
  # 如果开发环境日志停在 `epub.ready` 之后，优先怀疑 effect 生命周期或取消逻辑，再去怀疑 `display()` 或保存的 `locationCfi`。
- Keep startup recovery conservative. Do not persist `locationCfi` during initialization, and only persist after explicit user-triggered navigation once the reader is stable.
  # 启动恢复要尽量保守。初始化阶段不要持久化 `locationCfi`，只有在阅读器稳定后、且由用户明确触发翻页/跳转时才允许覆盖保存位置。
- When debugging reader startup, surface the latest internal checkpoints in the loading UI in development so issues can be diagnosed without opening DevTools.
  # 调试阅读器启动问题时，开发环境应把最新内部检查点直接显示在加载 UI 上，这样即使不打开 DevTools 也能定位问题。
## Encoding Rules

- Treat all repo source files as UTF-8 text.
- When editing files that contain Chinese text, preserve UTF-8 encoding and do not save them as ANSI, GBK, or any locale-dependent encoding.
- Avoid shell-based text rewriting or redirection for files that contain Chinese copy unless the command explicitly writes UTF-8.
- If a file shows mojibake such as `鍔犺浇` or `杩斿洖`, assume an encoding issue first; verify the file encoding before changing business logic.
- Prefer `apply_patch` or editor-based edits for copy changes in `.ts`, `.tsx`, `.md`, `.json`, and similar text files.
- Do not treat terminal mojibake alone as proof that a file is corrupted. First distinguish among: terminal display issues, file-encoding issues, and actual source breakage.
- For Chinese copy changes, verify in this order: editor/file view, build status, then app UI. Treat TypeScript parse errors or broken rendering as stronger evidence than shell output.
- After editing Chinese text in source files, run a build or type check before making further wide changes.
