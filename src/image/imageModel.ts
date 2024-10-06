
export interface ImageServiceConfig {
    type: ImageServiceTypeEnum;
    name: string;
    apiKey?: string; // Smms
    filePath?: string; // Local
}

export enum ImageServiceTypeEnum {
    Local = 'Local',
    // https://doc.sm.ms/
    Smms = 'Smms',
    // Imgur = 'Imgur',
}
