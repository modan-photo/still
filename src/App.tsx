import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Inspector } from "./components/Inspector";
import { Icon, type IconName } from "./components/Icons";
import { StillMark } from "./components/StillMark";
import { CropCorners, SketchLine } from "./components/Sketch";
import { Placeholder } from "./components/Placeholder";
import type { ThemeController, ThemePreference } from "./hooks/useTheme";
import { AppShell } from "./layout/AppShell";

type IconButtonProps = {
  /** 同时用作无障碍名称和悬停提示，确保纯图标按钮的用途可被识别。 */
  label: string;
  /** 图标名称由 IconName 约束，与图标组件支持的名称保持一致。 */
  icon: IconName;
  onClick?: () => void;
  /** 切换类按钮的按下状态；普通操作按钮可省略此属性。 */
  pressed?: boolean;
};

/**
 * 工具栏复用的纯图标按钮。
 * data-tooltip 为 CSS 伪元素提供提示文字，aria-pressed 同时表达切换状态并参与样式匹配。
 */
function IconButton({ label, icon, onClick, pressed }: IconButtonProps) {
  return (
    <button
      className="icon-button tooltip"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      onClick={onClick}
    >
      <Icon name={icon} />
      {pressed && <SketchLine underline />}
    </button>
  );
}

// 主题偏好与显示文案的映射；Record 确保每一种 ThemePreference 都有对应标签。
const themeLabels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** 应用主界面：组合顶部工具栏、照片工作区和属性侧栏，并管理外观设置浮层。 */
type AppProps = {
  theme: ThemeController;
};

function App({ theme }: AppProps) {
  // preference 是用户选择（含跟随系统），resolvedTheme 是当前实际生效的浅色或深色。
  // 主题持久化、系统主题监听和根元素样式属性更新由 useTheme 负责。
  const { preference, resolvedTheme, setPreference, toggleResolvedTheme } = theme;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [photoName, setPhotoName] = useState<string | null>(null);
  // 引用同时包住设置按钮和浮层，点击这两者都属于“内部点击”。
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 仅在浮层打开时监听全局事件，关闭状态下无需处理外部点击或 Escape。
    if (!settingsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      // pointerdown 统一处理鼠标、触控和触笔；浮层内部操作不触发关闭。
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      // 浮层关闭或组件卸载时移除同一组回调，避免残留监听器和重复响应。
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  // 工具栏与空态按钮共用原生文件选择入口；当前尚未绑定文件读取或预览逻辑。
  const openPhoto = () => {
    document.getElementById("photo-input")?.click();
  };

  // AppShell 仅负责区域编排；各插槽继续持有原有 UI 和状态。
  return (
    <AppShell
      titleBar={(
      <header className="toolbar">
        <div className="toolbar-start">
          <div className="brand" aria-label="Still">
            <StillMark size={22} />
            <span>Still</span>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          {/* 隐藏原生文件控件，通过按钮触发；accept 仅限定选择器的文件类型提示。 */}
          <input
            id="photo-input"
            className="visually-hidden"
            type="file"
            accept="image/*"
            aria-label="Choose photograph"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setPhotoName(file.name);
            }}
          />
          <button className="button button-ghost toolbar-open" type="button" aria-label="Open photograph" onClick={openPhoto}>
            <Icon name="open" />
            <span>Open</span>
          </button>
        </div>

        {/* 未选择照片时显示品牌标语；取消选择保留当前文件名。 */}
        <div className="document-context" aria-label="Current document" aria-live="polite">
          <span className="document-name" title={photoName ?? undefined}>
            {photoName ?? "Still Photo, Still Photography"}
          </span>
        </div>

        <div className="toolbar-actions">
          {/* 导出目前为禁用占位按钮，尚未接入照片状态或导出处理函数。 */}
          <button className="button button-primary" type="button" disabled aria-label="Export; open a photo first">
            <Icon name="export" />
            <span>Export</span>
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          {/* 快捷切换按实际主题取反，并保存为明确的浅色或深色偏好。 */}
          <IconButton
            label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
            icon={resolvedTheme === "light" ? "moon" : "sun"}
            onClick={toggleResolvedTheme}
          />

          {/* 浮层相对该容器定位；函数式更新确保连续点击时使用最新的开关状态。 */}
          <div className="popover-anchor" ref={settingsRef}>
            <IconButton
              label="Settings"
              icon="settings"
              pressed={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            />
            {/* 仅在打开时挂载设置内容，并为对话框提供可访问名称。 */}
            {settingsOpen && (
              <div className="settings-popover" role="dialog" aria-label="Appearance settings">
                <div className="popover-heading">
                  <div>
                    <p className="popover-title">Appearance</p>
                    <p className="popover-description">Choose how Still looks.</p>
                  </div>
                  <button
                    className="icon-button icon-button-small"
                    type="button"
                    aria-label="Close settings"
                    onClick={() => setSettingsOpen(false)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {/* 选中态依据用户偏好而非实际主题，使“跟随系统”保持独立选项。
                    aria-checked 表达单选状态，data-selected 和勾选图标提供视觉反馈。 */}
                <div className="theme-options" role="radiogroup" aria-label="Theme preference">
                  {(["system", "light", "dark"] as ThemePreference[]).map((theme) => (
                    <button
                      className="theme-option"
                      data-selected={preference === theme}
                      type="button"
                      role="radio"
                      aria-checked={preference === theme}
                      key={theme}
                      onClick={() => setPreference(theme)}
                    >
                      <Icon name={theme === "system" ? "system" : theme === "light" ? "sun" : "moon"} />
                      <span>{themeLabels[theme]}</span>
                      {preference === theme && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="toolbar-divider" aria-hidden="true" />
          <button
            className="icon-button tooltip"
            type="button"
            aria-label={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
            aria-expanded={inspectorOpen}
            aria-controls="inspector"
            aria-pressed={inspectorOpen}
            data-tooltip={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
            onClick={() => setInspectorOpen((open) => !open)}
          >
            <Icon name="sidebar" />
            {inspectorOpen && <SketchLine underline />}
          </button>
        </div>
      </header>
      )}
      mainCanvas={(
        <main className="canvas" aria-label="Photo workspace">
          <div className="canvas-caption"><span>Workspace</span><span>Still / Photo studio</span></div>
          {/* 预览底板当前始终呈现空态引导；文件选择后仍需另行接入照片渲染。 */}
          <div className="viewing-surface">
            <div className="empty-state">
              <div className="empty-mark" aria-hidden="true">
                <CropCorners />
                <StillMark size={28} />
              </div>
              <div className="empty-copy">
                <h1>Open a photograph</h1>
                <p>Choose a file to begin.</p>
              </div>
              <button className="button button-primary empty-action" type="button" onClick={openPhoto}>
                <Icon name="open" />
                <span>Open Photo</span>
              </button>
            </div>
          </div>
          <div className="canvas-footer"><span>No photograph loaded</span><span>Frame · Refine · Export</span></div>
        </main>
      )}
      rightPanel={<Inspector collapsed={!inspectorOpen} />}
      filmStrip={<Placeholder label="Film strip" description="Photo thumbnails will appear here" />}
    />
  );
}

export default App;
