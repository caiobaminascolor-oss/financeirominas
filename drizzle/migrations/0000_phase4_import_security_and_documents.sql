CREATE OR REPLACE FUNCTION public.import_store_scope() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT store_id FROM public.profiles WHERE id=auth.uid() AND active $$;
REVOKE ALL ON FUNCTION public.import_store_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_store_scope() TO authenticated;
CREATE POLICY imports_store_scope ON public.imports AS RESTRICTIVE FOR ALL TO authenticated USING (store_id IS NOT DISTINCT FROM public.import_store_scope() AND public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','FINANCEIRO','ESTOQUE']::public.app_role[])) WITH CHECK (store_id IS NOT DISTINCT FROM public.import_store_scope() AND public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','FINANCEIRO','ESTOQUE']::public.app_role[]));
CREATE POLICY imports_finance_scope ON public.imports AS RESTRICTIVE FOR ALL TO authenticated USING (target_entity NOT IN ('accounts_payable','accounts_receivable','expenses','sales') OR public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','FINANCEIRO']::public.app_role[])) WITH CHECK (target_entity NOT IN ('accounts_payable','accounts_receivable','expenses','sales') OR public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','FINANCEIRO']::public.app_role[]));
CREATE POLICY imports_file_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='imports' AND EXISTS (SELECT 1 FROM public.imports i WHERE i.file_path=name AND i.store_id IS NOT DISTINCT FROM public.import_store_scope()));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['products','inventory','categories','customers','suppliers','sales','salespeople','quotes','purchases','inventory_movements','accounts_payable','accounts_receivable','expenses','alerts'] LOOP EXECUTE format('CREATE POLICY phase4_store_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (store_id IS NOT DISTINCT FROM public.import_store_scope()) WITH CHECK (store_id IS NOT DISTINCT FROM public.import_store_scope())',t); END LOOP; END $$;
CREATE POLICY phase4_sale_items_scope ON public.sale_items AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_id)) WITH CHECK (EXISTS(SELECT 1 FROM public.sales s WHERE s.id=sale_id));
CREATE POLICY phase4_purchase_items_scope ON public.purchase_items AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=purchase_id)) WITH CHECK (EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=purchase_id));
CREATE POLICY phase4_quote_items_scope ON public.quote_items AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.quotes q WHERE q.id=quote_id)) WITH CHECK (EXISTS(SELECT 1 FROM public.quotes q WHERE q.id=quote_id));
CREATE POLICY purchases_stock_read ON public.purchases FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'ESTOQUE'));
CREATE POLICY purchases_stock_insert ON public.purchases FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'ESTOQUE'));
CREATE POLICY purchase_items_stock_read ON public.purchase_items FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'ESTOQUE'));
CREATE POLICY purchase_items_stock_insert ON public.purchase_items FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'ESTOQUE'));
CREATE POLICY phase4_financial_alerts ON public.alerts AS RESTRICTIVE FOR SELECT TO authenticated USING (category NOT IN ('Financeiro','Custo','Margem') OR public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','FINANCEIRO']::public.app_role[]));
CREATE OR REPLACE FUNCTION public.import_document(_entity text,_header jsonb,_items jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE doc uuid; item jsonb; scope uuid; BEGIN
scope:=public.import_store_scope();
PERFORM pg_advisory_xact_lock(hashtext(coalesce(scope::text,'geral')||_entity||coalesce(_header->>'sale_number',_header->>'purchase_number')));
IF _entity='sales' THEN
IF NOT public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE']::public.app_role[]) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF EXISTS(SELECT 1 FROM public.sales WHERE store_id IS NOT DISTINCT FROM scope AND lower(sale_number)=lower(_header->>'sale_number')) THEN RAISE EXCEPTION 'Venda já importada'; END IF;
INSERT INTO public.sales(sale_number,sold_at,customer_id,salesperson_id,payment_method,status,subtotal,discount_amount,total,cost_total,gross_profit,margin_pct,store_id,created_by) VALUES(_header->>'sale_number',(_header->>'sold_at')::timestamptz,(_header->>'customer_id')::uuid,(_header->>'salesperson_id')::uuid,_header->>'payment_method',coalesce(_header->>'status','CONCLUIDA'),(_header->>'subtotal')::numeric,(_header->>'discount_amount')::numeric,(_header->>'total')::numeric,(_header->>'cost_total')::numeric,(_header->>'gross_profit')::numeric,(_header->>'margin_pct')::numeric,scope,auth.uid()) RETURNING id INTO doc;
FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
INSERT INTO public.sale_items(sale_id,product_id,quantity,unit_price,unit_cost,discount_amount,total,margin_pct,created_by) VALUES(doc,(item->>'product_id')::uuid,(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'unit_cost')::numeric,(item->>'discount_amount')::numeric,(item->>'total')::numeric,(item->>'margin_pct')::numeric,auth.uid()); END LOOP;
ELSIF _entity='purchases' THEN
IF NOT public.has_any_role(auth.uid(),ARRAY['ADMIN','GERENTE','ESTOQUE']::public.app_role[]) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
IF EXISTS(SELECT 1 FROM public.purchases WHERE store_id IS NOT DISTINCT FROM scope AND lower(purchase_number)=lower(_header->>'purchase_number')) THEN RAISE EXCEPTION 'Compra já importada'; END IF;
INSERT INTO public.purchases(purchase_number,supplier_id,ordered_at,received_at,status,total,store_id,created_by) VALUES(_header->>'purchase_number',(_header->>'supplier_id')::uuid,(_header->>'ordered_at')::timestamptz,(_header->>'received_at')::timestamptz,coalesce(_header->>'status','PENDENTE'),(_header->>'total')::numeric,scope,auth.uid()) RETURNING id INTO doc;
FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP INSERT INTO public.purchase_items(purchase_id,product_id,quantity,unit_cost,total,created_by) VALUES(doc,(item->>'product_id')::uuid,(item->>'quantity')::numeric,(item->>'unit_cost')::numeric,(item->>'total')::numeric,auth.uid()); END LOOP;
ELSE RAISE EXCEPTION 'Entidade inválida'; END IF;
RETURN doc; END $$;
REVOKE ALL ON FUNCTION public.import_document(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_document(text,jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_profile_store() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.store_id IS DISTINCT FROM OLD.store_id AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'Somente administrador pode alterar a loja'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.protect_profile_store() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER phase4_profile_store BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_store();