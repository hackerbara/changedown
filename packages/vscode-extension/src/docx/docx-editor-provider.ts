// docx-editor-provider.ts — full replacement
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ChangeType, parseForFormat } from '@changedown/core';
import { renderMarkdownToHtml } from './docx-preview-renderer';
import { buildAnnotationCards } from './annotation-extractor';
import { buildLoadingHtml, buildErrorHtml, buildChoiceHtml, buildPreviewHtml } from './docx-preview-html';

function rewriteImagePaths(markdown: string, mediaDir: string, webview: vscode.Webview): string {
  // Markdown paths are relative to where the .md file would sit (e.g., "basename_media/hash.png").
  // mediaDir already points inside that folder, so resolve against its parent.
  const baseDir = path.dirname(mediaDir);
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, src) => {
      const absolutePath = path.isAbsolute(src) ? src : path.join(baseDir, src);
      if (fs.existsSync(absolutePath)) {
        const uri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
        return `![${alt}](${uri})`;
      }
      return match;
    }
  );
}

export class DocxEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'changedown.docxEditor';
  private readonly tempFiles: string[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new DocxEditorProvider(context);
    context.subscriptions.push({ dispose: () => provider.cleanupTempFiles() });
    return vscode.window.registerCustomEditorProvider(
      DocxEditorProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false }
    );
  }

  async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const docxPath = document.uri.fsPath;
    const fileName = path.basename(docxPath);
    const mdPath = docxPath.replace(/\.docx$/i, '-changedown.md');
    const mdFileName = path.basename(mdPath);
    const mdExists = fs.existsSync(mdPath);

    webviewPanel.webview.options = { enableScripts: true };

    // State tracking
    let tempPath: string | undefined;
    let currentMdPath: string | undefined;
    let currentViewMode = 'allMarkup';
    let currentMediaDir: string | undefined;

    // Single consolidated message handler (Task 9 fix — no duplicate listeners)
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'openExisting': {
          currentMdPath = mdPath;
          // Look for a media folder alongside the sidecar .md file
          if (!currentMediaDir) {
            const docxBasename = path.basename(docxPath, path.extname(docxPath));
            const sidecarMediaDir = path.join(path.dirname(mdPath), `${docxBasename}_media`);
            if (fs.existsSync(sidecarMediaDir)) {
              currentMediaDir = sidecarMediaDir;
              webviewPanel.webview.options = {
                ...webviewPanel.webview.options,
                localResourceRoots: [
                  ...(webviewPanel.webview.options.localResourceRoots || []),
                  vscode.Uri.file(sidecarMediaDir),
                ],
              };
            }
          }
          await this.showPreviewFromMarkdown(
            webviewPanel, fs.readFileSync(mdPath, 'utf-8'),
            fileName, currentViewMode, currentMediaDir
          );
          break;
        }
        case 'reimport':
          tempPath = await this.convertAndShow(
            webviewPanel, docxPath, fileName, currentViewMode,
            (dir) => { currentMediaDir = dir; }
          );
          if (tempPath) {
            currentMdPath = tempPath;
          }
          break;
        case 'setViewMode':
          currentViewMode = message.mode;
          if (currentMdPath && fs.existsSync(currentMdPath)) {
            const md = fs.readFileSync(currentMdPath, 'utf-8');
            await this.showPreviewFromMarkdown(
              webviewPanel, md, fileName, currentViewMode, currentMediaDir
            );
          }
          break;
        case 'edit': {
          // Copy markdown sidecar
          if (tempPath && !fs.existsSync(mdPath)) {
            fs.copyFileSync(tempPath, mdPath);
          } else if (tempPath && currentMdPath === tempPath) {
            fs.copyFileSync(tempPath, mdPath);
          }
          // Copy media folder alongside the sidecar markdown
          if (currentMediaDir && fs.existsSync(currentMediaDir)) {
            const targetMediaDir = path.join(path.dirname(mdPath), path.basename(currentMediaDir));
            if (!fs.existsSync(targetMediaDir)) {
              fs.cpSync(currentMediaDir, targetMediaDir, { recursive: true });
            }
          }
          if (!fs.existsSync(mdPath)) {
            vscode.window.showErrorMessage(`Cannot open: ${mdFileName} does not exist.`);
            return;
          }
          await vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(mdPath),
            { viewColumn: webviewPanel.viewColumn }
          );
          webviewPanel.dispose();
          break;
        }
      }
    });

    // Initial display
    if (mdExists) {
      webviewPanel.webview.html = buildChoiceHtml(fileName, mdFileName);
    } else {
      tempPath = await this.convertAndShow(
        webviewPanel, docxPath, fileName, currentViewMode,
        (dir) => { currentMediaDir = dir; }
      );
      if (tempPath) {
        currentMdPath = tempPath;
      }
    }
  }

  private async convertAndShow(
    webviewPanel: vscode.WebviewPanel,
    docxPath: string,
    fileName: string,
    viewMode: string,
    onMediaDir?: (dir: string) => void,
  ): Promise<string | undefined> {
    webviewPanel.webview.html = buildLoadingHtml(fileName);

    try {
      const { importDocx } = await import('@changedown/docx');
      const { markdown, mediaDir } = await importDocx(docxPath);

      // Add media folder to localResourceRoots so the webview can load images
      if (mediaDir) {
        onMediaDir?.(mediaDir);
        webviewPanel.webview.options = {
          ...webviewPanel.webview.options,
          localResourceRoots: [
            ...(webviewPanel.webview.options.localResourceRoots || []),
            vscode.Uri.file(mediaDir),
          ],
        };
      }

      // Write to temp file
      const mdBaseName = path.basename(docxPath).replace(/\.docx$/i, '-changedown.md');
      const tempPath = path.join(os.tmpdir(), `changedown-${Date.now()}-${mdBaseName}`);
      fs.writeFileSync(tempPath, markdown, 'utf-8');
      this.tempFiles.push(tempPath);

      await this.showPreviewFromMarkdown(
        webviewPanel, markdown, fileName, viewMode, mediaDir
      );

      return tempPath;
    } catch (err: any) {
      webviewPanel.webview.html = buildErrorHtml(fileName, err.message);
      return undefined;
    }
  }

  private async showPreviewFromMarkdown(
    webviewPanel: vscode.WebviewPanel,
    markdown: string,
    fileName: string,
    viewMode: string = 'allMarkup',
    mediaDir?: string
  ): Promise<void> {
    const doc = parseForFormat(markdown);
    const changes = doc.getChanges();

    const isDark = vscode.window.activeColorTheme?.kind === 2
      || vscode.window.activeColorTheme?.kind === 3;

    const resolvedMarkdown = mediaDir
      ? rewriteImagePaths(markdown, mediaDir, webviewPanel.webview)
      : markdown;

    const bodyHtml = renderMarkdownToHtml(resolvedMarkdown, isDark, viewMode);
    const annotations = buildAnnotationCards(changes, markdown);

    const stats = {
      insertions: changes.filter(c => c.type === ChangeType.Insertion).length,
      deletions: changes.filter(c => c.type === ChangeType.Deletion).length,
      substitutions: changes.filter(c => c.type === ChangeType.Substitution).length,
      comments: annotations.filter(a => a.type === 'comment').length,
      authors: [...new Set(
        changes.map(c => c.metadata?.author ?? c.inlineMetadata?.author).filter(Boolean) as string[]
      )],
    };

    webviewPanel.webview.html = buildPreviewHtml({
      fileName, bodyHtml, annotations, stats, currentViewMode: viewMode,
    });
  }

  private cleanupTempFiles(): void {
    for (const f of this.tempFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    this.tempFiles.length = 0;
  }
}
