/**
 * Boot step file — loaded FIRST by cucumber-js (alphabetical ordering).
 *
 * Installs the vscode mock and additional module stubs required for
 * @fast tier tests to coexist with @integration step files that import
 * vscode-dependent modules at module level.
 *
 * CRITICAL: This file must be named to sort before ALL other step files
 * (underscore prefix ensures this). It installs mocks before any step
 * file can trigger `require('vscode')` or `require('vscode-languageclient/node')`.
 */

import { installVscodeMock } from './vscode-mock';

// Install the vscode mock first
installVscodeMock();

// Now install additional module stubs for transitive dependencies
// that crash when loaded outside VS Code Extension Host.
installLanguageClientStub();

/**
 * Stub vscode-languageclient/node so that step files importing
 * modules that transitively depend on it (e.g., controller → lsp-client)
 * don't crash at require-time.
 *
 * The stub provides minimal class constructors that don't throw.
 */
function installLanguageClientStub(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require('module');
    const originalResolveFilename = Module._resolveFilename;

    // List of modules to stub
    const stubbedModules = new Set([
        'vscode-languageclient/node',
        'vscode-languageclient',
        'vscode-languageclient/lib/common/api',
    ]);

    // Minimal LanguageClient stub
    class LanguageClientStub {
        constructor(..._args: any[]) {}
        start(): Promise<void> { return Promise.resolve(); }
        stop(): Promise<void> { return Promise.resolve(); }
        isRunning(): boolean { return false; }
        onNotification(_method: string, _handler: Function): { dispose(): void } {
            return { dispose() {} };
        }
        onDidChangeState(_handler: Function): { dispose(): void } {
            return { dispose() {} };
        }
        sendNotification(_method: string, _params?: any): void {}
        get clientOptions(): any { return {}; }
    }

    const stubExports = {
        LanguageClient: LanguageClientStub,
        TransportKind: { stdio: 0, ipc: 1, pipe: 2, socket: 3 },
        State: { Stopped: 1, Starting: 2, Running: 3 },
    };

    // Intercept resolution for stubbed modules
    const prevResolve = Module._resolveFilename;
    Module._resolveFilename = function (request: string, parent: any, ...rest: any[]) {
        for (const stubbed of stubbedModules) {
            if (request === stubbed || request.startsWith(stubbed + '/')) {
                return `__stub__${stubbed}`;
            }
        }
        return prevResolve.call(this, request, parent, ...rest);
    };

    // Insert stubs into require cache
    for (const stubbed of stubbedModules) {
        const key = `__stub__${stubbed}`;
        require.cache[key] = {
            id: key,
            filename: key,
            loaded: true,
            exports: stubExports,
            children: [],
            paths: [],
            path: '',
            parent: null,
            require: require,
            isPreloading: false,
        } as any;
    }
}
