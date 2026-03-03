/**
 * Utility for examples to declare controls and read their values from URL params.
 *
 * - Value controls (number, boolean, select) are URL-bound and grouped on the left
 *   with submit/reset icon buttons. Changing them reloads the page.
 * - Action controls (button, toggle) are runtime-only and grouped on the right.
 *
 * Usage:
 *
 *   import { registerControls } from "./_controls";
 *
 *   const { order, size } = registerControls({
 *     order: { type: "number", label: "Nodes", default: 5000, min: 100, step: 100 },
 *     size: { type: "number", label: "Edges", default: 10000, min: 100, step: 100 },
 *     fa2: { type: "toggle", label: "ForceAtlas2", default: false, action: (running) => { ... } },
 *   });
 */
import ICON_RESET from "@phosphor-icons/core/assets/bold/arrow-counter-clockwise-bold.svg?raw";
import ICON_APPLY from "@phosphor-icons/core/assets/bold/arrow-right-bold.svg?raw";

interface NumberControl {
  type: "number";
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

interface BooleanControl {
  type: "boolean";
  label: string;
  default: boolean;
}

interface SelectControl {
  type: "select";
  label: string;
  default: string;
  options: { label: string; value: string }[];
}

interface ButtonControl {
  type: "button";
  label: string;
  action: () => void;
}

interface ToggleControl {
  type: "toggle";
  label: string;
  default: boolean;
  action: (active: boolean) => void;
}

type ControlDef = NumberControl | BooleanControl | SelectControl | ButtonControl | ToggleControl;
type ValueControlDef = NumberControl | BooleanControl | SelectControl;

type ControlValue<T extends ControlDef> = T extends NumberControl
  ? number
  : T extends BooleanControl
    ? boolean
    : T extends SelectControl
      ? string
      : T extends ToggleControl
        ? boolean
        : T extends ButtonControl
          ? void
          : never;

type ControlValues<T extends Record<string, ControlDef>> = {
  [K in keyof T]: ControlValue<T[K]>;
};

function readValue(def: ValueControlDef, raw: string | null): number | boolean | string {
  if (raw === null) return def.default;

  switch (def.type) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true" || raw === "1";
    case "select":
      return raw;
  }
}

function getFormValue(def: ValueControlDef, el: HTMLInputElement | HTMLSelectElement): string {
  if (def.type === "boolean") return String((el as HTMLInputElement).checked);
  return el.value;
}

function buildControls(
  container: HTMLElement,
  defs: Record<string, ControlDef>,
  values: Record<string, number | boolean | string | void>,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "controls-bar";

  // Left side: value controls + submit/reset
  const valueDefs = Object.entries(defs).filter(
    ([, def]) => def.type === "number" || def.type === "boolean" || def.type === "select",
  ) as [string, ValueControlDef][];

  if (valueDefs.length > 0) {
    const form = document.createElement("form");
    form.className = "controls-values";

    for (const [key, def] of valueDefs) {
      const row = document.createElement("label");
      row.className = "controls-row";

      const span = document.createElement("span");
      span.className = "controls-label";
      span.textContent = def.label;

      let input: HTMLInputElement | HTMLSelectElement;

      switch (def.type) {
        case "number": {
          input = document.createElement("input");
          input.type = "number";
          input.name = key;
          input.value = String(values[key]);
          if (def.min !== undefined) input.min = String(def.min);
          if (def.max !== undefined) input.max = String(def.max);
          if (def.step !== undefined) input.step = String(def.step);
          break;
        }
        case "boolean": {
          input = document.createElement("input");
          input.type = "checkbox";
          input.name = key;
          (input as HTMLInputElement).checked = values[key] as boolean;
          break;
        }
        case "select": {
          input = document.createElement("select");
          input.name = key;
          for (const opt of def.options) {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === values[key]) option.selected = true;
            input.appendChild(option);
          }
          break;
        }
      }

      if (def.type === "boolean") {
        row.appendChild(input);
        row.appendChild(span);
      } else {
        row.appendChild(span);
        row.appendChild(input);
      }

      form.appendChild(row);
    }

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "controls-icon-button";
    resetBtn.title = "Reset to defaults";
    resetBtn.innerHTML = ICON_RESET;
    form.appendChild(resetBtn);

    // Submit (apply) button
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "controls-icon-button";
    submitBtn.title = "Apply";
    submitBtn.innerHTML = ICON_APPLY;
    submitBtn.disabled = true; // starts disabled (inputs match current query)
    form.appendChild(submitBtn);

    // Check whether current form values differ from a reference set
    function formMatchesRef(ref: Record<string, string>): boolean {
      return valueDefs.every(([key, def]) => {
        const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement;
        return getFormValue(def, el) === ref[key];
      });
    }

    // Reference values: current URL params (for submit) and defaults (for reset)
    const currentParams: Record<string, string> = {};
    const defaultParams: Record<string, string> = {};
    for (const [key, def] of valueDefs) {
      currentParams[key] = String(values[key]);
      defaultParams[key] = String(def.default);
    }

    function updateButtonStates() {
      submitBtn.disabled = formMatchesRef(currentParams);
      resetBtn.disabled = formMatchesRef(defaultParams);
    }
    updateButtonStates();

    // Listen for input changes
    form.addEventListener("input", updateButtonStates);
    form.addEventListener("change", updateButtonStates);

    // Reset to defaults
    resetBtn.addEventListener("click", () => {
      for (const [key, def] of valueDefs) {
        const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement;
        if (def.type === "boolean") {
          (el as HTMLInputElement).checked = def.default;
        } else {
          el.value = String(def.default);
        }
      }
      updateButtonStates();
    });

    // Submit: update URL and reload
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const params = new URLSearchParams(location.search);
      for (const [key, def] of valueDefs) {
        const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement;
        params.set(key, getFormValue(def, el));
      }
      location.search = params.toString();
    });

    wrapper.appendChild(form);
  }

  // Right side: action controls (buttons, toggles)
  const actionDefs = Object.entries(defs).filter(([, def]) => def.type === "button" || def.type === "toggle");
  if (actionDefs.length > 0) {
    const actions = document.createElement("div");
    actions.className = "controls-actions";

    for (const [key, def] of actionDefs) {
      const btn = document.createElement("button");
      btn.type = "button";

      if (def.type === "button") {
        btn.className = "controls-button";
        btn.textContent = def.label;
        btn.addEventListener("click", def.action);
      } else if (def.type === "toggle") {
        btn.className = "controls-toggle";
        let active = values[key] as boolean;
        btn.textContent = def.label;
        btn.classList.toggle("active", active);
        btn.addEventListener("click", () => {
          active = !active;
          btn.classList.toggle("active", active);
          def.action(active);
        });
      }

      actions.appendChild(btn);
    }

    wrapper.appendChild(actions);
  }

  container.appendChild(wrapper);
}

export function registerControls<T extends Record<string, ControlDef>>(defs: T): ControlValues<T> {
  const params = new URLSearchParams(location.search);
  const values: Record<string, number | boolean | string | void> = {};

  for (const [key, def] of Object.entries(defs)) {
    if (def.type === "button") {
      values[key] = undefined;
    } else if (def.type === "toggle") {
      const raw = params.get(key);
      values[key] = raw !== null ? raw === "true" || raw === "1" : def.default;
    } else {
      values[key] = readValue(def, params.get(key));
    }
  }

  const container = document.getElementById("controls");
  if (container) {
    buildControls(container, defs, values);
  }

  return values as ControlValues<T>;
}
