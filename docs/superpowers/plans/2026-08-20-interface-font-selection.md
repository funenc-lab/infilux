# Interface Font Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Interface typography font-preset selector accurately represent recommended and historical custom font stacks without allowing manual font entry.

**Architecture:** Add a settings-scoped pure model that derives the Select value and display label from the persisted font-family string plus the recommended presets. `AppearanceSettings` consumes that model for both the trigger and menu, while the Zustand store remains responsible only for persisting the actual CSS font stack.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Base UI Select, Zustand.

## Scope Amendment

The implementation also places the interface font selector in the custom theme editor and
converts terminal and editor font-family controls to the same shared preset selector. Font sizes
remain numeric inputs. Persisted custom font stacks remain visible as disabled selections and are
only replaced when a user explicitly chooses a recommended preset.

## Global Constraints

- Keep persisted `fontFamily` values backward compatible; do not add a store field or migration.
- Keep generated TypeScript and code comments in English.
- Reuse the existing `Select` primitive and preserve keyboard and focus behavior.
- Restrict the change to Interface typography; remove the custom font-stack input and do not alter terminal font settings.
- Tests must exercise exported behavior and use independently derived expectations.

---

### Task 1: Create the interface font-preset selection model

**Files:**

- Create: `src/renderer/components/settings/interfaceFontPresetModel.ts`
- Create: `src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

**Interfaces:**

- Consumes: `UIFontPresetOption` from `@/stores/settings`.
- Produces: `buildInterfaceFontPresetSelection(options, fontFamily)` returning `{ selectedId, selectedLabel, options }`.
- Produces: `CUSTOM_INTERFACE_FONT_PRESET_ID` with the literal value `custom`.

- [ ] **Step 1: Write the failing test**

```typescript
it('represents an unrecognized font stack as the custom selection', () => {
  const selection = buildInterfaceFontPresetSelection(
    [
      { id: 'platform-default', fontFamily: 'system-ui, sans-serif' },
      { id: 'english-priority', fontFamily: 'Inter, sans-serif' },
    ],
    'IBM Plex Sans, sans-serif'
  );

  expect(selection.selectedId).toBe('custom');
  expect(selection.selectedLabel).toBe('Custom font stack');
  expect(selection.options).toContainEqual({
    id: 'custom',
    label: 'Custom font stack',
    disabled: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

Expected: FAIL because `interfaceFontPresetModel` and `buildInterfaceFontPresetSelection` do not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
export const CUSTOM_INTERFACE_FONT_PRESET_ID = 'custom' as const;

export function buildInterfaceFontPresetSelection(
  recommendedOptions: readonly UIFontPresetOption[],
  fontFamily: string
): InterfaceFontPresetSelection {
  const matchedOption = recommendedOptions.find((option) => option.fontFamily === fontFamily);
  const selectedId = matchedOption?.id ?? CUSTOM_INTERFACE_FONT_PRESET_ID;
  const selectedLabel = matchedOption ? getInterfaceFontPresetLabel(matchedOption.id) : 'Custom font stack';

  return {
    selectedId,
    selectedLabel,
    options: [
      ...recommendedOptions.map((option) => ({
        id: option.id,
        label: getInterfaceFontPresetLabel(option.id),
        disabled: false,
      })),
      ...(matchedOption ? [] : [{ id: CUSTOM_INTERFACE_FONT_PRESET_ID, label: selectedLabel, disabled: true }]),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/interfaceFontPresetModel.ts src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts
git commit -m "fix(settings): model custom interface font selection"
```

### Task 2: Render the selector from the shared model without manual entry

**Files:**

- Modify: `src/renderer/components/settings/AppearanceSettings.tsx:1381-1465`
- Modify: `src/renderer/components/settings/AppearanceSettings.tsx:2339-2357`
- Test: `src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

**Interfaces:**

- Consumes: `buildInterfaceFontPresetSelection` from `interfaceFontPresetModel.ts`.
- Consumes: `getRecommendedUIFontPresets(language)` and the persisted `localAppFontFamily`.
- Produces: a Select whose value, trigger label, item labels, and applied font stack all derive from the same selection model; no manual font input is rendered.

- [ ] **Step 1: Extend the failing test**

```typescript
it('uses the matching recommendation label for the selected value', () => {
  const selection = buildInterfaceFontPresetSelection(
    [
      { id: 'platform-default', fontFamily: 'system-ui, sans-serif' },
      { id: 'cjk-priority', fontFamily: 'PingFang SC, system-ui, sans-serif' },
    ],
    'PingFang SC, system-ui, sans-serif'
  );

  expect(selection.selectedId).toBe('cjk-priority');
  expect(selection.selectedLabel).toBe('Chinese UI optimized');
  expect(selection.options).toContainEqual({
    id: 'cjk-priority',
    label: 'Chinese UI optimized',
    disabled: false,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

Expected: FAIL because the model does not yet provide a stable label for the matching recommendation.

- [ ] **Step 3: Write minimal implementation**

```tsx
const uiFontPresetSelection = React.useMemo(
  () => buildInterfaceFontPresetSelection(uiFontPresetOptions, localAppFontFamily),
  [localAppFontFamily, uiFontPresetOptions]
);

<Select value={uiFontPresetSelection.selectedId} onValueChange={handleUIFontPresetChange}>
  <SelectTrigger>
    <SelectValue>{t(uiFontPresetSelection.selectedLabel)}</SelectValue>
  </SelectTrigger>
  <SelectPopup>
    {uiFontPresetSelection.options.map((option) => (
      <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
        {t(option.label)}
      </SelectItem>
    ))}
  </SelectPopup>
</Select>
```

Update `handleUIFontPresetChange` to return immediately for `custom`, then resolve only configured recommendation IDs before updating `localAppFontFamily` and `setAppFontFamily`.
Remove the `Custom font stack` settings row and its controlled `Input`; retain `localAppFontFamily` only as the display and selection state for persisted values.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts src/renderer/stores/settings/__tests__/defaults.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/AppearanceSettings.tsx src/renderer/components/settings/interfaceFontPresetModel.ts src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts
git commit -m "fix(settings): align interface font preset labels"
```

### Task 3: Verify the renderer contract

**Files:**

- Verify: `src/renderer/components/settings/AppearanceSettings.tsx`
- Verify: `src/renderer/components/settings/interfaceFontPresetModel.ts`
- Verify: `src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts`

**Interfaces:**

- Consumes: the completed selection model and existing appearance settings state.
- Produces: verified type-safe Interface typography behavior for recommended and custom stacks.

- [ ] **Step 1: Run focused behavior tests**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts src/renderer/stores/settings/__tests__/defaults.test.ts`

Expected: PASS with both custom and recommended font-stack cases covered.

- [ ] **Step 2: Run renderer type validation**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors from the new model or Select props.

- [ ] **Step 3: Run lint validation**

Run: `pnpm lint`

Expected: PASS with no lint errors in the changed settings files.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/settings/AppearanceSettings.tsx src/renderer/components/settings/interfaceFontPresetModel.ts src/renderer/components/settings/__tests__/interfaceFontPresetModel.test.ts
git commit -m "test(settings): cover interface font selection"
```
