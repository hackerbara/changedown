#!/usr/bin/env node
import { type HookInput } from '../shared.js';
interface CursorMcpResponse {
    continue: boolean;
    permission?: 'allow' | 'deny';
    agentMessage?: string;
}
export declare function handleBeforeMcpExecution(input: HookInput): Promise<CursorMcpResponse>;
export {};
