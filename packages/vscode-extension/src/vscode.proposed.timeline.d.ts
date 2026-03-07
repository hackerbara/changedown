/*---------------------------------------------------------------------------------------------
 *  Type definitions for the VS Code Timeline proposed API.
 *  Source: https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.timeline.d.ts
 *  License: MIT (Microsoft Corporation)
 *
 *  The Timeline API is a proposed (not yet stable) VS Code API.
 *  These types are vendored here so that change-timeline.ts compiles.
 *  When the API is finalized and lands in @types/vscode, remove this file.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export class TimelineItem {
		timestamp: number;
		label: string;
		id?: string;
		iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;
		description?: string;
		tooltip?: string | MarkdownString | undefined;
		command?: Command;
		contextValue?: string;
		accessibilityInformation?: AccessibilityInformation;
		constructor(label: string, timestamp: number);
	}

	export interface TimelineChangeEvent {
		uri: Uri;
		reset?: boolean;
	}

	export interface Timeline {
		readonly paging?: {
			readonly cursor: string | undefined;
		};
		readonly items: readonly TimelineItem[];
	}

	export interface TimelineOptions {
		cursor?: string;
		limit?: number | { timestamp: number; id?: string };
	}

	export interface TimelineProvider {
		readonly onDidChange?: Event<TimelineChangeEvent | undefined>;
		readonly id: string;
		readonly label: string;
		provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
	}

	export namespace workspace {
		export function registerTimelineProvider(scheme: string | string[], provider: TimelineProvider): Disposable;
	}
}
