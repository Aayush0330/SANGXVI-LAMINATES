import type { Metadata, Viewport } from "next";
import { InlineScript } from "@/components/inline-script";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sanghvi ERP",
  description: "Production ERP dashboard for Sanghvi Laminates operations",
  applicationName: "Sanghvi ERP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sanghvi ERP",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <InlineScript
          html={`(function(){try{var key='sangxvi-theme';var saved=localStorage.getItem(key);var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=saved|| (prefersDark ? 'dark' : 'light');document.documentElement.classList.toggle('dark', theme==='dark');document.documentElement.style.colorScheme=theme;}catch(e){}})();`}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
