GUIA TÉCNICO DE HARDENING OBRIGATÓRIO
Linux + Docker — Baseline de Configuração, Isolamento e Integridade

Versão: 1.1
Classificação: Confidencial / Padrão Corporativo
Status: Especificação técnica

1. OBJETIVO

Estabelecer a linha de base técnica mínima obrigatória para hosts Linux e containers Docker, visando reduzir a superfície de ataque, limitar o impacto de comprometimento de aplicações, impedir acesso desnecessário ao host e reduzir o risco de container escape, escalonamento de privilégios, movimentação lateral e exaustão de recursos.

A aplicação dos controles deve considerar as características reais do serviço. Requisitos condicionais devem ser classificados como obrigatórios quando a arquitetura utilizar o recurso correspondente.

2. PRINCÍPIO DE SEGURANÇA

Container não é uma máquina virtual. Containers compartilham o kernel do host e, portanto, um comprometimento dentro do container pode explorar vulnerabilidades do runtime, kernel ou configurações excessivamente permissivas.

A segurança deve ser aplicada em camadas:

Host Linux
→ Kernel
→ Docker Engine / containerd / runc
→ Namespaces / cgroups / LSM / seccomp
→ Container
→ Rede
→ Aplicação
→ Dados e segredos
→ Monitoramento e resposta.

Objetivo de segurança:

Aplicação vulnerável
→ Container comprometido
→ privilégios mínimos
→ recursos isolados
→ acesso limitado a volumes/rede
→ sem acesso ao Docker daemon
→ sem acesso administrativo ao host.

3. MODELO DE AMEAÇA

3.1 Cenários considerados

A1. Aplicação Web comprometida dentro do container.
A2. Processo comprometido tentando obter privilégios adicionais.
A3. Abuso de Linux capabilities.
A4. Abuso de dispositivos ou namespaces do host.
A5. Exploração de vulnerabilidade em kernel, runc, containerd ou Docker Engine.
A6. Roubo ou exposição de segredos.
A7. Container comprometido tentando acessar outros containers.
A8. Exaustão de CPU, memória, PIDs, armazenamento ou conexões.
A9. Abuso do Docker API/socket.
A10. Uso de imagem comprometida ou dependência vulnerável.

3.2 Limitação do modelo

Hardening de container não elimina a possibilidade de container escape. O objetivo é reduzir a probabilidade e o impacto de exploração por meio de defesa em profundidade.

4. REGRAS ELIMINATÓRIAS DE PRODUÇÃO

As configurações abaixo são proibidas por padrão:

4.1 privileged: true
Motivo: remove grande parte do isolamento de privilégios do container e amplia significativamente o acesso a capabilities e dispositivos.

4.2 Montagem do Docker socket
Proibido, por exemplo:
- /var/run/docker.sock:/var/run/docker.sock
- /run/docker.sock:/run/docker.sock

Motivo: acesso ao Docker daemon pode permitir criação, alteração ou execução de containers com privilégios do host.

4.3 Montagem do filesystem raiz do host
Proibido:
- /:/app
- /:/host
- /etc do host sem necessidade formal
- /root do host sem necessidade formal.

4.4 network_mode: host
Proibido por padrão. Exceções somente mediante análise arquitetural formal.

4.5 pid: host
Proibido por padrão.

4.6 ipc: host
Proibido por padrão.

4.7 sysctls que alterem parâmetros sensíveis do host
Não permitir alterações de parâmetros do kernel do host sem validação explícita.

4.8 seccomp=unconfined
Proibido em produção, salvo exceção formalmente aprovada.

4.9 apparmor=unconfined ou desativação equivalente
Proibido em produção, salvo exceção formalmente aprovada.

4.10 Execução como UID 0
Proibida por padrão. Exceções devem ser justificadas pelo requisito técnico do software e acompanhadas de controles compensatórios.

5. HARDENING DO HOST LINUX

5.1 Atualizações

O host deve receber atualizações de segurança de:
- kernel;
- glibc;
- OpenSSL;
- Docker Engine;
- containerd;
- runc;
- bibliotecas e pacotes relevantes.

Vulnerabilidades críticas exploráveis devem ser tratadas prioritariamente e não devem permanecer sem plano de remediação aprovado.

Para atualizações de rotina, estabelecer janela operacional máxima de 7 dias, salvo impossibilidade técnica documentada.

5.2 Kernel

Manter kernel suportado pelo sistema operacional.
Ativar mecanismos de proteção fornecidos pela distribuição.
Remover ou desabilitar serviços não utilizados.
Avaliar módulos de kernel desnecessários conforme o perfil do host.

Após atualização que exija reinicialização, validar:
test -f /var/run/reboot-required

5.3 Firewall

Aplicar política de menor exposição.

Portas públicas devem ser explicitamente autorizadas.

Cenário padrão:
22/tcp → somente redes administrativas.
80/tcp → somente se HTTP público/redirecionamento for necessário.
443/tcp → HTTPS público.

Portas de banco de dados e infraestrutura interna não devem ser publicadas na Internet:
3306, 5432, 6379, 2375, 2376 e equivalentes.

A configuração de firewall deve considerar também as regras criadas pelo Docker para publicação de portas.

5.4 SSH

Configuração mínima recomendada:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

Quando suportado e validado:
PermitEmptyPasswords no
MaxAuthTries restritivo
AllowUsers/AllowGroups para limitar administradores.

Antes de desabilitar autenticação por senha, validar que pelo menos uma chave administrativa funcional está disponível.

5.5 Grupo docker

Membros do grupo docker devem ser considerados equivalentes a administradores do Docker e, na prática, com capacidade de obter privilégios elevados no host.

Não adicionar usuários comuns ao grupo docker.

5.6 LSM

Manter ativo:
- AppArmor em Debian/Ubuntu quando disponível;
- SELinux em distribuições que o utilizem.

Não desabilitar LSM para contornar problemas de aplicação. Ajustar perfis e políticas.

6. DOCKER ENGINE E RUNTIME

6.1 Versões

Manter Docker Engine, containerd e runc em versões suportadas e sem vulnerabilidades críticas conhecidas.

A atualização deve considerar compatibilidade entre Engine, containerd, runc, kernel e aplicação.

6.2 User namespaces

Quando compatível com a aplicação, avaliar e preferir user namespace remapping:
"userns-remap": "default"

O user namespace reduz o impacto de UID 0 dentro do container ao mapear identidades para UIDs não privilegiados no host.

O uso não é obrigatório quando a arquitetura utiliza Docker Rootless, ou quando incompatibilidades documentadas impedirem seu uso. Nesses casos, devem existir controles compensatórios.

6.3 Rootless Docker

Quando operacionalmente compatível, avaliar Docker Rootless como camada adicional de redução de privilégios do daemon.

6.4 Seccomp

Manter seccomp habilitado.
Utilizar o perfil padrão do Docker ou perfil customizado restritivo validado.

Não utilizar:
seccomp=unconfined

6.5 AppArmor/SELinux

Manter o mecanismo de Mandatory Access Control ativo e aplicar perfis adequados ao workload.

6.6 Logs do daemon

Configurar driver de logs com rotação e retenção definidos.

Exemplo:
"log-driver": "json-file"
"log-opts": {
  "max-size": "10m",
  "max-file": "5"
}

Não registrar senhas, tokens, cookies ou outros segredos.

Alternativas como journald/syslog podem ser utilizadas quando integradas à política central de logs.

6.7 Docker API

Não expor o Docker daemon em TCP sem proteção.

Proibido:
-H tcp://0.0.0.0:2375

Se acesso remoto ao daemon for indispensável, utilizar autenticação e criptografia TLS adequadas e restringir origem por firewall/ACL.

6.8 Live Restore

"live-restore": true pode ser utilizado para melhorar disponibilidade durante reinicialização do daemon.

Live Restore é requisito de disponibilidade, não mecanismo primário de hardening.

7. HARDENING DO CONTAINER

7.1 Usuário

O processo deve executar como usuário não-root.

Dockerfile:
USER app

Compose:
user: "1000:1000"

O UID/GID real deve corresponder ao usuário criado na imagem ou ao modelo de permissões utilizado pelos volumes.

Não fixar UID 1000 automaticamente quando isso gerar incompatibilidade ou conflito; usar UID não-root conhecido e validado.

7.2 Filesystem somente leitura

Quando compatível:
read_only: true

Diretórios temporários devem utilizar tmpfs quando possível.

Exemplo:
tmpfs:
  - /tmp

Se a aplicação precisar persistir dados, montar somente o diretório necessário.

7.3 Volumes

Princípio:
mínimo privilégio + menor escopo + modo correto.

Preferir:
volume:ro

quando o container não precisa escrever.

Evitar:
- montagem de /
- /etc do host
- /root do host
- /proc do host
- /sys do host
- dispositivos do host sem necessidade explícita.

7.4 Build context

Utilizar .dockerignore.

Excluir, conforme o projeto:
.env
.env.*
.git
.git/*
*.pem
*.key
*.p12
*.pfx
credenciais e arquivos temporários.

Segredos não devem ser enviados para o contexto de build.

8. LINUX CAPABILITIES

8.1 Política padrão

Remover capabilities desnecessárias:

cap_drop:
  - ALL

Adicionar somente capabilities comprovadamente necessárias.

8.2 NET_BIND_SERVICE

NET_BIND_SERVICE somente deve ser adicionada quando o processo realmente precisar abrir portas privilegiadas (<1024).

Quando a aplicação escuta, por exemplo, 3000, 8080 ou 8443 e um proxy reverso faz o bind em 80/443, essa capability normalmente não é necessária.

8.3 Capabilities de alto risco

Não adicionar sem justificativa formal:
SYS_ADMIN
SYS_PTRACE
SYS_MODULE
NET_ADMIN
DAC_OVERRIDE
DAC_READ_SEARCH
SYS_RAWIO
SYS_CHROOT

9. NO NEW PRIVILEGES

Obrigatório:
security_opt:
  - no-new-privileges:true

O objetivo é impedir que processos obtenham privilégios adicionais por mecanismos como setuid/setgid e file capabilities.

10. NAMESPACES E REDE

10.1 Não utilizar PID namespace do host.

10.2 Não utilizar IPC namespace do host.

10.3 Preferir redes bridge definidas pelo usuário.

10.4 Para camadas internas, utilizar redes internal quando compatível:

networks:
  backend:
    internal: true

10.5 Não publicar portas de serviços internos sem necessidade.

10.6 Comunicação entre serviços deve utilizar nomes DNS internos da rede Docker, não IPs fixos de containers.

10.7 Publicar somente portas necessárias no host.

11. LIMITES DE RECURSOS

Todos os serviços devem possuir limites adequados de:
- CPU;
- memória;
- PIDs;
- armazenamento, quando suportado pela arquitetura;
- conexões e filas no nível da aplicação quando necessário.

Exemplo para Compose:
services:
  app:
    mem_limit: 2g
    cpus: "2.0"
    pids_limit: 512

Para ambientes onde deploy.resources.limits é efetivamente aplicado, pode-se utilizar:

deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 2048M
    reservations:
      cpus: "0.5"
      memory: 512M

Não assumir que deploy.resources.limits será aplicado pelo Docker Compose em todos os modos. Validar o modo de execução.

Os limites devem ser dimensionados por serviço; valores genéricos não devem ser aplicados sem teste.

12. ARMAZENAMENTO E LOGS

12.1 Evitar crescimento ilimitado de logs.

12.2 Definir rotação e retenção.

12.3 Monitorar espaço livre do host.

12.4 Não armazenar segredos em logs.

12.5 Dados persistentes devem estar em volumes ou bind mounts explicitamente definidos.

12.6 Backups dos volumes críticos devem ser independentes do container.

13. IMAGENS E SUPPLY CHAIN

13.1 Não utilizar latest em produção.

13.2 Preferir versões fixadas e, quando necessário para reprodutibilidade máxima, digest:

image: exemplo/app:1.2.3
ou
image: exemplo/app@sha256:<digest>

13.3 Utilizar imagens oficiais ou de origem confiável.

13.4 Preferir imagens mínimas e manter somente componentes necessários.

13.5 Remover ferramentas de desenvolvimento, shells adicionais e pacotes desnecessários quando não forem requeridos pelo runtime.

13.6 Executar scanners de vulnerabilidade no CI/CD.

Ferramentas possíveis:
Trivy
Grype
Docker Scout

13.7 Vulnerabilidades críticas exploráveis devem bloquear promoção para produção, salvo exceção formal documentada com avaliação de risco e controle compensatório.

13.8 Scanner de imagem não substitui atualização de dependências nem análise de configuração.

14. SEGREDOS

14.1 Nunca colocar credenciais diretamente no Dockerfile.

Proibido:
ENV API_KEY=valor-real

14.2 Não copiar arquivos de segredo para a imagem.

14.3 Utilizar mecanismos adequados:
Docker Secrets
BuildKit secrets
secret manager externo
arquivo protegido fora do repositório, quando compatível com o ambiente.

14.4 Segredos de runtime não devem aparecer em:
- docker history;
- logs;
- mensagens de erro;
- dumps;
- repositório Git;
- arquivos públicos.

14.5 Rotacionar credenciais quando houver suspeita de exposição.

15. DOCKERFILE

O Dockerfile deve:
- utilizar imagem base suportada;
- fixar versão da imagem;
- executar como non-root;
- possuir .dockerignore;
- evitar instalação de pacotes desnecessários;
- evitar segredos;
- minimizar número e superfície dos componentes;
- utilizar multi-stage build quando aplicável.

16. COMPOSE

O Compose de produção deve, quando compatível, aplicar:

security_opt:
  - no-new-privileges:true

cap_drop:
  - ALL

read_only: true

pids_limit: 512

user: "UID:GID"

Volumes com :ro quando aplicável.

Não utilizar:
privileged: true
network_mode: host
pid: host
ipc: host

Não montar Docker socket.

17. MONITORAMENTO E DETECÇÃO

17.1 Host

Monitorar:
journalctl -u docker
journalctl -u containerd
journalctl -k
logs de autenticação SSH
firewall
uso de CPU/memória/disco
reinicializações
falhas de serviços.

17.2 Docker events

Monitorar eventos como:
create
start
stop
die
exec
kill
oom
destroy

Dar atenção especial a:
- docker exec inesperado;
- criação de containers fora do processo de deploy;
- alteração de imagens;
- publicação inesperada de portas;
- containers privilegiados;
- montagem de novos volumes;
- alterações no runtime.

17.3 Auditoria

Executar auditorias periódicas utilizando ferramentas como:
Docker Bench Security
Lynis

O resultado deve ser tratado como evidência de conformidade, não como substituto de análise técnica.

18. SEGURANÇA DO HOST E DOS DADOS

18.1 Docker não deve ser a única barreira de segurança.

18.2 Banco de dados deve ficar em rede interna quando possível.

18.3 Serviços administrativos devem ficar restritos a redes administrativas.

18.4 Backups devem possuir controle de acesso independente.

18.5 O host não deve armazenar credenciais em texto puro em diretórios acessíveis por usuários não autorizados.

19. CRITÉRIOS GO / NO-GO

A implantação deve ser bloqueada quando houver, sem exceção formal aprovada:

- privileged: true;
- Docker socket montado;
- montagem desnecessária do filesystem do host;
- network_mode: host;
- pid: host;
- ipc: host;
- seccomp=unconfined;
- LSM desabilitado sem justificativa;
- credenciais incorporadas à imagem;
- daemon Docker exposto publicamente;
- container executando como root sem justificativa;
- ausência de limites de recursos em serviços sujeitos a risco de DoS;
- imagem com vulnerabilidade crítica explorável sem plano de tratamento;
- portas internas publicadas sem necessidade.

20. EXCEÇÕES

Exceções devem ser documentadas antes da implantação contendo:

- componente;
- configuração excepcional;
- justificativa técnica;
- risco introduzido;
- impacto;
- controles compensatórios;
- responsável pela aprovação;
- prazo de validade;
- plano de remoção da exceção.

Exceções não devem ser permanentes por padrão.

21. PLANO DE IMPLANTAÇÃO

21.1 Inventário

Mapear:
- containers;
- imagens;
- portas;
- volumes;
- capabilities;
- usuários;
- networks;
- secrets;
- dependências;
- dispositivos;
- limites de recursos.

21.2 Atualização

Aplicar patches do host e runtime.

21.3 Redução de privilégios

Aplicar:
- non-root;
- cap_drop ALL;
- no-new-privileges;
- remoção de privileged;
- seccomp;
- AppArmor/SELinux.

21.4 Isolamento

Aplicar:
- read_only;
- tmpfs;
- volumes mínimos;
- redes internas;
- remoção de portas desnecessárias.

21.5 Limites

Aplicar CPU, memória e PIDs conforme dimensionamento.

21.6 Supply Chain

Executar scanner das imagens e validar digest/versão.

21.7 Validação

Executar testes funcionais e de segurança em staging.

21.8 Produção

Promover somente após validação e registro de conformidade.

22. TESTES DE SEGURANÇA

22.1 Verificar identidade:

docker inspect <container>
ps/processos
Verificar que o processo não executa como UID 0.

22.2 Verificar capabilities:

docker inspect <container>
capsh --print, quando disponível.

Esperado:
somente capabilities necessárias.

22.3 Verificar privileged:

docker inspect <container>
Esperado:
Privileged=false.

22.4 Verificar mounts:

docker inspect <container>
Esperado:
somente volumes necessários.

22.5 Verificar namespaces:
não deve haver pid/IPC/network do host.

22.6 Verificar seccomp:
não utilizar unconfined.

22.7 Verificar no-new-privileges:
confirmar SecurityOpt.

22.8 Verificar limites:
memória, CPU e PIDs efetivamente aplicados no modo de execução utilizado.

22.9 Verificar exposição:
ss -lntup
docker ps
docker inspect

Confirmar que somente portas necessárias estão publicadas.

22.10 Verificar imagens:
scanner de vulnerabilidade + digest/versão.

23. CHECKLIST DE CONFORMIDADE

Host:
[ ] Sistema atualizado
[ ] Kernel suportado
[ ] Docker Engine atualizado
[ ] containerd atualizado
[ ] runc atualizado
[ ] Firewall ativo
[ ] SSH por chave
[ ] Root SSH desabilitado
[ ] PasswordAuthentication desabilitado
[ ] LSM ativo
[ ] Serviços desnecessários desabilitados

Docker:
[ ] privileged=false
[ ] Docker socket não montado
[ ] network_mode host ausente
[ ] pid host ausente
[ ] ipc host ausente
[ ] seccomp ativo
[ ] AppArmor/SELinux ativo
[ ] daemon sem exposição pública
[ ] logs com rotação
[ ] user namespaces avaliados
[ ] rootless avaliado quando aplicável

Container:
[ ] non-root
[ ] cap_drop ALL
[ ] capabilities mínimas
[ ] no-new-privileges
[ ] read_only quando compatível
[ ] tmpfs quando necessário
[ ] volumes mínimos
[ ] volumes read-only quando possível
[ ] limites de recursos
[ ] pids_limit
[ ] portas mínimas

Supply Chain:
[ ] imagem fixada
[ ] digest considerado
[ ] scanner executado
[ ] sem CVE crítica explorável
[ ] Dockerfile revisado
[ ] .dockerignore
[ ] sem secrets no build context
[ ] sem secrets na imagem

Observabilidade:
[ ] logs do Docker monitorados
[ ] logs do host monitorados
[ ] docker events monitorado
[ ] auditoria periódica
[ ] espaço em disco monitorado
[ ] alertas para eventos anômalos

24. REFERÊNCIAS

Docker Documentation — Security.
Docker Documentation — Daemon attack surface.
Docker Documentation — Rootless mode.
Docker Documentation — User namespaces.
Docker Documentation — Seccomp.
Docker Documentation — AppArmor.
OWASP — Docker Security Cheat Sheet.
CIS Docker Benchmark.
Docker Bench Security.
Lynis.
Trivy.
Grype.
Hadolint.

25. PRINCÍPIOS FINAIS

25.1 O container deve receber somente os privilégios necessários para executar sua função.

25.2 O host deve permanecer isolado de credenciais, volumes e interfaces desnecessárias.

25.3 Nenhum controle individual deve ser tratado como proteção absoluta contra container escape.

25.4 O nível de segurança deve ser validado pela configuração efetivamente executada, e não somente pelo Dockerfile ou docker-compose.yml.

25.5 Toda exceção deve possuir justificativa, aprovação, controles compensatórios e prazo de revisão.

25.6 Segurança de container é defesa em profundidade: menor privilégio + isolamento + controle de recursos + segurança do runtime + segurança do host + supply chain + monitoramento.
