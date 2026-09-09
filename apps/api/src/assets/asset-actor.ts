export type AssetActor =
	| { type: "USER"; userId: string }
	| { type: "SYSTEM"; mailboxOwnerId: string; messageId: string };
export function assetActorKey(actor: AssetActor) {
	return actor.type === "USER"
		? `user:${actor.userId}`
		: `mailbox:${actor.mailboxOwnerId}`;
}
