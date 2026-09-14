<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import { fileSize, shortDate } from './format.js';

	/**
	 * A document's earlier files: what each was, who put it up, who replaced it.
	 * Download is for everyone who can see the document, Restore for anyone who
	 * may upload, and Delete for good for a steward only — keeping the old file is
	 * what makes letting any member replace one safe.
	 */
	type Version = {
		id: string;
		filename: string;
		bytes: number;
		uploadedAt: number;
		uploader: string | null;
		supersededAt: number;
		supersededBy: string | null;
	};

	type Props = {
		slug: string;
		documentId: string;
		versions: readonly Version[];
		can: { upload: boolean; destroy: boolean };
		/** The form action path prefix; the library and the workspace both host this. */
		action?: string;
	};

	let { slug, documentId, versions, can, action = '' }: Props = $props();
</script>

{#if versions.length === 0}
	<p class="text-fg-muted text-meta">{m.library_versions_empty()}</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each versions as version (version.id)}
			<li
				class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-control) border p-2"
			>
				<span class="text-fg-secondary text-meta min-w-0 flex-1 break-words">
					{m.library_version_line({
						filename: version.filename,
						added: shortDate(version.uploadedAt),
						by: version.uploader ? m.library_version_by({ person: version.uploader }) : '',
						replaced: shortDate(version.supersededAt),
						replacer: version.supersededBy
							? m.library_version_by({ person: version.supersededBy })
							: ''
					})}
					· <span data-tabular>{fileSize(version.bytes)}</span>
				</span>
				<a
					href={links.documentVersionFile(slug, documentId, version.id)}
					class="text-fg text-meta underline underline-offset-2">{m.library_version_download()}</a
				>
				{#if can.upload}
					<form method="POST" action="{action}?/restore" use:enhance>
						<input type="hidden" name="documentId" value={documentId} />
						<input type="hidden" name="versionId" value={version.id} />
						<button
							type="submit"
							class="text-accent-fg text-meta cursor-pointer underline underline-offset-2"
							>{m.library_version_restore()}</button
						>
					</form>
				{/if}
				{#if can.destroy}
					<form method="POST" action="{action}?/deleteVersion" use:enhance>
						<input type="hidden" name="documentId" value={documentId} />
						<input type="hidden" name="versionId" value={version.id} />
						<button
							type="submit"
							class="text-danger text-meta cursor-pointer underline underline-offset-2"
							>{m.library_version_delete()}</button
						>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
