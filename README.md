<div align="center">

# 🎨 stitch-to-claude

**Ponte MCP entre o [Stitch](https://stitch.withgoogle.com) (Google) e o Claude Code.**

Gere telas, design systems e protótipos do Stitch direto do seu terminal — falando em linguagem natural com o Claude.

`Node ≥ 18` · `MCP stdio` · `escopo de usuário`

</div>

---

## 🤔 O que é isso?

O Stitch expõe um servidor MCP remoto (`stitch.googleapis.com/mcp`), mas o Claude Code **não consegue consumi-lo direto**: os schemas das ferramentas usam `$ref`/`$defs` que o cliente não resolve.

O `stitch-proxy.mjs` resolve isso atuando como um **proxy MCP local (stdio)**:

```
┌──────────────┐   stdio    ┌──────────────────┐   HTTPS    ┌──────────────────────┐
│  Claude Code │ ─────────► │  stitch-proxy.mjs │ ─────────► │  stitch.googleapis…  │
│   (cliente)  │ ◄───────── │   (este projeto)  │ ◄───────── │   (MCP do Stitch)    │
└──────────────┘            └──────────────────┘            └──────────────────────┘
                              • injeta a API key no header X-Goog-Api-Key
                              • "achata" os schemas ($ref/$defs → inline)
```

Resultado: o Claude enxerga as ferramentas do Stitch como se fossem nativas. ✨

---

## ✅ Pré-requisitos

- **Node.js ≥ 18** (`node --version`)
- **Claude Code** instalado (`claude --version`)
- Uma **API key do Stitch** — pegue em [stitch.withgoogle.com](https://stitch.withgoogle.com) → conta → *API keys*

---

## 🚀 Setup (passo a passo)

> Tudo via `export` — sem arquivos de config, sem `.env`. Rápido e reprodutível.

### 1. Clone e instale as dependências

```bash
git clone git@github.com:lucasmunizb/stitch-to-claude.git
cd stitch-to-claude
npm install
```

### 2. Exporte as duas variáveis

São só duas: a **chave** e o **caminho absoluto** do proxy (gerado com `$PWD`, então rode de dentro da pasta do projeto).

```bash
export STITCH_API_KEY="cole-sua-chave-aqui"
export STITCH_PROXY="$PWD/stitch-proxy.mjs"
```

### 3. Registre o MCP no escopo de usuário

O escopo `user` deixa o Stitch disponível em **todos os seus projetos**, não só neste diretório.

```bash
claude mcp add stitch \
  --scope user \
  --env STITCH_API_KEY="$STITCH_API_KEY" \
  -- node "$STITCH_PROXY"
```

### 4. Verifique

```bash
claude mcp list          # deve listar "stitch"  ✓ Connected
```

Ou, já dentro do Claude Code, rode `/mcp` para ver o servidor `stitch` conectado e suas ferramentas.

> 💡 **Dica:** colocar os dois `export` no seu `~/.bashrc`/`~/.zshrc` mantém a chave sempre disponível entre sessões. O caminho do proxy também pode ser fixado lá (apontando para o caminho absoluto real, não `$PWD`).

---

## 🧰 Ferramentas disponíveis

Depois de conectado, o Claude ganha acesso a estas tools (prefixadas com `stitch`):

| Ferramenta | O que faz |
|---|---|
| `create_project` | Cria um novo projeto no Stitch |
| `list_projects` / `get_project` | Lista / detalha projetos |
| `generate_screen_from_text` | Gera uma tela a partir de um prompt em texto |
| `list_screens` / `get_screen` | Lista / detalha telas de um projeto |
| `edit_screens` | Edita telas existentes |
| `generate_variants` | Gera variações de uma tela |
| `create_design_system` | Cria um design system |
| `create_design_system_from_design_md` / `upload_design_md` | Cria/sobe design system a partir de um `design.md` |
| `list_design_systems` / `update_design_system` | Lista / atualiza design systems |
| `apply_design_system` | Aplica um design system às telas |

---

## 💬 Como usar (ideias de prompts)

É só conversar com o Claude Code normalmente — ele decide quando chamar o Stitch.

**Criar do zero:**
```
Crie um projeto no Stitch chamado "Finance App" e gere uma tela de dashboard
com saldo total, gráfico de gastos do mês e lista das últimas transações.
```

**Iterar em cima do que existe:**
```
Liste as telas do meu projeto Finance App e gere 3 variações da tela de login,
uma minimalista, uma com ilustração e uma dark mode.
```

**Design system:**
```
Crie um design system com paleta roxa (#6D28D9), tipografia Inter e bordas
arredondadas, depois aplique em todas as telas do projeto.
```

**A partir de um arquivo:**
```
Use o design.md desta pasta para criar um design system no Stitch e
gerar a tela de onboarding seguindo ele.
```

**Explorar:**
```
Quais projetos eu tenho no Stitch? Mostre as telas do mais recente.
```

---

## ⚙️ Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `STITCH_API_KEY` | ✅ | — | Chave da API do Stitch (header `X-Goog-Api-Key`) |
| `STITCH_URL` | ❌ | `https://stitch.googleapis.com/mcp` | Endpoint MCP do upstream |

---

## 🔧 Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `STITCH_API_KEY não encontrada` | a env não chegou ao processo | confirme `echo $STITCH_API_KEY` e que o `--env` foi passado no `claude mcp add` |
| `stitch` aparece como `✗ Failed` no `/mcp` | chave inválida ou sem rede | revise a key; teste `node "$STITCH_PROXY"` direto (deve logar "conectado ao upstream") |
| Caminho errado / `Cannot find module` | registrou com `$PWD` de outra pasta | re-registre de dentro do projeto, ou use o caminho absoluto fixo |
| Mudei a chave e não atualizou | o MCP guarda o `--env` do registro | `claude mcp remove stitch` e registre de novo |

**Testar o proxy isolado** (fora do Claude):
```bash
node "$STITCH_PROXY"
# esperado:
# [stitch-proxy] conectado ao upstream: https://stitch.googleapis.com/mcp
# [stitch-proxy] rodando (stdio).
```

**Remover / re-registrar:**
```bash
claude mcp remove stitch
# ...ajuste os exports e rode o "claude mcp add" de novo
```

---

<div align="center">

Feito para deixar o fluxo **design → código** num lugar só. 🛠️

</div>
