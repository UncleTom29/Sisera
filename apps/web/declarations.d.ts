/// <reference types="react" />

declare module "next" {
  export interface Metadata {
    title?: string;
    description?: string;
    [key: string]: any;
  }
}

declare module "next/link" {
  import * as React from "react";
  export interface LinkProps {
    href: string;
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
    title?: string;
    [key: string]: any;
  }
  const Link: React.FC<LinkProps>;
  export default Link;
}

declare module "next/types.js" {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}
