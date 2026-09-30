# 基础裁剪交付与验收

## 实现范围

支持原图、自由、1:1、4:3、3:2、16:9、2:3、3:4、9:16；固定比例裁剪、移动与八个手柄缩放、重置、键盘确认/取消，以及只同步比例的批量应用。自由比例按详细 UI 和验收条目实现，不能批量应用。没有增加旋转裁剪、透视校正、焦点同步或裁剪撤销历史。

编辑覆盖层显示完整原图，遮罩外部区域，以便移动裁剪框；Enter 确认或切换 Tab 后显示裁剪结果。设置均使用显示方向原图的 0–1 归一化坐标。固定比例约束的是源图像素宽高比，因此归一化 width / height 不一定等于所选比例。

## 改动文件

新增文件（11 个）：

| 文件 | 用途 |
| --- | --- |
| src-tauri/src/render/crop.rs | 原分辨率像素裁剪、四舍五入、边界保护与单元测试 |
| src/render/crop.ts | Canvas 裁剪、像素边界、比例切换与居中矩形 |
| src/render/cropGeometry.ts | 移动、边角缩放、比例约束和钳制 |
| src/components/CropOverlay.tsx | 遮罩、网格、手柄、指针捕获和键盘操作 |
| src/hooks/useCropEdit.tsx | 临时拖拽预览、进入时基线、Esc/Enter 会话与网格互斥 |
| src/layout/RightPanel/tabs/CropTab.tsx | 比例、百分比位置、重置、批量确认和移动端画布入口 |
| src/services/cropStorage.ts | 按照片身份保存与校验 RenderSpec 的 crop 片段 |
| tests/crop.test.ts | 前端裁剪像素与比例计算测试 |
| tests/cropGeometry.test.ts | 拖拽几何和边界测试 |
| tests/cropBatch.test.ts | 批量应用、独立编辑和新照片隔离测试 |
| tests/cropStorage.test.ts | 恢复、重置、损坏存储和存储不可用测试 |

修改文件（14 个）：

| 文件 | 衔接点 |
| --- | --- |
| src/types/renderSpec.ts | 可选 CropSpec、归一化 CropRect 与默认值 |
| src-tauri/src/render/spec.rs | Rust 对应类型、serde 默认值与兼容性测试 |
| src-tauri/src/render/mod.rs | 注册 crop 模块 |
| src-tauri/src/render/pipeline.rs | 在边框之前裁剪；验证 EXIF 方向和小尺寸错误 |
| src-tauri/src/commands/ui.rs | 持久化 Tab 枚举加入 crop |
| src/components/ExportDialog.tsx | 根据裁剪后的尺寸计算导出比例与估算 |
| src/components/Icons.tsx | 加入裁剪图标 |
| src/hooks/useEditorShortcuts.ts | Tab 快捷键使用完整元数据列表 |
| src/layout/MainCanvas.tsx | 主预览裁剪链路、源图编辑上下文和覆盖层 |
| src/layout/RightPanelContent.tsx | 路由到 CropTab |
| src/layout/rightPanelTabs.ts | 在 frame 与 stamp 之间加入 crop 元数据 |
| src/main.tsx | 接入 CropEditProvider |
| src/stores/projectStore.ts | 原子批量更新、dirty 标记、裁剪保存和导入恢复 |
| src/theme/tokens.ts | 遮罩、网格、手柄颜色与触控尺寸 token |

本文件 docs/CROP-ACCEPTANCE.md 为第 12 步新增交付说明。工作区的 src/App.tsx 原有改动保留，不计入本次裁剪实现改动。没有新增依赖；没有修改 border、watermark、exif、collage 模块内部逻辑，也没有修改 RightPanelTabs 的结构。

## 架构与行为

- Rust 仍复用 image_export。解码阶段已有 EXIF 方向归一化，随后执行 crop，再执行原有 adjustments、border、watermark，最后由导出链路编码。裁剪不重采样；启用裁剪且结果任一边小于 16px 时返回“裁剪尺寸过小”。
- 主预览使用归一化矩形从缓存图取源区域，采用与 Rust 相同的原点和尺寸四舍五入规则。边框和水印沿用现有渲染器；胶片栏与网格缩略图显示完整照片。
- Pointer move 更新组件/Context 临时状态，位置读数同步变化；pointerup、pointercancel、丢失捕获或卸载时提交。比例改变或重置后，旧拖拽不能覆盖新的设置。
- 批量应用只对其他照片计算居中最大矩形，当前照片保留其裁剪位置；所有照片标记 dirty。后续单图编辑相互独立，没有全局“新导入照片自动应用”策略。
- Crop Tab 沿用现有移动端 persistent bottom drawer。窄屏四列按钮；“在画布上调整”收起抽屉。手柄命中区域 44×44px，touch-action: none；裁剪操作按钮至少 44px 高，touch-action: manipulation。
- 项目原来没有整组照片/完整 RenderSpec 的持久化机制。本次保存 crop 片段到本地 WebView localStorage，键包含照片路径、显示方向尺寸和文件 hash。重启后需要重新导入同一照片，才会恢复裁剪；照片列表不会自动恢复。文件身份或尺寸变化时不沿用旧设置。损坏或不可用的存储不会阻止编辑。

## 已执行验证

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查 | 通过 |
| Vitest 全部测试 | 6 个测试文件、59 项通过 |
| cargo test render:: --lib | 20 项通过、4 项发布模式性能测试跳过 |
| Vite 生产构建 | 通过；仍提示主 bundle 超过 500KB |
| git diff --check | 通过；Git 有工作区 LF/CRLF 提示 |
| 浏览器编辑会话 | 已验证比例切换、拖拽、百分比、Esc、Enter、重置 |
| 浏览器批量应用 | 已验证确认/取消、横竖图各自居中、当前位置保留、自由与单图禁用 |
| 浏览器持久化 | 已验证页面刷新后重新导入恢复，以及新照片不继承 |
| 浏览器移动布局 | 已验证 320×640、390×844，四列、滚动、全宽按钮、44px 手柄、比例拖拽和深浅主题 |

## 手动验收步骤

1. 导入横图、竖图和一张 EXIF orientation=6 或 8 的照片。进入“裁剪”，确认首次显示原图比例，覆盖层未启用。空项目下确认“请先导入照片”。
2. 选择 1:1，确认居中的正方形裁剪区域和遮罩。拖动框内区域，确认 X/Y 读数实时更新，尺寸保持不变；拖到四周，确认不能越界。
3. 选择 16:9，检查中心保持；测试四角和四边手柄，确认实际像素比例正确、边界钳制、通常场景下最小宽高为源图的 10%。极端源图比例下，如固定比例无法同时满足两边 10%，优先维持比例和不越界。
4. 选择“自由”，分别拖动各边，确认可独立改变宽高；确认批量按钮禁用并提示“自由比例无法批量应用”。
5. 选择“原图”，确认覆盖层退出、裁剪禁用、结果恢复原图。再次裁剪后点击“重置裁剪”，确认同样恢复并显示 toast。
6. 在裁剪框上测试方向键 1 个源图像素、Shift+方向键 10 个像素。Esc 恢复本次进入编辑前的状态；Enter 保留结果并隐藏覆盖层。重新点击当前比例或重进 Tab 可继续编辑。
7. 在拖拽过程中切换 Tab、切换照片或触发取消捕获。检查最后有效位置提交，且重置/新比例不会被旧拖拽覆盖。普通切换 Tab 再返回时，检查设置保留。
8. 当前照片设为偏离中心的 1:1，点击“应用到所有照片”。先取消，确认其他照片不变；再确认，检查数量不含当前照片、覆盖提示和完成 toast。查看横图与竖图各自的百分比矩形，确认居中且未复制当前偏移。
9. 单独修改一张批量裁剪后的照片，确认其他照片不受影响；导入从未编辑的新照片，确认没有继承比例。只保留一张照片时，检查批量按钮禁用并提示“只有一张照片”。
10. 从拼图切到裁剪，确认显示单图且网格关闭。返回拼图检查原有拼图内容仍可使用。
11. 为裁剪图同时开启边框和水印并导出。检查边框包围裁剪结果，水印位于最终图像上层；对 EXIF 旋转照片检查方向和裁剪位置。对照源像素边界计算检查导出，预览缓存与原图各自四舍五入可能带来边界误差。
12. 使用小图或很窄的裁剪，令最终源裁剪任一边小于 16px，确认导出显示“裁剪尺寸过小”；关闭裁剪后原有小图路径仍可使用。
13. 真正退出并重启桌面/Android 应用，重新导入相同文件，确认比例与位置恢复；重置后再重启重导入，确认保持未裁剪。照片列表不会自动恢复。
14. Android 真机在纵向与横向测试：选择比例、收起抽屉、单指移动、八个手柄缩放、连续快速拖动、抽屉滚动与重新打开。检查没有页面滚动干扰、触控区域可用、点击无明显延迟，坐标与预览同步。浏览器视口与指针测试不能替代此项。
15. 深浅主题各重复一次裁剪，检查遮罩、白色手柄和三分线可见性。查看实际应用控制台，记录任何新增错误或 MUI 警告。

## 尚未确认与已知限制

- Android 真机触控手感、实际点击延迟、原生应用完整重启恢复，以及真实照片导出与预览的逐像素对照，仍需手动验收。
- 完整移动抽屉的浏览器测试观察到现有 StampControls 在字体列表初始化前产生 Noto Sans SC 的 MUI Select out-of-range 警告。没有修改该模块，因而不能宣称“所有场景无 MUI 警告”。
- 不带 Tauri 桥接的浏览器测试里，现有 FrameMiniPreview 调用 convertFileSrc 会失败；移动布局测试仅在临时测试入口模拟文件 URL 接口。临时入口热更新还触发过 createRoot 重复初始化提示。临时入口已删除，这些记录不是对原生应用无错误的保证。
- 裁剪设置保存的是 RenderSpec 的 crop 片段，未扩展为整个项目会话持久化。localStorage 被清除、配额不足或写入被禁止时，编辑仍可继续，但不能保证跨重启保存。
