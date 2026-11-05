# SignPath Foundation application status

- **Submitted:** 2026-11-05
- **Project:** PinTu Collage / 拼图工坊
- **Repository:** https://github.com/jikeyum/pingtu-collage
- **Release at submission:** https://github.com/jikeyum/pingtu-collage/releases/tag/v5.0.0
- **Status:** pending review

The application form was submitted successfully. SignPath Foundation reviews
project eligibility, build provenance and reputation. This repository already
contains the code signing policy, privacy policy, CI build workflow and a
signed-artifact workflow template.

## After approval

SignPath will provide the organization ID, project slug, signing policy slug
and artifact configuration slug. The maintainer then needs to:

1. Create a SignPath API token.
2. Add repository variable `SIGNPATH_ORGANIZATION_ID`.
3. Add repository variable `SIGNPATH_PROJECT_SLUG`.
4. Add repository variable `SIGNPATH_SIGNING_POLICY_SLUG`.
5. Add repository variable `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`.
6. Add repository secret `SIGNPATH_API_TOKEN`.
7. Enable and test the signing step in `.github/workflows/signpath.yml`.

Do not put the API token in a workflow file or commit it to the repository.
