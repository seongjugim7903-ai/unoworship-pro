/**
 * components/composer/settings/index.ts
 * 설정(Settings) 모듈 재export
 */

export { default as SettingsButton } from './SettingsButton';
export { default as SettingsModal } from './SettingsModal';

// 카테고리 패널 (필요 시 직접 import 가능)
export { default as GeneralSettings } from './categories/GeneralSettings';
export { default as EditorSettings } from './categories/EditorSettings';
export { default as OutputSettings } from './categories/OutputSettings';
export { default as BroadcastSettings } from './categories/BroadcastSettings';
export { default as ShortcutSettings } from './categories/ShortcutSettings';
export { default as AboutSettings } from './categories/AboutSettings';
