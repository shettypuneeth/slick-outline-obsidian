import { Notice, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type SlickOutlinePlugin from './main';
import type { RelativePosition } from './slick-outline/geometry';
import { DEFAULT_READING_SPEED_WPM, isReadingSpeedWpm } from './slick-outline/readingTime';

export type SlickOutlinePlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SlickOutlineSettings {
  placement: SlickOutlinePlacement;
  customPosition: RelativePosition | null;
  readingSpeedWpm: number;
}

export const DEFAULT_SETTINGS: Readonly<SlickOutlineSettings> = {
  placement: 'top-left',
  customPosition: null,
  readingSpeedWpm: DEFAULT_READING_SPEED_WPM,
};

export function isPlacement(value: unknown): value is SlickOutlinePlacement {
  return value === 'top-left' || value === 'top-right' ||
    value === 'bottom-left' || value === 'bottom-right';
}

/** Loads current or legacy preferences, falling back to defaults for invalid saved values. */
export function readSettings(data: unknown): SlickOutlineSettings {
  const savedSettings = typeof data === 'object' && data !== null ? data : {};
  const savedPosition = 'customPosition' in savedSettings ? savedSettings.customPosition : null;

  // Older settings have only a preset; malformed coordinates also fall back to that preset.
  const customPosition = typeof savedPosition === 'object' && savedPosition !== null &&
    'x' in savedPosition && typeof savedPosition.x === 'number' && Number.isFinite(savedPosition.x) &&
    savedPosition.x >= 0 && savedPosition.x <= 1 &&
    'y' in savedPosition && typeof savedPosition.y === 'number' && Number.isFinite(savedPosition.y) &&
    savedPosition.y >= 0 && savedPosition.y <= 1 ? { x: savedPosition.x, y: savedPosition.y } : null;
  return {
    placement: 'placement' in savedSettings && isPlacement(savedSettings.placement)
      ? savedSettings.placement : DEFAULT_SETTINGS.placement,
    customPosition,
    readingSpeedWpm: 'readingSpeedWpm' in savedSettings && isReadingSpeedWpm(savedSettings.readingSpeedWpm)
      ? savedSettings.readingSpeedWpm : DEFAULT_SETTINGS.readingSpeedWpm,
  };
}

export class SlickOutlineSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: SlickOutlinePlugin) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const placementOptions: Record<string, string> = {
      'top-left': 'Top left',
      'top-right': 'Top right',
      'bottom-left': 'Bottom left',
      'bottom-right': 'Bottom right',
    };
    if (this.plugin.settings.customPosition) placementOptions.custom = 'Custom position';

    return [
      {
        name: 'Reading speed',
        desc: `Words per minute used for reading-time estimates (default: ${DEFAULT_READING_SPEED_WPM}).`,
        control: {
          type: 'number',
          key: 'readingSpeedWpm',
          defaultValue: DEFAULT_READING_SPEED_WPM,
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          step: 1,
          validate: (value) => isReadingSpeedWpm(value)
            ? undefined : 'Enter a positive whole number of words per minute.',
        },
      },
      {
        name: 'Placement',
        desc: 'Choose a corner, or drag the collapsed circle to a custom position.',
        control: {
          type: 'dropdown',
          key: 'placement',
          options: placementOptions,
        },
      },
      {
        name: 'Reset to defaults',
        desc: `Restore the top-left position and default reading speed (${DEFAULT_READING_SPEED_WPM} words per minute) in all panes.`,
        render: (setting) => {
          setting.addButton((button) => button
            .setButtonText('Reset to defaults')
            .setCta()
            .onClick(async () => {
              button.setDisabled(true);
              await this.plugin.resetSettings().then(
                () => this.update(),
                (error: unknown) => {
                  button.setDisabled(false);
                  console.error('SlickOutline could not reset its settings.', error);
                  new Notice('Could not reset the outline settings. Please try again.');
                },
              );
            }));
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === 'readingSpeedWpm') return this.plugin.settings.readingSpeedWpm;
    if (key === 'placement') {
      return this.plugin.settings.customPosition ? 'custom' : this.plugin.settings.placement;
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'readingSpeedWpm') {
      if (!isReadingSpeedWpm(value) || value === this.plugin.settings.readingSpeedWpm) return;
      await this.plugin.setReadingSpeedWpm(value).catch((error: unknown) => {
        this.update();
        console.error('SlickOutline could not save its reading speed.', error);
        new Notice('Could not save the reading speed. Please try again.');
      });
      return;
    }

    if (key === 'placement') {
      if (value === 'custom' && this.plugin.settings.customPosition) return;
      if (!isPlacement(value)) throw new TypeError(`Invalid outline placement: ${String(value)}`);
      await this.plugin.setPlacement(value).then(
        () => this.update(),
        (error: unknown) => {
          this.update();
          console.error('SlickOutline could not save its placement.', error);
          new Notice('Could not save the outline placement. Please try again.');
        },
      );
    }
  }
}
