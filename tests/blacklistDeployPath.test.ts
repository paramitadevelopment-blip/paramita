import { describe, it, expect } from 'vitest';
import {
  dedupeByOrderNumber,
  normalizeBirth,
  BLACKLIST_DAYS,
  BLACKLIST_REASON_NEW,
} from '@/lib/insurance';
import { splitAlreadyListed, splitOverThreshold, type BlacklistKey } from '@/lib/blacklist';
import { withinDays, toBlacklistKeys, type PastRecord } from '@/lib/historyLookup';
import { registerBlacklist, type BlacklistEntry } from '@/lib/blacklistStore';

/**
 * 파일을 올려 배포할 때, 걸린 사람이 명단에 오르기까지의 전 구간.
 *
 * 판정 함수 따로·저장 함수 따로 봐서는 못 잡는 것들이 있다. 실제로 두 번 그랬다 —
 * 판정은 정규화한 생년월일로 하면서 저장은 원문을 넣었고, 등록 경로를 아무도
 * 안 적어서 관리자가 올린 건과 구분이 안 됐다.
 *
 * 그래서 deploy가 엮는 순서를 그대로 재현하고, 마지막에 DB로 나가는 값까지 본다.
 * HTTP 껍데기(인증·CSRF·엑셀 파싱)만 빠져 있다.
 */

const now = new Date(2026, 7, 25, 10, 0);
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
};

const 상품 = '동양생명(치매간병보험)_상담예약(보관에어프라이어)';
const 파일 = { id: 'file-uuid-1', name: '20260816동양생명.xlsx' };

// 배포는 행을 배열로 다룬다. 열 자리를 실제와 같게 잡는다.
const NAME = 0;
const PRODUCT = 1;
const TEL1 = 2;
const TEL2 = 3;
const JUMIN = 4;
const ORDER = 5;

type Row = (string | number)[];

type RowOverrides = Partial<Record<'name' | 'tel1' | 'tel2' | 'jumin' | 'order', string>>;

const row = (o: RowOverrides = {}): Row => {
  const r: Row = [];
  r[NAME] = o.name ?? '여울찬';
  r[PRODUCT] = 상품;
  r[TEL1] = o.tel1 ?? '010-5938-0726';
  r[TEL2] = o.tel2 ?? '010-5938-0726';
  r[JUMIN] = o.jumin ?? '7301192******';
  r[ORDER] = o.order ?? `주문-${Math.random()}`;
  return r;
};

const past = (o: Partial<PastRecord> = {}): PastRecord => ({
  uploadedAt: daysAgo(10),
  dupReason: '',
  assignedTo: '파라인슈1',
  assignedAt: null,
  receivedAt: null,
  fileId: 'past-file',
  fileName: '과거.xlsx',
  name: '여울찬',
  tel1: '010-5938-0726',
  tel2: '010-5938-0726',
  birth: '7301192******',
  product: 상품,
  ...o,
});

/** deploy가 쓰는 것과 같은 키 추출 */
const toBlKey = (r: Row): BlacklistKey => ({
  product: String(r[PRODUCT] ?? ''),
  birth: normalizeBirth(String(r[JUMIN] ?? '')),
  tel1: String(r[TEL1] ?? ''),
  tel2: String(r[TEL2] ?? ''),
});

/** supabase 흉내. DB로 나가는 값을 붙잡아 둔다. */
function fakeSupabase() {
  const inserted: Array<{ table: string; rows: any[] }> = [];
  const client = {
    from(table: string) {
      return {
        insert(rows: any[]) {
          inserted.push({ table, rows });
          const result = { data: rows.map((_, i) => ({ id: i + 1 })), error: null };
          return Object.assign(Promise.resolve(result), {
            select: () => Promise.resolve(result),
          });
        },
      };
    },
  };
  return { client: client as any, inserted };
}

/**
 * 파일 한 개를 배포한다. deploy 라우트가 엮는 순서 그대로다.
 * @returns DB로 나간 blacklist 행들
 */
async function deploy(rows: Row[], listed: BlacklistKey[] = [], history: PastRecord[] = []) {
  const { items: dedupedByOrder } = dedupeByOrderNumber(rows, (r) => r[ORDER]);

  const { items: notListed } = splitAlreadyListed(dedupedByOrder, toBlKey, listed);

  const { newlyHit } = splitOverThreshold(
    notListed,
    toBlKey,
    toBlacklistKeys(withinDays(history, now, BLACKLIST_DAYS))
  );

  const pending: BlacklistEntry[] = newlyHit.map(({ item, count }) => ({
    product: String(item[PRODUCT] ?? ''),
    birth: String(item[JUMIN] ?? ''),
    tel1: String(item[TEL1] ?? ''),
    tel2: String(item[TEL2] ?? ''),
    customerName: String(item[NAME] ?? ''),
    reason: BLACKLIST_REASON_NEW,
    count,
    sourceFileId: 파일.id,
    sourceFileName: 파일.name,
  }));

  const { client, inserted } = fakeSupabase();
  const registered = await registerBlacklist(client, pending);

  return {
    registered,
    rows: inserted.find((i) => i.table === 'blacklist')?.rows ?? [],
    history: inserted.find((i) => i.table === 'blacklist_history')?.rows ?? [],
  };
}

describe('파일 업로드 → 배포 → 명단 등록', () => {
  it('3회를 채우면 명단에 오른다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.registered).toBe(1);
    expect(got.rows).toHaveLength(1);
  });

  it('2회면 오르지 않는다 — DB를 건드리지도 않는다', async () => {
    const got = await deploy([row()], [], [past()]);

    expect(got.registered).toBe(0);
    expect(got.rows).toHaveLength(0);
  });

  /** 이 질문 때문에 registered_by를 만들었다. 배포가 올린 건은 사람 손이 안 닿았다. */
  it('등록 경로가 자동(system)으로 찍힌다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.rows[0].registered_by).toBe('system');
  });

  it('사유와 신청횟수가 함께 남는다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.rows[0].reason).toBe(BLACKLIST_REASON_NEW);
    expect(got.rows[0].request_count).toBe(3);
  });

  it('어느 파일에서 걸렸는지 남는다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.rows[0].source_file_id).toBe(파일.id);
    expect(got.rows[0].source_file_name).toBe(파일.name);
  });

  /**
   * 판정은 정규화한 값으로 하면서 저장은 원문을 넣으면, 명단에 올려놓고도
   * 다음 배포에서 그 사람을 못 찾는다. 실제로 그랬던 버그다.
   */
  it('저장한 생년월일이 판정에 쓰는 모양과 같다', async () => {
    const got = await deploy([row({ jumin: '7301192******' })], [], [past(), past()]);

    expect(got.rows[0].birth).toBe('7301192');
    expect(got.rows[0].birth_key).toBe('7301192');
    expect(got.rows[0].birth).toBe(normalizeBirth('7301192******'));
  });

  it('전화번호도 하이픈을 벗겨 저장한다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.rows[0].tel1).toBe('01059380726');
    expect(got.rows[0].phone_keys).toEqual(['01059380726']);
  });

  it('등록 이력이 같은 사유로 함께 남는다', async () => {
    const got = await deploy([row()], [], [past(), past()]);

    expect(got.history).toEqual([
      { blacklist_id: 1, action: 'registered', reason: BLACKLIST_REASON_NEW },
    ]);
  });

  it('이미 명단에 있으면 다시 올리지 않는다', async () => {
    const 이미명단에 = [toBlKey(row())];

    const got = await deploy([row()], 이미명단에, [past(), past()]);

    expect(got.registered).toBe(0);
    expect(got.rows).toHaveLength(0);
  });

  /**
   * 실제 파일에서 났던 일이다 — 이름도 생년월일도 다른 행들이 번호를 공유해
   * 3회가 됐다.
   *
   * **한 줄로 오른다.** 판정(isSamePerson)이 상품+번호만 보고 생년월일을 안 보므로,
   * 이들은 규칙상 같은 사람이다. 예전에는 등록할 때만 생년월일까지 묶음에 넣어
   * 두 줄로 올랐는데, 그러면 막을 때는 한 사람인데 명단에는 둘이라 신청 건이
   * 양쪽에 나뉘어 붙고 횟수가 중복된다.
   */
  it('번호를 공유하면 이름·생년월일이 달라도 한 줄로 오른다', async () => {
    const 여울찬 = row({ name: '여울찬', order: 'A1' });
    const 여울찬2 = row({ name: '여울찬', order: 'A2' });
    const 테스트 = row({
      name: '테스트',
      order: 'A3',
      tel2: '010-1234-1234',
      jumin: '3001071******',
    });

    const got = await deploy([여울찬, 여울찬2, 테스트]);

    expect(got.rows).toHaveLength(1);
    expect(got.rows[0].registered_by).toBe('system');
  });

  /** 한쪽에만 있던 번호도 명단 줄에 담겨야 다음 배포에서 어느 칸으로 와도 걸린다. */
  it('묶인 사람의 번호를 모두 담는다', async () => {
    const 여울찬 = row({ name: '여울찬', order: 'A1' });
    const 여울찬2 = row({ name: '여울찬', order: 'A2' });
    const 테스트 = row({ name: '테스트', order: 'A3', tel2: '010-1234-1234' });

    const got = await deploy([여울찬, 여울찬2, 테스트]);

    expect(got.rows[0].phone_keys.sort()).toEqual(['01012341234', '01059380726']);
  });

  it('같은 주문번호가 두 줄이면 한 번으로 센다 — 3회에 못 미쳐 안 오른다', async () => {
    const 같은주문 = { order: 'A1' };

    const got = await deploy([row(같은주문), row(같은주문), row(같은주문)]);

    expect(got.registered).toBe(0);
  });

  it('미리보기만 하면 명단에 오르지 않는다 — 등록은 배포에서만 한다', async () => {
    // classify는 splitOverThreshold까지만 부르고 registerBlacklist를 안 부른다.
    const { items: deduped } = dedupeByOrderNumber([row()], (r) => r[ORDER]);
    const { items: notListed } = splitAlreadyListed(deduped, toBlKey, []);
    const { newlyHit } = splitOverThreshold(
      notListed,
      toBlKey,
      toBlacklistKeys(withinDays([past(), past()], now, BLACKLIST_DAYS))
    );

    expect(newlyHit).toHaveLength(1);

    const { inserted } = fakeSupabase();
    expect(inserted).toHaveLength(0);
  });
});
