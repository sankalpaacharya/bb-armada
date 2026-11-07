// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShadeGrid } from "@/components/shade-grid";

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const opacities = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[role=img] > span"))
    .map((cell) => cell.style.opacity)
    .join(",");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ShadeGrid", () => {
  it("is a labelled image whose cells move while motion is allowed", () => {
    vi.useFakeTimers();
    stubMotion(false);
    const { container, getByRole } = render(<ShadeGrid label="Working" />);
    expect(getByRole("img", { name: "Working" })).toBeTruthy();
    expect(container.querySelectorAll("[role=img] > span")).toHaveLength(16);
    const before = opacities(container);
    act(() => vi.advanceTimersByTime(120));
    expect(opacities(container)).not.toBe(before);
  });

  it("holds one frame under reduced motion", () => {
    vi.useFakeTimers();
    stubMotion(true);
    const { container } = render(<ShadeGrid label="Working" />);
    const before = opacities(container);
    act(() => vi.advanceTimersByTime(1000));
    expect(opacities(container)).toBe(before);
    expect(before).toContain("1");
  });

  it("stops ticking once the last grid is gone", () => {
    vi.useFakeTimers();
    stubMotion(false);
    const first = render(<ShadeGrid label="Working" />);
    const second = render(<ShadeGrid label="Working" />);
    expect(vi.getTimerCount()).toBe(1);
    first.unmount();
    expect(vi.getTimerCount()).toBe(1);
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
