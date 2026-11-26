# Contributing

This is a public repository. Review all contributions, including tests, examples, documentation, logs and screenshots, before submitting them.

- Use fictional fixtures only, such as placeholder GUIDs and "Example Site". Do not include real customer, site or tenant data.
- Write tool descriptions from scratch; do not copy them from product documentation.
- Never commit credentials, tokens, internal hostnames or non-public URLs. Use placeholders in examples and environment variables for local secrets.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue or pull request.

Describe the change and its intended behavior in your pull request. Add or update focused tests for behavior changes and run the relevant checks available in the repository. Do not run live tests against production or include real data in test results.

The live BDP smoke tests are excluded from public CI and are skipped unless all of the following are true: `BDP_LIVE_SMOKE=1`, credentials are provided through `BDP_TENANT_ID`, `BDP_CLIENT_ID`, `BDP_CLIENT_SECRET`, and `BDP_SCOPE`, `BDP_BASE_URL` is explicitly set to `https://ecostruxure-building-platform-api-uat.se.app`, and `BDP_LIVE_SMOKE_CONFIRM_NON_PROD=I_CONFIRM_UAT_ONLY`. Set these values only after a human has confirmed the credentials and target are for the non-production UAT environment. The suite only lists one site and executes a GraphQL query; it never runs against production or performs writes.

Run it locally with `npm test -- test/live-smoke.test.ts`. Do not add these credentials or confirmation variables to CI, repository files, or test output. The suite is also disabled whenever `CI` or `GITHUB_ACTIONS` is set.

The existing MIT license file does not establish legal approval for this repository. Written approval remains outstanding in [issue #3](https://github.com/fboucher/bdp-mcp-community/issues/3).
