import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/theme/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mulify Library",
  description: "Internal intelligence platform — library.mulify.co",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking theme script — runs synchronously before first paint.
          Reads localStorage and overrides data-theme / color-scheme on <html>.
          suppressHydrationWarning on <html> prevents React from warning about
          the attribute mismatch caused by this script (data-theme, style.colorScheme).
          The server always emits data-theme="dark" (matching :root CSS defaults).
          Light-mode users get the correct theme after this script, with no flash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mulify-theme');var m=(t==='dark'||t==='light'||t==='system')?t:'system';var dark=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var v=dark?'dark':'light';document.documentElement.dataset.theme=v;document.documentElement.style.colorScheme=v;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
