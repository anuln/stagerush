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

    const summary = document.createElement("dl");
    summary.className = "screen-summary";
    for (const row of model.summaryRows) {
      const label = document.createElement("dt");
      label.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.value;
      summary.append(label, value);
    }
    panel.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "screen-actions";
    for (const action of model.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `screen-action ${action.emphasis ?? "secondary"}`;
      button.textContent = action.label;
      button.addEventListener("click", () => onAction(action.id));
      actions.appendChild(button);
    }
    panel.appendChild(actions);
    this.root.appendChild(panel);
  }
}
