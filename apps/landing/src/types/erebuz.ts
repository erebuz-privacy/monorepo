export interface NavLink {
  label: string;
  href: string;
}

export interface FeatureSection {
  id: string;
  number: string;
  title: string;
  description: string;
  tagline: string;
  icon: string;
}

export interface UseErebuzCard {
  title: string;
  description: string;
  cta: string;
  ctaHref: string;
  image: string;
  className: string;
}

export interface GetInvolvedCard {
  title: string;
  description: string;
  cta: string;
  ctaHref: string;
}

export interface CommunityLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}
