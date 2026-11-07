// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";

import { Dropdown } from "@/components/dropdown";

const CHOICES = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

beforeAll(() => installTestPluginRuntime());
afterEach(cleanup);

function Harness({ onChange }: { onChange: (id: string) => void }) {
  const [value, setValue] = useState("a");
  return (
    <div>
      <button type="button">elsewhere</button>
      <Dropdown
        label="Pick one"
        choices={CHOICES}
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange(id);
        }}
        align="stretch"
      >
        {CHOICES.find((choice) => choice.id === value)?.label}
      </Dropdown>
    </div>
  );
}

const trigger = () => screen.getByRole("button", { name: /Alpha|Beta/ });
const list = () => screen.queryByRole("listbox", { name: "Pick one" });

describe("Dropdown", () => {
  it("opens its list on click and points the trigger at it", () => {
    render(<Harness onChange={vi.fn()} />);
    expect(list()).toBeNull();
    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger());
    expect(list()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(list()?.id);
  });

  it("picks an option, reports it, closes, and hands focus back to the trigger", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(list()).toBeNull();
    expect(trigger().textContent).toBe("Beta");
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    render(<Harness onChange={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(list()!, { key: "Escape" });
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on a press outside, but not on a press inside", () => {
    render(<Harness onChange={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole("option", { name: "Alpha" }));
    expect(list()).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    expect(list()).toBeNull();
  });

  it("closes when the trigger is clicked again", () => {
    render(<Harness onChange={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(list()).toBeNull();
  });
});
