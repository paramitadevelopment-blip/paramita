import { describe, it, expect } from 'vitest';
import { loadBlacklist, registerBlacklist } from '@/lib/blacklistStore';

/**
 * 명단을 읽고 쓰는 자리.
 *
 * 여기가 어긋나면 판정 함수가 아무리 맞아도 결과가 틀린다. 실제로 두 번 그랬다 —
 * 해제한 사람이 계속 막혔고, 저장한 생년월일이 판정할 때 쓰는 모양과 달라
 * 명단에 오른 사람이 다음 배포에서 그대로 배정됐다.
 *
 * DB를 띄우지 않고 호출 흔적만 본다. 우리가 확인해야 할 건 Supabase가 아니라
 * "무슨 조건으로 읽고 무슨 값을 넣는가"다.
 */

/** supabase 클라이언트 흉내. 무엇을 물어봤고 무엇을 넣었는지 기록한다. */
function fakeSupabase(rows: any[] = []) {
  const calls = {
    filters: [] as Array<[string, unknown]>,
    inserted: [] as Array<{ table: string; rows: any[] }>,
  };

  const client = {
    from(table: string) {
      return {
        select() {
          const result = { data: rows, error: null };
          const thenable: any = Promise.resolve(result);
          thenable.is = (column: string, value: unknown) => {
            calls.filters.push([column, value]);
            return Promise.resolve(result);
          };
          return thenable;
        },
        insert(inserting: any[]) {
          calls.inserted.push({ table, rows: inserting });
          const result = {
            data: inserting.map((_, i) => ({ id: i + 1 })),
            error: null,
          };
          return Object.assign(Promise.resolve(result), {
            select: () => Promise.resolve(result),
          });
        },
      };
    },
  };

  return { client: client as any, calls };
}

describe('명단 읽기', () => {
  it('해제된 사람은 빼고 읽는다 — 이 조건이 없으면 해제가 아무 소용이 없다', async () => {
    const { client, calls } = fakeSupabase([]);

    await loadBlacklist(client);

    expect(calls.filters).toContainEqual(['released_at', null]);
  });

  it('판정에 쓸 네 값으로 바꿔 준다', async () => {
    const { client } = fakeSupabase([
      { id: 7, product_name: '동양생명', birth: '5801011', tel1: '01011112222', tel2: null },
    ]);

    expect(await loadBlacklist(client)).toEqual([
      { id: 7, product: '동양생명', birth: '5801011', tel1: '01011112222', tel2: '' },
    ]);
  });

  /** 신청 건을 어느 줄에 달지 정하려면 id가 있어야 한다. */
  it('id를 함께 돌려준다', async () => {
    const { client } = fakeSupabase([
      { id: 12, product_name: '동양생명', birth: '5801011', tel1: '01011112222', tel2: null },
    ]);

    expect((await loadBlacklist(client))[0].id).toBe(12);
  });
});

const entry = (o: Record<string, any> = {}) => ({
  product: '동양생명 치매간병보험',
  birth: '5801011******',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  customerName: '김철수',
  reason: '60일 내 3회 이상 신청',
  count: 3,
  ...o,
});

describe('명단에 올리기', () => {
  /**
   * 저장하는 값과 판정하는 값이 다르면, 명단에 올려놓고도 다음 배포에서 못 찾는다.
   * 파일에서 온 원문은 `5801011******`인데 판정은 `5801011`로 보므로 정규화해서 넣는다.
   */
  it('생년월일을 판정에 쓰는 모양으로 저장한다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry()]);

    const row = calls.inserted[0].rows[0];
    expect(row.birth).toBe('5801011');
    expect(row.birth_key).toBe('5801011');
  });

  it('생년월일과 birth_key가 항상 같은 값이다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry({ birth: '580101-1234567' })]);

    const row = calls.inserted[0].rows[0];
    expect(row.birth).toBe(row.birth_key);
    expect(row.birth).toBe('5801011');
  });

  it('전화번호도 정규화해 넣는다 — 하이픈이 섞이면 같은 사람을 못 찾는다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry()]);

    const row = calls.inserted[0].rows[0];
    expect(row.tel1).toBe('01011112222');
    expect(row.phone_keys).toEqual(['01011112222']);
  });

  /**
   * 관리자가 손으로 올린 건과 갈라 보여야 한다. 예전에는 상품이 비었는지,
   * 신청횟수가 0인지로 눈치껏 갈랐는데 규칙이 바뀌면 그 눈치도 같이 틀려진다.
   */
  it('배포가 올린 건은 자동(system)으로 표시한다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry()]);

    expect(calls.inserted[0].rows[0].registered_by).toBe('system');
  });

  it('한 파일에서 같은 사람이 여러 번 걸려도 한 줄만 올린다', async () => {
    const { client, calls } = fakeSupabase();

    const count = await registerBlacklist(client, [entry(), entry(), entry()]);

    expect(count).toBe(1);
    expect(calls.inserted[0].rows).toHaveLength(1);
  });

  it('상품·생년월일·번호 중 하나라도 비면 올리지 않는다', async () => {
    const { client, calls } = fakeSupabase();

    const count = await registerBlacklist(client, [
      entry({ product: '' }),
      entry({ birth: '' }),
      entry({ tel1: '', tel2: '' }),
    ]);

    expect(count).toBe(0);
    expect(calls.inserted).toHaveLength(0);
  });

  it('등록 이력을 같은 사유로 함께 남긴다', async () => {
    const { client, calls } = fakeSupabase();

    await registerBlacklist(client, [entry({ reason: '60일 내 3회 이상 신청' })]);

    const history = calls.inserted.find((c) => c.table === 'blacklist_history');
    expect(history?.rows).toEqual([
      { blacklist_id: 1, action: 'registered', reason: '60일 내 3회 이상 신청' },
    ]);
  });

  it('올릴 게 없으면 DB를 건드리지 않는다', async () => {
    const { client, calls } = fakeSupabase();

    expect(await registerBlacklist(client, [])).toBe(0);
    expect(calls.inserted).toHaveLength(0);
  });
});
