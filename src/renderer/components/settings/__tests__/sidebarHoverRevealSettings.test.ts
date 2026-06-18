import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const generalSettingsSource = readFileSync(resolve(currentDir, '../GeneralSettings.tsx'), 'utf8');
const layoutSectionStart = generalSettingsSource.indexOf("t('Layout')");
const layoutSectionEnd = generalSettingsSource.indexOf("t('Agent Session Display')");
const layoutSectionSource = generalSettingsSource.slice(layoutSectionStart, layoutSectionEnd);

describe('floating sidebar settings', () => {
  it('exposes the floating sidebar setting inside layout settings', () => {
    expect(layoutSectionSource).toContain('floatingSidebarEnabled');
    expect(layoutSectionSource).toContain('setFloatingSidebarEnabled');
    expect(layoutSectionSource).toContain("t('Floating sidebar')");
    expect(layoutSectionSource).toContain(
      'Show the sidebar as a floating overlay when the pointer reaches the left edge.'
    );
    expect(layoutSectionSource).toContain('onCheckedChange={setFloatingSidebarEnabled}');
  });

  it('keeps floating sidebar field parts inside a Field root', () => {
    const hoverLabelIndex = layoutSectionSource.indexOf("t('Floating sidebar')");
    const hoverFieldPrefix = layoutSectionSource.slice(
      Math.max(0, hoverLabelIndex - 260),
      hoverLabelIndex
    );

    expect(hoverFieldPrefix).toContain(
      '<Field className="settings-field-row settings-field-row-start border-t border-border/70 pt-5">'
    );
    expect(hoverFieldPrefix).not.toContain(
      '<div className="settings-field-row settings-field-row-start border-t border-border/70 pt-5">'
    );
  });

  it('exposes the floating toolbar setting inside layout settings', () => {
    expect(layoutSectionSource).toContain('floatingToolbarEnabled');
    expect(layoutSectionSource).toContain('setFloatingToolbarEnabled');
    expect(layoutSectionSource).toContain("t('Floating toolbar')");
    expect(layoutSectionSource).toContain(
      'Show the toolbar as a floating overlay when the pointer reaches the right edge.'
    );
    expect(layoutSectionSource).toContain('onCheckedChange={setFloatingToolbarEnabled}');
  });
});
