export interface RedirectInput {
    toolName: 'Edit' | 'Write';
    filePath: string;
    oldText: string;
    newText: string;
    fileContent: string;
    config: {
        protocol: {
            mode: 'classic' | 'compact';
        };
        hashline: {
            enabled: boolean;
        };
    };
}
export declare function formatRedirect(input: RedirectInput): string;
export interface ReadRedirectConfig {
    policy?: {
        default_view?: string;
    };
}
export declare function formatReadRedirect(filePath: string, config: ReadRedirectConfig): string;
