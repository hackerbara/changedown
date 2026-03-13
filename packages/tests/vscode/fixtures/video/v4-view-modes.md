# Release Checklist

{++## Pre-Release++}

{--All tests must pass before tagging.--}
{++The CI pipeline validates test coverage, linting, and security scans automatically.++}

Database migrations {~~should run manually~>are applied automatically via Flyway~~} during deployment.

{==The changelog needs updating with breaking changes for this release.==}{>>@ops: automate this from git log?<<}

## Deployment

Rolling deploys target {++three availability zones with++} canary analysis before full rollout.

Rollback is {--manual and requires SSH access to--}{++automatic if error rate exceeds 1% during the++} canary window.
