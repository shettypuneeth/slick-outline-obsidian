import { PluginSettingTab, Setting } from 'obsidian';
import type OutlinerPlugin from './main';

export type OutlinerPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface OutlinerSettings {
  placement: OutlinerPlacement;
}

export const DEFAULT_SETTINGS: Readonly<OutlinerSettings> = {
  placement: 'top-left',
};

export function isPlacement(value: unknown): value is OutlinerPlacement {
  return value === 'top-left' || value === 'top-right' ||
    value === 'bottom-left' || value === 'bottom-right';
}

export function readSettings(data: unknown): OutlinerSettings {
  return {
    placement: typeof data === 'object' && data !== null &&
      'placement' in data && isPlacement(data.placement)
      ? data.placement : DEFAULT_SETTINGS.placement,
  };
}

export class OutlinerSettingTab extends PluginSettingTab {
  constructor(private readonly outliner: OutlinerPlugin) {
    super(outliner.app, outliner);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Placement')
      .setDesc('Choose the corner for the outliner in each Markdown pane.')
      .addDropdown((dropdown) => dropdown
        .addOption('top-left', 'Top left')
        .addOption('top-right', 'Top right')
        .addOption('bottom-left', 'Bottom left')
        .addOption('bottom-right', 'Bottom right')
        .setValue(this.outliner.settings.placement)
        .onChange(async (value) => {
          if (!isPlacement(value)) throw new Error(`Invalid outliner placement: ${value}`);
          await this.outliner.setPlacement(value);
        }));
  }
}
