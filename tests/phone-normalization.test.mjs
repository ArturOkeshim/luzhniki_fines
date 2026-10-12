import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRussianPhoneInput,
  normalizeRussianPhone,
} from "../app/lib/phone.ts";

test("normalizes common Russian phone formats", () => {
  const variants = [
    "89680607581",
    "79680607581",
    "+79680607581",
    "+7 968 060-75-81",
    "8 (968) 060 75 81",
    "9680607581",
  ];

  for (const value of variants) {
    assert.equal(normalizeRussianPhone(value), "+79680607581");
  }
});

test("rejects incomplete or non-Russian phone numbers", () => {
  assert.equal(normalizeRussianPhone("8 968 060"), "");
  assert.equal(normalizeRussianPhone("+1 968 060-75-81"), "");
  assert.equal(normalizeRussianPhone(""), "");
});

test("formats a valid number after input", () => {
  assert.equal(
    formatRussianPhoneInput("8 (968) 0607581"),
    "+7 968 060-75-81",
  );
});

test("formats a Russian phone while it is being entered", () => {
  assert.equal(formatRussianPhoneInput("8"), "+7");
  assert.equal(formatRussianPhoneInput("8968"), "+7 968");
  assert.equal(formatRussianPhoneInput("+7 968 0607"), "+7 968 060-7");
  assert.equal(formatRussianPhoneInput("9680607581"), "+7 968 060-75-81");
});

test("does not turn an explicit foreign country code into a Russian one", () => {
  assert.equal(formatRussianPhoneInput("+1 968"), "+1968");
});
