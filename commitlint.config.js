/**
 * Commit message rules.
 *
 * Spec: https://www.conventionalcommits.org/en/v1.0.0/
 * Process: docs/RELEASING.md
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'perf',
        'refactor',
        'docs',
        'test',
        'build',
        'outputs',
        'gates',
        'ci',
        'chore',
        'revert'
      ]
    ],
    'scope-enum': [
      2,
      'always',
      [
        'partials',
        'layouts',
        'shortcodes',
        'markup',
        'assets',
        'config',
        'i18n',
        'scripts',
        'tests',
        'theme',
        'docs',
        'contract',
        'fixtures',
        'oracle',
        'parity',
        'visual',
        'qa',
        'a11y',
        'build',
        'outputs',
        'gates',
        'ci',
        'deps',
        'upstream',
        'starter',
        'release'
      ]
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always']
  }
};
