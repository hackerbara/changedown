@fast @CL2
Feature: CL2 — CodeLens deduplication
  After removing the extension-side CodeLens provider, only the LSP
  provider should emit lenses. The extension module should not export
  AcceptRejectCodeLensProvider.

  Scenario: CL2-01 AcceptRejectCodeLensProvider is not exported
    Then the module "changedown-vscode/internals" does not export "AcceptRejectCodeLensProvider"
