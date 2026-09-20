import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { editorInfoField, type Editor } from 'obsidian';

/** Tracks the live CodeMirror view behind each public Obsidian editor as views mount and change. */
export class EditorBridge {
  private readonly editors = new Map<Editor, EditorView>();

  constructor(private readonly changed: (update?: ViewUpdate) => void) {}

  /** Register with Obsidian so editor lifecycle events maintain the mapping and notify consumers. */
  readonly extension = ViewPlugin.define((view) => {
    let editor: Editor | undefined;
    const bind = () => {
      const currentEditor = view.state.field(editorInfoField, false)?.editor;

      // Mode switches can replace the CodeMirror view before the old one is destroyed.
      if (currentEditor !== editor) {
        if (editor && this.editors.get(editor) === view) this.editors.delete(editor);
        editor = currentEditor;
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

  /** Returns the bound CodeMirror view, or undefined while its editor extension is unavailable. */
  get(editor: Editor): EditorView | undefined {
    return this.editors.get(editor);
  }

  clear(): void {
    this.editors.clear();
  }
}
