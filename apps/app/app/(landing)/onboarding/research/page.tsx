import { redirect } from "next/navigation";
import { requireMailboxAccess } from "@/lib/session";

export const instant = false;

export default async function ResearchKeyPage() {
	await requireMailboxAccess();
	redirect("/");
}
