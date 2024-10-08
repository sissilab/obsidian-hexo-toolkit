import { Notice, TFile } from "obsidian";
import { ImageBaseService, ImageServiceFactory } from "src/imageService/imageService";
import HexoPlugin from "src/main";
import { ConversionState } from "./conversionState";
import { ConversionStateModal } from "src/ui/modal/conversionStateModal";
import { ImageUtil } from "src/util/imageUil";

export class Convertor {

    private readonly conversionState: ConversionState;

    public constructor(private readonly plugin: HexoPlugin, statusBarEl: HTMLElement) {
        this.conversionState = new ConversionState(statusBarEl);

        statusBarEl.addEventListener('click', (event) => {
            if (this.conversionState.isModClickable()) {
                new ConversionStateModal(this.plugin.app, this.conversionState).open();
            }
        });
    }

    public ready() {
        this.conversionState.ready();
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
    private static readonly WIKILINK_EMBED_REGEX = /!\[\[(.*?)\]\]/g; // `![[]]`
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

                // Obsidian link to a heading within the same note `[[#1. xxx]]` -> Hexo `[1. xxx](#1-xxx)`
                text = text.replace(/\[\[#(.*?)\]\]/g, (matchedText, capturedText) => {
                    return `[${capturedText}](#${capturedText.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/-$/, '')})`;
                });

                const imageMatches: ImageMatch[] = [];
                this.handleWikilinkMatch(text, imageMatches); // ![[]]
                this.handleMarkdownMatch(text, imageMatches); // ![]()
                if (0 < imageMatches.length) {
                    if (undefined === imageService) {
                        imageService = ImageServiceFactory.getImageService(propertiesState.imageServiceConfigName, this.plugin);
                        if (imageService) {
                            this.conversionState.setImageServiceTitle(imageService.getServiceConfigFullName());
                        } else {
                            this.conversionState.setImageServiceTitle('Unknown Image Service');
                            this.conversionState.addErrorMessages('Found no available Image Service');
                        }
                    }
                    for (const imageMatch of imageMatches) {
                        if (Convertor.HTTP_START_REGEX.test(imageMatch.src)) {
                            continue;
                        }
                        if (!imageMatch.alt) {
                            imageMatch.alt = imageMatch.src;
                        }
                        this.conversionState.addImageMatch(imageMatch);
                        const imageFile = this.plugin.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(imageMatch.src), sourceFilePath);
                        if (!imageFile) {
                            this.conversionState.addErrorMessages('Found no image file: ' + imageMatch.matchedText);
                            continue;
                        }
                        if (Convertor.IMAGE_FORMAT_REGEX.test(imageMatch.src)) { // local image
                            imageMatch.file = imageFile;
                            // @ts-ignore
                            imageMatch.fullPath = this.plugin.app.vault.adapter.getFullPath(imageFile.path);
                            imageMatch.mimeType = ImageUtil.getImageContentType(imageFile.extension);
                            if (!imageService) {
                                continue;
                            }
                            const serviceHandleResult = await imageService.handle(imageMatch);
                            serviceHandleResult.errorMessages.forEach(msg => this.conversionState.addErrorMessages(msg));
                            if (serviceHandleResult.replacedText) {
                                text = text.replace(imageMatch.matchedText, serviceHandleResult.replacedText);
                            }
                        } else { // may be Excalidraw file -> convert to svg
                            if (this.isExcalidraw(imageFile)) {
                                const svgElement = await this.exportExcalidraw(imageFile);
                                if (svgElement) {
                                    svgElement.removeAttribute('width');
                                    svgElement.removeAttribute('height');
                                    const svgContainerEl = createDiv('excalidraw-svg');
                                    if (imageMatch.width && 0 < imageMatch.width) {
                                        svgContainerEl.style.maxWidth = imageMatch.width + '';
                                    }
                                    if (imageMatch.height && 0 < imageMatch.height) {
                                        svgContainerEl.style.maxHeight = imageMatch.height + '';
                                    }
                                    svgContainerEl.appendChild(svgElement);
                                    imageMatch.replacedText = svgContainerEl.outerHTML
                                        .replace(/\s*(>)\s*(<)\s*/g, '$1$2')
                                        .replace(/\s{2,}/g, ' ')
                                        .trim();
                                    text = text.replace(imageMatch.matchedText, imageMatch.replacedText);
                                }
                            }
                        }
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

    private handleWikilinkMatch(lineText: string, imageMatches: ImageMatch[]): void {
        const matchFormat = ImageMatchFormat.Wikilink;
        let match: RegExpExecArray | null;
        let src = '';
        let alt = '';
        let width: number | undefined = undefined;
        let height: number | undefined = undefined;
        // Obsidian embed a local image `![[image.png|alt1|alt2|30x50]]` -> Image Service
        while ((match = Convertor.WIKILINK_EMBED_REGEX.exec(lineText)) !== null) {
            const [matchedText, linkText] = match;
            const linkTextArr = linkText?.split('|');
            if (!linkTextArr || 1 > linkTextArr.length || !(src = linkTextArr[0]?.trim())) {
                continue;
            }
            if (1 < linkTextArr.length) {
                // parse image size:
                const linkTextTail = linkTextArr[linkTextArr.length - 1]?.trim();
                if (linkTextTail) {
                    if (Convertor.IMAGE_WIDTH_REGEX.test(linkTextTail)) { // width
                        width = Number(linkTextTail);
                    } else {
                        const imageSizeMatch = linkTextTail.match(Convertor.IMAGE_SIZE_REGEX);
                        if (imageSizeMatch) { // <width>x<height>
                            width = Number(imageSizeMatch[1]);
                            height = Number(imageSizeMatch[2]);
                        }
                    }
                }
                // parse image alt:
                alt = linkTextArr.slice(1, undefined === width ? linkTextArr.length : linkTextArr.length - 1).join('|').trimStart();
            }
            if (undefined === width) width = 0;
            if (undefined === height) height = 0;
            imageMatches.push({ matchedText, matchFormat, src, alt, width, height });
        }
    }

    // ![]()
    // e.g. ![image alt](image.png), ![image alt|30](image.png)
    private handleMarkdownMatch(lineText: string, imageMatches: ImageMatch[]): void {
        const matchFormat = ImageMatchFormat.Markdown;
        let match: RegExpExecArray | null;
        let src = '';
        let alt = '';
        let width: number | undefined = undefined;
        let height: number | undefined = undefined;
        // Markdown embed a local image `![alt1|alt2|30x50](image.png)` -> Image Service
        while ((match = Convertor.MARKDOWN_EMBED_REGEX.exec(lineText)) !== null) {
            const [matchedText, altText, linkText] = match;
            const srcIdx = linkText.indexOf('|')
            src = 0 < srcIdx ? linkText.substring(0, srcIdx) : linkText;
            if (!src) {
                continue;
            }
            if (altText) {
                const altIdx = altText.lastIndexOf('|');
                const altTextTail = (0 > altIdx ? altText : altText.substring(altIdx + 1)).trim();
                if (altTextTail) {
                    if (Convertor.IMAGE_WIDTH_REGEX.test(altTextTail)) { // width
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
            if (undefined === width) width = 0;
            if (undefined === height) height = 0;
            imageMatches.push({ matchedText, matchFormat, src, alt, width, height });
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

export interface ImageMatch {
    matchedText: string,
    matchFormat: ImageMatchFormat,
    src: string,
    alt: string,
    width: number,
    height: number,
    file?: TFile,
    mimeType?: string,
    fullPath?: string,
    replacedText?: string
}

export enum ImageMatchFormat {
    Wikilink,
    Markdown
}
