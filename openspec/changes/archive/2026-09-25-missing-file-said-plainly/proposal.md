## Why

When a document's stored file is missing from disk, the document screen gets the
problem wrong. The file route answers 404, pdf.js cannot open the file, and the
viewer falls back to the text with *"This PDF couldn't be shown as it was
uploaded… you can download the original"*. That blames the PDF, and the download
link it offers is a 404 too. It happened on a development instance: the
community's upload folder was gone and the database rows were not. The same thing
happens in production after a partial restore or a lost volume.

The reading itself cannot recover either. `extract-job.ts` treats a missing file
as `ExtractionUnavailable`, which keeps the earlier reading. So the
boot-time re-read sweep keeps picking the document up and gets nowhere, and the
member keeps seeing text from an older reader with no explanation.

Reasoning: `docs/04-security.md` §5 (storage and serving),
`openspec/specs/document-viewer` ("A PDF can be seen as it was uploaded"),
`openspec/specs/durability` (snapshot and restore).

## What Changes

- **The workspace view says whether the file is stored.** `workspaceView`
  carries `document.stored`, from a read-only existence check in
  `documents/storage.ts`. It is never a path and never a size. The only
  information it adds is present or absent.
- **The document screen says so plainly** when the file is missing: the file for
  this document is missing from storage, so the original cannot be shown or
  downloaded; the text below is what Compass read from it before it went missing;
  whoever runs this Compass can restore it from a backup, and a member who can
  upload can upload it again as a new version. At every width.
- **Nothing is offered that cannot work**: no download link, and the PDF viewer
  is not loaded. The text view is shown as today.
- The "couldn't be shown" sentence stays for what it describes: a file that is
  there and will not render.

Not in this change: surfacing the missing file anywhere else (the library list,
a steward health page), and stopping the re-read sweep from retrying a missing
file on every boot.

## Capabilities

### Modified Capabilities

- `document-viewer`: a document whose stored file is missing says so, and
  offers neither the original view nor a download.

## Impact

- `src/lib/server/documents/storage.ts` (`isStored`),
  `src/lib/server/services/workspace.ts`,
  `src/routes/(app)/c/[slug]/documents/[id]/+page.svelte`, `messages/en.json`.
- No migration, no new capability, no new route. Version: patch.
