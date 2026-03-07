#!/usr/bin/env node
import { type HookInput } from '../shared.js';
interface CursorReadResponse {
    continue: boolean;
    permission?: 'allow' | 'deny';
}
export declare function handleBeforeReadFile(input: HookInput): Promise<CursorReadResponse>;
export {};
