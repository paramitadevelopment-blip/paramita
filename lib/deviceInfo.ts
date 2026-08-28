import { UAParser } from 'ua-parser-js';

/**
 * 요청을 보낸 기기·브라우저·IP.
 *
 * 누가 언제 무엇을 했는지 남길 때 함께 적는다. 다운로드 기록과 로그인 기록이
 * 같은 값을 같은 이름으로 담아야 화면에서 나란히 놓고 볼 수 있다.
 */
export interface DeviceInfo {
  ip_address: string | null;
  /** mobile · tablet · desktop */
  device_type: string;
  /** Windows · macOS · iOS · Android */
  os_name: string | null;
  /** Chrome · Safari · Firefox · Edge */
  browser_name: string | null;
}

/** 헤더만 있으면 되므로 Request 든 NextRequest 든 받는다. */
interface HasHeaders {
  headers: { get(name: string): string | null };
}

export function extractDeviceInfo(request: HasHeaders): DeviceInfo {
  const userAgent = request.headers.get('user-agent') || '';
  const parser = new UAParser(userAgent);

  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  /*
   * x-forwarded-for 는 프록시·로드밸런서가 넣는 헤더다. 여러 단을 거치면
   * 쉼표로 이어 붙으므로 맨 앞이 실제 접속자다.
   *
   * 이 헤더는 클라이언트가 마음대로 만들어 보낼 수도 있다. 접근 제어에는
   * 쓰지 않고 기록용으로만 쓴다 — 이 값으로 무언가를 막지는 않는다.
   */
  const xForwarded = request.headers.get('x-forwarded-for');
  const ip = xForwarded ? xForwarded.split(',')[0].trim() : null;

  return {
    ip_address: ip,
    // 데스크톱 브라우저는 device.type 을 안 준다. 빈 값이 곧 데스크톱이다.
    device_type: device.type || 'desktop',
    os_name: os.name || null,
    browser_name: browser.name || null,
  };
}
