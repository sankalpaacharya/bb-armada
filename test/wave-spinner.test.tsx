// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WaveSpinner } from "@/components/wave-spinner";

describe("WaveSpinner", () => {
  it("draws three wave bars, named when it stands alone and hidden beside a word", () => {
    const { getByRole } = render(<WaveSpinner label="Working" />);
    expect(
      getByRole("img", { name: "Working" }).querySelectorAll("rect"),
    ).toHaveLength(3);
    const silent = render(<WaveSpinner />).container.firstElementChild;
    expect(silent?.getAttribute("aria-hidden")).toBe("true");
  });
});
