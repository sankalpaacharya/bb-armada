import { describe, expect, it } from "vitest";

import { shadeGridFrames } from "@/components/shade-grid";

describe("shadeGridFrames", () => {
  const frames = shadeGridFrames(3);

  it("paints every cell of the square in every frame", () => {
    for (const frame of frames) expect(frame).toHaveLength(9);
  });

  it("loops from a front entering the corner through to one leaving it", () => {
    expect(frames).toHaveLength(9);
    expect(frames[0]).toEqual([
      0.5, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22,
    ]);
  });

  it("sweeps the brightest cell from the top-left corner to the bottom-right", () => {
    const brightest = frames.map((frame) => frame.indexOf(1));
    expect(brightest).toEqual([-1, -1, 0, 1, 2, 5, 8, -1, -1]);
  });

  it("fades along the anti-diagonals around the front", () => {
    expect(frames[2]).toEqual([1, 0.75, 0.5, 0.75, 0.5, 0.22, 0.5, 0.22, 0.22]);
  });
});
