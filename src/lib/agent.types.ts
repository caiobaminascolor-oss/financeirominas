import type { Json } from "@/integrations/supabase/types";

export type AgentMessage = {
  id: string;
  role: string;
  content: string | null;
  created_at: string;
  tool_calls: Json | null;
  tool_results: Json | null;
};

export type AgentConversation = {
  id: string;
  title: string | null;
  last_message_at: string | null;
  archived: boolean;
};

export type AgentAction = {
  id: string;
  action_type: string;
  status: string;
  payload: Json;
  result: Json | null;
  created_at: string;
};

export type AgentTurn = {
  conversationId: string;
  message: AgentMessage;
  action?: AgentAction;
};