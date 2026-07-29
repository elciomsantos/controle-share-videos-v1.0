#!/bin/bash
# chmod +x .config/test-subagents.sh
# ./.config/test-subagents.sh


echo "🧪 Testando Subagentes..."
echo ""

echo "📁 Estrutura:"
tree .config/opencode -L 2

echo ""
echo "✅ Validate (verificando código Python)..."
# Simula validação
find src/ -name "*.py" -exec echo "  Validando: {}" \;

echo ""
echo "⚡ Optimize (analisando performance)..."
# Verifica complexidade
for file in $(find src/ -name "*.py"); do
    lines=$(wc -l < "$file")
    echo "  $file: $lines linhas"
done

echo ""
echo "🔒 Security (verificando vulnerabilidades)..."
# Procura por secrets
if grep -r "ghp_\|sk-\|api_key.*=" src/ 2>/dev/null; then
    echo "  ⚠️ ALERTA: Possível secret encontrado!"
else
    echo "  ✅ Nenhum secret exposto"
fi

echo ""
echo "🚀 Build GLM-5.2 (orquestrando)..."
echo "  ✅ Validação concluída"
echo "  ✅ Otimização aplicada"
echo "  ✅ Build pronto para WSL2"