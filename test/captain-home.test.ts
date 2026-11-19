import { describe, expect, it } from "vitest";

import { freshHome, homeFolder, homeOf } from "../lib/captain-home";

describe("a captain's home", () => {
  it("is its own folder when it has one, and a file-safe slug of its project's name otherwise", () => {
    expect(homeOf({ home: "video-editing" }, "Personal")).toBe("video-editing");
    expect(homeOf(null, "My App (v2)")).toBe("my-app-v2");
    expect(homeOf(null, "!!!")).toBe("project");
    expect(homeFolder("video-editing")).toBe("~/.bb/captains/video-editing");
  });

  it("is new for a new captain, named after it and numbered past every home taken", () => {
    expect(freshHome("Video editing", new Set(["personal"]))).toBe(
      "video-editing",
    );
    expect(freshHome("Forms", new Set(["forms", "forms-2", "forms-3"]))).toBe(
      "forms-4",
    );
  });
});
