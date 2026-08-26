import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.18', 'localhost', '127.0.0.1'],

  /*
   * 검색 로봇 차단.
   *
   * robots.txt 는 로봇에게 부탁하는 것이라 안 지키면 그만이다. 이 헤더는
   * 구글·네이버가 실제로 따르는 지시라, 어떤 경로로 들어와도 색인되지 않는다.
   *
   * 사내 업무 시스템이고 고객 개인정보가 들어 있어 색인될 이유가 없다.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
    ];
  },
};

export default nextConfig;
