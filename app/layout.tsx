import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { PremiumRefresher } from "@/components/premium/PremiumRefresher";
import "./globals.css";

// UI text. The same family the generated tools use by default, so the app and its output match.
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-thai",
  display: "swap",
});
// Code: the editor, file names, URLs.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EasyGAS IDE — AI builder for Google Apps Script",
  description:
    "Chat with AI to build Google Apps Script tools, preview live, and deploy to your own Google account.",
  icons: {
    icon: [
      { url: "/icon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/icon/apple-icon-180x180.png", sizes: "180x180" }],
    shortcut: ["/icon/favicon.ico"],
  },
};

// Set the theme class before first paint to avoid a flash. Defaults to light; dark only when the
// user explicitly chose it (stored in localStorage by ThemeToggle).
const NO_FLASH_THEME = `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="th" className={`${plexThai.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        {/* suppressHydrationWarning: React strips `nonce` from the client tree for security, so the
            server (with nonce) vs client (without) attribute always "mismatches" — expected, not a bug. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body>
        {children}
        <PremiumRefresher />
      </body>
    </html>
  );
}
