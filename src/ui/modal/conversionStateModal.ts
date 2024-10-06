import { App, Modal } from "obsidian";
import { ConversionState } from "src/conversion/conversionState";

export class ConversionStateModal extends Modal {
    constructor(app: App, private readonly conversionState: ConversionState) {
        super(app);
        this.setTitle('Hexo Conversion Result');
    }

    onOpen() {
        const { contentEl } = this;
        const state = this.conversionState;

        contentEl.addClass('modal-conversion-state'); // mcs
        contentEl.setAttr('spellcheck', 'false');

        contentEl.appendChild(this.createMcsItem('File Name', state.getFilename()));
        contentEl.appendChild(this.createMcsItem('File Path', state.getFilePath()));
        contentEl.appendChild(this.createMcsItem('Image Service', state.getImageServiceTitle()));
        contentEl.appendChild(this.createMcsItem('Status', state.getStatus()));
        contentEl.appendChild(this.createMcsItem('Run Time', state.getRunTime()));
        contentEl.appendChild(this.createMcsItem('Error Messages', state.getErrorMessagesUlElement()));
        contentEl.appendChild(this.createMcsItem('Image Matches', state.getImageMatchesUlElement(this.app)));
        contentEl.appendChild(this.createMcsItem('Converted Content', state.getConvertedContentUlElement()));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
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
