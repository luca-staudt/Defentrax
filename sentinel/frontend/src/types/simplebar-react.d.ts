declare module "simplebar-react" {
  import type { ComponentType, HTMLAttributes, ReactNode } from "react";

  const SimpleBar: ComponentType<HTMLAttributes<HTMLDivElement> & { children?: ReactNode }>;
  export default SimpleBar;
}
