import type { Metadata } from "next";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sanghvi ERP",
  description: "Production ERP dashboard for Sanghvi Laminates operations",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
