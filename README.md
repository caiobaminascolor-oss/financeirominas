# Minascolor Insights

Construir um SaaS de gestão empresarial chamado "MINASCOLOR CONTROL" para uma loja de tintas e materiais de construção/pintura. NÃO é um dashboard visual apenas — é um ERP analítico + BI + Controller com um AGENTE VIRTUAL de IA integrado aos dados reais.

ARQUITETURA GERAL
Frontend → Backend (Lovable Cloud) → Agent Controller → LLM (Lovable AI) → Tools/Functions → Banco de dados.
O LLM NUNCA acessa o banco diretamente — só via funções estruturadas (tools) controladas pelo backend. Toda resposta numérica do agente deve vir de tools, nunca de invenção. Se faltar dado: responder literalmente "DADOS INSUFICIENTES" e dizer o que falta. Se houver conflito de dados: "INCONSISTÊNCIA DETECTADA".

PERSONA DO AGENTE (system prompt fixo)
"Você é o Gerente Virtual + Controller da empresa. Sua função é transformar dados em decisões. Nunca invente números. Sempre diferencie FATURAMENTO, LUCRO, CAIXA, MARGEM, MARKUP, CMV, RECEBIMENTO e ESTOQUE — nunca tratar como sinônimos, e corrigir o usuário quando confundir (ex: "vendemos X, logo lucramos X" está errado — explicar por quê). Comece sempre pela conclusão, depois os dados. Ao achar um problema, estruture: O QUE está acontecendo / POR QUE / IMPACTO / O QUE FAZER / O QUE NÃO FAZER / PRIORIDADE (P1 urgente a P4 oportunidade). Se dados insuficientes, diga isso claramente. Diferencie DADO REAL, ESTIMATIVA, PROJEÇÃO e HIPÓTESE. Seja direto, crítico, imparcial, estratégico e orientado a números — não tente agradar. Se o usuário estiver errado, diga 'Você está errado neste ponto' e explique. Prioridades padrão de gestão: 1) Caixa 2) Margem 3) Estoque 4) Produtividade 5) Faturamento 6) Lucro 7) Crescimento — mas sempre aponte oportunidades de alto retorno/baixo risco quando existirem."

FASE 1 — FUNDAÇÃO (construir primeiro)
1. Ativar Lovable Cloud (banco, auth, storage, edge functions).
2. Schema relacional cobrindo: users, stores, products, categories, suppliers, customers, sales, sale_items, salespeople, quotes, quote_items, inventory, inventory_movements, purchases, purchase_items, accounts_payable, accounts_receivable, cash_transactions, expenses, targets, commissions, discounts, alerts, reports, imports, agent_conversations, agent_messages, agent_actions, audit_logs. Toda tabela crítica com created_at, updated_at, created_by e trilha de auditoria (registrar quem alterou, valor anterior, novo valor, data/hora — especialmente preço, custo, estoque, margem, desconto, meta, contas financeiras).
3. Autenticação com papéis: ADMIN, GERENTE, VENDEDOR, FINANCEIRO, ESTOQUE — com permissões diferenciadas (ex: vendedor não vê dados financeiros sensíveis sem permissão).
4. Layout do sistema: sidebar com Dashboard, Agente Controller, Vendas, Orçamentos, Clientes, Estoque, Produtos Parados, Compras, Fornecedores, Financeiro, Equipe, Metas, Marketing, Alertas, Relatórios, Importações, Configurações. Topo com busca global, seletor de período, notificações, usuário. Design SaaS B2B profissional, clean, executivo, responsivo (desktop first, ótima experiência mobile).
5. Tela "VISÃO GERAL": cards com Faturamento, Meta, % da meta, Margem, Lucro bruto, Nº de vendas, Ticket médio, CMV, Despesas, Contas a pagar, Contas a receber, Estoque, Capital em estoque, Giro, Orçamentos em aberto — cada card mostrando ATUAL / META / PERÍODO ANTERIOR / VARIAÇÃO / STATUS (🟢 BOM, 🟡 ATENÇÃO, 🔴 PROBLEMA). Card grande "GERENTE VIRTUAL" no topo com saudação e resumo automático de Problemas/Atenção/Resultados/Oportunidades.
6. Como ainda não há dados reais, criar ESTADO VAZIO com instruções claras de importação em vez de dados fictícios — nunca inventar dados para preencher gráficos.

FASE 2 — MÓDULOS OPERACIONAIS
/vendas (com ranking de vendedores multi-critério: faturamento, qtd vendas, ticket médio, margem, lucro, desconto médio, % da meta — nunca só por faturamento), /metas (meta mensal/semanal/diária/por vendedor/categoria, ritmo necessário, projeção de atingimento), /estoque (giro, cobertura, capital investido, classificações 🟢 alto giro / 🟡 atenção / 🟠 excessivo / 🔴 dinheiro parado / ⚠️ risco de ruptura), relatório de Produtos Parados (capital parado = estoque × custo, ranking, filtros 30/60/90/180/365 dias), Curva ABC (por faturamento, margem, giro e capital investido — nunca só faturamento), /compras (classificação 🟢 comprar agora / 🟡 em breve / 🟠 sob demanda / 🔴 não comprar, com justificativa cruzando estoque+giro+demanda+prazo+margem+caixa), /financeiro (caixa, contas a pagar/receber, fluxo de caixa com projeções 7/15/30/60/90 dias e cenários pessimista/base/otimista com premissas visíveis), /clientes (classificação novo/recorrente/VIP/inativo/em risco, oportunidades de recompra/cross-sell/upsell), /orcamentos (pipeline com status aberto/negociação/aprovado/convertido/perdido/expirado, taxa de conversão), /equipe (classificação por performance só com dados, nunca julgamento pessoal), /descontos (detectar desconto excessivo e venda abaixo do custo com alerta 🔴 imediato), /alertas (central classificada P1 urgente a P4 oportunidade), /marketing (leads → orçamentos → vendas → margem → lucro, CAC, ROI, ROAS).

FASE 3 — AGENTE VIRTUAL CONTROLLER (/agente)
Interface de chat moderna. O agente deve ter acesso a ferramentas estruturadas (functions/edge functions) que consultam o banco antes de responder qualquer pergunta numérica, incluindo: get_sales, get_sale_details, get_products, get_inventory, get_inventory_movements, get_stock_turnover, get_accounts_payable, get_accounts_receivable, get_cash_flow, get_expenses, get_customers, get_quotes, get_salespeople, get_targets, get_purchases, get_suppliers, get_margins, get_discounts, get_alerts, compare_periods, calculate_margin, calculate_stock_coverage, calculate_target_progress, calculate_cash_projection, calculate_customer_repurchase, calculate_salesperson_performance, detect_anomalies, generate_daily_closing, generate_weekly_report, generate_monthly_report. Usar Lovable AI para o LLM. O agente deve manter memória de conversas/decisões/parâmetros anteriores (agent_conversations/agent_messages/agent_actions) e conseguir aplicar ações como "atualize o estoque do produto X para Y" com registro em auditoria. Deve suportar refinamento por linguagem natural (ex: "mostre os 50 produtos com mais excesso de estoque" → "agora tire os produtos da marca X" → "agora só com capital parado > R$500" → "faça um plano de ação"). Botões de Fechamento do Dia, Relatório Semanal e Relatório Mensal que geram os relatórios estruturados conforme os templates definidos (fechamento gerencial terminando em "3 prioridades de amanhã"; semanal terminando em "plano da próxima semana"; mensal com resumo executivo de até 10 linhas e terminando em "10 decisões mais importantes do próximo mês").

FASE 4 — IMPORTAÇÃO E CONCILIAÇÃO
/importacoes: upload de PDF/Excel/CSV/XLSX, extração de produtos/vendas/estoque/compras/clientes/fornecedores/financeiro/orçamentos, histórico com status/erros/avisos. Mecanismo de conciliação entre relatórios (ex: estoque × vendas 12 meses) detectando estoque positivo com zero venda, venda sem estoque, estoque negativo, diferença de custo, produto duplicado/sem código/cadastro inconsistente, sinalizando "⚠️ ANOMALIA DETECTADA".

Comece pela Fase 1 (Cloud, schema, auth, layout, visão geral com estado vazio) e me avise quando estiver pronta para eu revisar antes de seguir para as próximas fases. A arquitetura deve ficar preparada para integrações futuras (ERP, Autcom, Citel, webhooks, N8N, Google Sheets, WhatsApp) sem simular integrações falsas agora.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://financeirominas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/91889068-71be-4173-be27-f1c70b44a848).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
