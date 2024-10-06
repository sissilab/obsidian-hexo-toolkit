import { PluginStatus } from "src/conversion/conversionState";

export class StatusBar {

    private baseMessage = 'Hexo: ';

    constructor(private readonly statusBarEl: HTMLElement) {
    }

    public addModClickable() {
        this.statusBarEl.addClass('mod-clickable');
    }

    public removeModClickable() {
        this.statusBarEl.removeClass('mod-clickable');
    }

    public display(status: PluginStatus) {
        this.statusBarEl.setText(this.baseMessage + status);
    }

}
