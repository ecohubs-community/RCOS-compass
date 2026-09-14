/**
 * Small, shared formatting for the document screens — kept in one place so a
 * row, a version list and the workspace header say "1.4 MB" the
 * same way.
 */

export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
