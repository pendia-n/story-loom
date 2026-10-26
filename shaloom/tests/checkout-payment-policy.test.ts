import test from "node:test";
import assert from "node:assert/strict";
import { applyCheckoutPaymentPolicy, applyCheckoutOffer, subscriptionRefundPolicy, isPaidCheckoutEvent } from "../workers/checkout-payment-policy.ts";

test("one-time chapter and media purchases stay USD and allow Dashboard-enabled cards and crypto", () => {
	for (const kind of ["chapter_slots", "media_addon"] as const) {
		const form = new URLSearchParams({ mode: "payment", "line_items[0][price]": "price_existing", "metadata[kind]": kind });
		applyCheckoutPaymentPolicy(form, kind);
		assert.equal(form.get("currency"), "usd");
		assert.equal(form.get("adaptive_pricing[enabled]"), "false");
		assert.equal([...form.keys()].some((key) => key.startsWith("payment_method_types") || key.startsWith("excluded_payment_method_types") || key.startsWith("allowed_payment_method_types")), false);
		assert.equal(form.get("line_items[0][price]"), "price_existing");
		assert.equal(form.get("metadata[kind]"), kind);
	}
});

test("subscriptions exclude crypto without replacing existing recurring prices or other Dashboard settings", () => {
	const form = new URLSearchParams({ mode: "subscription", "line_items[0][price]": "price_monthly" });
	applyCheckoutPaymentPolicy(form, "subscription");
	assert.equal(form.get("excluded_payment_method_types[0]"), "crypto");
	assert.equal(form.has("currency"), false);
	assert.equal(form.has("adaptive_pricing[enabled]"), false);
	assert.equal(form.get("line_items[0][price]"), "price_monthly");
});

test("card and crypto add-ons only fulfill confirmed paid Checkout events, including delayed success", () => {
	for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
		assert.equal(isPaidCheckoutEvent(type, { payment_status: "paid" }), true);
		for (const status of ["unpaid", "no_payment_required", undefined]) assert.equal(isPaidCheckoutEvent(type, { payment_status: status }), false);
	}
	for (const type of ["checkout.session.async_payment_failed", "checkout.session.expired", "payment_intent.processing"]) assert.equal(isPaidCheckoutEvent(type, { payment_status: "paid" }), false);
});

test("all six offers go directly to Checkout without configured product or price IDs", () => {
	for (const tier of ["standard", "zealous"] as const) {
		for (const kind of ["subscription", "chapter_slots", "media_addon"] as const) {
			const form = new URLSearchParams();
			applyCheckoutOffer(form, kind, tier);
			assert.equal(form.has("line_items[0][price]"), false);
			assert.equal(form.has("line_items[0][price_data][product]"), false);
			assert.equal(form.get("line_items[0][price_data][currency]"), "usd");
			assert.equal(form.get("line_items[0][price_data][unit_amount]"), kind === "subscription" ? tier === "standard" ? "1800" : "3600" : kind === "chapter_slots" ? "500" : "300");
			assert.equal(form.get("mode"), kind === "subscription" ? "subscription" : "payment");
			assert.equal(form.get("line_items[0][price_data][recurring][interval]"), kind === "subscription" ? "month" : null);
			assert.equal(form.get("excluded_payment_method_types[0]"), kind === "subscription" ? "crypto" : null);
		}
	}
});

test("subscription refunds are exactly half in the last 72 hours and never cumulative beyond half", () => {
	const now = 1_800_000_000_000;
	const paidAt = now / 1000 - 3600;
	assert.deepEqual(subscriptionRefundPolicy(paidAt, 1800, 0, now), { eligible: true, amount: 900 });
	assert.deepEqual(subscriptionRefundPolicy(paidAt, 3600, 0, now), { eligible: true, amount: 1800 });
	assert.equal(subscriptionRefundPolicy(paidAt, 1801, 0, now).amount, 900);
	assert.equal(subscriptionRefundPolicy(paidAt, 1800, 900, now).amount, 0);
	assert.equal(subscriptionRefundPolicy(paidAt, 1800, 1800, now).amount, 0);
	assert.equal(subscriptionRefundPolicy(paidAt, 1800, 200, now).amount, 700);
	assert.equal(subscriptionRefundPolicy(now / 1000 - 72 * 3600, 1800, 0, now).amount, 900);
	assert.deepEqual(subscriptionRefundPolicy(now / 1000 - 72 * 3600 - 1, 1800, 0, now), { eligible: false, amount: 0 });
	assert.equal(subscriptionRefundPolicy(now / 1000 + 1, 1800, 0, now).eligible, false);
	assert.equal(subscriptionRefundPolicy(null, 1800, 0, now).eligible, false);
	assert.throws(() => subscriptionRefundPolicy(paidAt, NaN, 0, now));
	assert.throws(() => subscriptionRefundPolicy(paidAt, 1800, -1, now));
});
