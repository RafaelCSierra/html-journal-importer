/**
 * HTML Journal Importer — Foundry VTT Module
 * Imports HTML files as Journal Entries with automatic folder organization
 * and Mestre/Público page grouping.
 */

const { ApplicationV2 } = foundry.applications.api;

// =========================================================================
// Category detection
// =========================================================================

const CATEGORY_PATTERNS = [
  { key: "NPCs",   patterns: [/\/NPCs\//i, /\\NPCs\\/i] },
  { key: "Reinos", patterns: [/\/Reinos\//i, /\\Reinos\\/i] },
  { key: "Locais", patterns: [/\/Locais\//i, /\\Locais\\/i] },
  { key: "Geral",  patterns: [/\/Geral\//i, /\\Geral\\/i, /Vis[aã]o Geral/i] },
];

function detectCategory(relativePath, fileName) {
  const full = relativePath || fileName;
  for (const { key, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some(p => p.test(full))) return key;
  }
  return null;
}

// =========================================================================
// File name parsing
// =========================================================================

/**
 * Parse a file name like "Grimfell - Mestre.html" into
 * { baseName: "Grimfell", variant: "Mestre" }
 *
 * Also handles "Lomia - Visão Geral.html" → { baseName: "Lomia", variant: "Visão Geral" }
 * And plain "SomeName.html" → { baseName: "SomeName", variant: null }
 */
function parseFileName(fileName) {
  const name = fileName.replace(/\.html?$/i, "");
  const match = name.match(/^(.+?)\s*-\s*(Mestre|Público|Visão Geral)$/i);
  if (match) {
    return { baseName: match[1].trim(), variant: match[2].trim() };
  }
  return { baseName: name.trim(), variant: null };
}

// =========================================================================
// Folder helpers
// =========================================================================

async function findOrCreateFolder(name, parentId = null) {
  const existing = game.folders.find(f =>
    f.type === "JournalEntry" && f.name === name && (f.folder?.id ?? null) === parentId
  );
  if (existing) return existing;
  return Folder.create({ name, type: "JournalEntry", folder: parentId ?? undefined });
}

// =========================================================================
// Read file as text
// =========================================================================

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

// =========================================================================
// HTMLJournalImporter
// =========================================================================

class HTMLJournalImporter extends ApplicationV2 {

  /** @type {File[]} */
  _files = [];

  /** @type {"idle"|"importing"|"done"} */
  _state = "idle";

  /** @type {string} */
  _resultMessage = "";

  static DEFAULT_OPTIONS = {
    id: "html-journal-importer",
    window: {
      title: "HTML Journal Importer",
      icon: "fas fa-file-import",
      resizable: true,
    },
    position: {
      width: 480,
      height: "auto",
    },
    actions: {
      pickFiles: HTMLJournalImporter.#onPickFiles,
      pickFolder: HTMLJournalImporter.#onPickFolder,
      import: HTMLJournalImporter.#onImport,
    },
  };

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  async _renderHTML() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("hji-wrapper");

    if (this._state === "importing") {
      wrapper.innerHTML = `
        <div class="hji-importing">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Importando...</p>
        </div>`;
      return { wrapper };
    }

    if (this._state === "done") {
      wrapper.innerHTML = `
        <div class="hji-result">
          <i class="fas fa-check-circle"></i>
          <p>${this._resultMessage}</p>
          <div class="hji-actions">
            <button type="button" data-action="pickFiles">Nova importação</button>
          </div>
        </div>`;
      return { wrapper };
    }

    // Idle state — main form
    const fileCount = this._files.length;
    const fileLabel = fileCount === 0
      ? "Nenhum arquivo selecionado"
      : `${fileCount} arquivo(s) selecionado(s)`;

    wrapper.innerHTML = `
      <div class="hji-form">
        <p class="hji-instructions">
          Selecione arquivos HTML ou uma pasta inteira para importar como Journal Entries.
        </p>

        <div class="hji-file-section">
          <div class="hji-file-buttons">
            <button type="button" data-action="pickFiles">
              <i class="fas fa-file-code"></i> Selecionar Arquivos
            </button>
            <button type="button" data-action="pickFolder">
              <i class="fas fa-folder-open"></i> Selecionar Pasta
            </button>
          </div>
          <p class="hji-file-count">${fileLabel}</p>
        </div>

        <div class="hji-options">
          <div class="form-group">
            <label for="hji-root-folder">Pasta raiz no Journal:</label>
            <input type="text" id="hji-root-folder" value="Importados" />
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="hji-subfolders" checked />
              Criar subpastas por categoria (NPCs, Reinos, Locais, Geral)
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="hji-overwrite" />
              Sobrescrever journals existentes com mesmo nome
            </label>
          </div>
        </div>

        <div class="hji-actions">
          <button type="button" data-action="import" ${fileCount === 0 ? "disabled" : ""}>
            <i class="fas fa-download"></i> Importar
          </button>
        </div>
      </div>`;

    return { wrapper };
  }

  _replaceHTML(result) {
    const content = this.element.querySelector(".window-content");
    content.replaceChildren(result.wrapper);
  }

  // -----------------------------------------------------------------------
  // Hidden file inputs (created once, reused)
  // -----------------------------------------------------------------------

  _getFileInput() {
    if (!this._fileInput) {
      this._fileInput = document.createElement("input");
      this._fileInput.type = "file";
      this._fileInput.accept = ".html,.htm";
      this._fileInput.multiple = true;
      this._fileInput.style.display = "none";
      this._fileInput.addEventListener("change", () => {
        this._files = Array.from(this._fileInput.files);
        this.render(true);
      });
      document.body.appendChild(this._fileInput);
    }
    return this._fileInput;
  }

  _getFolderInput() {
    if (!this._folderInput) {
      this._folderInput = document.createElement("input");
      this._folderInput.type = "file";
      this._folderInput.webkitdirectory = true;
      this._folderInput.style.display = "none";
      this._folderInput.addEventListener("change", () => {
        // Filter only .html/.htm files from the folder
        this._files = Array.from(this._folderInput.files).filter(f =>
          /\.html?$/i.test(f.name)
        );
        this.render(true);
      });
      document.body.appendChild(this._folderInput);
    }
    return this._folderInput;
  }

  // Cleanup on close
  async close(options) {
    this._fileInput?.remove();
    this._folderInput?.remove();
    this._fileInput = null;
    this._folderInput = null;
    return super.close(options);
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  static #onPickFiles() {
    this._getFileInput().click();
  }

  static #onPickFolder() {
    this._getFolderInput().click();
  }

  static async #onImport() {
    if (this._files.length === 0) return;

    const rootFolderName = this.element.querySelector("#hji-root-folder")?.value?.trim() || "Importados";
    const useSubfolders = this.element.querySelector("#hji-subfolders")?.checked ?? true;
    const overwrite = this.element.querySelector("#hji-overwrite")?.checked ?? false;

    this._state = "importing";
    this.render(true);

    try {
      const result = await this._doImport(rootFolderName, useSubfolders, overwrite);
      this._state = "done";
      this._resultMessage = `${result.created} journal(s) criado(s), ${result.updated} atualizado(s).`;
      ui.notifications.info(`HTML Journal Importer: ${this._resultMessage}`);
    } catch (err) {
      console.error("HTML Journal Importer |", err);
      this._state = "done";
      this._resultMessage = `Erro: ${err.message}`;
      ui.notifications.error(`HTML Journal Importer: ${err.message}`);
    }

    this._files = [];
    this.render(true);
  }

  // -----------------------------------------------------------------------
  // Import logic
  // -----------------------------------------------------------------------

  async _doImport(rootFolderName, useSubfolders, overwrite) {
    // 1. Read all files and parse metadata
    const entries = [];
    for (const file of this._files) {
      const html = await readFileAsText(file);
      const relativePath = file.webkitRelativePath || file.name;
      const { baseName, variant } = parseFileName(file.name);
      const category = useSubfolders ? detectCategory(relativePath, file.name) : null;
      // Journal name: "Grimfell - Mestre" or just "Grimfell" if no variant
      const journalName = variant ? `${baseName} - ${variant}` : baseName;
      entries.push({ journalName, category, html });
    }

    // 2. Create root folder
    const rootFolder = await findOrCreateFolder(rootFolderName);

    // 3. Create category subfolders
    const categoryFolders = new Map();
    if (useSubfolders) {
      const categories = new Set(entries.map(e => e.category).filter(Boolean));
      for (const cat of categories) {
        const folder = await findOrCreateFolder(cat, rootFolder.id);
        categoryFolders.set(cat, folder);
      }
    }

    // 4. Create one JournalEntry per file
    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      const parentFolder = entry.category
        ? categoryFolders.get(entry.category)
        : rootFolder;

      const pageData = [{
        name: entry.journalName,
        type: "text",
        text: { content: entry.html },
      }];

      // Check for existing journal with same name in same folder
      let existing = null;
      if (overwrite) {
        existing = game.journal.find(j =>
          j.name === entry.journalName && j.folder?.id === parentFolder.id
        );
      }

      if (existing) {
        // Replace page content
        const deleteIds = existing.pages.map(p => p.id);
        if (deleteIds.length) {
          await existing.deleteEmbeddedDocuments("JournalEntryPage", deleteIds);
        }
        await existing.createEmbeddedDocuments("JournalEntryPage", pageData);
        updated++;
      } else {
        await JournalEntry.create({
          name: entry.journalName,
          folder: parentFolder.id,
          pages: pageData,
        });
        created++;
      }
    }

    return { created, updated };
  }
}

// =========================================================================
// Singleton
// =========================================================================

let importerInstance = null;

function openImporter() {
  if (!importerInstance) {
    importerInstance = new HTMLJournalImporter();
    importerInstance.addEventListener("close", () => {
      importerInstance = null;
    });
  }
  importerInstance.render(true);
}

// =========================================================================
// Hooks
// =========================================================================

Hooks.on("renderJournalDirectory", (app, html) => {
  const headerActions = html.querySelector(".header-actions");
  if (!headerActions) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("hji-sidebar-btn");
  btn.innerHTML = `<i class="fas fa-file-import"></i> Importar HTML`;
  btn.dataset.tooltip = "Importar arquivos HTML como Journal Entries";
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    openImporter();
  });

  headerActions.appendChild(btn);
});

Hooks.once("ready", () => {
  console.log("HTML Journal Importer | Module loaded and ready.");
});
