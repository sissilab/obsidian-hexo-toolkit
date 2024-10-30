import { Notice, Platform } from "obsidian";
import { exec } from 'child_process';

export class ImageUtil {

    public static getImageContentType(fileExtension: string): string {
        const extension = fileExtension?.toLowerCase();
        switch (extension) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'bmp':
                return 'image/bmp';
            case 'svg':
                return 'image/svg+xml';
            case 'webp':
                return 'image/webp';
            default:
                return 'image/png'; // Unsupported MIME type
        }
    }

    public static copyFileBySystemCommand(filePath: string, fileName: string, mimeType?: string) {
        let command = '';
        let errorNotice = 'Failed to copy file using system command!';
        if (Platform.isWin) { // Windows: process.platform === 'win32'
            command = `powershell -command "Set-Clipboard -Path '${filePath}'"`;
            errorNotice += ' Please check and correctly install the `powershell` command.';
        } else if (Platform.isMacOS) { // macOS: process.platform === 'darwin'
            command = `osascript -e 'set the clipboard to (POSIX file "${filePath}")'`;
            errorNotice += ' Please check and correctly install the `osascript` command.';
        } else if (Platform.isLinux) { // Linux (need to install xclip)···
            command = `xclip -selection clipboard -t ${mimeType || 'image/png'} -i "${filePath}"`;
            errorNotice += ' Please check and correctly install the `xclip` command.';
        } else {
            new Notice(`Unsupported OS to copy a file!`);
            return;
        }

        exec(command, (error: any, stdout: any, stderr: any) => {
            if (error) {
                console.error(`Exec Error: ${error}`);
                new Notice(errorNotice);
                return;
            }
            if (stderr) {
                console.error(`Error Output: ${stderr}`);
                new Notice(errorNotice);
                return;
            }
            new Notice(`'${fileName}' copied to clipboard!`);
        });
    }

}

