"use client";

import "simplebar-react/dist/simplebar.min.css";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { PanelLive } from "@/lib/panel/live";

export function ClientAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div id="layout-wrapper">
      <PanelLive />
      <Header />
      <Sidebar />
      <div className="main-content">
        <div className="page-content">
          <div className="container-fluid">{children}</div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
