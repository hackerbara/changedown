import { join } from 'path';

export function isCursorApp(appPath: string): boolean {
  return appPath.toLowerCase().includes('cursor');
}

export function findWorkbenchJsPath(appRoot: string): string {
  return join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
}

export function getDefaultCursorAppPaths(): string[] {
  switch (process.platform) {
    case 'darwin':
      return ['/Applications/Cursor.app/Contents/Resources/app'];
    case 'linux':
      return [
        '/usr/share/cursor/resources/app',
        '/opt/cursor/resources/app',
      ];
    case 'win32':
      return [
        join(process.env.LOCALAPPDATA ?? '', 'Programs', 'cursor', 'resources', 'app'),
      ];
    default:
      return [];
  }
}
