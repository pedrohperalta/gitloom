# Gitloom — instruções para agentes

Cliente Git desktop em React/TypeScript e Tauri/Rust. Leia o `README.md` para arquitetura, comandos e limitações. Preserve alterações locais do usuário.

## Antes de implementar UI

- Converta o pedido em critérios observáveis de aceitação. Considere o fluxo completo: abrir, selecionar, repetir o clique, voltar, cancelar, confirmar, redimensionar e recarregar, conforme aplicável.
- Inspecione os componentes e padrões existentes antes de criar controles novos. Reutilize divisores, seções e confirmações para manter o comportamento consistente.
- Use dados que pressionem o layout: referências e caminhos longos, múltiplas referências no mesmo commit, listas vazias e listas que exigem rolagem.

## Contratos de interação e layout

- A coluna Branch / Tag deve permitir ajustar e restaurar a largura por mouse e teclado, com persistência. Os nomes completos devem continuar acessíveis; referências longas quebram linha sem truncamento, e o grafo acompanha a altura de cada linha.
- As seções da sidebar e os grupos de remotos devem ser recolhíveis por mouse e teclado, com `aria-expanded` e estado persistido. Recolher o conteúdo não deve impedir o uso das ações do cabeçalho.
- Contadores ficam imediatamente junto ao título correspondente. Nomes e subtítulos de worktrees ficam alinhados à esquerda. Verifique a geometria renderizada, não apenas a regra CSS.
- Clicar novamente no arquivo selecionado fecha o diff e retorna ao histórico. Isso vale para working tree, stage e arquivos históricos; preserve busca, posição e seleção do commit.
- Toda exclusão exige confirmação explícita com identificação do item. Abrir o diálogo não executa a ação; Cancelar e Escape preservam os dados. O foco inicial fica em Cancelar. Inclua operações que removem itens como efeito adicional, como aplicar e remover stash.
- Preserve os estados de carregamento, erro, seleção e desabilitação. Uma falha deve manter o diagnóstico visível e permitir cancelar ou tentar novamente.
- Atualize ambos os catálogos em `src/locales/` e use os tokens de `src/themes.css`.

## Verificação de mudanças de UI

Build e testes funcionais aprovados não bastam para declarar a interface pronta.

1. Para uma correção de comportamento, acrescente um teste que reproduza a falha e verifique o resultado percebido pelo usuário. Para layout, verifique limites, alinhamento, ausência de sobreposição e acesso ao texto completo. Evite testes que apenas confirmem classes ou a existência de elementos.
2. Execute `npm run build`, `npm test` e os testes de interface pertinentes. Use `npm run test:ui` para as regressões de UI; execute `npm run test:e2e` completo antes de uma release.
3. Para alterações de layout, idioma ou escala, revise inglês e português, texto a 100% e 150%, e janelas de 1080×680 e 1440×900. Use as capturas `test-results/ui-review-*.png` e acrescente cenários quando o componente alterado não estiver coberto.
4. Abra e inspecione as imagens geradas. Capture também o conteúdo abaixo da dobra, os diálogos e os estados alterados. Gerar uma captura não significa revisá-la; testes de geometria e inspeção visual são complementares.
5. Corrija os problemas encontrados nas imagens, mesmo quando os testes passarem. Não aceite automaticamente novas imagens como baseline para esconder uma regressão.

Ao alterar operações Git, mantenha a implementação no backend, com argumentos explícitos, sem interpolação de shell, e testes com Git real em repositórios temporários. Execute `cargo test --locked --manifest-path src-tauri/Cargo.toml`; o README documenta a instalação Rust isolada.

## Antes de publicar uma release

- Siga a revisão de UI do README. Não publique com falhas conhecidas ou verificações obrigatórias pendentes.
- Gere o pacote com o código final, abra o aplicativo desse pacote no macOS e repita os fluxos alterados. Navegador com backend simulado não comprova o funcionamento do pacote Tauri.
- Verifique a versão embutida, a integridade dos artefatos e os checksums. Confirme que a tag identifica o código usado no build e confira os uploads após a publicação.
- Se alguma verificação não puder ser feita, registre exatamente o que falta e por quê. Não afirme que houve revisão visual ou validação nativa sem executá-la.
- No relato final, informe os comportamentos verificados, problemas encontrados e limitações restantes. Diferencie correção local, pacote gerado e release publicada; a quantidade de testes, sozinha, não demonstra qualidade de UI.
