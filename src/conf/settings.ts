import { PluginSettingTab, App, Setting } from "obsidian";
import { ImageServiceTypeEnum, ImageServiceConfig } from "src/imageService/imageModel";
import HexoPlugin from "src/main";
import { t } from "src/lang/helper";

export interface HexoPluginSettings {
    hexoFrontMatterProperties: string;
    imageServiceConfigs: ImageServiceConfig[];
}

export const DEFAULT_SETTINGS: HexoPluginSettings = {
    hexoFrontMatterProperties: 'title,date,updated,tags,categories',
    imageServiceConfigs: [{ type: ImageServiceTypeEnum.Local, name: '' }],
}

export class HexoPluginSettingTab extends PluginSettingTab {
    plugin: HexoPlugin;

    constructor(app: App, plugin: HexoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.addClass('hexo-toolkit-setting');

        containerEl.createEl('h2', { text: 'Hexo Toolkit v' + this.plugin.manifest.version });

        new Setting(containerEl)
            .setClass('hexo-front-matter')
            .setName('Hexo Front-matter')
            .setDesc('When converting to Hexo-compatible markdown, only keep the property names configured here, separated by commas, such as `title,date,updated,tags,categories`.')
            .addText(text => text
                .setPlaceholder('Enter Hexo Front-matter properties')
                .setValue(this.plugin.settings.hexoFrontMatterProperties)
                .onChange(async (value) => {
                    this.plugin.settings.hexoFrontMatterProperties = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Image Hosting Services')
            .setDesc('Setting image hosting services to upload images.')
            .addButton(btn => {
                btn.setIcon('plus')
                    .setTooltip('Add an image hosting service')
                    .setCta()
                    .onClick(() => {
                        this.plugin.settings.imageServiceConfigs.push({
                            type: ImageServiceTypeEnum.Local,
                            name: '',
                            filePath: ''
                        });
                        this.plugin.saveSettings();
                        this.display();
                    });
            });

        const settingsContainer = containerEl.createDiv('image-service-settings');
        this.plugin.settings.imageServiceConfigs.forEach((service, index) => {
            this.createServiceSetting(settingsContainer, service, index);
        });
    }

    createServiceSetting(container: HTMLElement, service: ImageServiceConfig, index: number): void {
        const serviceGroup = container.createDiv('image-service-group');
        const details = serviceGroup.createEl('details', { attr: { 'open': '' } });

        const summary = details.createEl('summary');
        summary.createSpan({ cls: 'collapse-icon' });
        const summaryTextEl = summary.createSpan({ text: service.name || `Image Service ${index + 1}`, cls: 'summary-text' });
        if (0 < index) {
            summary.createEl('button', { text: '↑', cls: 'move-up-btn' })
                .addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (1 > index) {
                        return;
                    }
                    const temp = this.plugin.settings.imageServiceConfigs[index - 1];
                    this.plugin.settings.imageServiceConfigs[index - 1] = service;
                    this.plugin.settings.imageServiceConfigs[index] = temp;

                    await this.plugin.saveSettings();
                    this.display();
                });
        }
        if (this.plugin.settings.imageServiceConfigs.length - 1 > index) {
            summary.createEl('button', { text: '↓', cls: 'move-down-btn' })
                .addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.plugin.settings.imageServiceConfigs.length - 1 < index) {
                        return;
                    }
                    const temp = this.plugin.settings.imageServiceConfigs[index + 1];
                    this.plugin.settings.imageServiceConfigs[index + 1] = service;
                    this.plugin.settings.imageServiceConfigs[index] = temp;

                    await this.plugin.saveSettings();
                    this.display();
                });
        }
        summary.createEl('button', { text: '-', cls: 'remove-service-btn' })
            .addEventListener('click', async (e) => {
                e.preventDefault();
                this.plugin.settings.imageServiceConfigs.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
            });

        const serviceDetailsEl = details.createDiv('service-details');

        new Setting(serviceDetailsEl)
            .setName('Type')
            .addDropdown(dropdown => {
                for (const key in ImageServiceTypeEnum) {
                    // @ts-ignore
                    dropdown.addOption(key, t(key));
                }
                dropdown.setValue(service.type || '');
                dropdown.onChange(async (value) => {
                    service.type = value as ImageServiceTypeEnum;
                    await this.plugin.saveSettings();
                    this.display();
                });
            });

        new Setting(serviceDetailsEl)
            .setName('Name')
            .addText(text => text
                .setPlaceholder('Enter name')
                .setValue(service.name)
                .onChange(async (value) => {
                    service.name = value;
                    if (!value) {
                        summaryTextEl.setText(`Image Service ${index + 1}`);
                    } else {
                        summaryTextEl.setText(value);
                    }
                    await this.plugin.saveSettings();
                }));

        switch (service.type) {
            case ImageServiceTypeEnum.Local:
                this.addFilePath(serviceDetailsEl, service);
                break;
            case ImageServiceTypeEnum.Smms:
                this.addApiKey(serviceDetailsEl, service);
                break;
            default:
                break;
        }

    }

    addApiKey(serviceDetailsEl: HTMLDivElement, service: ImageServiceConfig) {
        new Setting(serviceDetailsEl)
            .setName('API Key')
            .addText(text => text
                .setPlaceholder('Enter API key')
                .setValue(service.apiKey || '')
                .onChange(async (value) => {
                    service.apiKey = value;
                    await this.plugin.saveSettings();
                }));
    }

    addFilePath(serviceDetailsEl: HTMLDivElement, service: ImageServiceConfig) {
        new Setting(serviceDetailsEl)
            .setName('File Path')
            .addText(text => text
                .setPlaceholder('Enter file path')
                .setValue(service.filePath || '')
                .onChange(async (value) => {
                    service.filePath = value;
                    await this.plugin.saveSettings();
                }));
    }

}
