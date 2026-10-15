export type ViewMode = "reading" | "source" | "live";

export type ModeSource = "rule" | "frontmatter";

const VALID_MODES: ViewMode[] = ["reading", "source", "live"];

const isValidMode = (value: string | null | undefined): value is ViewMode => {
  return !!value && (VALID_MODES as string[]).includes(value);
};

const CRM_LEGACY_ALIASES: Record<string, ViewMode> = { preview: "reading", edit: "live" };

export const normalizeFrontmatterMode = (value: unknown): ViewMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const mode = CRM_LEGACY_ALIASES[normalized] ?? normalized;
  return isValidMode(mode) ? mode : null;
};

export const parseRuleMode = (
  rawMode: string | null | undefined,
  customFrontmatterKey: string
): ViewMode | null => {
  if (!rawMode) return null;
  const parts = rawMode.split(":").map((part) => part.trim());
  const key = parts[0];
  if (key === "default") return null;
  if (parts.length > 1 && key !== customFrontmatterKey && key !== "auto-view-mode") return null;
  return normalizeFrontmatterMode(parts.length > 1 ? parts[1] : parts[0]);
};

export const resolveViewModeDecision = ({
  matchedRuleModes,
  frontmatterValue,
  customFrontmatterKey,
}: {
  matchedRuleModes: Array<string>;
  frontmatterValue: unknown;
  customFrontmatterKey: string;
}): { mode: ViewMode | null; source: ModeSource | null } => {
  const normalizedFrontmatter = normalizeFrontmatterMode(frontmatterValue);
  if (normalizedFrontmatter) {
    return { mode: normalizedFrontmatter, source: "frontmatter" };
  }

  let resolvedMode: ViewMode | null = null;
  let source: ModeSource | null = null;

  for (const ruleMode of matchedRuleModes) {
    const parsed = parseRuleMode(ruleMode, customFrontmatterKey);
    if (parsed !== null) {
      resolvedMode = parsed;
      source = "rule";
      continue;
    }

    if (typeof ruleMode === "string" && ruleMode.trim().startsWith("default")) {
      resolvedMode = null;
      source = null;
    }
  }

  if (resolvedMode) {
    return { mode: resolvedMode, source };
  }

  return { mode: null, source: null };
};
