// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWakeTime } from "@/lib/clock";
import { NOW } from "./fixtures";

const DAY = 24 * 3_600_000;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useWakeTime", () => {
  it("holds still until the soonest wake, then moves past it", () => {
    vi.useFakeTimers({ now: NOW });
    const wake = NOW + 60_000;
    const { result } = renderHook(() => useWakeTime([NOW + DAY, wake]));
    act(() => vi.advanceTimersByTime(59_000));
    expect(result.current).toBe(NOW);
    act(() => vi.advanceTimersByTime(1_100));
    expect(result.current).toBeGreaterThan(wake);
  });

  it("reaches a wake further off than one timer can wait", () => {
    vi.useFakeTimers({ now: NOW });
    const wake = NOW + 30 * DAY;
    const { result } = renderHook(() => useWakeTime([wake]));
    act(() => vi.advanceTimersByTime(25 * DAY));
    expect(result.current).toBeLessThan(wake);
    act(() => vi.advanceTimersByTime(5 * DAY + 100));
    expect(result.current).toBeGreaterThan(wake);
  });

  it("sets no timer when nothing is snoozed", () => {
    vi.useFakeTimers({ now: NOW });
    renderHook(() => useWakeTime([NOW - 1]));
    expect(vi.getTimerCount()).toBe(0);
  });
});
