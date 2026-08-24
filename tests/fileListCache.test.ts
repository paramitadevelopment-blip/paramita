import { describe, it, expect } from 'vitest';
import { patchFileStatus } from '@/lib/fileListCache';

/**
 * 다운로드 후 목록을 고치는 규칙 검증.
 *
 * 여기가 틀리면 방금 누른 줄이 아니라 다른 줄이 바뀌거나, 순서가 흔들려
 * 사용자가 보던 자리가 어긋난다. 둘 다 사용자가 바로 알아채는 종류의 오류다.
 */

const page = () => ({
  data: [
    { id: 'aaa', name: '경기.xlsx', myDownloadStatus: 'available' as const },
    { id: 'bbb', name: '파라인슈1.xlsx', myDownloadStatus: 'available' as const },
    { id: 'ccc', name: '파라인슈2.xlsx', myDownloadStatus: 'downloaded' as const },
  ],
  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
});

describe('다운로드 후 그 줄만 고치기', () => {
  it('누른 줄의 상태만 바뀐다', () => {
    const next = patchFileStatus(page(), 'bbb', 'downloaded');
    expect(next.data.map((f) => f.myDownloadStatus)).toEqual([
      'available',
      'downloaded',
      'downloaded',
    ]);
  });

  it('순서가 그대로다 — 이게 깨지면 누른 줄이 눈앞에서 사라진다', () => {
    const next = patchFileStatus(page(), 'aaa', 'downloaded');
    expect(next.data.map((f) => f.id)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('옆줄은 손대지 않는다', () => {
    const before = page();
    const next = patchFileStatus(before, 'bbb', 'downloaded');
    expect(next.data[0]).toEqual(before.data[0]);
    expect(next.data[2]).toEqual(before.data[2]);
  });

  it('파일명 같은 다른 값은 그대로 남는다', () => {
    const next = patchFileStatus(page(), 'bbb', 'downloaded');
    expect(next.data[1].name).toBe('파라인슈1.xlsx');
  });

  it('페이지 정보는 건드리지 않는다', () => {
    const next = patchFileStatus(page(), 'bbb', 'downloaded');
    expect(next.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });

  it('거부됨 상태도 그대로 반영한다', () => {
    const next = patchFileStatus(page(), 'aaa', 'rejected');
    expect(next.data[0].myDownloadStatus).toBe('rejected');
  });

  it('이 페이지에 없는 파일이면 원본을 그대로 돌려준다', () => {
    // 다른 페이지를 보고 있을 때 헛되이 새 객체를 만들면 목록이 통째로 다시 그려진다
    const before = page();
    expect(patchFileStatus(before, '없는id', 'downloaded')).toBe(before);
  });

  it('캐시가 비었거나 모양이 다르면 그대로 둔다', () => {
    expect(patchFileStatus(undefined, 'aaa', 'downloaded')).toBeUndefined();
    expect(patchFileStatus(null, 'aaa', 'downloaded')).toBeNull();
    const weird: any = { data: null };
    expect(patchFileStatus(weird, 'aaa', 'downloaded')).toBe(weird);
  });

  it('원본을 고치지 않는다 — 캐시를 직접 건드리면 화면이 안 바뀐다', () => {
    const before = page();
    patchFileStatus(before, 'bbb', 'downloaded');
    expect(before.data[1].myDownloadStatus).toBe('available');
  });
});
