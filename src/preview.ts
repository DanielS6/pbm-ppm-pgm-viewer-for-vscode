import * as vscode from "vscode";
import generateHTMLCanvas from "./webview";
import parse from "./parsing";
import { imagePreviewProviderViewType } from "./const";

class ImagePreviewDocument
  extends vscode.Disposable
  implements vscode.CustomDocument
{
  readonly uri: vscode.Uri;
  private documentData: Uint8Array;

  private static async readFile(uri: vscode.Uri) {
    return vscode.workspace.fs.readFile(uri);
  }

  static async create(uri: vscode.Uri) {
    const fileData = await ImagePreviewDocument.readFile(uri);
    return new ImagePreviewDocument(uri, fileData);
  }

  private constructor(uri: vscode.Uri, initialData: Uint8Array) {
    super(() => {});
    this.uri = uri;
    this.documentData = initialData;
  }

  public get getDocumentData() {
    return this.documentData;
  }

  public get imageData() {
    return parse.parseByteFormat(this.getDocumentData);
  }

  dispose() {
    super.dispose();
  }
}

export default class ImagePreviewProvider
  implements vscode.CustomReadonlyEditorProvider<ImagePreviewDocument>
{
  private static viewType = imagePreviewProviderViewType;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      ImagePreviewProvider.viewType,
      new ImagePreviewProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    );
  }

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: {},
    _token: vscode.CancellationToken
  ): Promise<ImagePreviewDocument> {
    const document = await ImagePreviewDocument.create(uri);
    return document;
  }

  private _updateWebView(
    newDocument: ImagePreviewDocument,
    webviewPanel: vscode.WebviewPanel
  ) {
    const { status, width, height, imgType } = newDocument.imageData;
    if (status === parse.PARSE_STATUS.SUCCESS) {
      webviewPanel.webview.html = generateHTMLCanvas(
        JSON.stringify(newDocument.imageData),
        width || 0,
        height || 0,
        imgType || ""
      );
    }
  }

  async resolveCustomEditor(
    document: ImagePreviewDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    this._updateWebView(document, webviewPanel);

    const relativePath = vscode.workspace.asRelativePath(document.uri);
    console.log("Opening File: " + relativePath);
    let watcher = vscode.workspace.createFileSystemWatcher("**/" + relativePath);  // possible to match another image
    const changeFileSubscription = watcher.onDidChange(async (e) => {
      console.log("Event: " + vscode.workspace.asRelativePath(e));
      if (relativePath === vscode.workspace.asRelativePath(e)) {  // filter an event
        console.log("Changed: " + vscode.workspace.asRelativePath(e));
        const newDocument = await ImagePreviewDocument.create(
          vscode.Uri.parse(e.path)
        );
        this._updateWebView(newDocument, webviewPanel);
      }
    });

    webviewPanel.onDidDispose(() => {
      changeFileSubscription.dispose();
    });
  }
}
