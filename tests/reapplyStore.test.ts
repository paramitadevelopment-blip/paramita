import { describe, it, expect } from 'vitest';
import { recordReapplyNotices, type ReapplyCandidate } from '@/lib/reapplyStore';
import type { AssignmentRecord } from '@/lib/lastAssignment';
import { DUP_CUSTOMER_REASON } from '@/lib/insurance';

/**
 * 재신청 알림을 DB로 내보내는 자리.
 *
 * 여기가 어긋나면 지사가 남의 고객을 보거나, 볼 사람이 없어 알림이 사라진다.
 * DB를 띄우지 않고 무슨 값이 나가는지만 본다.
 */

const now = new Date(2026, 7, 26, 10, 0);
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
};

const cand = (o: Partial<ReapplyCandidate> = {}): ReapplyCandidate => ({
  customerName: '홍길동',
  birth: '8001011******',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  product: '동양생명 치매간병보험',
  reason: DUP_CUSTOMER_REASON,
  orderNo: 'A1',
  sourceFileId: 'file-now',
  sourceFileName: '이번.xlsx',
  receivedAt: null,
  ...o,
});

const past = (o: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  name: '홍길동',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  assignedTo: '파라인슈1',
  receivedAt: null,
  assignedAt: null,
  // 이번 건(cand)은 receivedAt 이 없어 배포 시각(now)으로 잡힌다.
  // 과거는 그보다 앞서야 '이전 신청'으로 인정된다.
  uploadedAt: daysAgo(10),
  fileId: 'file-past',
  fileName: '과거.xlsx',
  ...o,
});

/** 배정 분류 → 사용자 소속. 실제 departments 표와 같은 모양이다. */
const toGroup = (dept: string) =>
  ({ 파라인슈1: '파라인슈', 파라인슈2: '파라인슈', 경기: '경기' } as Record<string, string>)[dept] ??
  null;

function fakeSupabase() {
  const inserted: any[] = [];
  const client = {
    from() {
      return {
        insert(rows: any[]) {
          inserted.push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
      };
    },
  };
  return { client: client as any, inserted };
}

describe('알림 만들기', () => {
  it('직전 배정 지사를 찾아 남긴다', async () => {
    const { client, inserted } = fakeSupabase();

    const r = await recordReapplyNotices(client, [cand()], [past()], toGroup, now);

    expect(r.saved).toBe(1);
    expect(inserted[0].assigned_dept).toBe('파라인슈1');
    expect(inserted[0].assigned_group).toBe('파라인슈');
  });

  /**
   * 파일에는 배정 분류('파라인슈1')로 적히는데 사용자 소속은 조직명('파라인슈')이다.
   * 여기서 안 바꾸면 지사 사용자의 소속과 안 맞아 아무에게도 안 보인다.
   */
  it('배정 분류를 사용자 소속으로 바꿔 저장한다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(client, [cand()], [past({ assignedTo: '파라인슈2' })], toGroup, now);

    expect(inserted[0].assigned_dept).toBe('파라인슈2');
    expect(inserted[0].assigned_group).toBe('파라인슈');
  });

  it('전화번호를 정규화해 넣는다 — 검색이 하이픈 유무를 안 타야 한다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(client, [cand()], [past()], toGroup, now);

    expect(inserted[0].tel1).toBe('01011112222');
    expect(inserted[0].phone_keys).toEqual(['01011112222']);
  });

  it('이번 건과 직전 배정을 모두 남긴다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(client, [cand()], [past()], toGroup, now);

    expect(inserted[0].source_file_name).toBe('이번.xlsx');
    expect(inserted[0].assigned_file_name).toBe('과거.xlsx');
    expect(inserted[0].order_no).toBe('A1');
    expect(inserted[0].reason).toBe(DUP_CUSTOMER_REASON);
  });

  it('배정된 적이 없으면 알림을 안 만든다 — 알릴 지사가 없다', async () => {
    const { client, inserted } = fakeSupabase();

    const r = await recordReapplyNotices(
      client,
      [cand()],
      [past({ assignedTo: '중복 제외' })],
      toGroup,
      now
    );

    expect(r.saved).toBe(0);
    expect(r.skipped).toBe(1);
    expect(inserted).toHaveLength(0);
  });

  it('소속 표에 없는 배정 분류는 건너뛴다', async () => {
    const { client } = fakeSupabase();

    const r = await recordReapplyNotices(
      client,
      [cand()],
      [past({ assignedTo: '없는소속' })],
      toGroup,
      now
    );

    expect(r.saved).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it('후보가 없으면 DB를 건드리지 않는다', async () => {
    const { client, inserted } = fakeSupabase();

    expect(await recordReapplyNotices(client, [], [past()], toGroup, now)).toEqual({
      saved: 0,
      skipped: 0,
    });
    expect(inserted).toHaveLength(0);
  });

  it('여러 건을 한 번에 넣는다', async () => {
    const { client, inserted } = fakeSupabase();

    const r = await recordReapplyNotices(
      client,
      [cand({ orderNo: 'A1' }), cand({ orderNo: 'A2' })],
      [past()],
      toGroup,
      now
    );

    expect(r.saved).toBe(2);
    expect(inserted.map((i) => i.order_no)).toEqual(['A1', 'A2']);
  });

  /**
   * 배포일이 아니라 고객이 실제로 신청한 날을 남긴다. 밀렸다가 한꺼번에 올리면
   * 배포일은 다 같은데 신청일은 제각각이라, 배포일로 적으면 지사가 언제 온
   * 신청인지 알 수 없다.
   */
  it('접수일자를 다시 신청한 날로 쓴다', async () => {
    const { client, inserted } = fakeSupabase();
    const 신청일 = new Date(2026, 7, 11);

    await recordReapplyNotices(
      client,
      [cand({ receivedAt: 신청일 })],
      [past({ receivedAt: new Date(2026, 7, 1) })],
      toGroup,
      now
    );

    expect(new Date(inserted[0].applied_at)).toEqual(신청일);
  });

  /**
   * 같은 날짜면 다시 신청한 게 아니라 같은 신청서가 두 번 들어온 것이다.
   * 같은 파일을 두 번 올리면 그런 행이 통째로 생기는데, 그걸 "또 신청했다"고
   * 지사에 알리면 잘못된 정보다.
   */
  it('이전 신청일이 이번과 같은 날이면 알림을 안 만든다', async () => {
    const { client, inserted } = fakeSupabase();
    const 같은날 = new Date(2026, 7, 11);

    const r = await recordReapplyNotices(
      client,
      [cand({ receivedAt: 같은날 })],
      [past({ receivedAt: 같은날 })],
      toGroup,
      now
    );

    expect(r.saved).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it('이전 신청일이 이번보다 나중이면 알림을 안 만든다', async () => {
    const { client } = fakeSupabase();

    const r = await recordReapplyNotices(
      client,
      [cand({ receivedAt: new Date(2026, 7, 1) })],
      [past({ receivedAt: new Date(2026, 7, 20) })],
      toGroup,
      now
    );

    expect(r.saved).toBe(0);
  });

  it('하루라도 앞서면 알림을 만든다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(
      client,
      [cand({ receivedAt: new Date(2026, 7, 11) })],
      [past({ receivedAt: new Date(2026, 7, 10) })],
      toGroup,
      now
    );

    expect(inserted).toHaveLength(1);
    expect(new Date(inserted[0].previous_applied_at)).toEqual(new Date(2026, 7, 10));
  });

  it('접수일자를 못 읽으면 배포 시각으로 물러선다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(client, [cand({ receivedAt: null })], [past()], toGroup, now);

    expect(new Date(inserted[0].applied_at)).toEqual(now);
  });

  /**
   * 두 날짜가 같은 축이어야 나란히 놓고 볼 수 있다. 이전 쪽만 배정날짜(우리가
   * 처리한 시각)로 잡으면 "8/12에 신청했는데 8/25에 배정됐다"처럼 뒤집힌다.
   */
  it('직전 신청일도 접수일자를 쓴다', async () => {
    const { client, inserted } = fakeSupabase();
    const 그때신청일 = new Date(2026, 7, 1);

    await recordReapplyNotices(
      client,
      [cand()],
      [past({ receivedAt: 그때신청일, assignedAt: daysAgo(3), uploadedAt: daysAgo(3) })],
      toGroup,
      now
    );

    expect(new Date(inserted[0].previous_applied_at)).toEqual(그때신청일);
  });

  it('접수일자가 없으면 배정날짜, 그것도 없으면 업로드 시각으로 물러선다', async () => {
    const { client, inserted } = fakeSupabase();
    const 배정일 = new Date(2026, 7, 5, 17, 0, 0);

    await recordReapplyNotices(
      client,
      [cand()],
      [past({ receivedAt: null, assignedAt: 배정일 })],
      toGroup,
      now
    );
    expect(new Date(inserted[0].previous_applied_at)).toEqual(배정일);

    const 두번째 = fakeSupabase();
    await recordReapplyNotices(
      두번째.client,
      [cand()],
      [past({ receivedAt: null, assignedAt: null, uploadedAt: daysAgo(7) })],
      toGroup,
      now
    );
    expect(new Date(두번째.inserted[0].previous_applied_at)).toEqual(daysAgo(7));
  });

  /** 두 날짜가 같은 축이라 앞뒤가 맞아야 한다. */
  it('직전 신청일이 이번 신청일보다 앞선다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(
      client,
      [cand({ receivedAt: new Date(2026, 7, 20) })],
      [past({ receivedAt: new Date(2026, 7, 1) })],
      toGroup,
      now
    );

    expect(new Date(inserted[0].previous_applied_at).getTime()).toBeLessThan(
      new Date(inserted[0].applied_at).getTime()
    );
  });

  /** 같은 사람이 계속 다시 신청하면 그때마다 한 줄씩 쌓인다. 몇 번 왔는지가 정보다. */
  it('같은 사람이 여러 번 와도 각각 남긴다', async () => {
    const { client, inserted } = fakeSupabase();

    await recordReapplyNotices(
      client,
      [cand({ orderNo: 'B1' }), cand({ orderNo: 'B2' })],
      [past()],
      toGroup,
      now
    );

    expect(inserted).toHaveLength(2);
    expect(inserted.every((i) => i.assigned_group === '파라인슈')).toBe(true);
  });
});
