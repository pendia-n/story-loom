/** Keep Dashboard-managed payment methods, with crypto limited to one-time USD purchases. */
export function applyCheckoutPaymentPolicy(form: URLSearchParams, kind: "subscription" | "chapter_slots" | "media_addon") {
	if (kind === "subscription") {
		form.set("excluded_payment_method_types[0]", "crypto");
		return;
	}
	// Stablecoin Checkout is presented in USD. Local-currency conversion can hide Crypto.
	// Do not hard-code payment_method_types: Stripe includes eligible, enabled cards and crypto.
	form.set("currency", "usd");
	form.set("adaptive_pricing[enabled]", "false");
}

export function isPaidCheckoutEvent(type: unknown, session: { payment_status?: unknown }) {
	return (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") && session.payment_status === "paid";
}
