import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAgentConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const agent = await import("./agent.server");
    return agent.listConversations(context.supabase, context.userId);
  });

export const getAgentConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const agent = await import("./agent.server");
    return agent.getConversation(context.supabase, context.userId, data.conversationId);
  });

export const sendAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversationId: z.string().uuid().optional(), message: z.string().trim().min(1).max(4000), report: z.enum(["daily", "weekly", "monthly"]).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const agent = await import("./agent.server");
    return agent.sendMessage(context.supabase, context.userId, data);
  });

export const decideAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ actionId: z.string().uuid(), approve: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const agent = await import("./agent.server");
    return agent.applyAction(context.supabase, context.userId, data.actionId, data.approve);
  });

export const archiveAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const agent = await import("./agent.server");
    return agent.archiveConversation(context.supabase, context.userId, data.conversationId);
  });
