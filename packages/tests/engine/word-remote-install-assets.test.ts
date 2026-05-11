import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Word remote-only install assets', () => {
  it('ships a remote-only manifest that does not require localhost MCP or dev certs', () => {
    const manifest = read('packages/word-add-in/manifest.remote.xml');

    expect(manifest).toContain('https://changedown.com/word/taskpane.html?changedownMode=remote');
    expect(manifest).toContain('<AppDomain>https://changedown.com</AppDomain>');
    expect(manifest).toContain('<AppDomain>https://changedown-remote-relay-staging.hackerbara.workers.dev</AppDomain>');
    expect(manifest).not.toContain('127.0.0.1:39990');
    expect(manifest).not.toContain('127.0.0.1:3000');
  });

  it('ships shell-only macOS and Windows installers beside the hosted manifest', () => {
    const mac = read('packages/word-add-in/install-mac.sh');
    const windows = read('packages/word-add-in/install-windows.ps1');

    expect(mac).toContain('manifest.remote.xml');
    expect(mac).toContain('Library/Containers/com.microsoft.Word/Data/Documents/wef');
    expect(mac).toContain('ln "$MANIFEST_PATH" "$WEF_MANIFEST_PATH"');
    expect(mac).not.toContain('ln -s');
    expect(mac).not.toMatch(/\bnpx\b|\bnpm\b|\bnode\b/);

    expect(windows).toContain('manifest.remote.xml');
    expect(windows).toContain('HKCU:\\SOFTWARE\\Microsoft\\Office\\16.0\\Wef\\Developer');
    expect(windows).toContain('Test-DownloadedAssets');
    expect(windows).toContain('System.IO.Compression.ZipFile');
    expect(windows).toContain('Remove-StaleRegistryValue');
    expect(windows).toContain('SecurityProtocolType]::Tls12');
    expect(windows).toContain("local-name()='OfficeApp'");
    expect(windows).toContain('ChangeDown-Launch-$RunId.docx');
    expect(windows).toContain('Remove-OldLaunchers');
    expect(windows).not.toMatch(/\bnpx\b|\bnpm\b|\bnode\b/i);
  });

  it('cleans only known ChangeDown sideload entries before reinstalling', () => {
    const mac = read('packages/word-add-in/install-mac.sh');
    const windows = read('packages/word-add-in/install-windows.ps1');

    expect(mac).toContain('cleanup_existing_manifests');
    expect(mac).toContain('KNOWN_ADDIN_IDS');
    expect(mac).toContain('a3f7c142-84b2-4e9d-b031-cd2e7f85a301');
    expect(mac).toContain('d3b6b0d7-c5e8-4a81-8d9f-9d8cf7e6d051');
    expect(mac).toContain('grep -Eql');
    expect(mac).not.toContain('rm -rf "$WEF_DIR"');

    expect(windows).toContain('$KnownAddinIds');
    expect(windows).toContain('Remove-ItemProperty');
    expect(windows).toContain('a3f7c142-84b2-4e9d-b031-cd2e7f85a301');
    expect(windows).toContain('d3b6b0d7-c5e8-4a81-8d9f-9d8cf7e6d051');
    expect(windows).not.toContain('Remove-Item -Path $RegistryPath -Recurse');
  });

  it('keeps the launcher document source next to the Word manifests and wires website publishing', () => {
    expect(existsSync(path.join(repoRoot, 'packages/word-add-in/ChangeDown-Launch.docx'))).toBe(true);

    const webpackConfig = read('packages/word-add-in/webpack.config.js');
    const websiteBuild = read('scripts/build-word-pane-for-website.mjs');
    for (const artifact of ['manifest.remote.xml', 'install-mac.sh', 'install-windows.ps1', 'ChangeDown-Launch.docx']) {
      expect(webpackConfig).toContain(artifact);
      expect(websiteBuild).toContain(artifact);
    }
  });

  it('keeps the launcher document add-in reference version aligned with the remote manifest', async () => {
    const manifest = read('packages/word-add-in/manifest.remote.xml');
    const manifestVersion = manifest.match(/<Version>(.*?)<\/Version>/)?.[1];
    expect(manifestVersion).toBeTruthy();

    const launcher = readFileSync(path.join(repoRoot, 'packages/word-add-in/ChangeDown-Launch.docx'));
    const zip = await JSZip.loadAsync(launcher);
    const webextensionXml = await zip.file('word/webextensions/webextension.xml')?.async('string');
    expect(webextensionXml).toContain(`version="${manifestVersion}"`);
  });
});
