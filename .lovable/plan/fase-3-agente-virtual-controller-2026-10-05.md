# Fase 3 — Agente Virtual Controller

## Objetivo
Transformar `/agente` em um chat operacional conectado aos dados reais da empresa, com histórico persistente, respostas auditáveis e relatórios gerenciais. O modelo nunca consultará o banco diretamente: toda informação será entregue por ferramentas controladas no servidor.

## Entregas

1. **Motor seguro do agente**
   - Criar uma função autenticada no servidor para receber mensagens, validar o papel do usuário e chamar o Lovable AI.
   - Implementar um catálogo fechado de ferramentas para vendas, estoque, financeiro, clientes, orçamentos, equipe, metas, compras, fornecedores, margens, descontos, alertas, comparações, projeções e anomalias.
   - Restringir cada ferramenta conforme o papel; dados financeiros ficam disponíveis apenas para ADMIN, GERENTE e FINANCEIRO.
   - Forçar respostas com conclusão primeiro, distinção entre dado real/estimativa/projeção/hipótese e os textos literais `DADOS INSUFICIENTES` ou `INCONSISTÊNCIA DETECTADA` quando aplicáveis.

2. **Memória e rastreabilidade**
   - Persistir conversas, mensagens, ferramentas usadas, resultados e consumo do modelo nas tabelas já existentes.
   - Recuperar o contexto recente para refinamentos como “agora retire a marca X” sem perder filtros anteriores.
   - Salvar decisões e propostas de ação separadamente das mensagens.

3. **Ações com confirmação**
   - Interpretar pedidos de alteração, inicialmente incluindo atualização de estoque.
   - Nunca aplicar uma alteração diretamente pela resposta da IA: mostrar uma proposta com antes/depois e exigir confirmação explícita.
   - Executar a ação no servidor com validação de papel e registrar resultado, responsável e auditoria já existente.

4. **Relatórios estruturados**
   - Implementar Fechamento do Dia, Relatório Semanal e Relatório Mensal usando o mesmo catálogo de ferramentas.
   - Finalizar o diário com “3 prioridades de amanhã”, o semanal com “plano da próxima semana” e o mensal com resumo executivo de até 10 linhas e “10 decisões mais importantes do próximo mês”.
   - Exibir lacunas de dados em vez de preencher números inexistentes.

5. **Experiência em `/agente`**
   - Criar interface de chat responsiva com lista de conversas, histórico, caixa de mensagem, estados de processamento, referências das consultas e cartões de confirmação de ações.
   - Adicionar atalhos para os três relatórios e sugestões de perguntas úteis.
   - Manter a linguagem executiva e o design atual do MINASCOLOR CONTROL.

6. **Validação**
   - Verificar controle de acesso, persistência do histórico, refinamento de perguntas, estados sem dados, confirmação de ação e geração dos três relatórios.
   - Validar que nenhuma resposta numérica é produzida sem resultado de ferramenta e que alterações sensíveis deixam trilha de auditoria.

## Detalhes técnicos
- Funções internas serão `createServerFn` autenticadas; nenhuma função externa ou acesso direto do modelo ao banco.
- O catálogo de ferramentas fará consultas com escopo da loja e limites de linhas/período.
- A saída do modelo será tratada como não confiável; somente o controlador executará ferramentas e ações permitidas.
- A primeira versão cobrirá todas as ferramentas solicitadas, agrupando consultas correlatas internamente para reduzir custo e latência.
