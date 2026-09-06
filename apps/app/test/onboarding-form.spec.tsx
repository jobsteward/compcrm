import { afterEach, expect, it, mock, spyOn } from "bun:test";
import * as queries from "@tanstack/react-query";
import * as navigation from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingForm } from "../app/(landing)/onboarding/onboarding-form";
import * as client from "../lib/trpc/client";

afterEach(() => mock.restore());

it("enters the application after saving workspace onboarding", () => {
	const replace = mock();
	const refresh = mock();
	let onSuccess: (() => void) | undefined;

	spyOn(navigation, "useRouter").mockReturnValue({
		bfcacheId: "test",
		replace,
		refresh,
		push: mock(),
		back: mock(),
		forward: mock(),
		prefetch: mock(),
	});
	spyOn(client, "useTRPC").mockReturnValue({
		workspace: {
			update: {
				mutationOptions: (options: { onSuccess: () => void }) => {
					onSuccess = options.onSuccess;
					return options;
				},
			},
		},
	} as unknown as ReturnType<typeof client.useTRPC>);
	spyOn(queries, "useMutation").mockReturnValue({
		isPending: false,
	} as ReturnType<typeof queries.useMutation>);

	renderToStaticMarkup(<OnboardingForm placeholder="Acme" />);
	expect(onSuccess).toBeDefined();
	onSuccess?.();

	expect(refresh).toHaveBeenCalledTimes(1);
	expect(replace).toHaveBeenCalledWith("/");
});
