import type { ScreenActionId, ScreenViewModel } from "./ScreenState";

export class ScreenOverlayController {
  private readonly root: HTMLDivElement;
  private lastKey = "";

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "screen-overlay is-hidden";
    document.body.appendChild(this.root);
  }

  render(
    model: ScreenViewModel | null,
    onAction: (actionId: ScreenActionId) => void
  ): void {
    if (!model) {
      if (!this.root.classList.contains("is-hidden")) {
        this.root.classList.add("is-hidden");
      }
      this.lastKey = "";
      return;
    }

    const key = JSON.stringify(model);
    if (this.lastKey === key && !this.root.classList.contains("is-hidden")) {
      return;
    }
    this.lastKey = key;
    this.root.classList.remove("is-hidden");
    this.root.dataset.screen = model.screen.toLowerCase();
    this.root.replaceChildren();

    const panel = document.createElement("section");
    panel.className = "screen-panel";

    const title = document.createElement("h1");
    title.textContent = model.title;
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "screen-subtitle";
    subtitle.textContent = model.subtitle;
    panel.appendChild(subtitle);

    const summary = document.createElement("div");
    summary.className = "screen-summary";
    model.summaryRows.forEach((row, index) => {
      const summaryRow = document.createElement("div");
      summaryRow.className = "screen-summary-row";
      summaryRow.style.setProperty("--row-index", String(index));

      const label = document.createElement("span");
      label.className = "screen-summary-label";
      label.textContent = row.label;
      const value = document.createElement("span");
      value.className = "screen-summary-value";
      value.textContent = row.value;
      summaryRow.append(label, value);
      summary.appendChild(summaryRow);
    });
    panel.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "screen-actions";
    model.actions.forEach((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `screen-action ${action.emphasis ?? "secondary"}`;
      button.style.setProperty("--action-index", String(index));
      button.setAttribute("aria-label", action.label);
      button.textContent = action.label;
      button.addEventListener("click", () => onAction(action.id));
      button.addEventListener(
        "touchend",
        (event) => {
          event.preventDefault();
          onAction(action.id);
        },
        { passive: false }
      );
      actions.appendChild(button);
    });
    panel.appendChild(actions);
    this.root.appendChild(panel);
  }
}
