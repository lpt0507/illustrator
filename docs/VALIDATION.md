# 验证记录

## 0.3.4（2026-11-21）

中文化专项：所有用户可见的提示、错误、对话框标题与界面标签统一为简体中文。

| 文件 | 变化 |
|---|---|
| `jsx/artwork.jsx` | "用 Illustrator/Photoshop 编辑" 的结果提示、选区/文件缺失/BridgeTalk 错误全部改为中文 |
| `jsx/core.jsx` | 所有 `fail()` 错误、`File.openDialog` / `Folder.selectDialog` 标题、对象名兜底改为中文 |
| `jsx/host.jsx` | JSON 解析、载荷校验、未知操作的错误改为中文 |
| `index.html` | 分区标签 LINKS / TRANSFORM 和弹窗标题 ACTION 改为中文 |
| 版本号 | 统一升到 0.3.4，缓存指纹同步；因改了 `CSXS/manifest.xml`，需重启 Illustrator |

## 0.3.3（2026-11-21）

性能专项：把"面板刷新"从全量链接扫描改成轻量计数。

### 基准（200 个链接的桩文档，连续 3 次刷新）

| 路径 | 耗时 | 文件读取次数 |
|---|---|---|
| 优化前 `scan` ×3（缓存被代理比较清空） | 15 ms | 600 |
| 仅修缓存后 `scan` ×3 | 15 ms | 200 |
| 优化后 `summary` ×3 | <1 ms | 0 |

### 已执行（自动化）

| 项目 | 变化 |
|---|---|
| `jsx/core.jsx` | 新增 `A.summary()`：只遍历计数，跳过 `rowFor()` 的图像头读取、矩阵分解、图层/画板路径计算；missing 判定沿用 `rowFor` 的 embedded 规则 |
| `jsx/core.jsx` | `documentState()` 改用 `name + path` 作为元数据缓存的文档标识。原先比较 Document 代理引用，宿主每次访问 `activeDocument` 都返回新代理，导致缓存被反复清空、链接文件被重复读取 |
| `js/panel.js` | `refresh()` 只发 `ping`，不再发 `scan`。精简 CEP 面板无任何视图消费 scan 的 rows |
| `LinkForge.jsx` | 状态行刷新改用 `summary`；`lfStatus().rows` 改由 `linkCount` 提供，保持诊断语义 |
| 版本号 | 统一升到 0.3.3；新增命令必须提版本，否则自愈加载不会重跑新宿主脚本 |

### 未执行

- 真机大文档（数百链接）的刷新耗时实测；上述基准为 Node 桩数据，只反映 CPU 侧工作量，不含真实磁盘 I/O 与 BridgeTalk 开销。

## 0.3.2（2026-11-21）

修复 0.3.1 遗留的 `applyScan is not defined` 误报，并做了一轮全量静态复查。

| 项目 | 变化 |
|---|---|
| `js/panel.js` | `execute()` 移除操作后多余的 `scan` RPC：精简版已无文档信息区，`applyScan` 调用被删，结果无人消费；改为直接更新 `lastScan`。这类"操作成功但报刷新失败"的误报从根上消除 |
| `jsx/core.jsx` | PNG 元数据：末尾 `color===4||6 ? true : null` 会覆盖 `tRNS`/`IEND` 的判定，改为仅在 alpha 通道类型时置 true；PPI 计算去掉重复计入的 `parts.scaleX`（`boundingBox` 已含缩放） |
| 版本号 | `host.jsx` / `LinkForge.jsx` / `panel.js` / `manifest.xml` / `index.html` 缓存指纹统一到 0.3.2，使自愈加载能重跑改动后的宿主脚本 |

### 已执行（自动化）

- `node --check`：`panel.js`、`host.jsx`、`core.jsx`、`artwork.jsx`、`LinkForge.jsx`（jsx 需剥离 `#include` / `#target`，与 0.3.1 同法）全部通过。
- DOM 引用与 `data-action` ↔ 命令比对：无缺失。
- 确定问题的修复已在源码与安装副本两处核对。

### 未执行

- 真机逐项回归（置入、重链、PDF 页码、嵌入、AI/PS 编辑、四种变换）。PNG 透明度与 PPI 属 scan 元数据，精简面板无展示位，需按需临时查看数据确认。

## 0.3.1（2026-10-23）

本版做的是界面收敛与整理：清掉压缩样式表里的死规则、统一版本号、补齐文档。**只有“定位路径”在真实 Illustrator 上点验过**，其余 11 项未重跑宿主回归。

### 已执行（自动化）

| 项目 | 方法 | 结果 |
|---|---|---|
| 脚本语法 | `node --check`（jsx 剥离 `#include`、`LinkForge.jsx` 剥离 `#target`） | `panel.js`、`host.jsx`、`core.jsx`、`artwork.jsx`、`LinkForge.jsx` 全部通过 |
| 业务层加载 | stub `LF`/`app`/`File`/`Folder` 中 `evalFile` 两份 jsx | 注册出 13 个命令：`editAI editPS embed place relink relinkFolder resetRotation resetScale resetTransform reveal scan setTransform updatePdfPage` |
| 界面 ↔ 命令 | 比对 `data-action` 与注册命令 | 12 个按钮全部命中，无悬空命令 |
| DOM 引用 | 抽取 `panel.js` 里的 `el('id')` 与 `index.html` 的 `id` | 无缺失（`action-*` 为运行时生成，排除） |
| HTML 结构 | 逐标签闭合检查 | 无未闭合、无错配 |
| 样式回归 | 无头 Chrome 在 420px / 260px 两档采集 19 组元素的计算样式，与改动前逐字段对比 | 除 `main` 外 **0 处差异**（`main` 为本次有意修复，见下） |
| 定位路径四分支 | stub 模拟 vbs 成功 / vbs 失败转 cmd / ps1 报错 / 全失败 | 分别得到 `select` / `select` / `select` / `folder`，`app.system` 调用次数 0 |

### 已执行（真机）

- CEP 面板可正常连接（面板显示“已连接”，12 个按钮可点）。
- **定位路径**：在 Illustrator 30.x 上对 `\\fs\Customerfile\江天彩印\2026\10\BZ26496-江天彩印\02-单模\DY80032179-单模.ai` 实测，资源管理器打开双模目录、选中该文件并**置前于 Illustrator 窗口**。

### 本次样式与结构整理

| 项目 | 变化 |
|---|---|
| `css/panel.css` | 规则 177 → 88，字节 13,071 → 8,207；删除 89 条死选择器（标题区、页签、文档信息条、文件表格、设置卡片、底部状态栏等）；删除未使用的 `--surface`、`--orange`；追加结构说明注释 |
| `main` 滚动容器 | 原规则写作 `.tabs+main{flex:1;overflow:auto;min-height:0}`，而 `.tabs` 早已删除，**该规则从未命中**：`main` 不是滚动容器，内容超高会被 `body{overflow:hidden}` 直接裁掉。改为 `main{...}` 后正常滚动 |
| `scrollbar-gutter` | 随 `main` 生效后常驻预留 7px（420px 面板下按钮宽 191→188），影响窄面板可用宽度，已移除 |
| 减少动效 | `animation-duration:3s!important` 反而把转圈从 1s 拖到 3s，改为 `.01ms` |
| `index.html` | 删除空的 `<footer hidden>` 壳子；css/js 缓存指纹同步 0.3.1 |
| `js/panel.js` | 删除对已移除元素的残留引用（`statusText`、`statusDot`、`refreshButton`、`documentName`、`linkCount`、`missingCount`、`selectionCount`、`headerVersion`）及空转的 `applyScan()` |
| `CSXS/manifest.xml` | 版本 0.3.1；宿主范围 `[28.0,30.9]` → `[28.0,99.9]`（免去每次大版本手改）；`MinSize` 高度 480 → 200 |
| `LinkForge.jsx` | 版本 0.3.1，与 `LF.version` 一致，避免原生面板每次重复 `evalFile` |

### 未执行

- 除“定位路径”外 11 项功能在真实文档上的回归（置入、重链、PDF 页码、嵌入、AI/PS 编辑、四种变换）。
- Photoshop 侧确认实际收到打开请求。
- 任何文件格式的批量回归与撤销链验证。

## 沿用自 0.1.4 的宿主事实

以下结论来自 0.1.4 在 Illustrator 30.6.0 上的实测，精简版保留了同样的代码路径，但**未在本版重验**：

- `PlacedItem.matrix` 与 `transform()` 的 Y 轴方向相反，代码中已做符号换算。
- 未镜像对象本身的 matrix 行列式通常为负，不能据此判定用户镜像。
- PNG pHYs / JPEG JFIF 密度决定源尺寸基准；未知密度按 72 PPI 坐标基准。
- 多对象批量操作部分成功不回滚，面板显示成功/跳过/失败数量。

## 沿用自 0.2.x 的环境事实

- `app.system()` 携带中文或 UNC 路径会直接抛异常（不是返回值非零），Windows 分支不能用它启动外部程序。
- 启动器 `.vbs`/`.cmd` 若写成带 BOM 的 UTF-8，wscript 与 cmd 会在文件头解析失败；启动器用系统默认编码，只有给脚本读取的 txt 用 UTF-8。
- 修改 `CSXS/manifest.xml` 需重启 Illustrator；修改 `jsx/` 不需要（面板会按版本号自动 `evalFile`）。

完整版 0.1.4 的原始验证记录与源码备份在 `.workbuddy/backup-0.1.4/`。

## 发布前手工验收清单

1. 文件 → 脚本 → Link Forge 能打开面板；重复运行不产生第二个可见窗口。
2. 置入、重新链接、更新所在文件夹、PDF 页码、嵌入各自成功一次，并检查撤销后文档结构。
3. 取消缩放 / 取消旋转 / 恢复原始变换在未缩放、已缩放、镜像、旋转 90° 对象上结果正确；剪切对象应报错且原件不变。
4. 指定缩放及角度后对象中心不移动。
5. Illustrator / Photoshop 编辑各打开一个源文件；PS 侧确认实际收到。
6. 面板最窄缩到 200×200 时按钮变单列且可滚动，无裁切。
7. 关闭面板后重新启动，复用同一窗口且 12 个按钮可用。
