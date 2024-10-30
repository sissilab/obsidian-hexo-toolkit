import { FileSystemAdapter, MarkdownView, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, HexoPluginSettings, HexoPluginSettingTab } from './conf/settings';
import { Convertor } from './conversion/convertor';

export default class HexoPlugin extends Plugin {
	public settings: HexoPluginSettings;
	private convertor: Convertor;

	async onload() {
		console.log('loading %s plugin v%s ...', this.manifest.id, this.manifest.version);

		await this.loadSettings();

		await this.loadPlugin();

		this.addCommands();

		this.addSettingTab(new HexoPluginSettingTab(this.app, this));

		this.convertor.ready();
	}

	onunload() {
		console.log('unloading %s plugin v%s ...', this.manifest.id, this.manifest.version);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadPlugin() {
		this.convertor = new Convertor(this, this.addStatusBarItem());
	}

	private addCommands() {
		this.addCommand({
			id: 'hexo-converter',
			name: 'Convert',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view && 'markdown' == view.getViewType()) {
					if (!checking) {
						this.convertor.convertToHexo(view.file);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'hexo-conversion-result',
			name: 'Open last conversion result',
			callback: () => this.convertor.openConversionResultByCommand()
		});
	}

	public includeHexoFrontMatter(propertyName: string): boolean {
		if (propertyName && this.settings.hexoFrontMatterProperties) {
			return this.settings.hexoFrontMatterProperties.split(',').some(prop => propertyName === prop.trim());
		}
		return false;
	}

	private getPluginAbsolutePath(): string {
		let basePath;
		// base path
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			basePath = this.app.vault.adapter.getBasePath();
		} else {
			throw new Error('Cannot determine base path.');
		}
		// relative path
		const relativePath = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		// absolute path
		return `${basePath}/${relativePath}`;
	}

}
