import type { MetadataRoute } from 'next';

/**
 * 검색 로봇을 전부 막는다.
 *
 * 사내 업무 시스템이고, 안에 고객 이름·전화번호·주민번호 앞자리가 들어 있다.
 * 로그인 없이는 아무 화면도 안 보이지만 로그인 화면 자체가 색인되면
 * 회사 이름으로 검색했을 때 관리 도구 주소가 그대로 드러난다.
 *
 * 이것만으로는 부족하다 — robots.txt 는 로봇에게 부탁하는 것이라 안 지키면
 * 그만이다. next.config 의 X-Robots-Tag 헤더와 layout 의 metadata 로
 * 세 겹을 둔다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
