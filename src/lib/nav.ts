import {
  LayoutDashboard,
  Bot,
  ShoppingCart,
  FileText,
  Users,
  Boxes,
  PackageX,
  Truck,
  Building2,
  Wallet,
  UserCog,
  Target,
  Megaphone,
  Bell,
  BarChart3,
  Upload,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Quando definido, só aparece para estes papéis. */
  roles?: AppRole[];
  group: "Gestão" | "Operação" | "Financeiro" | "Inteligência" | "Sistema";
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão Geral", to: "/dashboard", icon: LayoutDashboard, group: "Gestão" },
  { label: "Agente Controller", to: "/agente", icon: Bot, group: "Gestão" },
  { label: "Metas", to: "/metas", icon: Target, group: "Gestão" },

  { label: "Vendas", to: "/vendas", icon: ShoppingCart, group: "Operação" },
  { label: "Orçamentos", to: "/orcamentos", icon: FileText, group: "Operação" },
  { label: "Clientes", to: "/clientes", icon: Users, group: "Operação" },
  { label: "Estoque", to: "/estoque", icon: Boxes, group: "Operação" },
  { label: "Produtos Parados", to: "/produtos-parados", icon: PackageX, group: "Operação" },
  { label: "Compras", to: "/compras", icon: Truck, group: "Operação", roles: ["ADMIN", "GERENTE", "FINANCEIRO", "ESTOQUE"] },
  { label: "Fornecedores", to: "/fornecedores", icon: Building2, group: "Operação" },

  { label: "Financeiro", to: "/financeiro", icon: Wallet, group: "Financeiro", roles: ["ADMIN", "GERENTE", "FINANCEIRO"] },

  { label: "Equipe", to: "/equipe", icon: UserCog, group: "Inteligência" },
  { label: "Marketing", to: "/marketing", icon: Megaphone, group: "Inteligência" },
  { label: "Alertas", to: "/alertas", icon: Bell, group: "Inteligência" },
  { label: "Relatórios", to: "/relatorios", icon: BarChart3, group: "Inteligência" },

  { label: "Importações", to: "/importacoes", icon: Upload, group: "Sistema" },
  { label: "Configurações", to: "/configuracoes", icon: Settings, group: "Sistema" },
];

export const NAV_GROUPS = ["Gestão", "Operação", "Financeiro", "Inteligência", "Sistema"] as const;
