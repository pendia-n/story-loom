import test from "node:test";
import assert from "node:assert/strict";
import { applyCheckoutPaymentPolicy, isPaidCheckoutEvent } from "../workers/checkout-payment-policy.ts";

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
