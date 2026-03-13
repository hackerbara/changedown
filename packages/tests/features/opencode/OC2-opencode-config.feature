@fast @OC2
Feature: OC2 - OpenCode Config Hook
  The OpenCode plugin config hook injects MCP server configuration, skills
  paths, and instruction files into the OpenCode runtime config. Projects
  can opt out of skills and instructions via .opencode/changetracks.json.

  # ── MCP Server Injection ──

  Scenario: Config hook adds changetracks MCP server when not already configured
    Given an OpenCode plugin context for directory "/test/project"
    When I call the OpenCode config hook with empty config
    Then the config has a changetracks MCP server
    And the MCP server type is "local"
    And the MCP server environment has CHANGETRACKS_PROJECT_DIR "/test/project"

  Scenario: Config hook does not override existing changetracks MCP server
    Given an OpenCode plugin context for directory "/test/project"
    When I call the OpenCode config hook with existing changetracks MCP "https://custom.example.com"
    Then the MCP server URL is "https://custom.example.com"

  # ── Skills Injection ──

  Scenario: Config hook adds skills path by default
    Given an OpenCode plugin context for directory "/test/project"
    When I call the OpenCode config hook with empty config
    Then the config has skills paths
    And the skills path contains "skills"

  Scenario: Config hook omits skills when .opencode/changetracks.json disables them
    Given a temporary OpenCode project directory
    And an OpenCode opt-out config with skills disabled
    When I call the OpenCode config hook from temporary directory
    Then the config has no skills paths

  # ── Instructions Injection ──

  Scenario: Config hook adds instruction files by default
    Given an OpenCode plugin context for directory "/test/project"
    When I call the OpenCode config hook with empty config
    Then the config has instructions

  Scenario: Config hook omits instructions when .opencode/changetracks.json disables them
    Given a temporary OpenCode project directory
    And an OpenCode opt-out config with instructions disabled
    When I call the OpenCode config hook from temporary directory
    Then the config has no instructions

  # ── No Plugin-Level Tools ──

  Scenario: Plugin does not register propose_change or read_tracked_file as plugin tools
    Given an OpenCode plugin context for directory "/test/project"
    When I initialize the OpenCode plugin
    Then the plugin has no tool registrations
