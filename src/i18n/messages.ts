import { useUIStore } from '../stores/uiStore';

const messages = {
  en: {
    settingsTitle: 'Application settings',
    closeSettings: 'Close settings',
    language: 'Language',
    languageDescription: 'Choose the language used by Still.',
    english: 'English',
    chinese: '简体中文',
    systemFonts: 'Use system fonts',
    systemFontsDescription:
      'Allow stamp fonts installed on this device. Keep this off for portable presets and identical rendering across computers.',
    systemFontsEnabled:
      'System fonts are available. They are enumerated once and cached for this session.',
    systemFontsDisabled: 'Only the five fonts bundled with Still are available.',
    settings: 'Application settings',
    openSettings: 'Open application settings',
    switchToDark: 'Switch to dark theme',
    switchToLight: 'Switch to light theme',
    minimize: 'Minimize window',
    maximize: 'Maximize or restore window',
    closeWindow: 'Close window',
    emptyWorkspace: 'Empty photo workspace',
    emptyPrompt: 'Drop photos here, or choose files to import',
    importPhotos: 'Import photos',
    importFolder: 'Import folder',
    inspectorPanel: 'Inspector panel',
    inspector: 'Inspector',
    openInspector: 'Open inspector',
    closeInspector: 'Close inspector',
    expandInspector: 'Expand inspector',
    collapseInspector: 'Collapse inspector',
    frame: 'Frame',
    transform: 'Transform',
    stamp: 'Stamp',
    exif: 'EXIF',
    collage: 'Collage',
    photoFilmstrip: 'Photo filmstrip',
    editorCanvas: 'Editor canvas',
    openCollage: 'Open collage editor',
    gridView: 'Grid view',
    gridViewShortcut: 'Grid view (G)',
  },
  zh: {
    settingsTitle: '应用设置',
    closeSettings: '关闭设置',
    language: '语言',
    languageDescription: '选择 Still 的界面语言。',
    english: 'English',
    chinese: '简体中文',
    systemFonts: '使用系统字体',
    systemFontsDescription: '允许使用设备上安装的水印字体。关闭后预设更易在不同设备间保持一致。',
    systemFontsEnabled: '系统字体已启用，本次会话会枚举并缓存字体列表。',
    systemFontsDisabled: '仅使用 Still 内置的五款字体。',
    settings: '应用设置',
    openSettings: '打开应用设置',
    switchToDark: '切换到深色主题',
    switchToLight: '切换到浅色主题',
    minimize: '最小化窗口',
    maximize: '最大化或还原窗口',
    closeWindow: '关闭窗口',
    emptyWorkspace: '空白照片工作区',
    emptyPrompt: '将照片拖到这里，或选择文件导入',
    importPhotos: '导入照片',
    importFolder: '导入文件夹',
    inspectorPanel: '检查器选项卡',
    inspector: '检查器',
    openInspector: '打开检查器',
    closeInspector: '关闭检查器',
    expandInspector: '展开检查器',
    collapseInspector: '收起检查器',
    frame: '边框',
    transform: '变换',
    stamp: '水印',
    exif: 'EXIF',
    collage: '拼图',
    photoFilmstrip: '照片胶片条',
    editorCanvas: '编辑画布',
    openCollage: '打开拼图编辑器',
    gridView: '网格视图',
    gridViewShortcut: '网格视图 (G)',
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function translate(language: 'en' | 'zh', key: MessageKey): string {
  return messages[language][key];
}

export function useTranslation() {
  const language = useUIStore((state) => state.language);
  return (key: MessageKey) => translate(language, key);
}
