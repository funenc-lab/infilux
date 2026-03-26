import { describe, expect, it } from "vitest";
import { APP_COLOR_PRESET_OPTIONS } from "@/lib/appTheme";
import { buildAppearanceColorPresetModel } from "../appearanceColorPresetModel";

describe("buildAppearanceColorPresetModel", () => {
  it("falls back to the first preset when the selected id is unknown", () => {
    const model = buildAppearanceColorPresetModel({
      selectedPresetId: "missing-preset",
      presetOptions: APP_COLOR_PRESET_OPTIONS,
    });

    expect(model.selectedPreset.id).toBe(APP_COLOR_PRESET_OPTIONS[0]?.id);
  });

  it("marks the curated presets as recommended", () => {
    const model = buildAppearanceColorPresetModel({
      selectedPresetId: "graphite-ink",
      presetOptions: APP_COLOR_PRESET_OPTIONS,
    });

    expect(
      model.compactOptions.find((option) => option.id === "graphite-ink")
        ?.recommended,
    ).toBe(true);
    expect(
      model.compactOptions.find((option) => option.id === "tide-blue")
        ?.recommended,
    ).toBe(true);
    expect(
      model.compactOptions.find((option) => option.id === "warm-graphite")
        ?.recommended,
    ).toBe(true);
    expect(
      model.compactOptions.find((option) => option.id === "classic-red")
        ?.recommended,
    ).toBe(false);
  });
});
