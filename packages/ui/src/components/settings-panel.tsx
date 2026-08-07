// packages/ui/src/components/settings-panel.tsx
import { SettingsView, type SettingsViewTab } from "./settings-view.js";

export type ThemeTone = "light" | "dark";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  speed?: "fast" | "balanced" | "thorough";
  providerId?: string;
}

export type SettingsTab = "general" | "models" | "mcp" | "skills" | "context";

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeTone;
  onThemeChange: (t: ThemeTone) => void;
  accentColor?: string;
  onAccentChange?: (hex: string) => void;
  models: ModelOption[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onExportBundle?: () => Promise<unknown> | unknown;
  onImportBundle?: (file: File) => Promise<unknown> | unknown;
  bundleBusy?: boolean;
  initialTab?: SettingsTab;
  className?: string;
  /** Daemon API 密钥（web 直连 daemon 时使用；desktop 不传则隐藏） */
  secretConfigured?: boolean;
  secretPreview?: string;
  onSecretClear?: () => void;
  onSecretPaste?: (secret: string) => void;
}

function mapTabToSettingsViewTab(tab?: SettingsTab): SettingsViewTab {
  switch (tab) {
    case "models":
      return "connections";
    case "mcp":
      return "mcp";
    case "skills":
      return "skills";
    case "context":
      return "personal_context";
    case "general":
      return "general";
    default:
      return "appearance";
  }
}

/**
 * SettingsPanel delegates 100% to native macOS-style preference sheet SettingsView.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  if (!props.open) return null;

  return (
    <SettingsView
      open={props.open}
      onClose={props.onClose}
      theme={props.theme}
      onThemeChange={props.onThemeChange}
      accentColor={props.accentColor}
      onAccentChange={props.onAccentChange}
      selectedModelId={props.selectedModelId}
      onModelChange={props.onModelChange}
      onExportBundle={props.onExportBundle}
      onImportBundle={props.onImportBundle}
      bundleBusy={props.bundleBusy}
      initialTab={mapTabToSettingsViewTab(props.initialTab)}
      secretConfigured={props.secretConfigured}
      secretPreview={props.secretPreview}
      onSecretClear={props.onSecretClear}
      onSecretPaste={props.onSecretPaste}
    />
  );
}
