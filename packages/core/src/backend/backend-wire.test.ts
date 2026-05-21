import { describe, expect, it } from "vitest";
import {
  CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
  backendWireOperationClass,
  assertPaneBackendWireRequestHasNoTransportSecrets,
  type PaneBackendWireRequest,
} from "./backend-wire";

describe("Pane backend wire envelope", () => {
  it("classifies backend operations without public MCP tool names", () => {
    const read: PaneBackendWireRequest = {
      protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
      operation: { kind: "read", ref: { uri: "word://sess-1" }, options: { view: "working" } },
    };
    const write: PaneBackendWireRequest = {
      protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
      operation: { kind: "applyChange", ref: { uri: "word://sess-1" }, op: { kind: "propose", args: { at: "1:abc", op: "{++hi++}" } } },
    };


    expect(backendWireOperationClass(read)).toBe("read");
    expect(backendWireOperationClass(write)).toBe("write");
    expect(JSON.stringify(write)).not.toContain("propose_change");
  });

  it("rejects transport/auth material in the backend operation envelope", () => {
    const operation = {
      protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
      operation: { kind: "read", ref: { uri: "word://sess-1" }, options: { token: "secret" } },
    } as PaneBackendWireRequest;

    expect(() => assertPaneBackendWireRequestHasNoTransportSecrets(operation)).toThrow(/transport secret/i);
  });

  it("rejects transport/auth keys case-insensitively", () => {
    const operation = {
      protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
      operation: {
        kind: "read",
        ref: { uri: "word://sess-1" },
        options: { Authorization: "Bearer secret", TokenHashPrefix: "abcd" },
      },
    } as PaneBackendWireRequest;

    expect(() => assertPaneBackendWireRequestHasNoTransportSecrets(operation)).toThrow(/Authorization/);
  });
});
