const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function switchOcamlFile(activeEditor) {
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor found');
        return null;
    }

    const currentFile = activeEditor.document.uri.fsPath;
    let targetFile;
    let errorMessage = '';

    // Determine target file based on current file type
    if (currentFile.endsWith('_intf.ml')) {
        targetFile = currentFile.replace('_intf.ml', '.ml');
        errorMessage = `No corresponding .ml file found for ${currentFile}`;
    }
    else if (currentFile.endsWith('.mli')) {
        targetFile = currentFile.replace('.mli', '.ml');
        errorMessage = `No corresponding .ml file found for ${currentFile}`;
    }
    else if (currentFile.endsWith('.ml')) {
        // First try _intf.ml
        targetFile = currentFile.replace('.ml', '_intf.ml');
        errorMessage = `Neither _intf.ml nor .mli file found for ${currentFile}`;

        // If _intf.ml doesn't exist, try .mli
        if (!(await fileExists(targetFile))) {
            targetFile = currentFile.replace('.ml', '.mli');
            if (!(await fileExists(targetFile))) {
                vscode.window.showErrorMessage(errorMessage);
                return null;
            }
        }
    }
    else {
        vscode.window.showErrorMessage('Not an OCaml implementation or interface file');
        return null;
    }

    // Final existence check (redundant but ensures error shows)
    if (!(await fileExists(targetFile))) {
        vscode.window.showErrorMessage(errorMessage);
        return null;
    }

    return targetFile;
}

async function addToDuneWorkspace(selectedUri) {
    // Get current workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace opened');
        return;
    }

    // Get current file path
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    let selectedPath;
    if (selectedUri) {
        selectedPath = selectedUri.fsPath;
    }
    else {
        const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
        const defaultDir = currentFilePath
            ? path.dirname(currentFilePath)
            : workspaceFolders[0].uri.fsPath;

        // Show directory picker with default path
        const selectedDir = await vscode.window.showOpenDialog({
            defaultUri: vscode.Uri.file(defaultDir),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select directory to add to dune'
        });

        if (!selectedDir || selectedDir.length === 0) {
            return; // User cancelled
        }

        selectedPath = selectedDir[0].fsPath;
    }
    const relativePath = path.relative(workspaceFolders[0].uri.fsPath, selectedPath);

    // Ask user for alias type
    const aliasType = await vscode.window.showQuickPick(
        ['runtest', 'default'],
        { placeHolder: 'Select the alias type to add to dune file' }
    );

    if (!aliasType) {
        return;
    }

    // Find root dune file
    const rootDunePath = path.join(workspaceFolders[0].uri.fsPath, 'dune');


    try {
        // Read existing dune file
        let content = await fileExists(rootDunePath) ? await fs.readFile(rootDunePath, 'utf8') : '';

        // Add new stanza with modern Dune syntax
        let stanza = `(alias
  (name ${aliasType})
  (deps (alias_rec ${relativePath}/${aliasType}))
)
`

        // Write back to file
        await fs.writeFile(rootDunePath, stanza + content);
        vscode.window.showInformationMessage(`Successfully added ${relativePath} to dune workspace as ${aliasType} with default action`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to update dune file: ${error}`);
    }
}

let prefix = "ocaml-platform-extensions"

async function activate(context) {
    // Register file switcher command
    let switchDisposable = vscode.commands.registerCommand(`${prefix}.switchFiles`, async () => {
        const targetFile = await switchOcamlFile(vscode.window.activeTextEditor);
        if (targetFile) {
            try {
                const document = await vscode.workspace.openTextDocument(targetFile);
                await vscode.window.showTextDocument(document);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to open file: ${targetFile}`);
            }
        }
    });

    // Register dune workspace command
    let duneDisposable = vscode.commands.registerCommand(
        `${prefix}.addToDuneWorkspace`,
        addToDuneWorkspace  // Pass the URI when called from context menu
    );

    context.subscriptions.push(switchDisposable, duneDisposable);
}

exports.activate = activate;