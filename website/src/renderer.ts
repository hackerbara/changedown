import {
  CriticMarkupParser, type ChangeNode, computeSettledText,
  buildViewDocument, buildRawDocument, formatHtml,
} from '@changetracks/core';
import MarkdownIt from 'markdown-it';
import { changetracksPlugin, type PluginConfig } from '@preview/plugin';

const parser = new CriticMarkupParser();

export interface RenderResult {
  html: string;
  changes: ChangeNode[];
  rawText: string;
}

export type ViewMode = 'final' | 'changes' | 'agent';

export function render(rawMarkdown: string, view: ViewMode): RenderResult {
  const doc = parser.parse(rawMarkdown);
  const changes = doc.getChanges();

  if (view === 'agent') {
    return renderAgent(rawMarkdown, changes);
  }

  if (view === 'final') {
    return renderFinal(rawMarkdown, changes);
  }

  // changes view: rendered markdown with CriticMarkup visible
  return renderChanges(rawMarkdown, changes);
}

function renderAgent(rawMarkdown: string, changes: ChangeNode[]): RenderResult {
  // Three-zone format with hashlines, Zone 3 projections, and raw footnotes
  const threeZone = buildViewDocument(rawMarkdown, 'review', {
    filePath: 'page.md',
    trackingStatus: 'tracked',
    protocolMode: 'classic',
    defaultView: 'review',
    viewPolicy: 'suggest',
  });

  const contentHtml = formatHtml(threeZone, {
    showMarkup: true,
    showAnchors: true,
    embedMetadata: true,
    showZone3: true,
  });

  // Extract raw footnote definitions to show actual discussions
  const rawDoc = buildRawDocument(rawMarkdown, {
    filePath: 'page.md',
    trackingStatus: 'tracked',
    protocolMode: 'classic',
    defaultView: 'review',
    viewPolicy: 'suggest',
  });

  let footnoteHtml = '';
  if (rawDoc.footnoteSection) {
    const escaped = rawDoc.footnoteSection
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    footnoteHtml = `\n<div class="ct-footnote-section">${escaped}</div>`;
  }

  const html = `<div class="raw-file">${contentHtml}${footnoteHtml}</div>`;
  return { html, changes, rawText: rawMarkdown };
}

function renderFinal(rawMarkdown: string, changes: ChangeNode[]): RenderResult {
  const md = new MarkdownIt({ html: true });
  const settled = computeSettledText(rawMarkdown);
  const html = md.render(settled);
  return { html, changes, rawText: rawMarkdown };
}

function renderChanges(rawMarkdown: string, changes: ChangeNode[]): RenderResult {
  const config: PluginConfig = {
    enabled: true,
    showFootnotes: true,
    showComments: true,
    renderInCodeFences: false,
    metadataDetail: 'badge',
    authorColors: 'auto',
    isDarkTheme: true,
  };
  const md = new MarkdownIt({ html: true });
  md.use(changetracksPlugin, () => config);
  const html = md.render(rawMarkdown);
  return { html, changes, rawText: rawMarkdown };
}
