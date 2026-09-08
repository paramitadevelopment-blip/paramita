import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 배포 원본(files.file_content)에서 "이 칸이 이 값인 줄"이 든 파일을 찾는다.
 *
 * jsonb 포함 검사는 **자료형까지 같아야** 걸린다. `'[{"주문번호":"67309060"}]'`는
 * 저장된 값이 문자열일 때만 맞고, 엑셀에서 숫자로 읽힌 `67309060`(따옴표 없음)은
 * 안 걸린다. 실제 배포 파일의 주문번호는 거의 숫자로 들어온다 — 엑셀이 숫자로
 * 보이는 칸을 숫자로 주기 때문이다. 시험용 파일은 'ORD-2026-0001'처럼 글자가
 * 섞여 있어 문자열로 저장됐고, 그래서 이 어긋남이 시험에서는 드러나지 않았다.
 *
 * 그래서 숫자로만 된 값은 **두 모양으로 찾아 합친다**. 찾는 쪽을 넓히는 것이지
 * 판정을 무르게 하는 것이 아니다 — 어느 줄이 맞는지는 부르는 쪽이 String()으로
 * 다시 좁힌다.
 *
 * 이 검사는 파일 단위다. 걸린 파일에는 다른 사람 줄도 함께 들어 있다.
 */
export async function filesContaining<T>(
  supabase: SupabaseClient,
  select: string,
  needle: Record<string, string>
): Promise<T[]> {
  const [key, value] = Object.entries(needle)[0];

  const shapes: Array<Record<string, string | number>> = [{ [key]: value }];
  /*
   * 숫자로만 된 값이면 숫자 모양도 함께 찾는다. 안전한 정수 범위를 넘으면
   * 자리가 뭉개지므로(1e21 같은 표기) 문자열로만 찾는다.
   */
  if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
    shapes.push({ [key]: Number(value) });
  }

  const found = new Map<string, T>();
  for (const shape of shapes) {
    /*
     * JSON 문자열로 넘긴다. 배열을 그대로 주면 supabase-js가 Postgres 배열
     * 리터럴 '{...}'로 바꿔 보내는데 jsonb 열이 그 형식을 못 읽는다.
     */
    const { data, error } = await supabase
      .from('files')
      .select(select)
      .eq('is_original', true)
      .eq('source', 'direct')
      .contains('file_content', JSON.stringify([shape]));

    /*
     * 과거를 못 읽으면 "기록에 없는 고객"과 구별이 안 된다. 조용히 넘어가면
     * 있는 고객을 없는 것처럼 다루게 되므로 그대로 던진다.
     */
    if (error) throw error;

    for (const file of data ?? []) {
      const id = String((file as { id?: unknown }).id ?? '');
      if (id && !found.has(id)) found.set(id, file as T);
    }
  }

  return [...found.values()];
}
