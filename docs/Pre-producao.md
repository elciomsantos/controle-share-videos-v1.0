Realize uma avaliação completa de segurança da aplicação, considerando que ela está em fase final de desenvolvimento e próxima de entrar em produção.

A análise deve identificar e documentar todas as vulnerabilidades, riscos e pontos de melhoria, seguindo as melhores práticas de segurança para aplicações web e APIs.

A avaliação deve incluir, no mínimo:

Identificação de vulnerabilidades conhecidas (OWASP Top 10 e outras relevantes).
Análise de autenticação, autorização e controle de acesso.
Validação de entradas e proteção contra ataques como SQL Injection, XSS, CSRF, SSRF e Command Injection.
Verificação do gerenciamento de sessões, tokens (JWT), cookies e credenciais.
Análise da configuração de segurança do servidor, Docker, banco de dados e variáveis de ambiente.
Avaliação das dependências e bibliotecas utilizadas, identificando versões vulneráveis ou desatualizadas.
Revisão do código em busca de falhas de segurança, exposição de informações sensíveis e práticas inseguras.
Verificação da proteção de arquivos, diretórios, uploads e permissões.
Análise de logs, auditoria, tratamento de erros e exposição de informações sensíveis.
Avaliação da comunicação segura (HTTPS/TLS, cabeçalhos HTTP de segurança, CORS, CSP e demais mecanismos).
Verificação da conformidade com boas práticas de segurança para implantação em produção.

Ao final, apresente um relatório estruturado contendo:

Resumo executivo com o nível geral de segurança da aplicação.
Lista de vulnerabilidades, classificadas por criticidade (Crítica, Alta, Média, Baixa e Informativa).
Descrição técnica de cada vulnerabilidade.
Impacto e possíveis consequências.
Evidências encontradas.
Recomendações detalhadas para correção.
Prioridade de implementação das correções.
Checklist de hardening para o ambiente de produção.
Validação final, indicando se a aplicação está apta para produção ou quais requisitos ainda precisam ser atendidos.

Considere uma postura de auditoria técnica, priorizando precisão, profundidade da análise e recomendações práticas para tornar a aplicação segura antes da implantação em produção.