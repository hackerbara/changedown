// changetracks-rules.ts — ChangeTracks rule for llm-jail
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import type { Rule, FileOperation, Verdict, ToolCall, ToolResult } from 'llm-jail';
import type { ChangeTracksConfig } from './config.js';
import { isFileInScope, isFileExcludedFromHooks } from './scope.js';
import { parseTrackingHeader } from '@changetracks/core';
import { formatRedirect, formatReadRedirect } from './core/redirect-formatter.js';
import { shouldLogEdit, logEdit, logReadAudit } from './core/edit-tracker.js';

/**
 * Build the ChangeTracks rule for a given config and project directory.
 * This replaces core/policy-engine.ts.
 */
export function buildChangeTracksRule(
  config: ChangeTracksConfig,
  projectDir: string,
  sessionId: string,
): Rule {
  function isInScope(file: string): boolean {
    // Glob-based scope check
    if (!isFileInScope(file, config, projectDir)) {
      // Check per-file header override: 'tracked' overrides glob exclusion
      if (fs.existsSync(file)) {
        try {
          const head = fs.readFileSync(file, 'utf-8').slice(0, 500);
          const header = parseTrackingHeader(head);
          if (header?.status === 'tracked') return true;
        } catch { /* ignore */ }
      }
      return false;
    }

    // In scope by glob — check per-file 'untracked' override
    if (fs.existsSync(file)) {
      try {
        const head = fs.readFileSync(file, 'utf-8').slice(0, 500);
        const header = parseTrackingHeader(head);
        if (header?.status === 'untracked') return false;
      } catch { /* ignore */ }
    }

    // Hook exclusion check
    if (isFileExcludedFromHooks(file, config, projectDir)) return false;

    return true;
  }

  return {
    name: 'changetracks',
    scope: isInScope,

    onToolCall: (call: ToolCall): Verdict => {
      // Author enforcement: deny MCP write tools missing required author parameter
      if (config.author.enforcement === 'required') {
        const mcpWriteTools = ['propose_change', 'amend_change', 'review_changes', 'supersede_change'];
        if (mcpWriteTools.includes(call.tool) && !call.input.author) {
          return {
            action: 'deny',
            reason: 'Author is required by project policy. Add author parameter (e.g., author: "ai:claude-opus-4.6").',
          };
        }
      }
      return { action: 'allow' };
    },

    onWrite: async (op: FileOperation): Promise<Verdict> => {
      // Creation tracking bypass: non-existent files are allowed through (Write only, not Edit)
      if (
        config.policy.creation_tracking !== 'none' &&
        !fs.existsSync(op.file) &&
        op.source.tool !== 'edit'
      ) {
        return {
          action: 'allow',
          agentHint: 'New file will be created with ChangeTracks tracking header and creation footnote.',
        };
      }

      if (config.policy.mode === 'permissive') {
        return { action: 'allow' };
      }

      if (config.policy.mode === 'strict') {
        let hint: string;
        try {
          const fileContent = await fsPromises.readFile(op.file, 'utf-8');
          if (config.hashline.enabled) {
            const { initHashline } = await import('@changetracks/core');
            await initHashline();
          }
          const relPath = op.file.startsWith(projectDir)
            ? op.file.slice(projectDir.length + 1)
            : op.file;
          hint = formatRedirect({
            toolName: op.source.tool === 'edit' ? 'Edit' : 'Write',
            filePath: relPath,
            oldText: (op.source.input.old_string as string) ?? '',
            newText: (op.source.input.new_string as string) ?? (op.source.input.content as string) ?? '',
            fileContent,
            config: { protocol: config.protocol, hashline: config.hashline },
          });
        } catch {
          hint = `BLOCKED: This file is tracked by ChangeTracks (policy: strict). Use propose_change instead of Edit/Write.`;
        }

        return {
          action: 'deny',
          reason: hint,
          userMessage: 'ChangeTracks blocked a raw edit on a tracked file.',
        };
      }

      // safety-net mode
      const hashlineTip = config.hashline.enabled
        ? '\nTip: Use read_tracked_file first for LINE:HASH coordinates.'
        : '';
      return {
        action: 'warn',
        agentHint: `This file is tracked by ChangeTracks (policy: safety-net). Edit will be auto-wrapped but reasoning is lost. Use propose_change for tracked edits with context.${hashlineTip}`,
      };
    },

    onRead: (op: FileOperation): Verdict => {
      if (config.policy.mode === 'strict') {
        const relPath = op.file.startsWith(projectDir)
          ? op.file.slice(projectDir.length + 1)
          : op.file;
        return {
          action: 'deny',
          reason: formatReadRedirect(relPath, { policy: config.policy }),
          userMessage: 'ChangeTracks blocked a raw read on a tracked file.',
        };
      }
      return { action: 'allow' };
    },

    onDelete: (): Verdict => {
      if (config.policy.mode === 'permissive') return { action: 'allow' };
      return {
        action: 'deny',
        reason: 'This file is tracked by ChangeTracks. Tracked files cannot be deleted directly.',
        agentHint: 'Deletion of tracked files is not supported. Use propose_change to mark content for deletion instead.',
      };
    },

    afterWrite: async (op: FileOperation, _result: ToolResult): Promise<void> => {
      if (!shouldLogEdit(config.policy.mode)) return;

      const oldText = (op.source.input.old_string as string) ?? '';
      const newText = (op.source.input.new_string as string) ?? (op.source.input.content as string) ?? '';

      let contextBefore: string | undefined;
      let contextAfter: string | undefined;
      try {
        const fileContent = await fsPromises.readFile(op.file, 'utf-8');
        if (newText) {
          const editPos = fileContent.indexOf(newText);
          if (editPos > 0) contextBefore = fileContent.slice(Math.max(0, editPos - 50), editPos);
          if (editPos >= 0) contextAfter = fileContent.slice(editPos + newText.length, editPos + newText.length + 50);
        }
      } catch { /* ignore */ }

      // Capitalize tool name for pending edit storage (e.g. 'edit' → 'Edit')
      const toolName = op.source.tool.charAt(0).toUpperCase() + op.source.tool.slice(1);
      await logEdit(projectDir, sessionId, op.file, oldText, newText, toolName, contextBefore, contextAfter);
    },

    afterRead: async (op: FileOperation, _result: ToolResult): Promise<void> => {
      await logReadAudit(projectDir, sessionId, op.file);
    },
  };
}
