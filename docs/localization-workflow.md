# Localization Workflow

## Files

- Source language: `src/locales/en.json`
- Translation files: `src/locales/fr.json`, `src/locales/ca.json`, `src/locales/de.json`, `src/locales/it.json`

## Rules

- Add and edit translation keys in `src/locales/en.json` first.
- Keep the same keys in all locale files.
- Update the translated files in the same branch as the English change, so no locale falls behind.
- Review translation updates through GitHub before merging.

## Local Checks

Run:

```bash
npm run build
```

before merging translation structure changes.
