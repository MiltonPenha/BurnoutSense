import "react";

declare module "react" {
  interface CSSProperties {
    "--toast-duration"?: string;
  }
}
