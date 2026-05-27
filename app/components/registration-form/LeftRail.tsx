/**
 * LeftRail — 3 vertical icon buttons that switch the middle panel.
 *
 * Phase 1 ships only three panels (Form elements / Appearance /
 * Settings); the other Sami panels (After submit, Email notifications,
 * Integrations, Account page) are explicitly out of scope.
 */
import { Icon, Tooltip } from "@shopify/polaris";
import {
  FormsIcon,
  ColorIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";

export type LeftRailSection = "elements" | "appearance" | "settings";

const SECTIONS: Array<{
  key: LeftRailSection;
  label: string;
  icon: typeof FormsIcon;
}> = [
  { key: "elements", label: "Form elements", icon: FormsIcon },
  { key: "appearance", label: "Appearance", icon: ColorIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export function LeftRail({
  active,
  onSelect,
}: {
  active: LeftRailSection;
  onSelect: (section: LeftRailSection) => void;
}) {
  return (
    <nav
      aria-label="Builder sections"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--p-space-200)",
        padding: "var(--p-space-300)",
        borderRight: "1px solid var(--p-color-border)",
        background: "var(--p-color-bg-surface)",
        height: "100%",
      }}
    >
      {SECTIONS.map((s) => {
        const selected = s.key === active;
        return (
          <Tooltip key={s.key} content={s.label} preferredPosition="above">
            <button
              type="button"
              aria-pressed={selected}
              aria-label={s.label}
              onClick={() => onSelect(s.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                border: "1px solid var(--p-color-border)",
                borderRadius: "var(--p-border-radius-200)",
                background: selected
                  ? "var(--p-color-bg-surface-selected)"
                  : "var(--p-color-bg-surface)",
                cursor: "pointer",
              }}
            >
              <Icon source={s.icon} tone={selected ? "primary" : "base"} />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
