# Seccomp Profile

Perfil seccomp fail-closed (`defaultAction: SCMP_ACT_ERRNO`) usado por todos os
containers em produção. Pina o perfil default do Docker para garantir
reprodutibilidade independente da versão do daemon.

**Origem:** `profiles/seccomp/default.json` do repositório
[moby/moby](https://github.com/moby/moby) na tag `v28.0.1`.

**Atualização:** Renovar via Renovate/Dependabot quando o Docker publicar
atualizações do perfil. Após trocar, validar que o backend, frontend e Caddy
continuam funcionando em staging antes de publicar em produção.

**Aplicação:** `docker-compose.prod.yml`:

```yaml
security_opt:
  - no-new-privileges:true
  - seccomp=./docker/seccomp/default.json
```

*Nota:* Caminho relativo resolvido pelo Compose a partir do diretório do
arquivo de compose. Alternativa: copiar o perfil para `/etc/docker/seccomp.json`
no host e referenciar `seccomp=/etc/docker/seccomp.json`.