# Link Forge · Illustrator 链接增强工具

面向 Adobe Illustrator 的链接管理面板，集中处理置入文件、重新链接、PDF 页码、嵌入、AI/PS 编辑，以及链接对象的缩放与旋转归一化。提供 CEP 面板与原生 ScriptUI 面板两种入口，当前版本 **0.3.4**，界面与提示已全部中文化。

## 功能

| 分类 | 功能 | 说明 |
|---|---|---|
| 链接与文件 | 置入文件 | 原生多选文件，按画板原点顺序错位摆放 |
| 链接与文件 | 定位路径 | 在资源管理器中定位并选中源文件，窗口置前；支持中文与 UNC 路径 |
| 链接与文件 | 重新链接 | 将当前选区的所有链接指向同一个替换文件 |
| 链接与文件 | 更新所在文件夹 | 按相同文件名匹配，仅在文件存在时重链 |
| 链接与文件 | 更新 PDF 页码 | 支持 PDF / 兼容 AI，支持 6 种置入边界，临时修改偏好后恢复 |
| 链接与文件 | 嵌入链接对象 | 调用 Illustrator 原生嵌入 |
| 链接与文件 | 用 Illustrator 编辑 | 在 Illustrator 中打开选中链接的源文件 |
| 链接与文件 | 用 Photoshop 编辑 | 通过 BridgeTalk 异步发送到本机 Photoshop |
| 变换 | 取消缩放 | 以源文件密度归一化，保留对象中心与镜像 |
| 变换 | 取消旋转 | 归一化到 0°，坐标系已按宿主 Y 轴约定换算 |
| 变换 | 恢复原始变换 | 归一化缩放与旋转，不恢复历史摆放位置 |
| 变换 | 指定缩放及角度 | 设定目标值而非叠加；剪切或奇异矩阵拒绝执行 |

操作成功后底部轻提示并在 3 秒后消失；部分失败时弹出结果面板，逐条列出原因。需要参数或确认的操作使用面板内表单/确认框。面板离线时按钮整体禁用。

## 环境要求

- Windows（安装、启动、卸载脚本基于 cmd 与 PowerShell）
- Adobe Illustrator 28.0 及以上（`CSXS/manifest.xml` 声明宿主范围 `[28.0,99.9]`）
- CEP 11 / 12 运行时。安装脚本会为当前用户开启 `PlayerDebugMode`，以便加载未签名的开发版面板
- “用 Photoshop 编辑”需要本机安装 Photoshop；代码不确认 Photoshop 是否已打开或实际收到请求

## 安装

1. 下载或克隆本仓库到本地。
2. 双击 **`Install.cmd`**。脚本会安装扩展文件，并尝试在 Illustrator 的“文件 > 脚本”目录写入菜单入口；普通安装失败时会以管理员权限重试一次。
   - 扩展安装位置：`%APPDATA%\Adobe\CEP\extensions\com.aether.illustrator.linktoolkit`
   - 旧版本备份：`%LOCALAPPDATA%\LinkForge\backup-<时间戳>`
3. **重启 Illustrator**。
4. 从 **文件 > 脚本 > Link Forge** 打开；也可从 **窗口 > 扩展功能** 中的对应项打开 CEP 面板。

如果不想依赖 CEP，可双击 **`Launch.cmd`** 直接通过 COM 调用 `LinkForge.jsx` 打开原生面板；启动器带互斥锁，避免重复窗口。

卸载：双击 **`Uninstall.cmd`**，它会删除扩展与安装时写入的脚本菜单入口，不会修改 Illustrator 文档。

## 项目结构

```text
.
├── CSXS/manifest.xml        # CEP 扩展清单与版本
├── index.html               # CEP 面板界面
├── css/panel.css            # 面板样式
├── js/panel.js              # 面板逻辑与宿主营命令通信
├── jsx/host.jsx             # CEP 宿主入口（命令分发）
├── jsx/core.jsx             # 链接诊断与核心业务命令
├── jsx/artwork.jsx          # Illustrator / Photoshop 编辑等命令
├── LinkForge.jsx            # 原生 ScriptUI 面板
├── scripts/
│   ├── install.ps1          # 安装 / 卸载
│   ├── launch-native.ps1    # 原生面板启动器
│   ├── menu-entry.jsx       # “文件 > 脚本”入口
│   └── reveal.ps1           # 定位路径的 Windows 辅助脚本
├── docs/
│   ├── FEATURES.md          # 功能实现范围与边界
│   └── VALIDATION.md        # 各版本验证记录与验收清单
├── Install.cmd / Launch.cmd / Uninstall.cmd
└── README.md
```

## 二次开发注意事项

- Illustrator 运行的是**安装目录中的副本**。修改 `js/`、`css/`、`index.html` 后，必须同步复制到安装目录，或重新运行 `Install.cmd`，否则看不到改动。
- 修改 `index.html` 中脚本/样式的 `?v=` 缓存指纹，可强制 CEP 重新加载。
- 修改 `jsx/` 后需要同步提升 `jsx/host.jsx` 的 `LF.version`、`LinkForge.jsx` 的 `version` 和 `js/panel.js` 的 `HOST_VERSION`，否则面板的自愈加载不会重跑新脚本；修改 `CSXS/manifest.xml` 还需重启 Illustrator。
- 含中文的 `.jsx` / `.ps1` 文件必须保存为 **UTF-8 BOM**，否则 ExtendScript 或 Windows PowerShell 5.1 会按 ANSI 解码导致乱码。
- 面板刷新路径不要调用全量 `scan`（逐项读取图像头、矩阵、图层与画板）；状态计数使用轻量的 `summary` 命令。

## 已知限制

- 本版仅保留上述 12 项功能，旧版中的栅格化、降采样、描摹、文件列表等能力已移除；详细范围见 [`docs/FEATURES.md`](docs/FEATURES.md)。
- 多对象批量操作部分成功不回滚，结果面板显示成功 / 跳过 / 失败数量。
- “恢复原始变换”只归一化缩放与旋转，不能恢复历史摆放位置。
- 尚未在真机上对全部图像格式与文档结构做完整批量回归；正式生产前请按 [`docs/VALIDATION.md`](docs/VALIDATION.md) 的验收清单测试。
