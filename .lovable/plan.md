# Fase 4 — Importação e Conciliação

## Objetivo
Permitir carregar dados reais da loja (planilhas e PDFs) em `/importacoes`, validar antes de gravar, registrar histórico completo e rodar conciliações automáticas que alimentam Alertas e o Agente Controller. Nenhum dado é inventado: linhas inválidas são rejeitadas com motivo.

## Entregas

1. **Upload e leitura**
   - Aceitar CSV, XLS, XLSX e PDF (até 10 MB).
   - Planilhas lidas no navegador; PDFs com tabelas extraídos pela IA (Lovable AI) no servidor, sempre exibidos para revisão antes de gravar.
   - Arquivo original guardado em armazenamento privado para rastreabilidade.

2. **Mapeamento de colunas**
   - Escolher a entidade: produtos, estoque, vendas (com itens), compras, clientes, fornecedores, contas a pagar, contas a receber, despesas, orçamentos.
   - Sugestão automática de mapeamento por nome da coluna (ex.: "Cód.", "SKU" → código) com ajuste manual.
   - Modelos de planilha para download por entidade.

3. **Validação e prévia**
   - Por linha: campos obrigatórios, tipos, datas, valores negativos indevidos, códigos inexistentes (ex.: venda de produto não cadastrado).
   - Classificação: OK / AVISO / ERRO. Prévia com contagens antes de confirmar.
   - Modo de gravação: inserir novos ou atualizar existentes pelo código (upsert).

4. **Gravação e histórico**
   - Gravação no servidor com validação de papel (ESTOQUE: produtos/estoque/compras/fornecedores; FINANCEIRO: contas/despesas; ADMIN/GERENTE: tudo; VENDEDOR: sem importação).
   - Tabela `imports` registra arquivo, entidade, status, linhas processadas/inseridas/atualizadas/rejeitadas, erros e avisos, autor e data.
   - Alterações de preço, custo e estoque continuam auditadas pelo trigger existente.
   - Página de detalhe de cada importação com lista de erros por linha e exportação CSV dos rejeitados.

5. **Conciliação**
   - Estoque × vendas (saldo esperado vs. informado), produto duplicado (código/descrição), estoque negativo, divergência de custo (compra vs. cadastro), venda abaixo do custo, contas sem cliente/fornecedor, totais de venda ≠ soma dos itens.
   - Resultado salvo como alertas P1–P4 com problema, causa, impacto e solução, visíveis em `/alertas` e consultáveis pelo Agente.
   - Botão "Rodar conciliação" e execução automática após cada importação.

6. **Validação**
   - Testes das regras de validação e conciliação com arquivos de exemplo.
   - Verificar permissões por papel, histórico e estados vazios.

## Detalhes técnicos
- Leitura de planilhas com `xlsx` (SheetJS) no cliente; envio das linhas normalizadas em lotes para `createServerFn` autenticadas com zod.
- PDF: texto enviado ao Lovable AI com saída estruturada (tool calling) — tratada como não confiável e sempre revisada pelo usuário.
- Bucket privado `imports` com RLS por loja; coluna de resultado detalhado em `imports` (jsonb) via migração com GRANTs.
- Regras de conciliação em módulo puro (`reconciliation.ts`) testado com vitest; persistência em `alerts` com chave de deduplicação.
