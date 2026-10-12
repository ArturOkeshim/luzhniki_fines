import assert from "node:assert/strict";
import test from "node:test";
import {
  addDateOnlyDays,
  formatRussianDateOnly,
  inclusiveDateRangeEnd,
  moscowDate,
} from "../app/lib/date-only.ts";

test("adds subscription days without applying a device time zone", () => {
  assert.equal(addDateOnlyDays("2026-10-07", 30), "2026-11-06");
  assert.equal(addDateOnlyDays("2028-02-28", 1), "2028-02-29");
});

test("counts the start date as the first subscription day", () => {
  assert.equal(inclusiveDateRangeEnd("2026-10-08", 30), "2026-11-06");
  assert.equal(inclusiveDateRangeEnd("2026-10-08", 1), "2026-10-08");
});

test("uses Moscow calendar date as the service date", () => {
  const afterMoscowMidnight = new Date("2026-10-06T21:30:00.000Z");
  assert.equal(moscowDate(0, afterMoscowMidnight), "2026-10-07");
  assert.equal(moscowDate(1, afterMoscowMidnight), "2026-10-08");
});

test("formats the stored calendar date without shifting it", () => {
  assert.match(formatRussianDateOnly("2026-11-06"), /6 ноября 2026/);
});
