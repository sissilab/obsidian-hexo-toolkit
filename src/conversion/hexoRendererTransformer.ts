
import { slugize, stripHTML, unescapeHTML } from 'hexo-util';
import uslug from 'uslug';

export class HexoRendererTransformer {

	public static transformHeading(text: string, hexoRendererType: HexoRendererType): string {
		if (!text || !hexoRendererType) {
			return text;
		}
		switch (hexoRendererType) {
			case HexoRendererType.HexoRendererMarked:
				/**
				 * options:
				 * - `separator`: Separator, default '-'
				 * - `transform`: Transform the string into lower case (1) or upper case (2)
				 */
				return slugize(stripHTML(unescapeHTML(text)).trim(), {/*options: separator, transform*/ });
			case HexoRendererType.HexoRendererMarkdownItPlus:
				return uslug(text);
			default:
				break
		}
		return text;
	}

}

export enum HexoRendererType {
	// hexo-util (Hexo default: Slugize): https://github.com/hexojs/hexo-util?tab=readme-ov-file#slugizestr-options
	// Slugize in hexo-util (hexo-renderer-marked)
	HexoRendererMarked = 'HexoRendererMarked',
	// Uslug (hexo-renderer-markdown-it-plus)
	HexoRendererMarkdownItPlus = 'HexoRendererMarkdownItPlus',
}
