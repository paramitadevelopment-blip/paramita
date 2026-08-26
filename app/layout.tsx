import "./globals.css";
import { Providers } from "./providers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "파라미타인슈어런스",
  description: "파일 관리 및 배포 시스템",
  icons: {
    icon: "/logo/favicon.png",
  },
  // 사내 업무 시스템이라 검색에 뜰 이유가 없다. robots.txt·헤더와 함께 세 겹으로 막는다.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
