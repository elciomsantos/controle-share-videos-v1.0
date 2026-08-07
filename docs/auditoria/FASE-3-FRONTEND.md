# Fase 3 — Auditoria de Frontend

**Status:** ✅ Concluída
**Data:** 2026-08-04
**Escopo:** qualidade de código do frontend Next.js (Pages Router + Mantine): gating de rotas e autenticação, estados de módulo e ciclo de vida de upload, tipagem (`any`/casts), robustez de parsing de limites vindos de config, i18n, acessibilidade e padrões React/Next.

---

## 3.1 Resumo Executivo

O frontend é **bem estruturado e defensivo em pontos críticos** (upload chunked com retry automático por índice, `crypto.getRandomValues` para shareId/senha, probe antes de montar mídia, contagem de views com guard anti-loop, download via fetch same-origin com parse de `Content-Disposition`, sanitização de redirects em `change-password`). Entretanto, foram identificados **12 achados**:

| Severidade | Qtd |
|---|---|
| Alto | 2 |
| Médio | 6 |
| Baixo | 4 |
| **Total** | **12** |

**Principal risco:** o gating de rotas no `middleware.ts` decodifica o JWT com `jwtDecode()` **sem verificar a assinatura** (FRN-01), e o fluxo de upload combina **estado mutável a nível de módulo** com `Promise.all` não aguardado (FRN-02), podendo orfanar compartilhamentos incompletos no backend e suprimir toasts de erro.

---

## 3.2 Critérios Avaliados

| Critério | Status |
|---|---|
| Gating de rotas e autenticação (middleware) | ⚠️ Parcial (FRN-01) |
| Ciclo de vida do upload (estado, finalização, erros) | ⚠️ Parcial (FRN-02) |
| Parsing de limites numéricos vindos de config | ❌ Falho (FRN-03) |
| Tipagem forte (`any` / casts sem verificação) | ❌ Falho (FRN-04) |
| Resiliência quando a API de config está indisponível | ⚠️ Parcial (FRN-05) |
| Acessibilidade (zoom, contraste, alvos de toque) | ⚠️ Parcial (FRN-06) |
| Navegação de previews de arquivo (sem perder contexto) | ⚠️ Parcial (FRN-07) |
| Consistência do modelo de categorias de config | ⚠️ Parcial (FRN-08) |
| Segurança de links externos (`target="_blank"`) | ⚠️ Parcial (FRN-09) |
| Internacionalização (strings fora de i18n) | ⚠️ Parcial (FRN-10) |
| Keys de listas e imutabilidade de props | ⚠️ Parcial (FRN-11, FRN-12) |
| Geração de IDs/senhas e validação de IDs em rotas | ✅ Adequado (`crypto.getRandomValues`, `isValidId`) |
| Upload defensivo (chunk retry, `pLimit(3)`, probe de mídia) | ✅ Adequado |
| Sanitização de redirects pós-alteração de senha | ✅ Adequado (anti open-redirect) |

---

## 3.3 Achados Detalhados

### FRN-01 — Gating de rotas decodifica o JWT sem verificar a assinatura

- **Problema:** O `middleware.ts` usa `jwtDecode()` (jwt-decode), que **apenas decodifica** a base64 do payload e verifica `exp`, sem validar a assinatura do token. O gating de UI (rotas admin/account) confia em alegações de um cookie que o cliente pode forjar localmente.
- **Localização:** `frontend/src/middleware.ts` — import l.1, uso l.56 (`jwtDecode` é a única ocorrência de decode de token no repositório).
- **Evidência:**
  ```ts
  // middleware.ts:56
  const payload = jwtDecode<{ exp?: number; role?: string; isAdmin?: boolean }>(token);
  if (payload.exp && payload.exp * 1000 < Date.now()) return signOutRedirect();
  // decisões de rota usam payload.role / payload.isAdmin
  ```
- **Situação Atual:** um usuário pode fabricar um cookie `access_token` com `{ role: "admin", isAdmin: true, exp: futuro }` e ver rotas/telas admin na UI. O **backend continua a fonte de verdade** (valida assinatura/role em cada endpoint), então o impacto é de UI/informação, não de dados — mas remove a defesa em profundidade e expõe estrutura de rotas.
- **Implementação (recomendada):** verificar a assinatura no middleware com a mesma chave do backend (`JWT_SECRET`) usando `jose` (já presente via `jwtDecode` não usa; `jose` é dependência do backend — adicionar no frontend) — ou, se a rota exige dados, delegar a decisão à API. Alternativa de menor esforço: manter apenas o gating de UX e garantir que nenhuma decisão de segurança dependa dele (documentar).
- **Código Sugerido:**
  ```ts
  import { jwtVerify } from "jose";
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret);
    // payload.role / payload.isAdmin confiáveis
  } catch {
    return signOutRedirect(); // assinatura inválida/forjada
  }
  ```
- **Benefícios:** gating de UI passa a rejeitar cookies forjados; defesa em profundidade; alinhamento com a validação do backend.
- **Riscos:** o middleware precisa ter acesso a `JWT_SECRET` (disponível no runtime do servidor Edge — ok); não cobre rotas que hoje funcionam sem segredo — exigiria rollout coordenado com a chave do backend.
- **Compatibilidade:** nenhuma mudança de API; requer `JWT_SECRET` compartilhado entre backend e frontend.

---

### FRN-02 — Estado mutável a nível de módulo + `Promise.all` não aguardado no upload

- **Problema:** o fluxo de upload mantém estado **fora do componente** (escopo de módulo ES, que é singleton no Pages Router). Além disso, `Promise.all(fileUploadPromises)` em `upload/index.tsx:166` não é aguardado nem tem `.catch` — a finalização do compartilhamento depende de um `useEffect` observando o progresso, que pode não rodar se o usuário navegar/desmontar a página.
- **Localização:** `frontend/src/pages/upload/index.tsx` l.26-28 e l.166; `frontend/src/components/upload/EditableUpload.tsx` (idem `let errorToastShown`).
- **Evidência:**
  ```ts
  // upload/index.tsx:26-28
  let errorToastShown = false;
  let createdShare: Share;
  let pendingGeneratedPassword: string | undefined;
  // ...
  // upload/index.tsx:166
  Promise.all(fileUploadPromises); // sem await, sem catch
  ```
- **Situação Atual:** (1) `errorToastShown` permanece `true` após navegar de volta para `/upload`, suprimindo toasts de erro futuros; (2) `createdShare`/`pendingGeneratedPassword` podem referenciar um compartilhamento de uma sessão anterior se o usuário abandonar o fluxo e entrar de novo; (3) como `Promise.all` não é aguardado e a finalização depende do `useEffect` (l.210-288), um componente desmontado no meio do upload pode **orfanar um share no backend** — criado mas nunca completado nem expirado até o cron.
- **Implementação (recomendada):** mover o estado para dentro do componente (`useState`/`useRef`) ou para um store (Zustand/Context), e aguardar o `Promise.all` com `try/catch`, completando o share dentro do mesmo handler — não em `useEffect`. Padrão já usado em `EditableUpload.tsx:144` (`await Promise.all(...)`) deve ser replicado.
- **Código Sugerido:**
  ```ts
  // dentro do componente
  const [createdShare, setCreatedShare] = useState<Share>();
  const pendingGeneratedPassword = useRef<string>();
  try {
    await Promise.all(fileUploadPromises);
    await completeShare(); // dentro do fluxo, não no useEffect
  } catch (err) {
    notifyError(err);
  }
  ```
- **Benefícios:** elimina vazamento de estado entre navegações; finalização confiável; elimina órfãos no backend.
- **Riscos:** mudança estrutural no fluxo de upload; exige teste manual do cenário de navegação durante o upload.
- **Compatibilidade:** nenhuma mudança de contrato de API.

---

### FRN-03 — `parseInt` sem guarda de NaN em limites vindos de config (`any`)

- **Problema:** vários pontos de limite (tamanho máximo, chunk size, comprimento de senha) aplicam `parseInt()` diretamente sobre `config.get(...)`, que retorna `any`. Se o valor estiver vazio, não-numérico ou corrompido, `parseInt` devolve `NaN` e as comparações `> <` com `NaN` são `false` silenciosamente — o upload pode não sofrer limite algum (espelho do BKD-03 no frontend).
- **Localização:** `frontend/src/pages/upload/index.tsx:70,72,74,187`; `frontend/src/components/upload/EditableUpload.tsx:37,66,72`; `frontend/src/pages/share/[shareId]/index.tsx:54,184`; `frontend/src/pages/account/shares.tsx:148`; `frontend/src/components/admin/shares/ManageShareTable.tsx:132`; `frontend/src/components/admin/config/AdminConfigInput.tsx:79,287`; `frontend/src/services/config.service.ts:52`.
- **Evidência:**
  ```ts
  // upload/index.tsx:70-74
  const chunkSize = useRef(parseInt(config.get("share.chunkSize")));
  maxShareSize ??= parseInt(config.get("share.maxSize"));
  maxShareSize = Math.min(maxShareSize, parseInt(user.shareSizeLimit)); // parseInt(undefined) = NaN => Math.min(x, NaN) = NaN
  ```
- **Situação Atual:** `Math.min(maxShareSize, NaN)` produz `NaN`; o Dropzone compara `fileSizeSum + currentFilesSize > maxShareSize` → `> NaN` é sempre `false` → o limite pode ser **desativado silenciosamente**. O mesmo padrão se repete para chunk size (`Math.ceil(file.size / NaN)` = NaN → loop de chunks não executa → upload trava sem mensagem).
- **Implementação (recomendada):** criar helper `toSafeNumber(value: any, fallback: number)` que normalize `NaN`/`undefined` e reutilizar nos 11 pontos. Em segundo plano, tipar `config.get<T>(key)` (ver FRN-04).
- **Código Sugerido:**
  ```ts
  export const toSafeNumber = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const maxShareSize = toSafeNumber(config.get("share.maxSize"), DEFAULT_MAX_SIZE);
  ```
- **Benefícios:** limites de upload/chunk passam a valer mesmo com config corrompida; paridade com a correção do BKD-03.
- **Riscos:** definir fallbacks sensatos por contexto.
- **Compatibilidade:** nenhuma mudança de API.

---

### FRN-04 — Tipos `any` generalizados (~55 usos)

- **Problema:** o frontend desliga o type-checker em cadeias de config e no tratamento de erros, concentrando erros de contrato para o runtime.
- **Localização:** `frontend/src/services/config.service.ts:38` (`get(key): any`); `frontend/src/hooks/config.hook.ts` (`get(): any`); `frontend/src/middleware.ts:10` (`fetchConfig(): Promise<any>`); `frontend/src/types/share.type.ts:6` (`files: any`); `frontend/src/pages/upload/index.tsx:93` (`(result as any).generatedPassword`); `frontend/src/utils/date.util.ts:11-14` (dayjs); `frontend/src/components/upload/Dropzone.tsx:65`; `frontend/src/components/admin/config/AdminConfigInput.tsx:87`; `frontend/src/components/auth/SignInForm.tsx:103`; + ~40 blocos `catch (err: any)` em modals/forms.
- **Evidência (contagem por ferramenta):** `as any` em 6 pontos; padrão `: any`/`err: any`/`e: any` em 51 ocorrências; total ≈ 55 usos.
- **Situação Atual:** `(result as any).generatedPassword` retorna `undefined` silencioso se o backend mudar o payload; `config.get()` não oferece nenhuma segurança de tipo para as chaves (typo vira runtime error).
- **Implementação (recomendada):** genericizar `config.get<T>(key): T`; tipar o payload de criação de share (`GeneratedShareResult`) e o `files` do tipo `Share`; substituir `err: any` por `unknown` + narrowing (`isAxiosError`, `instanceof Error`) ou um `error.util.ts` dedicado (já existe util de erro — centralizar).
- **Código Sugerido:**
  ```ts
  // config.service.ts
  get<T = string>(key: string, returnDefault?: boolean): T;
  // upload/index.tsx:93
  const generatedPassword = (result as GeneratedShareResult).generatedPassword;
  ```
- **Benefícios:** erros de contrato detectados em compilação; refatoração segura quando o backend tipar suas respostas.
- **Riscos:** ajuste de dezenas de call sites ao genericizar.
- **Compatibilidade:** apenas assinaturas TS.

---

### FRN-05 — Fallback silencioso de config + potencial loop de `location.reload()` por idioma

- **Problema:** quando a API de config falha, `_app.tsx` usa `getDefaultConfig()` **sem sinalizar erro**. Em seguida, o efeito que sincroniza idioma dispara `location.reload()` quando `pageProps.language !== cookieLanguage`. Com a API indisponível, `pageProps.language` é sempre o default (`pt-BR`); se o cookie `language` do usuário for outro, **todo reload mantém o mismatch → loop de reload infinito**.
- **Localização:** `frontend/src/pages/_app.tsx` — fallback l.357; reload l.212-218; viewport l.261-262.
- **Evidência:**
  ```ts
  // _app.tsx:357
  pageProps.configVariables = getDefaultConfig(); // sem flag de erro
  // _app.tsx:212-218
  if (!pageProps.language) return;
  const cookieLanguage = getCookie("language");
  if (!cookieLanguage) { i18nUtil.setLanguageCookie(pageProps.language); }
  else if (pageProps.language !== cookieLanguage) { location.reload(); }
  ```
- **Situação Atual:** com a API fora do ar e cookie de idioma ≠ `pt-BR`, a página recarrega continuamente (efeito de "tela branca com reload"). Mesmo com a API no ar, qualquer diferença transitória força um reload completo desnecessário.
- **Implementação (recomendada):** expor uma flag `configFetchFailed` no `getInitialProps`; quando verdadeira, não disparar `location.reload()` por idioma (usar o idioma do cookie). Adicionalmente, sincronizar o idioma via setState em vez de `location.reload()`.
- **Código Sugerido:**
  ```ts
  // _app.tsx:216-218
  else if (pageProps.language !== cookieLanguage && !pageProps.configFetchFailed) {
    i18nUtil.setLanguageCookie(pageProps.language); // sem reload forçado
  }
  ```
- **Benefícios:** app continua utilizável com a API de config fora do ar; elimina loop de reload; melhor UX de troca de idioma.
- **Riscos:** troca de idioma passa a ser imediata (via estado) — validar se há dependência do reload para aplicar o locale.
- **Compatibilidade:** nenhuma mudança de API.

---

### FRN-06 — `user-scalable=no` no viewport (bloqueia zoom — acessibilidade)

- **Problema:** a meta viewport desabilita o zoom do usuário (`user-scalable=no`), violando diretrizes de acessibilidade (WCAG 1.4.4 / 1.4.10 — redimensionamento de texto e reflow).
- **Localização:** `frontend/src/pages/_app.tsx:261-262`.
- **Evidência:**
  ```html
  <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no" />
  ```
- **Situação Atual:** usuários com baixa visão não conseguem ampliar a interface em mobile; também é penalizado por ferramentas de auditoria de acessibilidade.
- **Implementação (recomendada):** remover `user-scalable=no` (ou trocar para `user-scalable=yes`), mantendo `width=device-width, initial-scale=1`. Limitar `maximum-scale` a `5` se houver receio de quebra de layout (não recomendado bloquear por completo).
- **Código Sugerido:**
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ```
- **Benefícios:** zoom habilitado; conformidade com WCAG; melhor para telas pequenas.
- **Riscos:** potencial quebra sutil de layout em telas muito pequenas (testar as telas de upload/share).
- **Compatibilidade:** nenhuma.

---

### FRN-07 — Preview de PDF navega com `window.location.href` (perde overlay e contexto)

- **Problema:** o preview de PDF substitui a página inteira com `window.location.href` em vez de renderizar inline, perdendo o modal/overlay e o contexto do compartilhamento; sem tratamento de erro (ex.: 403 de download → página de erro genérica).
- **Localização:** `frontend/src/components/share/FilePreview.tsx:352`.
- **Evidência:**
  ```ts
  window.location.href = `/api/shares/${shareId}/files/${fileId}?download=false`;
  ```
- **Situação Atual:** navegação de página inteira (comunicação de um SPA); inconsistente com o restante dos previews (imagem/texto inline via probe); o botão "View original file" (l.176-185) usa o mesmo endpoint de forma correta como link externo.
- **Implementação (recomendada):** renderizar o PDF em `<iframe>`/`<object>` com fallback de erro (mensagem em vez de quebrar a página), mantendo o usuário no modal; ou manter o `window.location.href` apenas como último recurso com `try` de verificação de disponibilidade.
- **Código Sugerido:**
  ```tsx
  <iframe
    src={`/api/shares/${shareId}/files/${fileId}?download=false`}
    title={file.fileName}
    onError={() => setPdfError(true)}
  />
  ```
- **Benefícios:** UX consistente; tratamento de erro; menos navegação destrutiva.
- **Riscos:** mudança de comportamento do preview (validar renderização do PDF no modal).
- **Compatibilidade:** o endpoint já suporta `download=false`.

---

### FRN-08 — Inconsistência no modelo de categorias de config (capitalizadas na página vs. minúsculas no serviço)

- **Problema:** a página `/admin/config/[category]` valida com uma lista **capitalizada** `["General", "Appearance", ...]`, enquanto o serviço espera **minúsculas** `["general", "appearance", ...]` e faz fallback para `"general"`. A validação na página quase nunca casa com as URLs geradas (minúsculas), e o fetch funciona apenas por causa do fallback do serviço.
- **Localização:** `frontend/src/pages/admin/config/[category].tsx:31-39` (lista de exibição) vs. `frontend/src/services/config.service.ts:5-13` (lista do serviço).
- **Evidência:**
  ```ts
  // [category].tsx:31-39
  const categories = ["General", "Appearance", "Email", "Share", "SMTP", "Legal", "Cache"];
  // config.service.ts:5-13
  const categories = ["general", "appearance", "email", "share", "smtp", "legal", "cache"];
  // [category].tsx:48-54 — valida com a lista capitalizada
  if (!categories.includes(router.query.category)) { ... }
  ```
- **Situação Atual:** navegar para `/admin/config/email` valida `includes("email")` contra a lista capitalizada → falha, mas cai no caminho que usa `router.query.category` cru; o serviço então faz fallback para `"general"` quando recebe algo fora da lista minúscula — o fetch de "email" na prática funciona só quando `handleCategoryChange` converte para minúsculas (corpo ainda não auditado integralmente). O modelo é frágil e dependente de conversão implícita.
- **Implementação (recomendada):** unificar o case em um único lugar (ex.: constante exportada do serviço, em minúsculas) e validar/gerar URLs a partir dela; converter `handleCategoryChange` para o formato canônico.
- **Código Sugerido:**
  ```ts
  import { configCategories } from "../../../services/config.service"; // lista única
  const categoryId = configCategories.includes(router.query.category as string)
    ? (router.query.category as string)
    : "general";
  ```
- **Benefícios:** elimina o fallback acidental; URLs e labels consistentes; menos caminhos implícitos.
- **Riscos:** nenhum funcional relevante; validar o corpo de `handleCategoryChange` (l.52-139) antes de aplicar.
- **Compatibilidade:** URLs de config preservadas.

---

### FRN-09 — `target="_blank"` sem `rel="noopener noreferrer"`

- **Problema:** o único `target="_blank"` do repositório não define `rel` — expõe a nova aba à janela de origem (reverse tabnabbing). Mesmo-origem reduz o risco, mas a correção é trivial.
- **Localização:** `frontend/src/components/share/FilePreview.tsx:180`.
- **Evidência:**
  ```tsx
  <Button variant="subtle" component={Link} target="_blank" href={...}>
    View original file
  </Button>
  ```
- **Situação Atual:** a aba aberta pode, em tese, manipular `window.opener` e redirecionar a página de origem (apenas confiável para mesma origem hoje).
- **Implementação (recomendada):** adicionar `rel="noopener noreferrer"`.
- **Código Sugerido:**
  ```tsx
  <Button variant="subtle" component={Link} target="_blank" rel="noopener noreferrer" href={...}>
  ```
- **Benefícios:** proteção contra reverse tabnabbing; padrão de segurança recomendado (OWASP).
- **Riscos:** nenhum.
- **Compatibilidade:** nenhuma.

---

### FRN-10 — Strings hardcoded em inglês (i18n incompleto)

- **Problema:** textos visíveis ao usuário fora do sistema i18n, incluindo um comentário explícito "Add translation?" no código.
- **Localização:** `frontend/src/components/share/FilePreview.tsx:183-184` ("View original file" / `{/* Add translation? */}`) e l.343 ("Preview couldn't be fetched.").
- **Situação Atual:** em `pt-BR`, esses textos aparecem em inglês ao usuário; quebra a internacionalização do restante do app.
- **Implementação (recomendada):** extrair para as traduções (`i18n/translations/*.ts`) com chaves em `filePreview.*` e remover o comentário.
- **Código Sugerido:**
  ```tsx
  <FormattedMessage id="filePreview.viewOriginalFile" />
  ...
  <FormattedMessage id="filePreview.fetchFailed" />
  ```
- **Benefícios:** i18n completo; tradução para `pt-BR`.
- **Riscos:** nenhum.
- **Compatibilidade:** nenhuma.

---

### FRN-11 — Chaves de listas por índice (estado desalinha ao remover/reordenar)

- **Problema:** listas de arquivos usam o índice como `key` e um `Record<number, string>` indexado por posição para descrições — remover/reordenar um item desalinha descrições e estado.
- **Localização:** `frontend/src/components/upload/FileList.tsx:160-168` (`key={i}`); `frontend/src/components/upload/modals/showCreateUploadModal.tsx:443,718` (`key={index}` + `fileDescriptions[index]`).
- **Evidência:**
  ```tsx
  // FileList.tsx
  {files.map((file, i) => <FileListRow key={i} ... />)}
  // showCreateUploadModal.tsx — descrição por índice
  const description = fileDescriptions[fileIndex];
  ```
- **Situação Atual:** ao remover o arquivo de posição 0, o `Record` continua indexado pela posição antiga e as descrições migram para o arquivo errado; o React pode reutilizar DOM incorretamente.
- **Implementação (recomendada):** usar chave estável (ex.: `file.name + file.path` ou um id atribuído no upload) e armazenar descrições por essa chave (`Record<string, string>`).
- **Código Sugerido:**
  ```tsx
  const key = `${file.path}/${file.name}`;
  {files.map((file) => <FileListRow key={key} ... />)}
  ```
- **Benefícios:** estado estável frente a remoção/reordenação; renderização correta.
- **Riscos:** nenhum.
- **Compatibilidade:** nenhuma.

---

### FRN-12 — Mutação de props por referência

- **Problema:** componentes mutam os objetos `File` recebidos como prop em vez de copiá-los — efeitos colaterais indiretos no estado do pai e padrão frágil.
- **Localização:** `frontend/src/pages/upload/index.tsx:105-114` (muta `file.uploadingProgress` dentro do updater); `frontend/src/components/upload/EditableUpload.tsx:83-92` (idem); `frontend/src/components/upload/modals/showCreateUploadModal.tsx:285-288,674-677` (`file.description = fileDescriptions[index]` dentro de `map`).
- **Evidência:**
  ```ts
  // showCreateUploadModal.tsx:285-288
  const updated = files.map((file) => { file.description = fileDescriptions[i]; return file; });
  ```
- **Situação Atual:** a mutação de objetos compartilhados pode causar renders inconsistentes e bugs difíceis de rastrear; dificulta o React StrictMode e a depuração.
- **Implementação (recomendada):** sempre retornar novos objetos (`{ ...file, description }`, `{ ...file, deleted: true }`), sem alterar os recebidos.
- **Código Sugerido:**
  ```ts
  const updated = files.map((file, i) => ({ ...file, description: fileDescriptions[i] }));
  ```
- **Benefícios:** imutabilidade previsível; menos efeitos colaterais; compatível com StrictMode.
- **Riscos:** nenhum.
- **Compatibilidade:** nenhuma.

---

## 3.4 Fortalezas da Fase 3 (não são achados)

- Upload defensivo: chunk retry automático por índice (`unexpected_chunk_index` + 5 s), `pLimit(3)` de concorrência, `setFileProgress`, upload de pasta via `<input webkitdirectory>` com guard de feature (`"webkitdirectory" in HTMLInputElement.prototype`).
- Geração de `shareId` (16 chars) e senha (12 chars) com `crypto.getRandomValues` (CSPRNG); charset de senha sem caracteres ambíguos (0O1Il).
- `generateAvailableLink` com verificação de disponibilidade via `shareService.isShareIdAvailable` (retry com limite).
- Download via fetch same-origin com `credentials`, parse de `Content-Disposition` e tratamento de erro JSON (`.response.data`).
- Validação de `isValidId(shareId)` nas rotas de share/file (anti path-injection).
- Probe antes de montar mídia (`useFileProbe`) + contagem de views por play com guard anti-loop (`useRecordPlayView`); `useViewLimitModal` quando atinge o limite de views.
- Sanitização de redirect pós-alteração de senha (`change-password.tsx:55-58`: só aceita `next` começando com `/` e não `//` — anti open-redirect).
- Utilitários de cor defensivos em `_app.tsx` (`normalizeHexColor`, `rgbToHex` clamped, fallback "victoria").
- `MarkdownRenderer` com DOMPurify estrito; API com CSRF + retry.
- Traduções: sistema i18n completo com `pt-BR` default e `useTranslate`/`translateOutsideContext`.

---

## 3.5 Classificação Risco × Impacto × Esforço

| ID | Achado | Risco | Impacto | Esforço | Quick Win |
|---|---|---|---|---|---|
| FRN-01 | JWT sem verificação no gating do middleware | Alto | Segurança | Médio | ⚠️ parcial |
| FRN-02 | Estado módulo-level + `Promise.all` não aguardado no upload | Alto | Disponibilidade | Médio | ❌ |
| FRN-03 | `parseInt` sem guarda de NaN em limites de config | Médio | Segurança | Baixo | ✅ |
| FRN-04 | Tipos `any` generalizados (~55) | Médio | Manutenibilidade | Médio | ❌ |
| FRN-05 | Fallback de config silencioso + loop de `location.reload` | Médio | Disponibilidade | Baixo | ✅ |
| FRN-06 | `user-scalable=no` bloqueia zoom (WCAG) | Médio | Acessibilidade | Muito Baixo | ✅ |
| FRN-07 | Preview de PDF via `window.location.href` | Médio | Usabilidade | Médio | ❌ |
| FRN-08 | Categorias de config inconsistentes (page vs. serviço) | Médio | Manutenibilidade | Baixo | ✅ |
| FRN-09 | `target="_blank"` sem `rel="noopener noreferrer"` | Baixo | Segurança | Muito Baixo | ✅ |
| FRN-10 | Strings hardcoded em inglês (i18n) | Baixo | Manutenibilidade | Muito Baixo | ✅ |
| FRN-11 | Keys de listas por índice | Baixo | Manutenibilidade | Baixo | ✅ |
| FRN-12 | Mutação de props por referência | Baixo | Manutenibilidade | Baixo | ✅ |

---

## 3.6 Recomendações Prioritárias

1. **FRN-01** (Alto) — verificar assinatura do JWT no middleware (`jose` + `JWT_SECRET`).
2. **FRN-02** (Alto) — mover estado de upload para dentro do componente e aguardar `Promise.all` com finalização no handler.
3. **FRN-05** (Quick Win) — flag de falha na config + sincronização de idioma sem `location.reload()` forçado.
4. **FRN-03** (Quick Win) — helper `toSafeNumber` nos 11 pontos de limite (espelho do BKD-03).
5. **FRN-06/09/10/11/12** — acessibilidade e quick wins de baixo esforço.
6. **FRN-08** — unificar modelo de categorias de config (validar `handleCategoryChange`).
7. **FRN-04** — genericizar `config.get<T>()` e tipar contratos de share (Fase 7/12).

---

## 3.7 Notas de Execução

- Correções **propostas, não aplicadas** (escopo da Fase 12 — Refatoração / plano da Fase 13).
- **Referências cruzadas:** `parseInt`/`any` no frontend → espelho de BKD-02/BKD-03 (Fase 2); `File.size` String → Fase 4; CSRF/signOut/throttle → Fase 5; queries/performance → Fase 6; `any`/LOC → Fase 7; dependências (jwt-decode, jose) → Fase 8.
- **Pendências de leitura para fases seguintes:** corpo de `handleCategoryChange` (`[category].tsx:52-139`), `Header.tsx` (l.67+), `FilePreview.tsx` (l.107-372 exceto trechos citados), `account/*`, `system.service.ts`, `utils/fileSize.util.ts`.
