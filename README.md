# HTML Journal Importer

Módulo para Foundry VTT v13 que importa arquivos HTML como Journal Entries.

## Funcionalidades

- **Importação por arquivos ou pasta** — selecione HTMLs individuais ou uma pasta inteira
- **Organização automática** — cria subpastas no Journal sidebar (NPCs, Reinos, Locais, Geral) baseado na estrutura de diretórios dos arquivos
- **Suporte a variantes Mestre/Público** — arquivos como `Grimfell - Mestre.html` e `Grimfell - Público.html` são importados como journals separados, permitindo controle individual de permissões e compartilhamento com jogadores
- **Sobrescrita opcional** — atualiza journals existentes com o mesmo nome ao reimportar

## Instalação

1. Baixe ou clone este repositório
2. Copie a pasta `html-journal-importer` para `FoundryVTT/Data/modules/`
3. Ative o módulo nas configurações do world

## Uso

1. Abra a aba **Journal** no sidebar
2. Clique no botão **Importar HTML**
3. Selecione os arquivos ou pasta com seus HTMLs
4. Configure a pasta raiz e opções de subpastas
5. Clique em **Importar**

## Formato esperado dos arquivos

O módulo espera arquivos HTML com a convenção de nome:

```
Nome - Mestre.html
Nome - Público.html
```

Organizados em pastas por categoria:

```
Foundry/
├── NPCs/
├── Reinos/
├── Locais/
└── Geral/
```
