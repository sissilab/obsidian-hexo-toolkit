import { Notice } from "obsidian";

export class ImageUtil {

    public static copyFileBySystemCommand(filePath: string, fileName: string) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { exec } = require('child_process');
        let command = '';
        if (process.platform === 'win32') { // Windows
            command = `powershell -command "Set-Clipboard -Path '${filePath}'"`;
        } else {
            new Notice(`Unsupported OS to copy a file!`);
            return;
        }
        /* else if (process.platform === 'darwin') { // macOS
            command = `osascript -e 'set the clipboard to (POSIX file "${filePath}")' `;
        } else { // Linux (need to install xclip)···
            command = `xclip -selection clipboard -t image/png -i "${filePath}"`;
        } */

        exec(command, (error: any, stdout: any, stderr: any) => {
            if (error) {
                console.error(`Exec Error: ${error}`);
                new Notice('Failed to copy file using system command!');
                return;
            }
            if (stderr) {
                console.error(`Error Output: ${stderr}`);
                new Notice('Failed to copy file using system command!');
                return;
            }
            new Notice(`'${fileName}' copied to clipboard!`);
        });
    }

}

