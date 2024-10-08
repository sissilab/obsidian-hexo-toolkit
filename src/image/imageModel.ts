
export interface ImageServiceConfig {
    type: ImageServiceTypeEnum;
    name: string;
    apiKey?: string; // Smms
    filePath?: string; // Local
}

export enum ImageServiceTypeEnum {
    Local = 'Local',
    Smms = 'Smms', // https://doc.sm.ms/
    // Imgur = 'Imgur',
}
