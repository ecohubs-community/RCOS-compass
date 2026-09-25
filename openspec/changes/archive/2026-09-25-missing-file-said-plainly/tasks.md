## 1. Knowing whether the file is there

- [x] 1.1 `isStored(storageKey)` in `src/lib/server/documents/storage.ts`: a synchronous read-access check through `absolutePathOf`, false on any error
- [x] 1.2 `workspaceView` carries `document.stored`
- [x] 1.3 Tests (integration, `workspace.test.ts`): true when the file is in the upload folder, false when it is not

## 2. Saying it

- [x] 2.1 `workspace_file_missing` (and the upload hint) in `messages/en.json`; de/es fall back
- [x] 2.2 Document screen: when `!stored`, the sentence at both widths, no header download link, the PDF viewer never loaded
- [x] 2.3 `pnpm check`, unit and integration suites

## 3. Shipping

- [x] 3.1 `package.json` patch bump
