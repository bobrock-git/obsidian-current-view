import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CurrentViewPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/config/settings";
import { normalizeFrontmatterMode, parseRuleMode } from "../src/lib/view-mode";

describe("CRM legacy view modes", () => {
  it.each([
    ["preview", "reading"], ["edit", "live"], [" PREVIEW ", "reading"],
    [" EDIT ", "live"], ["reading", "reading"], ["source", "source"],
    ["live", "live"], ["unknown", null], [42, null], ["toString", null],
  ])("normalizes %s", (input, output) => expect(normalizeFrontmatterMode(input)).toBe(output));
  it.each([
    ["auto-view-mode: preview", "reading"], ["auto-view-mode: edit", "live"],
    ["current view: preview", "reading"], ["preview", "reading"], ["edit", "live"],
    ["default", null], ["other: reading", null],
  ])("parses %s", (input, output) => expect(parseRuleMode(input, "current view")).toBe(output));
});

describe("CRM resource lifecycle", () => {
  let plugin: CurrentViewPlugin | undefined;
  let observers: Array<{ disconnect: ReturnType<typeof vi.fn> }>;
  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("activeDocument", { body: {}, querySelectorAll: vi.fn(() => []) });
    vi.stubGlobal("MutationObserver", class {
      disconnect = vi.fn();
      constructor() { observers.push(this); }
      observe() {}
    });
  });
  afterEach(() => {
    plugin?.onunload();
    plugin = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function boot(settings = {}, navigatorPresent = true) {
    const events = new Map<string, Set<unknown>>();
    const workspace = {
      on: vi.fn((name: string, callback: unknown) => {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name)!.add(callback);
        return { name, callback };
      }),
      offref: vi.fn((ref: { name: string; callback: unknown }) => events.get(ref.name)?.delete(ref.callback)),
      getLeavesOfType: () => [], iterateAllLeaves: () => {},
    };
    const fileDispose = vi.fn(), folderDispose = vi.fn();
    const menus = {
      registerFileMenu: vi.fn(() => fileDispose),
      registerFolderMenu: vi.fn(() => folderDispose),
    };
    const registry: Record<string, unknown> = {};
    if (navigatorPresent) registry["notebook-navigator"] = { api: { menus } };
    const app = {
      workspace,
      vault: { on: () => ({}), getFiles: () => [], getAllFolders: () => [], getConfig: () => null },
      metadataCache: { on: () => ({}) },
      plugins: { plugins: registry },
    };
    plugin = new CurrentViewPlugin(app as any, { id: "current-view", name: "Current View (CRM Mod)", version: "1.6.4" } as any);
    plugin.loadData = vi.fn(async () => ({ folderRules: [], filePatterns: [], tagRules: [], ...settings }));
    plugin.saveData = vi.fn(async () => {});
    await plugin.onload();
    return { events, workspace, menus, registry, fileDispose, folderDispose };
  }

  it("keeps both switches off when missing from existing settings", async () => {
    const { events, menus } = await boot();
    expect(plugin!.settings.crmNativeLockMenu).toBe(false);
    expect(plugin!.settings.crmNotebookNavigatorIntegration).toBe(false);
    expect(events.get("file-menu")?.size ?? 0).toBe(0);
    expect(menus.registerFileMenu).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    "keeps switches independent: native=%s NN=%s", async (native, nn) => {
      const { events, menus } = await boot({ crmNativeLockMenu: native, crmNotebookNavigatorIntegration: nn, showExplorerIcons: true });
      expect(events.get("file-menu")?.size ?? 0).toBe(native ? 1 : 0);
      expect(events.get("folder-menu")?.size ?? 0).toBe(native ? 1 : 0);
      expect(menus.registerFileMenu).toHaveBeenCalledTimes(nn ? 1 : 0);
      expect(menus.registerFolderMenu).toHaveBeenCalledTimes(nn ? 1 : 0);
      expect(observers).toHaveLength(nn ? 1 : 0);
    });

  it("adds native menus once, removes them and can enable them again", async () => {
    const { events } = await boot();
    plugin!.settings.crmNativeLockMenu = true;
    await plugin!.saveSettings();
    await plugin!.saveSettings();
    expect(events.get("file-menu")?.size).toBe(1);
    expect(events.get("folder-menu")?.size).toBe(1);
    plugin!.settings.crmNativeLockMenu = false;
    await plugin!.saveSettings();
    expect(events.get("file-menu")?.size).toBe(0);
    expect(events.get("folder-menu")?.size).toBe(0);
    plugin!.settings.crmNativeLockMenu = true;
    await plugin!.saveSettings();
    expect(events.get("file-menu")?.size).toBe(1);
    plugin!.onunload();
    expect(events.get("file-menu")?.size).toBe(0);
  });

  it("removes NN menus, observer and delayed retry without duplicating resources", async () => {
    const { menus, fileDispose, folderDispose } = await boot({ crmNotebookNavigatorIntegration: true, showExplorerIcons: true });
    await plugin!.saveSettings();
    expect(menus.registerFileMenu).toHaveBeenCalledTimes(1);
    expect(observers).toHaveLength(1);
    plugin!.settings.crmNotebookNavigatorIntegration = false;
    await plugin!.saveSettings();
    expect(fileDispose).toHaveBeenCalledTimes(1);
    expect(folderDispose).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(menus.registerFileMenu).toHaveBeenCalledTimes(1);
    plugin!.settings.crmNotebookNavigatorIntegration = true;
    await plugin!.saveSettings();
    expect(menus.registerFileMenu).toHaveBeenCalledTimes(2);
    expect(observers).toHaveLength(2);
  });

  it("does not create an observer when NN icons are hidden", async () => {
    const { menus } = await boot({ crmNotebookNavigatorIntegration: true, showExplorerIcons: false });
    expect(menus.registerFileMenu).toHaveBeenCalledTimes(1);
    expect(observers).toHaveLength(0);
    plugin!.settings.showExplorerIcons = true;
    await plugin!.saveSettings();
    expect(observers).toHaveLength(1);
    plugin!.settings.showExplorerIcons = false;
    await plugin!.saveSettings();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(menus.registerFileMenu).toHaveBeenCalledTimes(1);
  });

  it("cancels delayed registration when disabled before NN becomes available", async () => {
    const { registry, menus } = await boot({ crmNotebookNavigatorIntegration: true }, false);
    plugin!.settings.crmNotebookNavigatorIntegration = false;
    await plugin!.saveSettings();
    registry["notebook-navigator"] = { api: { menus } };
    vi.advanceTimersByTime(2000);
    expect(menus.registerFileMenu).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up enabled resources when the plugin unloads", async () => {
    const { events, fileDispose, folderDispose } = await boot({ crmNativeLockMenu: true, crmNotebookNavigatorIntegration: true, showExplorerIcons: true });
    plugin!.onunload();
    expect(events.get("file-menu")?.size).toBe(0);
    expect(fileDispose).toHaveBeenCalledTimes(1);
    expect(folderDispose).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
