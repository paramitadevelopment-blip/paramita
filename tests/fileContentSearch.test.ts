import { describe, it, expect } from 'vitest';
import { filesContaining } from '@/lib/fileContentSearch';

/**
 * 배포 원본에서 값으로 파일을 찾을 때, 저장된 자료형까지 맞아야 걸린다.
 *
 * 실제 배포 파일의 주문번호는 엑셀이 숫자로 주기 때문에 jsonb에 숫자로 들어간다.
 * 문자열로만 찾으면 그 파일이 통째로 안 걸려 "기록에 없는 고객"이 된다 —
 * 사은품 조회가 안 되고, 민원은 주문번호 대신 이름으로 붙거나 담당지사없음이 된다.
 */

/** 어떤 모양으로 찾았는지 받아 적고, 미리 정해 둔 답을 주는 가짜 Supabase. */
function fakeSupabase(answers: Record<string, Array<{ id: string }>>) {
  const asked: string[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            contains: (_column: string, json: string) => {
              asked.push(json);
              return { data: answers[json] ?? [], error: null };
            },
          }),
        }),
      }),
    }),
  };
  return { client, asked };
}

describe('배포 원본에서 값으로 파일 찾기', () => {
  it('숫자로만 된 값은 문자열·숫자 두 모양으로 찾는다', async () => {
    const { client, asked } = fakeSupabase({
      '[{"주문번호":67309060}]': [{ id: 'f1' }],
    });
    const found = await filesContaining<{ id: string }>(client as never, 'id', {
      주문번호: '67309060',
    });
    expect(asked).toEqual(['[{"주문번호":"67309060"}]', '[{"주문번호":67309060}]']);
    expect(found.map((f) => f.id)).toEqual(['f1']);
  });

  it('문자열로 저장된 것도 그대로 찾는다', async () => {
    const { client } = fakeSupabase({ '[{"주문번호":"67309060"}]': [{ id: 'f2' }] });
    const found = await filesContaining<{ id: string }>(client as never, 'id', {
      주문번호: '67309060',
    });
    expect(found.map((f) => f.id)).toEqual(['f2']);
  });

  it('두 모양에 같은 파일이 걸려도 한 번만 준다', async () => {
    const { client } = fakeSupabase({
      '[{"주문번호":"1"}]': [{ id: 'same' }],
      '[{"주문번호":1}]': [{ id: 'same' }],
    });
    const found = await filesContaining<{ id: string }>(client as never, 'id', { 주문번호: '1' });
    expect(found).toHaveLength(1);
  });

  it('글자가 섞인 값은 문자열로만 찾는다 — 숫자일 수가 없다', async () => {
    const { client, asked } = fakeSupabase({});
    await filesContaining(client as never, 'id', { 주문번호: 'ORD-2026-0001' });
    expect(asked).toEqual(['[{"주문번호":"ORD-2026-0001"}]']);
  });

  it('이름 같은 글자 칸도 문자열로만 찾는다', async () => {
    const { client, asked } = fakeSupabase({});
    await filesContaining(client as never, 'id', { 고객명: '박헌정' });
    expect(asked).toEqual(['[{"고객명":"박헌정"}]']);
  });

  it('안전한 정수 범위를 넘는 숫자는 문자열로만 찾는다 — 자리가 뭉개진다', async () => {
    const { client, asked } = fakeSupabase({});
    const huge = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    await filesContaining(client as never, 'id', { 주문번호: huge });
    expect(asked).toEqual([`[{"주문번호":"${huge}"}]`]);
  });

  it('읽다 실패하면 그대로 던진다 — 없는 고객과 구별되어야 한다', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ contains: () => ({ data: null, error: new Error('연결 끊김') }) }),
          }),
        }),
      }),
    };
    await expect(filesContaining(client as never, 'id', { 주문번호: '1' })).rejects.toThrow(
      '연결 끊김'
    );
  });
});
