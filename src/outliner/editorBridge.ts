import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { editorInfoField, type Editor } from 'obsidian';

export class EditorBridge {
  private readonly editors = new Map<Editor, EditorView>();

  constructor(private readonly changed: (update?: ViewUpdate) => void) {}

  readonly extension = ViewPlugin.define((view) => {
    let editor: Editor | undefined;
    const bind = () => {
      const current = view.state.field(editorInfoField, false)?.editor;
      if (current !== editor) {
        if (editor && this.editors.get(editor) === view) this.editors.delete(editor);
        editor = current;
      }
      if (editor) this.editors.set(editor, view);
    };
    bind();
    this.changed();
    return {
      update: (update: ViewUpdate) => {
        bind();
        this.changed(update);
      },
      destroy: () => {
        if (editor && this.editors.get(editor) === view) this.editors.delete(editor);
        this.changed();
      },
    };
  });

  get(editor: Editor): EditorView | undefined {
    return this.editors.get(editor);
  }

  clear(): void {
    this.editors.clear();
  }
}
