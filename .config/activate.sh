#!/bin/bash
# Ativar ambiente de desenvolvimento com todos subagentes

# chmod +x .config/activate.sh
# source .config/activate.sh

export OPENCODE_CONFIG_DIR="$(pwd)/.config/opencode"

echo "🧠 Carregando subagentes..."
for agent in .config/opencode/subagents/*.json; do
    echo "  ✅ $(basename $agent .json)"
done

echo "🛠️  Carregando skills..."
for skill in .config/opencode/skills/*.json; do
    echo "  ✅ $(basename $skill .json)"
done

echo "🚀 Ambiente OpenCode pronto!"