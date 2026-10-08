import type { Metadata } from "next";
import "../assets/scss/themes.scss";

export const metadata: Metadata = {
  title: "Defentrax",
  description: "Security & Infrastructure Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-layout="vertical"
      data-sidebar="dark"
      data-sidebar-size="lg"
      data-bs-theme="dark"
      data-topbar="dark"
      data-layout-width="fluid"
      data-layout-position="fixed"
      data-layout-style="default"
      data-sidebar-image="none"
      data-preloader="disable"
      data-theme="default"
      data-theme-colors="default"
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
