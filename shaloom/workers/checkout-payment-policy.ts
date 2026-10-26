export type CheckoutKind = "subscription" | "chapter_slots" | "media_addon";
export type PaidTier = "standard" | "zealous";

export function checkoutOffer(kind: CheckoutKind, tier: PaidTier) {
	const label = tier === "standard" ? "Standard" : "Zealous";
	if (kind === "subscription") return { name: `Shaloom - ${label} Subscription`, amount: tier === "standard" ? 1800 : 3600 };
	if (kind === "chapter_slots") return { name: `Shaloom - ${label} Add On: ${tier === "standard" ? 10 : 20} chapters`, amount: 500 };
	return { name: `Shaloom - ${label} Add On: Media Space for One Chapter`, amount: 300 };
}

/** Send the offer directly to hosted Checkout; no configured Price or Product IDs. */
export function applyCheckoutOffer(form: URLSearchParams, kind: CheckoutKind, tier: PaidTier) {
	const offer = checkoutOffer(kind, tier);
	form.set("line_items[0][price_data][currency]", "usd");
	form.set("line_items[0][price_data][unit_amount]", String(offer.amount));
	form.set("line_items[0][price_data][product_data][name]", offer.name);
	form.set("line_items[0][price_data][product_data][metadata][shaloom_kind]", kind);
	form.set("line_items[0][price_data][product_data][metadata][shaloom_tier]", tier);
	form.set("line_items[0][quantity]", "1");
	if (kind === "subscription") form.set("line_items[0][price_data][recurring][interval]", "month");
	applyCheckoutPaymentPolicy(form, kind);
}

/** Keep Dashboard-managed fiat methods, with crypto limited to one-time USD purchases. */
export function applyCheckoutPaymentPolicy(form: URLSearchParams, kind: CheckoutKind) {
	form.set("mode", kind === "subscription" ? "subscription" : "payment");
	if (kind === "subscription") {
		form.set("excluded_payment_method_types[0]", "crypto");
		return;
	}
	// Stablecoin Checkout is presented in USD. Local-currency conversion can hide Crypto.
	// Do not hard-code payment_method_types: Stripe includes eligible, enabled cards and crypto.
	form.set("currency", "usd");
	form.set("adaptive_pricing[enabled]", "false");
}

export function subscriptionRefundPolicy(paidAt: number | null, amountPaid: number, alreadyRefunded = 0, now = Date.now()) {
	const elapsed = paidAt === null ? -1 : now - paidAt * 1000;
	const eligible = paidAt !== null && elapsed >= 0 && elapsed <= 72 * 60 * 60 * 1000;
	if (!Number.isSafeInteger(amountPaid) || amountPaid <= 0 || !Number.isSafeInteger(alreadyRefunded) || alreadyRefunded < 0 || alreadyRefunded > amountPaid) throw new Error("Stripe returned an invalid subscription payment amount.");
	return { eligible, amount: eligible ? Math.max(0, Math.floor(amountPaid / 2) - alreadyRefunded) : 0 };
}

export function isPaidCheckoutEvent(type: unknown, session: { payment_status?: unknown }) {
	return (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") && session.payment_status === "paid";
}
