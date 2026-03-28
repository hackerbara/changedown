import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';

// =============================================================================
// Setup steps
// =============================================================================

Given(
  'a tracked markdown file {string} with content:',
  async function (this: ChangeDownWorld, name: string, content: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile(name, content);
    this.files.set(name, filePath);
  },
);

Given(
  'a tracked file {string} with content:',
  async function (this: ChangeDownWorld, name: string, content: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile(name, content);
    this.files.set(name, filePath);
  },
);

// Handles unquoted boolean/numeric config values like: the config has hashline.enabled = true
Given(
  /^the config has (\w+)\.(\w+) = (true|false|\d+)$/,
  async function (this: ChangeDownWorld, section: string, key: string, rawValue: string) {
    if (!this.configOverrides[section]) this.configOverrides[section] = {};
    let coerced: unknown;
    if (rawValue === 'true') coerced = true;
    else if (rawValue === 'false') coerced = false;
    else coerced = parseInt(rawValue, 10);
    this.configOverrides[section][key] = coerced;
    if (this.ctx) {
      await this.ctx.reconfigure({ [section]: { [key]: coerced } });
    }
  },
);

// Handles config value set to empty string: the config has author.default = "" (empty)
Given(
  'the config has {word}.{word} = {string} \\(empty)',
  async function (this: ChangeDownWorld, section: string, key: string, _value: string) {
    if (!this.configOverrides[section]) this.configOverrides[section] = {};
    this.configOverrides[section][key] = '';
    if (this.ctx) {
      await this.ctx.reconfigure({ [section]: { [key]: '' } });
    }
  },
);

// Handles quoted string config values like: the config has protocol.mode = "classic"
Given(
  'the config has {word}.{word} = {string}',
  async function (this: ChangeDownWorld, section: string, key: string, value: string) {
    if (!this.configOverrides[section]) this.configOverrides[section] = {};
    // Coerce to proper types
    let coerced: unknown;
    if (value === 'true') coerced = true;
    else if (value === 'false') coerced = false;
    else if (/^\d+$/.test(value)) coerced = parseInt(value, 10);
    else coerced = value;
    this.configOverrides[section][key] = coerced;
    // If context already exists (e.g., after Background created a file),
    // reconfigure it so the new setting takes effect.
    if (this.ctx) {
      await this.ctx.reconfigure({ [section]: { [key]: coerced } });
    }
  },
);

// =============================================================================
// MCP tool steps -- propose_change
// =============================================================================

When(
  'I call propose_change with:',
  async function (this: ChangeDownWorld, table: any) {
    if (!this.ctx) await this.setupContext();
    const rows: string[][] = table.rawTable;
    const params = Object.fromEntries(rows.map((r: string[]) => [r[0].trim(), r[1].trim()]));
    const filePath = this.files.get(params.file) ?? params.file;

    // Resolve dynamic hash/line placeholders from committed view output
    // (e.g., <line of "timeout = 30">, <hash of that line>)
    const resolveHashCoords = (p: Record<string, string>) => {
      const resolved: Record<string, string> = { ...p };
      if (this.lastResult && !this.lastResult.isError) {
        const viewText = this.ctx.resultText(this.lastResult);
        // Extract target text from placeholder description (e.g., <line of "timeout = 30">)
        const needsResolving = Object.values(resolved).some(v => v?.startsWith('<'));
        if (needsResolving) {
          // Try to extract target from placeholder like <line of "retry = false">
          let searchTarget = '';
          for (const v of Object.values(resolved)) {
            if (v?.startsWith('<')) {
              const quoted = v.match(/"([^"]+)"/);
              if (quoted) { searchTarget = quoted[1]; break; }
            }
          }
          // Fallback to old_text if no target in placeholder
          if (!searchTarget) searchTarget = p.old_text ?? '';

          if (searchTarget) {
            for (const line of viewText.split('\n')) {
              if (line.includes(searchTarget)) {
                // Committed view format: " 3:d7 |timeout = 30" or "3:d7|..."
                const m = line.match(/\s*(\d+):([0-9a-f]{2})/);
                if (m) {
                  if (resolved.start_line?.startsWith('<')) resolved.start_line = m[1];
                  if (resolved.start_hash?.startsWith('<')) resolved.start_hash = m[2];
                  if (resolved.after_line?.startsWith('<')) resolved.after_line = m[1];
                  if (resolved.after_hash?.startsWith('<')) resolved.after_hash = m[2];
                  break;
                }
              }
            }
          }
        }
      }
      return resolved;
    };

    const rp = resolveHashCoords(params);
    const opts: any = {
      old_text: rp.old_text,
      new_text: rp.new_text,
      insert_after: rp.insert_after,
      reason: rp.reasoning ?? rp.reason,
      author: rp.author,
      raw: rp.raw === 'true',
    };
    if (rp.start_line && !rp.start_line.startsWith('<'))
      opts.start_line = parseInt(rp.start_line, 10);
    if (rp.start_hash && !rp.start_hash.startsWith('<'))
      opts.start_hash = rp.start_hash;
    if (rp.after_line && !rp.after_line.startsWith('<'))
      opts.after_line = parseInt(rp.after_line, 10);
    if (rp.after_hash && !rp.after_hash.startsWith('<'))
      opts.after_hash = rp.after_hash;

    try {
      this.lastResult = await this.ctx.propose(filePath, opts);
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// MCP tool steps -- read_tracked_file
// =============================================================================

When(
  'I call read_tracked_file with view = {string}',
  async function (this: ChangeDownWorld, view: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    try {
      this.lastResult = await this.ctx.read(filePath, { view });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// MCP tool steps -- review_changes
// =============================================================================

When(
  'I call review_changes approving {string}',
  async function (this: ChangeDownWorld, changeId: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [{ change_id: changeId, decision: 'approve', reason: 'approved' }],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call review_changes rejecting {string}',
  async function (this: ChangeDownWorld, changeId: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [{ change_id: changeId, decision: 'reject', reason: 'rejected' }],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// MCP tool steps -- get_change
// =============================================================================

When(
  'I call get_change for {string}',
  async function (this: ChangeDownWorld, changeId: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    try {
      this.lastResult = await this.ctx.getChange(filePath, changeId);
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// MCP tool steps -- amend_change
// =============================================================================

When(
  'I call amend_change for {string} with new_text {string}',
  async function (this: ChangeDownWorld, changeId: string, newText: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    try {
      this.lastResult = await this.ctx.amend(filePath, changeId, {
        new_text: newText,
        reason: 'amended via step',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// Assertion steps -- response data
// =============================================================================

Then(
  'the response contains change_id {string}',
  function (this: ChangeDownWorld, expectedId: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const data = this.ctx.parseResult(this.lastResult);
    assert.equal(data.change_id, expectedId);
  },
);

Then(
  'the response type is {string}',
  function (this: ChangeDownWorld, expectedType: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const data = this.ctx.parseResult(this.lastResult);
    assert.equal(data.type, expectedType);
  },
);

Then(
  'the response is an error',
  function (this: ChangeDownWorld) {
    assert.ok(this.lastResult, 'No MCP result available');
    assert.equal(this.lastResult.isError, true, 'Expected an error response');
  },
);

Then(
  'the response is not an error',
  function (this: ChangeDownWorld) {
    assert.ok(this.lastResult, 'No MCP result available');
    assert.notEqual(this.lastResult.isError, true, 'Expected a success response');
  },
);

// =============================================================================
// Assertion steps -- file content
// =============================================================================

Then(
  'the file contains {string}',
  async function (this: ChangeDownWorld, expected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(expected),
      `Expected file to contain "${expected}" but got:\n${disk}`,
    );
  },
);

Then(
  'the file does not contain {string}',
  async function (this: ChangeDownWorld, unexpected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      !disk.includes(unexpected),
      `Expected file NOT to contain "${unexpected}" but it does`,
    );
  },
);

Then(
  'the file {string} contains {string}',
  async function (this: ChangeDownWorld, name: string, expected: string) {
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}" in this scenario`);
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(expected),
      `Expected file "${name}" to contain "${expected}" but got:\n${disk}`,
    );
  },
);

Then(
  'the file contains a footnote {string} with status {string}',
  async function (this: ChangeDownWorld, ref: string, status: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    const id = ref.replace('[^', '').replace(']', '');
    // assertFootnoteStatus throws on mismatch -- let it propagate as a test failure
    await this.ctx.assertFootnoteStatus(filePath, id, status);
  },
);

Then(
  'the footnote contains the reasoning {string}',
  async function (this: ChangeDownWorld, expected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file has been created in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(expected),
      `Expected footnote to contain reasoning "${expected}" but file content is:\n${disk}`,
    );
  },
);

// =============================================================================
// Assertion steps -- read view output
// =============================================================================

Then(
  'the output contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const text = this.ctx.resultText(this.lastResult);
    assert.ok(
      text.includes(expected),
      `Expected output to contain "${expected}" but got:\n${text}`,
    );
  },
);

Then(
  'the output does not contain {string}',
  function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const text = this.ctx.resultText(this.lastResult);
    assert.ok(
      !text.includes(unexpected),
      `Expected output NOT to contain "${unexpected}" but it does`,
    );
  },
);
