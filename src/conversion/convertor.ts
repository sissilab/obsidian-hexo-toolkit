import { Notice, TFile } from "obsidian";
import { ImageBaseService, ImageServiceFactory } from "src/imageService/imageService";
import HexoPlugin from "src/main";
import { ConversionState } from "./conversionState";
import { ConversionStateModal } from "src/ui/modal/conversionStateModal";
import { ImageUtil } from "src/util/imageUtil";
import { HexoRendererTransformer } from "./hexoRendererTransformer";

export class Convertor {

	private readonly conversionState: ConversionState;

	public constructor(private readonly plugin: HexoPlugin, statusBarEl: HTMLElement) {
		this.conversionState = new ConversionState(statusBarEl);

		statusBarEl.addEventListener('click', (event) => {
			if (this.conversionState.isModClickable() && !this.conversionState.isOpened) {
				new ConversionStateModal(this.plugin.app, this.conversionState).open();
			}
		});
	}

	public ready() {
		this.conversionState.ready();
	}

	public openConversionResultByCommand() {
		if (!this.conversionState.isModClickable()) {
			new Notice(`The conversion result cannot be opened due to incorrect states!`);
			return;
		}
		if (this.conversionState.isOpened) {
			new Notice(`The conversion result has already opened!`);
			return;
		}
		new ConversionStateModal(this.plugin.app, this.conversionState).open();
	}

	public async convertToHexo(file: TFile | null) {
		if (!this.conversionState.isReady()) {
			new Notice(`[${this.plugin.manifest.id}] Not ready!`);
			return;
		}
		if (!file || !(file instanceof TFile) || 'md' != file.extension) {
			new Notice(`[${this.plugin.manifest.id}] Unsupported file to convert!`);
			return;
		}
		this.conversionState.start(file); // start to convert...
		// const fileName = file.name;
		const filePath = file.path;
		this.plugin.app.vault.read(file)
			.then(content => {
				this.convertToHexoByLines(content?.split('\n'), filePath)
					.then(convertedContent => {
						this.conversionState.setConvertedContent(convertedContent);
						navigator.clipboard.writeText(convertedContent)
							.then(() => {
								// final success (copied)
								this.conversionState.success(true);
							})
							.catch(err => {
								// error copying
								this.conversionState.flawedSuccess('Failed to copy: ' + err + ' \n^v^ But you can still manually copy the \'Converted Content\' on the \'Hexo Conversion Result\' modal dialog.', true, 5);
							});
					});
			}).catch(err => {
				this.conversionState.error('Failed to read: ' + err, true); // error reading
			});
	}

	// private static readonly HEXO_REQUIRED_FRONT_MATTER = ['title', 'lang', 'tags', 'date', 'categories'];
	private static readonly HEXO_FRONT_MATTER_TAGS = 'tags';
	private static readonly HEXO_IMAGE_SERVICE_KEY = 'hexo-image-service';

	private static readonly INLINE_CODE_BLOCK_REGEX = /`([^ `]+)`/g;
	private static readonly WIKILINK_REGEX = /(!?)\[\[(.*?)\]\]/g; // `![[]]`, `[[]]`
	private static readonly MARKDOWN_EMBED_REGEX = /!\[(.*?)\]\((.*?)\)/g; // `![]()`
	private static readonly HTTP_START_REGEX = /^(https?:\/\/)/i; // start with `http://` or `https://`
	private static readonly IMAGE_FORMAT_REGEX = /\.(jpe?g|png|gif|bmp|svg|webp|avif)$/i; // end with `.jpg` or `.jpeg` or `.png` or ...
	private static readonly IMAGE_WIDTH_REGEX = /^\d+$/; // positive integer
	private static readonly IMAGE_SIZE_REGEX = /(\d+)\s*x\s*(\d+)/; // e.g. 40 x 50

	private async convertToHexoByLines(lines: string[], sourceFilePath: string): Promise<string> {
		if (!lines || 0 >= lines.length) return '';
		let lineText: string;
		const convertedLines: string[] = [];

		const propertiesState = new PropertiesState();
		let imageService: ImageBaseService | undefined | null = undefined;
		let propertiesHandleResult: PropertiesHandleResult;
		let isMultiLineCode = false;
		for (let i = 0, len = lines.length; i < len; i++) {
			lineText = lines[i];

			// Obsidian properties -> Hexo Front-matter
			if (!(propertiesHandleResult = this.handleProperties(i, lineText, propertiesState))
				|| 'discarded' === propertiesHandleResult.handledMode) {
				continue;
			}
			lineText = propertiesHandleResult.lineText;
			if ('retained' === propertiesHandleResult.handledMode || !lineText) {
				convertedLines.push(lineText);
				continue;
			}

			// Multi-line code block
			if (lineText.startsWith('```')) {
				isMultiLineCode = !isMultiLineCode;
				convertedLines.push(lineText);
				continue;
			}
			if (isMultiLineCode) {
				convertedLines.push(lineText);
				continue;
			}

			// Split inline codes and ordinary texts
			const textStates = this.parseTextState(lineText);
			let parsedText = '';
			for (const textState of textStates) {
				let text = textState.text;
				if ('code' === textState.type) { // inline code
					parsedText += text;
					continue;
				}

				// Obsidian link to 1a heading within the same note `[[#1. xxx]]` -> Hexo `[1. xxx](#1-xxx)`
				/* text = text.replace(/\[\[#(.*?)\]\]/g, (matchedText, capturedText) => {
					return `[${capturedText}](#${capturedText.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/-$/, '')})`;
				}); */

				const linkMatches: LinkMatch[] = [];
				this.handleWikilinkMatch(text, linkMatches); // `![[]]`, `[[]]`
				this.handleMarkdownMatch(text, linkMatches); // `![]()`
				if (0 < linkMatches.length) {
					if (undefined === imageService) {
						imageService = ImageServiceFactory.getImageService(propertiesState.imageServiceConfigName, this.plugin);
						if (imageService) {
							this.conversionState.setImageServiceTitle(imageService.getServiceConfigFullName());
						} else {
							this.conversionState.setImageServiceTitle('Unknown Image Service');
							this.conversionState.addErrorMessages('Found no available Image Service');
						}
					}
					for (const lm of linkMatches) {
						this.conversionState.addLinkMatch(lm);
						if (LinkMatchStatus.Valid !== lm.status) {
							continue;
						}
						if (Convertor.HTTP_START_REGEX.test(lm.src)) {
							lm.status = LinkMatchStatus.Unmatched;
							continue;
						}
						if (!lm.alt) {
							lm.alt = lm.src;
						}
						switch (lm.linkType) {
							case LinkType.LinkingInternalHeading: {
								if (lm.src) {
									// Obsidian link to a heading within the same note `[[#1. xxx]]` -> Hexo `[1. xxx](#1-xxx)`
									const transformedHeading = HexoRendererTransformer.transformHeading(lm.src, this.plugin.settings.hexoRendererType);
									lm.replacedText = `[${lm.alt}](#${transformedHeading})`;
									text = text.replace(lm.matchedText, lm.replacedText);
								}
								continue;
							}
							case LinkType.LinkFile: {
								const linkFile = this.plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(lm.src), sourceFilePath);
								if (linkFile) {
									lm.file = linkFile;
									const metadataProps = this.plugin.app.metadataCache.getFileCache(linkFile)?.frontmatter;
									if (metadataProps) {
										const hexoPath = metadataProps['hexo-path'];
										if (hexoPath) {
											lm.replacedText = `[${lm.alt}](${hexoPath})`;
											text = text.replace(lm.matchedText, lm.replacedText);
											continue;
										}
									}
								} else {
									this.conversionState.addErrorMessages('Found no link file: ' + lm.matchedText);
								}
								break;
							}
							case LinkType.EmbedFile: {
								const linkFile = this.plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(lm.src), sourceFilePath);
								if (linkFile) {
									lm.file = linkFile;
									if (Convertor.IMAGE_FORMAT_REGEX.test(lm.src)) { // local image
										// @ts-ignore
										lm.fullPath = this.plugin.app.vault.adapter.getFullPath(linkFile.path);
										lm.mimeType = ImageUtil.getImageContentType(linkFile.extension);
										if (imageService) {
											const serviceHandleResult = await imageService.handle(lm);
											serviceHandleResult.errorMessages.forEach(msg => this.conversionState.addErrorMessages(msg));
											const replacedText = serviceHandleResult.replacedText;
											if (replacedText) {
												lm.replacedText = replacedText;
												text = text.replace(lm.matchedText, replacedText);
												continue;
											}
										}
									} else { // may be Excalidraw file -> convert to svg
										if (this.isExcalidraw(linkFile)) {
											const svgElement = await this.exportExcalidraw(linkFile);
											if (svgElement) {
												svgElement.removeAttribute('width');
												svgElement.removeAttribute('height');
												const svgContainerEl = createDiv('excalidraw-svg');
												if (lm.width && 0 < lm.width) {
													svgContainerEl.style.maxWidth = lm.width + '';
												}
												if (lm.height && 0 < lm.height) {
													svgContainerEl.style.maxHeight = lm.height + '';
												}
												svgContainerEl.appendChild(svgElement);
												lm.replacedText = svgContainerEl.outerHTML
													.replace(/\s*(>)\s*(<)\s*/g, '$1$2')
													.replace(/\s{2,}/g, ' ')
													.trim();
												text = text.replace(lm.matchedText, lm.replacedText);
												continue;
											}
										}
									}
								} else {
									this.conversionState.addErrorMessages('Found no link file: ' + lm.matchedText);
								}
								break;
							}
							default:
								continue;
						}
						lm.status = LinkMatchStatus.Unmatched;
					}
				}
				parsedText += text;
			}
			convertedLines.push(parsedText);
		}
		return convertedLines.join('\n');
	}

	/**
	 * Split inline codes and ordinary texts
	 * 
	 * @param lineText 
	 * @returns 
	 */
	private parseTextState(lineText: string): TextState[] {
		if (!lineText) {
			return [{ type: 'text', text: lineText }];
		}
		let match: RegExpExecArray | null;
		let lastIndex = 0;
		const result: TextState[] = [];
		while ((match = Convertor.INLINE_CODE_BLOCK_REGEX.exec(lineText)) !== null) {
			if (lastIndex < match.index) {
				result.push({ type: 'text', text: lineText.slice(lastIndex, match.index) });
			}
			result.push({ type: 'code', text: match[0] });
			lastIndex = Convertor.INLINE_CODE_BLOCK_REGEX.lastIndex;
		}
		if (lastIndex < lineText.length) {
			result.push({ type: 'text', text: lineText.slice(lastIndex) });
		}
		return result;
	}

	/**
	 * Handle Obsidian properties block (Hexo front-matter):
	 * 1. retain required properties defined in `HEXO_REQUIRED_FRONT_MATTER`
	 * 2. replace the values of `tags` from `_` to ` ` (deprecated)
	 * 
	 * @param i 
	 * @param lineText 
	 * @param propertiesState 
	 * @returns 
	 */
	private handleProperties(i: number, lineText: string, propertiesState: PropertiesState): PropertiesHandleResult {
		if (PropertiesIndicatorType.End === propertiesState.propertiesIndicator) {
			return { lineText, handledMode: null };
		}
		if (0 === i && '---' === lineText) {
			propertiesState.propertiesIndicator = PropertiesIndicatorType.Start;
		} else if ('---' === lineText && PropertiesIndicatorType.Inside === propertiesState.propertiesIndicator) {
			propertiesState.propertiesIndicator = PropertiesIndicatorType.End;
			return { lineText, handledMode: 'retained' };
		}
		if (null != propertiesState.propertiesIndicator) {
			if (PropertiesIndicatorType.Start == propertiesState.propertiesIndicator) {
				propertiesState.propertiesIndicator = PropertiesIndicatorType.Inside;
				return { lineText, handledMode: 'retained' };
			} else if (PropertiesIndicatorType.Inside == propertiesState.propertiesIndicator) {
				const propertyIdx = lineText.indexOf(':');
				if (0 < propertyIdx) {
					const propertyKey = lineText.substring(0, propertyIdx);
					propertiesState.isHexoProperty = this.plugin.includeHexoFrontMatter(propertyKey);
					// propertiesState.isTags = Convertor.HEXO_FRONT_MATTER_TAGS === propertyKey;
					if (Convertor.HEXO_IMAGE_SERVICE_KEY === propertyKey) {
						propertiesState.imageServiceConfigName = lineText.substring(propertyIdx + 1)?.trim();
					}
				}
				if (!propertiesState.isHexoProperty) {
					return { lineText, handledMode: 'discarded' };
				}
				/* if (propertiesState.isTags) {
					lineText = lineText.replace(/_/g, ' ');
				} */
				return { lineText, handledMode: 'retained' };
			}
		}
		return { lineText, handledMode: null };
	}

	/**
	 * Parse Wikilink format: `![[]]`, `[[]]`
	 * - Link to a file: `[[Hexo A]]`
	 * - Link to a heading in a note:
	 *   - Linking to a heading within the same note: `[[#Test Heading]]`
	 *   - Linking to a heading in another note: `[[Hexo A#Overview]]`
	 *   - Linking to subheadings `[[Hexo A#Overview#Heading Last|Change Display Text]]`
	 * - Embed files:
	 *   - Embed an image in a note: `![[image.png|alt1|alt2|30x50]]`
	 */
	private handleWikilinkMatch(lineText: string, linkMatches: LinkMatch[]): void {
		const matchFormat = LinkMatchFormat.Wikilink;
		let match: RegExpExecArray | null;
		let linkType: LinkType;
		let src: string;
		let alt: string;
		let status: LinkMatchStatus;
		let width: number | undefined = undefined;
		let height: number | undefined = undefined;
		while ((match = Convertor.WIKILINK_REGEX.exec(lineText)) !== null) {
			const [matchedText, exclamationMark, linkText] = match;
			const isEmbed = '!' === exclamationMark;
			src = '';
			alt = '';
			const linkTextArr = linkText?.split('|');
			if (!linkTextArr || 1 > linkTextArr.length || !(src = linkTextArr[0]?.trim())) {
				linkType = LinkType.Exception;
				status = LinkMatchStatus.Invalid;
				linkMatches.push({ matchedText, matchFormat, linkType, src, alt, status }); // LinkMatchStatus.Invalid
				continue;
			}
			if (isEmbed) {
				linkType = LinkType.EmbedFile;
			} else {
				if (src.startsWith('#')) { // Linking to a heading within the same note: `[[#Test Heading|Display Text]]`
					linkType = LinkType.LinkingInternalHeading;
					if (!(src = src.substring(1)?.trimStart())) {
						status = LinkMatchStatus.Invalid;
						linkMatches.push({ matchedText, matchFormat, linkType, src, alt, status }); // LinkMatchStatus.Invalid
						continue;
					}
				} else {
					linkType = LinkType.LinkFile;
				}
			}
			status = LinkMatchStatus.Valid;
			if (1 < linkTextArr.length) {
				if (LinkType.EmbedFile === linkType) {
					// parse image/Excalidraw size:
					const linkTextTail = linkTextArr[linkTextArr.length - 1]?.trim();
					if (linkTextTail) {
						if (Convertor.IMAGE_WIDTH_REGEX.test(linkTextTail)) { // <width>
							width = Number(linkTextTail);
						} else {
							const imageSizeMatch = linkTextTail.match(Convertor.IMAGE_SIZE_REGEX); // <width>x<height>
							if (imageSizeMatch) {
								width = Number(imageSizeMatch[1]);
								height = Number(imageSizeMatch[2]);
							}
						}
					}
					// parse image alt:
					alt = linkTextArr.slice(1, undefined === width ? linkTextArr.length : linkTextArr.length - 1).join('|').trimStart();
				} else {
					alt = linkTextArr.slice(1).join('').trimStart();
				}
			}
			linkMatches.push({ matchedText, matchFormat, linkType, src, alt, status, width, height }); // LinkMatchStatus.Valid
		}
	}

	// ![]()
	// e.g. ![image alt](image.png), ![image alt|30](image.png)
	private handleMarkdownMatch(lineText: string, linkMatches: LinkMatch[]): void {
		const matchFormat = LinkMatchFormat.Markdown;
		let match: RegExpExecArray | null;
		let linkType: LinkType;
		let src: string;
		let alt: string;
		let status: LinkMatchStatus;
		let width: number | undefined = undefined;
		let height: number | undefined = undefined;
		// const isEmbed = true;
		// Markdown embed a local image `![alt1|alt2|30x50](image.png)` -> Image Service
		while ((match = Convertor.MARKDOWN_EMBED_REGEX.exec(lineText)) !== null) {
			const [matchedText, altText, linkText] = match;
			src = '';
			alt = '';
			const srcIdx = linkText.indexOf('|')
			src = 0 < srcIdx ? linkText.substring(0, srcIdx) : linkText;
			if (!src) {
				linkType = LinkType.Exception;
				status = LinkMatchStatus.Invalid;
				linkMatches.push({ matchedText, matchFormat, linkType, src, alt, status }); // LinkMatchStatus.Invalid
				continue;
			}
			status = LinkMatchStatus.Valid;
			linkType = LinkType.EmbedFile;
			if (altText) {
				const altIdx = altText.lastIndexOf('|');
				const altTextTail = (0 > altIdx ? altText : altText.substring(altIdx + 1)).trim();
				if (altTextTail) {
					if (Convertor.IMAGE_WIDTH_REGEX.test(altTextTail)) { // <width>
						width = Number(altTextTail);
					} else {
						const imageSizeMatch = altTextTail.match(Convertor.IMAGE_SIZE_REGEX);
						if (imageSizeMatch) { // <width>x<height>
							width = Number(imageSizeMatch[1]);
							height = Number(imageSizeMatch[2]);
						}
					}
				}
				alt = (undefined === width ? altText : altText.substring(0, altIdx)).trimStart();
			}
			linkMatches.push({ matchedText, matchFormat, linkType, src, alt, status, width, height });
		}
	}

	private isExcalidraw(file: TFile): boolean {
		// const metadata = this.plugin.app.metadataCache.getFileCache(file);
		// const properties = metadata?.frontmatter;
		// if (properties) {
		//     return 'excalidraw-plugin' in properties;
		// }
		return (
			'excalidraw' === file.extension ||
			// @ts-ignore
			(ExcalidrawAutomate.isExcalidrawFile && ExcalidrawAutomate.isExcalidrawFile(file))
		);
	}

	private async exportExcalidraw(file: TFile) {
		try {
			// @ts-ignore
			ExcalidrawAutomate.reset();
			// @ts-ignore
			// const image = await ExcalidrawAutomate.createPNG(file.path);
			// @ts-ignore
			return ExcalidrawAutomate.createSVG(file.path);
		} catch (error) {
			this.conversionState.addErrorMessages(`Failed to export Excalidraw '${file.basename}': ${error}`);
		}
		return null;
	}

}

enum PropertiesIndicatorType {
	Start,
	Inside,
	End
}

interface PropertiesHandleResult {
	lineText: string,
	handledMode: 'discarded' | 'retained' | null
}

class PropertiesState {
	public propertiesIndicator: PropertiesIndicatorType | null = null;
	public isHexoProperty = false;
	public isTags = false;

	public imageServiceConfigName: string;
}

interface TextState {
	type: 'text' | 'code',
	text: string
}

export interface LinkMatch {
	matchedText: string,
	matchFormat: LinkMatchFormat,
	linkType: LinkType,
	src: string,
	alt: string,
	status: LinkMatchStatus,
	width?: number | undefined, // image width
	height?: number | undefined, // image height
	file?: TFile, // the corresponding file for `src`
	mimeType?: string,
	fullPath?: string, // absolute file full path
	replacedText?: string
}

export enum LinkMatchFormat {
	Wikilink,
	Markdown
}

export enum LinkType {
	Exception,
	LinkingInternalHeading, // `[[#Heading One]]`
	LinkFile, // `[[file name]]`
	EmbedFile, // `![[file name]]`. It may be an image, Excalidraw file,  or other file ...
	EmbedImage,
}

export enum LinkMatchStatus {
	Invalid,
	Valid,
	Unmatched
}
