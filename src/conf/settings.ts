import { PluginSettingTab, App, Setting } from "obsidian";
import { ImageServiceTypeEnum, ImageServiceConfig } from "src/imageService/imageModel";
import HexoPlugin from "src/main";
import { t } from "src/lang/helper";
import { HexoRendererType } from "src/conversion/hexoRendererTransformer";

export interface HexoPluginSettings {
	hexoFrontMatterProperties: string;
	hexoRendererType: HexoRendererType;
	imageServiceConfigs: ImageServiceConfig[];
}

export const DEFAULT_SETTINGS: HexoPluginSettings = {
	hexoFrontMatterProperties: 'title,date,updated,tags,categories',
	hexoRendererType: HexoRendererType.HexoRendererMarked,
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

		new Setting(containerEl)
			.setClass('hexo-front-matter')
			.setName(t('HexoFrontMatterName'))
			.setDesc(t('HexoFrontMatterDesc'))
			.addText(text => text
				.setPlaceholder('Enter Hexo Front-matter properties')
				.setValue(this.plugin.settings.hexoFrontMatterProperties)
				.onChange(async (value) => {
					this.plugin.settings.hexoFrontMatterProperties = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('HexoRendererTypeName'))
			.setDesc(t('HexoRendererTypeDesc'))
			.addDropdown(dropdown => {
				for (const key in HexoRendererType) {
					// @ts-ignore
					dropdown.addOption(key, t(key));
				}
				dropdown.setValue(this.plugin.settings.hexoRendererType);
				dropdown.onChange(async (value) => {
					this.plugin.settings.hexoRendererType = value as HexoRendererType;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t('ImageHostingServicesName'))
			.setDesc(t('ImageHostingServicesDesc'))
			.addButton(btn => {
				btn.setIcon('plus')
					.setTooltip(t('ImageHostingServicesAddBtnTip'))
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
			.setName(t('ImageServiceType'))
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
			.setName(t('ImageServiceName'))
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
			.setName(t('ImageServiceApiKey'))
			.addText(text => text
				.setPlaceholder(t('ImageServiceApiKeyPlaceholder'))
				.setValue(service.apiKey || '')
				.onChange(async (value) => {
					service.apiKey = value;
					await this.plugin.saveSettings();
				}));
	}

	addFilePath(serviceDetailsEl: HTMLDivElement, service: ImageServiceConfig) {
		new Setting(serviceDetailsEl)
			.setName(t('ImageServiceFilePath'))
			.addText(text => text
				.setPlaceholder(t('ImageServiceFilePathPlaceholder'))
				.setValue(service.filePath || '')
				.onChange(async (value) => {
					service.filePath = value;
					await this.plugin.saveSettings();
				}));
	}

}
