# rodar testes local


docker compose --env-file .env.local -f docker-compose.local.yml up --build


````markdown

## Objetivo

Este manual reúne os principais comandos para administrar, limpar e recuperar espaço utilizado pelo Docker.

> **Atenção:** Muitos comandos removem dados permanentemente. Certifique-se de que não há contêineres, imagens ou volumes importantes antes de executá-los.

---

# 1. Verificar os recursos existentes

## Listar contêineres

### Linux

```bash
docker ps -a
```

**Descrição**

Lista todos os contêineres (em execução e parados).

---

## Listar imagens

### Linux

```bash
docker images
```

ou

```bash
docker image ls
```

**Descrição**

Mostra todas as imagens armazenadas localmente.

---

## Listar volumes

### Linux

```bash
docker volume ls
```

**Descrição**

Exibe todos os volumes persistentes.

---

## Listar redes

### Linux

```bash
docker network ls
```

**Descrição**

Mostra todas as redes Docker.

---

## Ver uso de espaço

### Linux

```bash
docker system df
```

**Descrição**

Exibe o espaço utilizado por:

- Imagens
- Contêineres
- Volumes
- Cache de Build

---

# 2. Parar todos os contêineres

## Linux

```bash
docker stop $(docker ps -aq)
```

---

# 3. Remover todos os contêineres

## Linux

```bash
docker rm $(docker ps -aq)
```

### Forçando a remoção

```bash
docker rm -f $(docker ps -aq)
```
---

# 4. Remover todas as imagens

## Linux

```bash
docker rmi -f $(docker images -aq)

---

# 5. Remover todos os volumes

## Linux

```bash
docker volume rm $(docker volume ls -q)
```

> **Atenção:** Todos os dados persistentes serão apagados.

---

# 6. Remover redes não utilizadas

## Linux

```bash
docker network prune -f
```
---

# 7. Limpar cache de build

## Linux

```bash
docker builder prune
```

Sem confirmação:

```bash
docker builder prune -f
```

Remover todo o cache:

```bash
docker builder prune -a -f
```

---

# 8. Limpeza automática do Docker

## Linux

```bash
docker system prune
```

Remover imagens não utilizadas:

```bash
docker system prune -a
```

Remover imagens e volumes:

```bash
docker system prune -a --volumes
```

Sem confirmação:

```bash
docker system prune -a --volumes -f
```
---

# 9. Limpeza completa

## Linux

```bash
docker stop $(docker ps -aq)

docker rm -f $(docker ps -aq)

docker rmi -f $(docker images -aq)

docker volume rm $(docker volume ls -q)

docker network prune -f

docker builder prune -a -f
```
---

# 10. Conferir se a limpeza funcionou

## Linux

```bash
docker ps -a
docker images
docker volume ls
docker network ls
docker system df
```
---

# 11. Comandos de inspeção

## Informações do Docker

```bash
docker info
```
---

## Versão do Docker

```bash
docker version
```
---

## Ver logs de um contêiner

```bash
docker logs NOME_DO_CONTAINER
```
---

## Entrar em um contêiner

```bash
docker exec -it NOME_DO_CONTAINER bash
```

Caso a imagem não possua o Bash:

```bash
docker exec -it NOME_DO_CONTAINER sh
```

## Listar apenas contêineres em execução

```bash
docker ps
```
## Listar apenas IDs dos contêineres

```bash
docker ps -aq
```

# Resumo

| Objetivo | Linux | Windows PowerShell |
|----------|--------|--------------------|
| Listar contêineres | `docker ps -a` | `docker ps -a` |
| Listar imagens | `docker images` | `docker images` |
| Parar todos | `docker stop $(docker ps -aq)` | `docker stop (docker ps -aq)` |
| Remover contêineres | `docker rm -f $(docker ps -aq)` | `docker rm -f (docker ps -aq)` |
| Remover imagens | `docker rmi -f $(docker images -aq)` | `docker rmi -f (docker images -aq)` |
| Remover volumes | `docker volume rm $(docker volume ls -q)` | `docker volume rm (docker volume ls -q)` |
| Remover redes | `docker network prune -f` | `docker network prune -f` |
| Limpar cache | `docker builder prune -a -f` | `docker builder prune -a -f` |
| Limpeza completa | `docker system prune -a --volumes -f` | `docker system prune -a --volumes -f` |
| Ver uso de espaço | `docker system df` | `docker system df` |

---

# Boas práticas

- Execute `docker system df` antes e depois da limpeza para verificar o espaço recuperado.
- Utilize `docker system prune -a --volumes -f` periodicamente em ambientes de desenvolvimento.
- Não remova volumes se eles contiverem bancos de dados ou arquivos importantes.
- Antes de apagar imagens, confirme se elas não serão reutilizadas por projetos ativos.
- Faça backup de dados importantes antes de realizar limpezas completas.

````

docker compose -f docker-compose.local.yml --env-file .env.local up -d --build 

"http://192.168.0.200:3000



