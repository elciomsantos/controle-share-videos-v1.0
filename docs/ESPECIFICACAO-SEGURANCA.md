ESPECIFICAÇÃO DE SEGURANÇA — SESSÕES, AUTENTICAÇÃO E TOKENS
Versão 1.2
Data: 17/08/2026
Status: Especificação técnica
Escopo: Aplicações web com usuários autenticados, controle de acesso por sessão e compartilhamento controlado de vídeos/arquivos.

1. OBJETIVO
Estabelecer requisitos técnicos para autenticação, gerenciamento de sessões, tokens, autorização, compartilhamento de recursos, revogação, auditoria e proteção contra abuso.

2. PRINCÍPIOS
2.1 A identidade efetiva deve ser derivada exclusivamente de uma sessão válida criada pelo servidor.
2.2 O cliente nunca define a identidade autenticada, permissões ou propriedade de recursos.
2.3 Tokens de sessão e compartilhamento são identificadores opacos, imprevisíveis e sem dados de negócio.
2.4 Autenticação e autorização são controles distintos.
2.5 Toda autorização de recurso deve ser realizada no servidor.
2.6 A aplicação deve utilizar mecanismos criptográficos e bibliotecas maduras, evitando criptografia própria.
2.7 Falhas de autenticação e autorização devem falhar de forma segura.

3. MODELO DE IDENTIDADE E AUTORIZAÇÃO
Fluxo obrigatório:
token -> sessão -> user_id -> permissões -> recurso.
O user_id associado à sessão é obtido exclusivamente do registro server-side.
O envio de user_id pelo cliente não deve alterar a identidade autenticada.
Essa regra impede a manipulação direta da identidade da sessão, mas não elimina falhas de autorização sobre objetos. Cada recurso deve possuir verificação própria de propriedade, escopo ou permissão.
Qualquer endpoint que aceite um identificador de recurso deve validar se a sessão autenticada possui autorização para aquele recurso.

4. TRANSPORTE
4.1 Produção deve operar exclusivamente sobre HTTPS.
4.2 HTTP deve ser redirecionado ou bloqueado.
4.3 HSTS deve ser habilitado quando o domínio e a infraestrutura permitirem operação permanente em HTTPS.
4.4 Tokens não devem aparecer em URL, query string, fragmento, HTML, Referer ou logs.
4.5 A comunicação entre proxy e aplicação deve ser protegida quando atravessar rede não confiável.
4.6 A conexão aplicação-banco deve utilizar TLS quando houver tráfego por rede não confiável ou infraestrutura separada.

5. GERAÇÃO DE TOKENS
5.1 Tokens devem ser gerados exclusivamente por CSPRNG.
5.2 A sessão deve possuir no mínimo 128 bits de entropia; esta especificação adota 256 bits.
5.3 Implementação PHP recomendada:
$token = bin2hex(random_bytes(32));
5.4 São proibidos timestamp, user_id, username, rand(), mt_rand(), MD5, SHA-1, hashes de dados previsíveis e combinações previsíveis como timestamp+user_id.
5.5 SHA-256 pode ser utilizado para armazenar o hash de um token já aleatório; não é fonte de aleatoriedade.

6. TOKEN OPACO
6.1 O token não deve conter user_id, função, permissões, e-mail ou dados de negócio.
6.2 A associação token/usuário deve existir somente no servidor.
6.3 O token real não deve ser armazenado em banco, logs ou interfaces administrativas.

7. ARMAZENAMENTO DA SESSÃO
Tabela sessions recomendada:
CREATE TABLE sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    last_activity_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(512) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_token_hash (token_hash),
    KEY idx_sessions_user_id (user_id),
    KEY idx_sessions_expires_at (expires_at),
    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);
7.1 Armazenar somente SHA-256(token) em token_hash.
7.2 token_hash deve possuir índice UNIQUE.
7.3 O token deve ser tratado como entrada não confiável antes de consulta.
7.4 Queries devem ser parametrizadas.

8. COOKIE
Configuração recomendada:
Set-Cookie: __Host-SID=<TOKEN>; Path=/; Secure; HttpOnly; SameSite=Strict
8.1 Secure obrigatório em produção.
8.2 HttpOnly obrigatório.
8.3 SameSite obrigatório; Lax pode ser utilizado quando Strict for incompatível com o fluxo.
8.4 Path=/.
8.5 Não definir Domain com prefixo __Host-.
8.6 Não armazenar credenciais de sessão em localStorage, sessionStorage, IndexedDB, URL, query string ou fragmento.

9. CRIAÇÃO E REGENERAÇÃO DA SESSÃO
Fluxo:
POST /login
-> validar entrada
-> localizar usuário
-> verificar senha
-> aplicar controles de autenticação
-> gerar token CSPRNG
-> calcular SHA-256
-> criar sessão
-> enviar cookie protegido.
9.1 Após autenticação deve existir uma nova sessão autenticada.
9.2 Sessões anônimas não devem ser convertidas de forma insegura em sessões autenticadas.
9.3 Quando o mecanismo nativo PHP for usado, aplicar session_regenerate_id(true).
9.4 Em mecanismo próprio, gerar novo token e invalidar o identificador anterior quando aplicável.

10. VALIDAÇÃO DE REQUISIÇÕES
Para cada requisição autenticada:
Cookie -> extrair token -> validar formato -> SHA-256 -> localizar sessão -> verificar revogação -> verificar expiração -> obter user_id -> verificar usuário ativo -> verificar autorização -> executar.
10.1 Ausência ou invalidez de autenticação deve resultar em HTTP 401.
10.2 Falha de autorização deve resultar em HTTP 403 quando a autenticação é válida.
10.3 Não confiar em user_id, role, permissões ou propriedade enviados pelo cliente.
10.4 last_activity_at não deve ser atualizado em toda requisição. Utilizar atualização condicional, por exemplo:
UPDATE sessions
SET last_activity_at = NOW()
WHERE id = ?
  AND last_activity_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE);

11. EXPIRAÇÃO
11.1 A sessão deve possuir expiração absoluta.
11.2 Deve possuir timeout por inatividade.
11.3 Deve permitir revogação manual.
11.4 Política inicial recomendada: 30 minutos de inatividade e 8 horas de duração absoluta, ajustável ao risco.
11.5 Sistemas de alto risco devem utilizar tempos menores.

12. LOGOUT E REVOGAÇÃO
Logout deve revogar a sessão no servidor e limpar o cookie.
UPDATE sessions
SET revoked_at = NOW()
WHERE id = ?;
Eventos que devem permitir revogação:
logout; troca de senha; alteração de credenciais; desativação do usuário; suspeita de comprometimento; encerramento administrativo; alteração crítica de privilégios.
Deve ser possível revogar a sessão atual e todas as sessões do usuário.

13. MÚLTIPLAS SESSÕES
13.1 Política padrão: múltiplas sessões ativas são permitidas.
13.2 Sistemas críticos podem revogar sessões anteriores no novo login:
UPDATE sessions
SET revoked_at = NOW()
WHERE user_id = ?
  AND id != ?;
13.3 A política deve ser definida explicitamente e aplicada de forma consistente.

14. AUTENTICAÇÃO E SENHAS
14.1 Senhas nunca devem ser armazenadas em texto puro.
14.2 Utilizar Argon2id ou mecanismo moderno equivalente suportado pelo framework.
14.3 Senhas somente devem trafegar por TLS.
14.4 Mensagens de falha de login devem ser genéricas.
14.5 Login deve possuir proteção contra automação, brute force e credential stuffing.
14.6 Contas administrativas devem utilizar MFA.

15. MFA E REAUTENTICAÇÃO
15.1 MFA deve ser exigido para administradores e operações críticas.
15.2 Métodos preferenciais: WebAuthn/passkeys ou TOTP, conforme arquitetura.
15.3 Recovery codes devem ser de uso único e protegidos.
15.4 Operações críticas devem exigir autenticação recente.
Exemplos: alteração de senha, alteração de e-mail, alteração de permissões, desativação de conta, revogação administrativa e operações sensíveis sobre compartilhamentos.

16. RECUPERAÇÃO DE SENHA
16.1 Endpoint de recuperação deve responder de forma genérica, sem revelar existência da conta.
16.2 Token de recuperação deve ser aleatório, armazenado somente como hash, possuir expiração curta e uso único.
16.3 Deve haver rate limiting.
16.4 Após alteração de senha, sessões existentes devem ser revogadas conforme política.
16.5 Eventos de recuperação devem ser registrados em auditoria.

17. CSRF
17.1 Operações autenticadas por cookie que alterem estado devem possuir proteção CSRF.
17.2 Aplicar especialmente a POST, PUT, PATCH e DELETE.
17.3 SameSite não deve ser tratado como substituto universal de CSRF.
17.4 Utilizar token CSRF sincronizado ou mecanismo equivalente do framework.

18. XSS E CONTENT SECURITY POLICY
18.1 Aplicar escaping de saída.
18.2 Validar entradas.
18.3 Evitar innerHTML e execução dinâmica quando desnecessários.
18.4 Utilizar Content Security Policy adequada à aplicação.
18.5 O cookie HttpOnly impede leitura direta do token por JavaScript, mas não impede XSS de executar ações autenticadas.

19. SECURITY HEADERS
Devem ser definidos conforme a aplicação:
Strict-Transport-Security
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
frame-ancestors 'none' na CSP quando a aplicação não precisar ser incorporada por terceiros.
Não utilizar unsafe-inline/unsafe-eval sem justificativa técnica.

20. CORS
20.1 Não utilizar Access-Control-Allow-Origin: * em endpoints autenticados.
20.2 Origens permitidas devem ser explicitamente configuradas.
20.3 Credenciais via cookie somente devem ser aceitas para origens confiáveis.
20.4 Preflight e métodos permitidos devem ser restritos ao necessário.

21. CACHE
21.1 Respostas contendo tokens, credenciais ou informações de autenticação devem utilizar:
Cache-Control: no-store
21.2 Recursos autenticados devem possuir política de cache explicitamente definida.
21.3 Não permitir cache implícito de informações sensíveis em navegador, proxy ou CDN.

22. RATE LIMITING
22.1 Login deve possuir limites por IP, identificador de conta e janela de tempo.
22.2 Endpoints de recuperação de senha devem possuir limites.
22.3 Endpoints de compartilhamento devem possuir limites por IP e, quando aplicável, por token.
22.4 Endpoints administrativos devem possuir limites mais restritivos.
22.5 Em ambiente distribuído, rate limiting não deve depender somente de memória local.

23. TOKENS DE COMPARTILHAMENTO
Shares são independentes das sessões.
Tabela recomendada:
CREATE TABLE shares (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_by_user_id BIGINT UNSIGNED NOT NULL,
    video_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NULL,
    max_views INT UNSIGNED NULL,
    views INT UNSIGNED NOT NULL DEFAULT 0,
    max_downloads INT UNSIGNED NULL,
    downloads INT UNSIGNED NOT NULL DEFAULT 0,
    password_hash VARCHAR(255) NULL,
    created_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_shares_token_hash (token_hash),
    KEY idx_shares_created_by (created_by_user_id),
    KEY idx_shares_video (video_id)
);
23.1 Nunca reutilizar token de sessão como share token.
23.2 Share tokens devem possuir 256 bits de entropia.
23.3 Limites de views/downloads devem ser atualizados atomicamente.
23.4 Token expirado ou revogado deve ser rejeitado.
23.5 O endpoint de share deve possuir rate limiting.

24. PROTEÇÃO DE ARQUIVOS E VÍDEOS
24.1 Identificador do vídeo nunca deve conceder acesso por si só.
24.2 O servidor deve validar autorização antes de abrir o arquivo.
24.3 Caminho físico do arquivo nunca deve ser controlado diretamente pelo cliente.
24.4 Bloquear path traversal e caminhos absolutos fornecidos pelo cliente.
24.5 Downloads e streaming devem aplicar a mesma autorização.
24.6 Requisições HTTP Range/206 Partial Content não podem contornar autorização.
24.7 Arquivos devem permanecer fora de diretórios diretamente públicos quando a aplicação precisar controlar acesso.

25. CONCORRÊNCIA
25.1 Operações sobre views/downloads devem ser atômicas ou transacionais.
Exemplo:
UPDATE shares
SET views = views + 1
WHERE id = ?
  AND revoked_at IS NULL
  AND (max_views IS NULL OR views < max_views);
25.2 A aplicação deve verificar o número de linhas afetadas.
25.3 Atualizações de sessão devem tolerar requisições simultâneas sem corrupção de estado.

26. REFRESH TOKENS
26.1 Refresh Token somente deve ser implementado quando houver necessidade real de sessões longas.
26.2 A sessão principal deve permanecer curta e revogável.
26.3 Refresh Tokens devem ser armazenados de forma protegida, preferencialmente somente como hash.
26.4 Cada utilização válida deve emitir um novo Refresh Token.
26.5 O Refresh Token anterior deve ser invalidado após rotação.
26.6 Deve ser mantida a relação de família entre tokens para detecção de reutilização.
26.7 Reutilização de token já invalidado deve ser tratada como possível comprometimento.
26.8 Ao detectar reuse, a família de refresh tokens deve ser revogada conforme política.
26.9 O evento deve ser registrado em auditoria e pode exigir nova autenticação.
26.10 Refresh Tokens não devem aparecer em URL, logs ou respostas de erro.

27. SESSION FIXATION
27.1 O servidor não deve aceitar identificador arbitrário do cliente e convertê-lo em sessão válida.
27.2 Somente IDs previamente gerados pelo servidor podem representar sessões válidas.
27.3 Após autenticação deve haver regeneração/rotação.

28. IP, USER-AGENT E PROXY
28.1 IP e User-Agent podem ser usados para auditoria e detecção de anomalias.
28.2 IP não é segredo e não substitui o token.
28.3 Mudança de IP não deve invalidar automaticamente uma sessão sem política de risco.
28.4 user_agent deve ser truncado para o limite da coluna antes da persistência.
28.5 A aplicação somente deve confiar em X-Forwarded-For, X-Real-IP ou Forwarded quando a requisição vier de proxy explicitamente confiável.
28.6 Headers de proxy recebidos de clientes não confiáveis não devem ser utilizados como fonte de IP confiável.

29. LOGS E AUDITORIA
29.1 Nunca registrar senha, token, cookie, refresh token ou código MFA.
29.2 Access logs do Nginx/Apache não devem registrar Cookie completo.
29.3 Eventos devem conter, quando aplicável:
timestamp UTC; event_type; user_id; session_id interno; request_id; IP; User-Agent; recurso; resultado.
29.4 Eventos mínimos:
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
SESSION_CREATED
SESSION_REVOKED
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
MFA_ENABLED
MFA_DISABLED
MFA_FAILED
PERMISSION_CHANGED
ROLE_CHANGED
SHARE_CREATED
SHARE_REVOKED
SHARE_ACCESS
SHARE_DOWNLOAD
REFRESH_TOKEN_REUSE_DETECTED
ADMIN_SESSION_REVOKED

30. REQUEST ID
30.1 Cada requisição deve possuir identificador de correlação.
30.2 O request_id deve ser propagado entre proxy, aplicação e logs.
30.3 Não utilizar request_id como credencial.

31. BANCO DE DADOS
31.1 Banco não deve ser exposto diretamente à Internet.
31.2 Aplicação deve possuir credencial exclusiva.
31.3 Princípio do menor privilégio.
31.4 Queries parametrizadas.
31.5 Índices adequados para token_hash, user_id e expiração.
31.6 Conexão TLS quando aplicável.
31.7 Rotina de limpeza de sessões expiradas/revogadas.
31.8 DELETE e UPDATE administrativos devem sempre possuir condições explícitas e validadas.
Exemplo de limpeza:
DELETE FROM sessions
WHERE expires_at < NOW()
   OR (revoked_at IS NOT NULL
       AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY));

32. GESTÃO DE SEGREDOS
32.1 Segredos não devem ser armazenados no código-fonte ou Git.
32.2 Não registrar segredos em logs.
32.3 .env e arquivos equivalentes contendo credenciais devem permanecer fora do controle de versão.
32.4 Utilizar mecanismo de secrets adequado ao ambiente, como Docker Secrets, secret manager ou armazenamento protegido.
32.5 Chaves criptográficas devem possuir ciclo de vida e rotação definidos.

33. BACKUP E RECUPERAÇÃO
33.1 Backups devem ser protegidos contra acesso não autorizado.
33.2 Backups sensíveis devem ser criptografados.
33.3 Deve existir política de retenção.
33.4 Restaurações devem ser testadas periodicamente.
33.5 Backup deve ser armazenado de forma independente do servidor principal.

34. ADMINISTRAÇÃO
Administradores devem poder visualizar:
sessões ativas; criação; último acesso; IP; User-Agent; estado; revogação.
34.1 Nunca mostrar token completo.
34.2 Acesso administrativo deve utilizar MFA.
34.3 Operações administrativas críticas devem ser auditadas.
34.4 Impersonação, se existir, deve possuir autorização explícita e auditoria.

35. TESTES DE SEGURANÇA
A implementação deve possuir testes automatizados e/ou manuais para:
35.1 alteração de user_id no request -> acesso negado;
35.2 token alterado -> 401;
35.3 token expirado -> 401;
35.4 token revogado -> 401;
35.5 token reutilizado após logout -> 401;
35.6 acesso a recurso de outro usuário -> 403;
35.7 path traversal -> bloqueado;
35.8 arquivo direto sem autorização -> bloqueado;
35.9 share expirado -> bloqueado;
35.10 share revogado -> bloqueado;
35.11 excesso de tentativas -> rate limited;
35.12 Cookie ausente nos access logs;
35.13 Refresh Token reutilizado -> família revogada conforme política;
35.14 tentativa de alteração de permissões sem autorização -> bloqueada;
35.15 CORS não autorizado -> bloqueado.

36. LIMPEZA E RETENÇÃO
Sessões expiradas/revogadas devem ser removidas conforme política de retenção.
Logs de auditoria devem possuir retenção definida e proteção contra alteração.
Dados de auditoria devem ser minimizados conforme necessidade operacional e requisitos legais aplicáveis.

37. CHECKLIST
- HTTPS obrigatório
- HSTS configurado quando aplicável
- CSPRNG
- 256 bits de entropia
- Token opaco
- Token sem user_id
- Token fora de URL
- Token armazenado somente como hash
- token_hash UNIQUE
- Cookie HttpOnly
- Cookie Secure
- SameSite
- __Host-
- Sem localStorage para credenciais
- Regeneração após login
- Timeout por inatividade
- Expiração absoluta
- Logout revoga servidor
- Revogação global
- Múltiplas sessões definidas
- Argon2id
- MFA
- Recovery codes
- Reautenticação crítica
- Password reset seguro
- CSRF
- XSS
- CSP
- Security Headers
- CORS restritivo
- Cache-Control no-store para dados sensíveis
- Rate limiting
- Trusted proxy
- User-Agent truncado
- Access logs sem Cookie
- Auditoria
- Request ID
- Shares separados
- Autorização por recurso
- Proteção contra path traversal
- Range requests autorizados
- Refresh Token Rotation
- Refresh Token Reuse Detection
- Banco não exposto
- Menor privilégio
- TLS banco quando aplicável
- Secrets fora do Git
- Backup protegido
- Testes de segurança

38. FLUXO ARQUITETURAL
Navegador
  |
  | HTTPS
  v
Proxy reverso
  |
  v
Aplicação
  |
  +--> autenticação
  |
  +--> sessão
  |      |
  |      +--> token_hash
  |      +--> user_id
  |      +--> expiração
  |      +--> revogação
  |
  +--> autorização
  |      |
  |      +--> usuário
  |      +--> permissão
  |      +--> recurso
  |
  +--> auditoria
  |
  v
Banco de dados

39. REFERÊNCIAS
IETF RFC 9700 — BCP 240: Best Current Practice for OAuth 2.0 Security.
OWASP Session Management Cheat Sheet.
OWASP Authentication Cheat Sheet.
OWASP Web Security Testing Guide.
OWASP ASVS.
OWASP Rate Limiting Cheat Sheet.

40. DECISÃO ARQUITETURAL
Para aplicação web tradicional acessada por navegador, a arquitetura padrão é:
Cookie HttpOnly + Secure + SameSite
+
token aleatório de 256 bits
+
SHA-256(token) no banco
+
user_id na sessão server-side
+
expiração por inatividade e absoluta
+
revogação server-side
+
CSRF protection
+
autorização por recurso no servidor
+
Cache-Control: no-store para dados sensíveis
+
auditoria.
JWT não é necessário para este cenário quando a aplicação possui backend e banco próprios. Sessão server-side fornece revogação e controle centralizados.

41. PRINCÍPIO FINAL
O token identifica uma sessão.
A sessão identifica o usuário.
A autorização determina o que o usuário pode acessar.
O recurso nunca deve ser autorizado somente pela posse de um identificador.
Nenhum dado enviado pelo navegador deve substituir a autoridade server-side.
