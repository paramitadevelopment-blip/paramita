import { describe, it, expect } from 'vitest';
import { deployedStoragePath } from '@/lib/storagePath';

/**
 * 배포본이 갈 저장소 경로.
 *
 * 같은 경로를 덮어쓰면 캐시가 옛 파일을 돌려줘서 배포 직후 프리뷰에
 * 분류 결과·중복 시트가 안 보인다. 그래서 반드시 **다른** 경로여야 한다.
 */
describe('deployedStoragePath — 업로드 경로와 다른 자리에 쓴다', () => {
  it('확장자 앞에 표시와 시각을 끼운다', () => {
    expect(deployedStoragePath('admin/dy/1/2026-09-08/20260908_102829551.xlsx', 1700000000000)).toBe(
      'admin/dy/1/2026-09-08/20260908_102829551_deployed_1700000000000.xlsx'
    );
  });

  it('업로드 경로와 절대 같지 않다', () => {
    const uploaded = 'admin/hk/1/2026-09-08/a.xlsx';
    expect(deployedStoragePath(uploaded)).not.toBe(uploaded);
  });

  it('시각이 다르면 경로도 다르다 — 같은 원본을 두 번 만들어도 안 겹친다', () => {
    const p = 'admin/dy/1/x.xlsx';
    expect(deployedStoragePath(p, 1)).not.toBe(deployedStoragePath(p, 2));
  });

  it('확장자가 없으면 뒤에 붙인다', () => {
    expect(deployedStoragePath('admin/dy/1/noext', 5)).toBe('admin/dy/1/noext_deployed_5');
  });

  it('폴더 이름의 점은 확장자가 아니다', () => {
    expect(deployedStoragePath('a.b/c', 5)).toBe('a.b/c_deployed_5');
    expect(deployedStoragePath('a.b/c.xlsx', 5)).toBe('a.b/c_deployed_5.xlsx');
  });
});
