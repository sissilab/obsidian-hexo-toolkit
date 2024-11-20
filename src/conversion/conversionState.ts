import { App, Notice, TFile } from "obsidian";
import { StatusBar } from "src/ui/statusBar/statusBar";
import { LinkMatch } from "./convertor";
import { ImageUtil } from "src/util/imageUtil";

export class ConversionState {
	private status: PluginStatus = PluginStatus.Init;
	private file: TFile | null = null; // converted file
	private linkMatches: LinkMatch[] = [];
	private startTime = 0;
	private endTime = 0;
	private errorMessages: string[] = [];

	private imageServiceTitle: string;

	private statusBar: StatusBar;
	public isOpened = false;

	private convertedContent = '';

	public constructor(statusBarEl: HTMLElement) {
		this.statusBar = new StatusBar(statusBarEl);

		this.statusBar.display(this.status);
	}

	public isReady(): boolean {
		return PluginStatus.Ready === this.status
			|| PluginStatus.FlawedSuccess === this.status
			|| PluginStatus.Success === this.status
			|| PluginStatus.Error === this.status;
	}

	public isModClickable(): boolean {
		return PluginStatus.FlawedSuccess === this.status
			|| PluginStatus.Success === this.status
			|| PluginStatus.Error === this.status;
	}

	public isConverting(): boolean {
		return PluginStatus.Converting === this.status;
	}

	public getStatus(): string {
		return this.status;
	}

	public getConvertingFileName(): string {
		if (!this.isConverting) {
			if (this.file) {
				this.file = null;
			}
			return '';
		}
		return this.file ? this.file.basename : '';
	}

	public getFilename(): string {
		return this.file ? this.file.basename : '';
	}

	public getFilePath(): string {
		return this.file ? this.file.path : '';
	}

	public addLinkMatch(linkMatch: LinkMatch) {
		if (!this.linkMatches) {
			this.linkMatches = [];
		}
		this.linkMatches.push(linkMatch);
	}

	public getLinkMatches(): LinkMatch[] {
		return this.linkMatches;
	}

	public getImageMatchesUlElement(app: App): HTMLUListElement {
		const ul = createEl('ul');
		if (!this.linkMatches) {
			return ul;
		}
		let replacedText: string;
		let isConversionFailed: boolean;
		for (const im of this.linkMatches) {
			isConversionFailed = false;
			const li = createEl('li');
			if (im.file && im.fullPath) {
				const fullPath = im.fullPath;
				const fileName = im.file.name;
				const mimeType = im.mimeType;
				const copyImageFileBtn = createEl('button', { cls: 'copy-image-file-btn', title: 'copy image file' });
				copyImageFileBtn.addEventListener('click', () => {
					ImageUtil.copyFileBySystemCommand(fullPath, fileName, mimeType);
				});
				li.appendChild(copyImageFileBtn);
			}
			if (!im.replacedText) { // conversion failed and won't be replaced
				replacedText = im.matchedText;
				isConversionFailed = true;
			} else {
				replacedText = 200 >= im.replacedText.length ? im.replacedText : im.replacedText.substring(0, 200) + ' ...';
			}
			li.appendChild(createEl('code', { text: im.matchedText }));
			li.appendChild(createSpan({ cls: isConversionFailed ? 'error-tip' : '', text: ' -> ' }));
			li.appendChild(createEl('code', { text: replacedText }));

			ul.appendChild(li);
		}
		return ul;
	}

	public isImageMatchesError(): boolean {
		if (this.linkMatches && 0 < this.linkMatches.length) {
			return this.linkMatches.some(im => !im.replacedText);
		}
		return false;
	}

	public addErrorMessages(msg: string, isNotice?: boolean, duration?: number) {
		this.errorMessages.push(msg);
		if (isNotice) {
			new Notice(msg, duration);
		}
	}

	public getErrorMessages(): string[] {
		return this.errorMessages;
	}

	public getErrorMessagesUlElement(): HTMLUListElement {
		const ul = createEl('ul');
		if (!this.errorMessages) {
			return ul;
		}
		for (const errMsg of this.errorMessages) {
			ul.appendChild(createEl('li', { text: errMsg }));
		}
		return ul;
	}

	public setImageServiceTitle(imageServiceTitle: string) {
		this.imageServiceTitle = imageServiceTitle;
	}

	public getImageServiceTitle(): string {
		return this.imageServiceTitle || '';
	}

	public getRunTime(): string {
		if (0 >= this.startTime) {
			return '';
		}
		return `${new Date(Date.now()).toISOString()} ~ ${0 < this.endTime ? new Date(this.endTime).toISOString() + ' (' + (this.endTime - this.startTime) + 'ms)' : ''}`;
	}

	public setConvertedContent(convertedContent: string) {
		this.convertedContent = convertedContent;
	}

	public getConvertedContent(): string {
		return this.convertedContent;
	}

	public getConvertedContentUlElement(): HTMLUListElement {
		const ul = createEl('ul', { cls: 'converted-content-container' });
		ul.createEl('li').createEl('textarea', { cls: 'converted-content-text', text: this.convertedContent });
		return ul;
	}

	public ready() {
		this.status = PluginStatus.Ready;
		this.statusBar.display(this.status);
		this.file = null;
		this.linkMatches = [];
		this.startTime = 0;
		this.endTime = 0;
		this.convertedContent = '';
	}

	public start(file: TFile): void {
		this.status = PluginStatus.Converting;
		this.statusBar.display(this.status);
		this.file = file;
		this.linkMatches = [];
		this.startTime = Date.now();
		this.endTime = 0;
		this.errorMessages = [];
		this.setImageServiceTitle('');
		this.convertedContent = '';
		this.statusBar.removeModClickable();
	}

	public success(isNotice?: boolean) {
		let flawedSuccessNotice = '';
		if (this.isImageMatchesError()) {
			this.status = PluginStatus.FlawedSuccess;
			flawedSuccessNotice = ' But some of the image conversion failed.';
		} else {
			this.status = PluginStatus.Success;
		}
		this.endTime = Date.now();
		this.statusBar.display(this.status);
		if (isNotice) {
			new Notice(`'${this.file?.basename}' converted and copied successfully!${flawedSuccessNotice}`);
		}
		this.statusBar.addModClickable();
	}

	public flawedSuccess(msg?: string, isNotice?: boolean, duration?: number) {
		this.status = PluginStatus.FlawedSuccess;
		this.endTime = Date.now();
		this.statusBar.display(this.status);
		if (msg) {
			this.addErrorMessages(msg, isNotice, duration);
		}
		this.statusBar.addModClickable();
	}

	public error(msg?: string, isNotice?: boolean, duration?: number) {
		this.status = PluginStatus.Error;
		this.endTime = Date.now();
		this.statusBar.display(this.status);
		if (msg) {
			this.addErrorMessages(msg, isNotice, duration);
		}
		this.statusBar.addModClickable();
	}

}

export enum PluginStatus {
	Init = 'Init ⚙️', // initializing
	Ready = 'Ready ✅', // no task and ready to convert
	Converting = 'Converting ⏳', // a conversion task is working
	FlawedSuccess = 'Flawed Success 😅',
	Success = 'Success 🎉',
	Error = 'Error 😡',
}
