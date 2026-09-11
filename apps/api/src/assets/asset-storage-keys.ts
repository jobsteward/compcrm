export function createAssetStorageKeys(input: {
	organizationId: string;
	projectId: string;
	uploadId: string;
	objectId: string;
}) {
	const projectPrefix = `${input.organizationId}/projects/${input.projectId}`;
	return {
		temporaryKey: `temporary/${projectPrefix}/${input.uploadId}`,
		finalKey: `${projectPrefix}/assets/${input.objectId}`,
	};
}
