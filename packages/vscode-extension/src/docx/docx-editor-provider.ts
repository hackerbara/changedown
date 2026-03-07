import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DocxEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'changetracks.docxEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new DocxEditorProvider(context);
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
    const mdPath = docxPath.replace(/\.docx$/i, '-changetracks.md');
    const mdExists = fs.existsSync(mdPath);

    const statusHtml = '<p>Ready to convert tracked changes to CriticMarkup.</p>';

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = getWebviewContent(fileName, mdPath, mdExists, statusHtml);

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'convert') {
        try {
          webviewPanel.webview.html = getWebviewContent(fileName, mdPath, mdExists, '<p>Converting...</p>', true);

          const { importDocx } = await import('@changetracks/docx');
          const { markdown, stats } = await importDocx(docxPath);

          fs.writeFileSync(mdPath, markdown, 'utf-8');

          const mdUri = vscode.Uri.file(mdPath);
          await vscode.commands.executeCommand('vscode.open', mdUri);

          vscode.window.showInformationMessage(
            `Imported ${stats.insertions} ins, ${stats.deletions} del, ${stats.substitutions} sub from ${fileName}`
          );

          webviewPanel.dispose();
        } catch (err: any) {
          vscode.window.showErrorMessage(`DOCX import failed: ${err.message}`);
          webviewPanel.webview.html = getWebviewContent(
            fileName, mdPath, mdExists,
            `<p style="color: var(--vscode-errorForeground);">Error: ${escapeHtml(err.message)}</p>`
          );
        }
      }

      if (message.command === 'openExisting') {
        const mdUri = vscode.Uri.file(mdPath);
        await vscode.commands.executeCommand('vscode.open', mdUri);
        webviewPanel.dispose();
      }
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getWebviewContent(
  fileName: string,
  mdPath: string,
  mdExists: boolean,
  statusHtml: string,
  loading = false
): string {
  const mdFileName = path.basename(mdPath);

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      padding: 2rem;
      text-align: center;
    }
    h1 { font-size: 1.4em; margin-bottom: 0.5em; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 2rem; }
    .status { margin-bottom: 2rem; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 12px 32px;
      font-size: 1.1em;
      cursor: pointer;
      border-radius: 4px;
      margin: 0.5rem;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .icon { font-size: 3em; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="icon">\u{1F4C4}</div>
  <h1>${escapeHtml(fileName)}</h1>
  <p class="subtitle">Word document with tracked changes</p>
  <div class="status">${statusHtml}</div>
  ${loading
    ? '<button disabled>Converting...</button>'
    : `<button onclick="vscode.postMessage({ command: 'convert' })">
        Import &amp; Edit as Markdown
      </button>`
  }
  ${mdExists && !loading
    ? `<button class="secondary" onclick="vscode.postMessage({ command: 'openExisting' })">
        Open existing ${escapeHtml(mdFileName)}
      </button>`
    : ''
  }
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
}
