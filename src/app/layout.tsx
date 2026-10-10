import "~/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
export const metadata: Metadata = {
  title: "Graceful Trees Lab — Interactive Graceful Labeling Demo",
  description:
    "Grow your own tree and watch backtracking, constraint programming, and local search find its graceful labeling. An interactive demo of the Graceful Trees Conjecture.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
