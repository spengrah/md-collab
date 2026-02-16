export class ItemView {
  public readonly app: unknown;
  public readonly containerEl: unknown;

  constructor(leaf: { app: unknown; containerEl: unknown }) {
    this.app = leaf.app;
    this.containerEl = leaf.containerEl;
  }
}

export class MarkdownView {}

export class Notice {
  constructor(_message: string) {}
}

export class WorkspaceLeaf {}
export class Plugin {}
