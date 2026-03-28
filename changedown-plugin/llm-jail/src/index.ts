// src/index.ts — Public API for llm-jail
export { evaluate } from './evaluate.js';
export { augment } from './augment.js';
export { analyze, addRecognizer, resetRecognizers } from './analyzer.js';
export type {
  ToolCall,
  FileOperation,
  Verdict,
  ToolResult,
  Rule,
  Recognizer,
  RecognizerMatch,
} from './types.js';
export { PRE_HANDLER_MAP, POST_HANDLER_MAP } from './types.js';
