import { App, Modal } from "obsidian";
import { ConversionState } from "src/conversion/conversionState";
import { t } from "src/lang/helper";

export class ConversionStateModal extends Modal {
	constructor(app: App, private readonly conversionState: ConversionState) {
		super(app);
		this.setTitle('Hexo Conversion Result');
	}

	onOpen() {
		const { contentEl } = this;
		const state = this.conversionState;
		state.isOpened = true;

		contentEl.addClass('modal-conversion-state'); // mcs
		contentEl.setAttr('spellcheck', 'false');

		contentEl.appendChild(this.createMcsItem(t('FileName'), state.getFilename()));
		contentEl.appendChild(this.createMcsItem(t('FilePath'), state.getFilePath()));
		contentEl.appendChild(this.createMcsItem(t('ImageService'), state.getImageServiceTitle()));
		contentEl.appendChild(this.createMcsItem(t('Status'), state.getStatus()));
		contentEl.appendChild(this.createMcsItem(t('RunTime'), state.getRunTime()));
		contentEl.appendChild(this.createMcsItem(t('ErrorMessages'), state.getErrorMessagesUlElement()));
		contentEl.appendChild(this.createMcsItem(t('ImageMatches'), state.getImageMatchesUlElement(this.app)));
		contentEl.appendChild(this.createMcsItem(t('ConvertedContent'), state.getConvertedContentUlElement()));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.conversionState.isOpened = false;
	}

	private createMcsItem(key: string, val: string): HTMLDivElement;
	private createMcsItem(key: string, val: HTMLUListElement): HTMLDivElement;
	private createMcsItem(key: string, val: string | HTMLUListElement): HTMLDivElement {
		const itemDivEl = createDiv({ cls: 'mcs-item' });
		itemDivEl.appendChild(createSpan({ cls: 'mcs-item-key', text: key }));
		itemDivEl.appendText(': ');
		const valSpanEl = createSpan({ cls: 'mcs-item-val' });
		if (typeof val === 'string') {
			valSpanEl.setText(val);
		} else if (val instanceof HTMLUListElement) {
			valSpanEl.appendChild(val);
		}
		itemDivEl.appendChild(valSpanEl);
		return itemDivEl;
	}

}
