import {
  BookOpen,
  CircleDollarSign,
  Code,
  EyeOff,
  Network,
  Rocket,
  Route,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ListItem {
  title: string;
  href?: string;
  icon: Icon;
  group?: boolean;
  separator?: boolean;
  isNew?: boolean;
}

export interface Section {
  title: string;
  Icon: Icon;
  list: ListItem[];
}

export const contents: Section[] = [
  {
    title: "Get Started",
    Icon: Sparkles,
    list: [
      { title: "Introduction", href: "/docs/introduction", icon: BookOpen },
      { title: "Getting test USDC", href: "/docs/getting-test-usdc", icon: CircleDollarSign },
      { title: "Quickstart", href: "/docs/quickstart", icon: Rocket },
    ],
  },
  {
    title: "Concepts",
    Icon: ShieldCheck,
    list: [
      { title: "Routing", href: "/docs/concepts/routing", icon: Route },
      { title: "Privacy model", href: "/docs/concepts/privacy", icon: EyeOff },
      { title: "Compliance", href: "/docs/concepts/compliance", icon: Scale },
      {
        title: "Supported chains",
        href: "/docs/concepts/chains",
        icon: Network,
      },
    ],
  },
  {
    title: "SDK Reference",
    Icon: Code,
    list: [
      { title: "findRoute()", href: "/docs/sdk/find-route", icon: Route },
      { title: "send()", href: "/docs/sdk/send", icon: Send },
    ],
  },
];
