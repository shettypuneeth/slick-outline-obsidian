import { Notice, PluginSettingTab, Setting } from 'obsidian';
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

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Reading speed')
      .setDesc(`Words per minute used for reading-time estimates (default: ${DEFAULT_READING_SPEED_WPM}).`)
      .addText((text) => {
        const input = text.inputEl;
        input.type = 'number';
        input.min = '1';
        input.max = String(Number.MAX_SAFE_INTEGER);
        input.step = '1';
        input.setAttribute('aria-label', 'Reading speed (words per minute)');
        text.setValue(String(this.plugin.settings.readingSpeedWpm));

        // Commit a complete value, rather than saving each intermediate keystroke.
        input.addEventListener('input', () => input.setCustomValidity(''));
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
          }
        });
        input.addEventListener('change', () => {
          const readingSpeedWpm = input.valueAsNumber;
          if (!isReadingSpeedWpm(readingSpeedWpm)) {
            input.setCustomValidity('Enter a positive whole number of words per minute.');
            input.reportValidity();
            return;
          }
          input.setCustomValidity('');
          if (readingSpeedWpm === this.plugin.settings.readingSpeedWpm) return;

          text.setDisabled(true);
          void this.plugin.setReadingSpeedWpm(readingSpeedWpm).then(
            () => text.setValue(String(this.plugin.settings.readingSpeedWpm)).setDisabled(false),
            (error: unknown) => {
              text.setValue(String(this.plugin.settings.readingSpeedWpm)).setDisabled(false);
              console.error('SlickOutline could not save its reading speed.', error);
              new Notice('Could not save the reading speed. Please try again.');
            },
          );
        });
      });

    new Setting(this.containerEl)
      .setName('Placement')
      .setDesc('Choose a corner, or drag the collapsed circle to a custom position.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('top-left', 'Top left')
          .addOption('top-right', 'Top right')
          .addOption('bottom-left', 'Bottom left')
          .addOption('bottom-right', 'Bottom right');
        if (this.plugin.settings.customPosition) {

          // Custom is a status indicator; choosing a preset clears the dragged position.
          dropdown.addOption('custom', 'Custom position');
          const option = dropdown.selectEl.querySelector<HTMLOptionElement>('option[value="custom"]');
          if (option) option.disabled = true;
        }
        const previousSelection = this.plugin.settings.customPosition ? 'custom' : this.plugin.settings.placement;
        dropdown.setValue(previousSelection).onChange(async (value) => {
          if (!isPlacement(value)) throw new Error(`Invalid outline placement: ${value}`);
          dropdown.setDisabled(true);
          await this.plugin.setPlacement(value).then(
            () => this.display(),
            (error: unknown) => {
              dropdown.setValue(previousSelection).setDisabled(false);
              console.error('SlickOutline could not save its placement.', error);
              new Notice('Could not save the outline placement. Please try again.');
            },
          );
        });
      });
    new Setting(this.containerEl)
      .setName('Reset to defaults')
      .setDesc(`Restore the top-left position and default reading speed (${DEFAULT_READING_SPEED_WPM} words per minute) in all panes.`)
      .addButton((button) => button
        .setButtonText('Reset to defaults')
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          await this.plugin.resetSettings().then(
            () => this.display(),
            (error: unknown) => {
              button.setDisabled(false);
              console.error('SlickOutline could not reset its settings.', error);
              new Notice('Could not reset the outline settings. Please try again.');
            },
          );
        }));
  }
}
