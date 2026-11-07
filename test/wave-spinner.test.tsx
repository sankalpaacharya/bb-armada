// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaveSpinner } from "@/components/wave-spinner";

describe("WaveSpinner", () => {
  it("draws nine dots that pulse outward from the top-left, named when it stands alone", () => {
    const { getByRole } = render(<WaveSpinner label="Working" />);
    const dots = getByRole("img", { name: "Working" }).querySelectorAll("span");
    expect(dots).toHaveLength(9);
    expect(Array.from(dots, (dot) => dot.style.animationDelay)).toEqual([
      "0s",
      "0.12s",
      "0.24s",
      "0.12s",
      "0.24s",
      "0.36s",
      "0.24s",
      "0.36s",
      "0.48s",
    ]);
    const silent = render(<WaveSpinner />).container.firstElementChild;
    expect(silent?.getAttribute("aria-hidden")).toBe("true");
  });
});
