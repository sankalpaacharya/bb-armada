// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";

import { Switch } from "../components/ui/switch";

afterEach(cleanup);

function Labelled() {
  const [on, setOn] = useState(false);
  return (
    <>
      <span id="label">Auto-compact</span>
      <Switch checked={on} onCheckedChange={setOn} aria-labelledby="label" />
    </>
  );
}

it("is a named switch that flips when clicked", () => {
  render(<Labelled />);
  const toggle = screen.getByRole("switch", { name: "Auto-compact" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
});
