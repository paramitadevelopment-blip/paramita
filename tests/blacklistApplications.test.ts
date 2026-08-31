import { describe, it, expect } from 'vitest';
import { registerBlacklist, recordApplications } from '@/lib/blacklistStore';
import { findListed, type BlacklistKey } from '@/lib/blacklist';

/**
 * 명단에 오른 사람의 신청 건.
 *
 * 예전에는 신청횟수가 등록 시점에 굳는 숫자였고 출처 목록은 조회할 때마다 파일을
 * 훑어 만드는 값이라, 그 사람이 또 신청해도 숫자가 안 늘고 파일을 지우면 목록만
 * 사라졌다. '3회' 옆에 두 줄이 뜨는 상태다.
 *
 * 신청 한 건을 한 줄로 남기고 횟수를 그 줄 수로 다시 세면 둘이 같은 자리에서
 * 나온다. 여기서 보는 건 그 규칙이다.
 */

/**
 * 신청 건 표를 들고 있는 supabase 흉내.
 * UNIQUE(blacklist_id, source_file_id, order_key)까지 흉내낸다 — 주문번호는
 * 파일 안에서만 유니크해서 파일까지 같아야 같은 신청이다.
 */
function fakeSupabase(
  existing: Array<{ blacklist_id: number; order_key: string; source_file_id?: string | null }> = []
) {
  const applications = [...existing];
  const calls = {
    upserts: [] as Array<{ rows: any[]; options: any }>,
    updates: [] as Array<{ id: unknown; values: any }>,
    inserted: [] as Array<{ table: string; rows: any[] }>,
  };

  const client = {
    from(table: string) {
      return {
        select(_columns?: string) {
          const rows =
            table === 'blacklist_applications'
              ? applications.map((a) => ({ blacklist_id: a.blacklist_id }))
              : [];
          const result = { data: rows, error: null };
          const thenable: any = Promise.resolve(result);
          thenable.in = () => Promise.resolve(result);
          thenable.is = () => Promise.resolve(result);
          thenable.order = () => Promise.resolve(result);
          return thenable;
        },

        insert(rows: any[]) {
          calls.inserted.push({ table, rows });
          const result = { data: rows.map((_, i) => ({ id: i + 1 })), error: null };
          return Object.assign(Promise.resolve(result), {
            select: () => Promise.resolve(result),
          });
        },

        upsert(rows: any[], options: any) {
          calls.upserts.push({ rows, options });
          // 파일까지 같아야 같은 신청이다.
          for (const row of rows) {
            const dup = applications.some(
              (a) =>
                a.blacklist_id === row.blacklist_id &&
                (a.source_file_id ?? null) === (row.source_file_id ?? null) &&
                a.order_key === row.order_key
            );
            if (!dup) applications.push(row);
          }
          return Promise.resolve({ error: null });
        },

        update(values: any) {
          return {
            eq: (_column: string, id: unknown) => {
              calls.updates.push({ id, values });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client: client as any, calls, applications };
}

const entry = (o: Record<string, any> = {}) => ({
  product: '동양생명(치매간병보험)',
  birth: '6609012******',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  customerName: '여울찬',
  reason: '60일 내 3회 이상 신청',
  count: 3,
  sourceFileId: 'file-a',
  sourceFileName: '8월.xlsx',
  orderNo: '20796767',
  appliedAt: new Date(2026, 7, 12),
  ...o,
});

describe('이미 명단에 있는 사람이 또 신청', () => {
  it('신청 건이 쌓이고 횟수가 그만큼 늘어난다', async () => {
    // 이미 3건이 쌓여 있는 사람
    const { client, calls } = fakeSupabase([
      { blacklist_id: 5, order_key: 'A', source_file_id: 'file-a' },
      { blacklist_id: 5, order_key: 'B', source_file_id: 'file-a' },
      { blacklist_id: 5, order_key: 'C', source_file_id: 'file-a' },
    ]);

    await recordApplications(client, [
      { blacklistId: 5, entry: entry({ orderNo: 'D' }) },
    ]);

    expect(calls.updates).toEqual([
      { id: 5, values: expect.objectContaining({ request_count: 4 }) },
    ]);
  });

  /** 한 파일을 두 번 배포해도 신청이 두 배가 되면 안 된다. */
  it('같은 파일의 같은 주문번호는 한 건으로 남는다', async () => {
    const { client, calls, applications } = fakeSupabase([
      { blacklist_id: 5, order_key: 'A', source_file_id: 'file-a' },
    ]);

    await recordApplications(client, [{ blacklistId: 5, entry: entry({ orderNo: 'A' }) }]);

    expect(applications).toHaveLength(1);
    expect(calls.updates[0].values.request_count).toBe(1);
  });

  /**
   * 주문번호는 **파일 안에서만** 유니크하다. 파일을 모아 놓으면 같은 번호가 서로
   * 다른 신청을 가리킬 수 있어서, 번호만 보고 묶으면 남의 신청과 뭉개진다.
   */
  it('파일이 다르면 주문번호가 같아도 다른 신청이다', async () => {
    const { client, calls, applications } = fakeSupabase([
      { blacklist_id: 5, order_key: 'A', source_file_id: 'file-a' },
    ]);

    await recordApplications(client, [
      { blacklistId: 5, entry: entry({ orderNo: 'A', sourceFileId: 'file-b' }) },
    ]);

    expect(applications).toHaveLength(2);
    expect(calls.updates[0].values.request_count).toBe(2);
  });

  it('UNIQUE 로 거르도록 onConflict 에 파일까지 넣는다', async () => {
    const { client, calls } = fakeSupabase();

    await recordApplications(client, [{ blacklistId: 5, entry: entry() }]);

    expect(calls.upserts[0].options).toMatchObject({
      onConflict: 'blacklist_id,source_file_id,order_key',
      ignoreDuplicates: true,
    });
  });

  /** 주문번호가 없으면 같은 신청인지 가릴 수 없다. 근거 없이 세지 않는다. */
  it('주문번호가 없으면 남기지 않는다', async () => {
    const { client, calls } = fakeSupabase();

    await recordApplications(client, [{ blacklistId: 5, entry: entry({ orderNo: '' }) }]);

    expect(calls.upserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });

  /** 파일을 지워도 명단은 남는다. 어느 파일이었는지도 같이 남아야 되짚을 수 있다. */
  it('출처 파일 이름을 함께 남긴다', async () => {
    const { client, calls } = fakeSupabase();

    await recordApplications(client, [{ blacklistId: 5, entry: entry() }]);

    expect(calls.upserts[0].rows[0]).toMatchObject({
      source_file_id: 'file-a',
      source_file_name: '8월.xlsx',
      customer_name: '여울찬',
    });
  });

  /**
   * 더하기가 아니라 다시 세기다. 더하기만 하면 한 번 어긋난 값이 영영 남는다 —
   * 실제로 등록 시점 값(3)이 굳어 목록 두 줄과 안 맞는 상태였다.
   */
  it('저장된 값에 더하지 않고 신청 건수로 맞춘다', async () => {
    const { client, calls } = fakeSupabase([
      { blacklist_id: 5, order_key: 'A', source_file_id: 'file-a' },
    ]);

    await recordApplications(client, [{ blacklistId: 5, entry: entry({ orderNo: 'B' }) }]);

    // 이 사람의 신청은 A·B 두 건이다. 등록 시점에 3이라 적혀 있었어도 2다.
    expect(calls.updates[0].values.request_count).toBe(2);
  });
});

describe('처음 명단에 올릴 때', () => {
  /** 한 파일에 세 번 걸린 사람은 명단 한 줄, 신청 세 건이다. */
  it('사람은 한 줄이고 신청은 걸린 횟수만큼 남는다', async () => {
    const { client, calls, applications } = fakeSupabase();

    await registerBlacklist(client, [
      entry({ orderNo: 'A' }),
      entry({ orderNo: 'B' }),
      entry({ orderNo: 'C' }),
    ]);

    const blacklistInsert = calls.inserted.find((c) => c.table === 'blacklist');
    expect(blacklistInsert!.rows).toHaveLength(1);
    expect(applications).toHaveLength(3);
  });

  it('등록 직후 횟수가 신청 건수와 같다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry({ orderNo: 'A' }), entry({ orderNo: 'B' })]);

    expect(calls.updates.at(-1)!.values.request_count).toBe(2);
  });
});

describe('명단에서 그 사람 줄 찾기', () => {
  const listed = [
    { id: 1, product: '동양생명(치매간병보험)', birth: '6609012', tel1: '010-1111-2222', tel2: '' },
    { id: 2, product: '', birth: '', tel1: '010-9999-8888', tel2: '' },
  ];

  const key = (o: Partial<BlacklistKey> = {}): BlacklistKey => ({
    product: '동양생명(치매간병보험)',
    birth: '6609012',
    tel1: '010-1111-2222',
    tel2: '010-1111-2222',
    ...o,
  });

  it('상품과 번호가 맞으면 그 줄을 준다', () => {
    expect(findListed(key(), listed)?.id).toBe(1);
  });

  /** 관리자가 손으로 올린 줄은 상품이 없다. "어느 상품으로 와도 막아라"다. */
  it('상품 없는 줄은 번호만 보고 찾는다', () => {
    expect(findListed(key({ tel1: '010-9999-8888', tel2: '' }), listed)?.id).toBe(2);
  });

  it('번호가 안 겹치면 못 찾는다', () => {
    expect(findListed(key({ tel1: '010-3333-4444', tel2: '' }), listed)).toBeNull();
  });

  it('판정할 근거가 없으면 못 찾는다', () => {
    expect(findListed(key({ tel1: '', tel2: '' }), listed)).toBeNull();
  });
});
