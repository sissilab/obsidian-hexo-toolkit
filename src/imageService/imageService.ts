import { requestUrl, TFile } from "obsidian";
import HexoPlugin from "src/main";
import { ImageServiceConfig, ImageServiceTypeEnum } from "./imageModel";
import { LinkMatch, LinkMatchFormat } from "src/conversion/convertor";

export class ImageServiceFactory {

	public static getImageService(serviceConfigName: string, plugin: HexoPlugin): ImageBaseService | null {
		const configs = plugin.settings.imageServiceConfigs;
		if (!configs || 1 > configs.length) {
			return null;
		}
		let serviceConfig: ImageServiceConfig = configs[0];
		if (serviceConfigName) {
			const conf = configs.find(conf => serviceConfigName === conf.name);
			if (conf) {
				serviceConfig = conf;
			}
		}
		const type = serviceConfig?.type;
		if (!type) {
			return null;
		}
		switch (type) {
			case ImageServiceTypeEnum.Local:
				return new LocalImageService(plugin, serviceConfig);
			case ImageServiceTypeEnum.Smms:
				return new Smms(plugin, serviceConfig);
			default:
				break;
		}
		return null;
	}

}

export abstract class ImageBaseService {

	protected errorMessages: string[] = [];

	public constructor(protected readonly plugin: HexoPlugin,
		protected readonly serviceConfig: ImageServiceConfig) {
	}

	public abstract handle(imageMatch: LinkMatch): Promise<ImageServiceHandleResult>;

	public getServiceConfigFullName(): string {
		if (!this.serviceConfig) {
			return '';
		}
		return `${this.serviceConfig.name} (${this.serviceConfig.type})`;
	}

	protected combineImageHtml(url: string | null, imageMatch: LinkMatch): string | null {
		if (!url) {
			return null;
		}
		const imgAlt = imageMatch.alt ? 'alt="' + imageMatch.alt + '"' : '';
		const imgWidth = imageMatch.width && 0 < imageMatch.width ? 'width="' + imageMatch.width + '"' : '';
		const imgHeight = imageMatch.height && 0 < imageMatch.height ? 'height="' + imageMatch.height + '"' : '';
		imageMatch.replacedText = `<img src="${url}" ${imgAlt} ${imgWidth} ${imgHeight} srcFile="${imageMatch.src}">`;
		return imageMatch.replacedText;
	}

	protected addErrorMessages(msg: string) {
		if (!this.errorMessages) {
			this.errorMessages = [];
		}
		this.errorMessages.push(msg);
	}
}

export class LocalImageService extends ImageBaseService {

	public constructor(plugin: HexoPlugin, serviceConfig: ImageServiceConfig) {
		super(plugin, serviceConfig);
	}

	public async handle(imageMatch: LinkMatch): Promise<ImageServiceHandleResult> {
		const imageFile = imageMatch.file;
		if (!imageFile) {
			return { replacedText: imageMatch.matchedText, errorMessages: ['Wrong image file for ' + imageMatch.matchedText] };
		}
		const filename = imageFile.name
		if (LinkMatchFormat.Wikilink !== imageMatch.matchFormat && LinkMatchFormat.Markdown !== imageMatch.matchFormat) {
			imageMatch.replacedText = imageMatch.matchedText;
			return { replacedText: null, errorMessages: this.errorMessages };
		}
		const url = (this.serviceConfig.filePath ? this.serviceConfig.filePath.trim() : '') + filename;
		return { replacedText: this.combineImageHtml(url, imageMatch), errorMessages: this.errorMessages };
	}
}

export class Smms extends ImageBaseService {

	private readonly baseApiUrl = 'https://sm.ms/api/v2/';

	public constructor(plugin: HexoPlugin, serviceConfig: ImageServiceConfig) {
		super(plugin, serviceConfig);
	}

	public async handle(imageMatch: LinkMatch): Promise<ImageServiceHandleResult> {
		const imageFile = imageMatch.file;
		if (!imageFile) {
			return { replacedText: imageMatch.matchedText, errorMessages: ['Wrong image file for ' + imageMatch.matchedText] };
		}
		const filename = imageFile.name;
		const imageUrl = await this.query(filename);
		if (imageUrl || null === imageUrl) {
			// When `imageUrl` is not empty: existed in SM.MS
			// When `imageUrl` is null: error calling API
			return { replacedText: this.combineImageHtml(imageUrl, imageMatch), errorMessages: this.errorMessages };
		}
		// Found no image on SM.MS -> call upload api
		const res = await this.upload(imageFile, filename, imageMatch.mimeType);
		if (res) {
			if (res.success) {
				return { replacedText: this.combineImageHtml(res.data.url, imageMatch), errorMessages: this.errorMessages };
			} else if ('image_repeated' === res.code) {
				return { replacedText: this.combineImageHtml(res.images, imageMatch), errorMessages: this.errorMessages };
			}
		}
		return { replacedText: null, errorMessages: this.errorMessages };
	}

	private async query(filename: string): Promise<string | null> {
		let totalPages = -1;
		let page = 1;
		do {
			const res = await this.queryHistoryPage(page);
			if (!res || !res.success) {
				return null;
			}
			for (const resData of res.data) {
				// finding the corresponding file on the Image Hosting Service according to its filename
				if (filename === resData.filename) {
					return resData.url;
				}
			}
			if (-1 === totalPages) {
				totalPages = res.TotalPages;
			}
		} while (page++ < totalPages);
		return ''; // the specified file does't exist
	}

	// pageSize is fixed to 100.
	private async queryHistoryPage(page: number) {
		const url = this.baseApiUrl + 'upload_history' + '?page=' + page;
		try {
			const response = await requestUrl({
				url,
				method: 'GET',
				headers: {
					'Authorization': this.serviceConfig.apiKey || ''
				},
			});
			if (response && 200 === response.status) {
				const resJson = response.json;
				if (resJson && !resJson.success) {
					this.addErrorMessages(`Wrong query API response: url=${url}, code=${resJson.code}, message=${resJson.message}`);
				}
				return resJson;
			}
		} catch (error) {
			this.addErrorMessages(`Error calling query API: url=${url}, error=${error}`);
		}
		return null;
	}

	private async upload(imageFile: TFile, filename: string, contentType?: string) {
		const url = this.baseApiUrl + 'upload';
		if (!contentType) {
			contentType = 'image/png';
		}
		const imageBuffer = await this.plugin.app.vault.readBinary(imageFile);
		const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
		// ------WebKitFormBoundaryPkpFF7tjBAqx29L\r\n
		const sBoundary = '--' + boundary + '\r\n';
		// ------WebKitFormBoundaryPkpFF7tjBAqx29L\r\nContent-Disposition: form-data; name="smfile"; filename="filename.png"r\nContent-Type: image/png\r\n\r\n
		const imgForm = `${sBoundary}Content-Disposition: form-data; name="smfile"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
		// \r\n------WebKitFormBoundaryPkpFF7tjBAqx29L--\r\n
		const eBoundary = '\r\n--' + boundary + '--\r\n';

		const imgFormArray = new TextEncoder().encode(imgForm);
		const endBoundaryArray = new TextEncoder().encode(eBoundary);

		const formDataArray = new Uint8Array(imgFormArray.length + imageBuffer.byteLength + endBoundaryArray.length);
		formDataArray.set(imgFormArray, 0);
		formDataArray.set(new Uint8Array(imageBuffer), imgFormArray.length);
		formDataArray.set(endBoundaryArray, imgFormArray.length + imageBuffer.byteLength);

		const headers = {
			'Authorization': this.serviceConfig.apiKey || '',
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		};

		try {
			const response = await requestUrl({
				url: url,
				method: "POST",
				body: formDataArray.buffer,
				throw: false,
				headers: headers,
			});
			if (response && 200 === response.status) {
				const resJson = response.json;
				if (resJson && !resJson.success) {
					this.addErrorMessages(`Wrong upload API response: url=${url}, code=${resJson.code}, message=${resJson.message}`);
				}
				return resJson;
			}
		} catch (error) {
			this.addErrorMessages(`Error calling upload API: url=${url}, error=${error}`);
		}
		return null;
	}

}

export interface ImageServiceHandleResult {
	replacedText: string | null,
	errorMessages: string[]
}
